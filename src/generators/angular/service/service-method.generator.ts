import {
    ClassDeclaration,
    MethodDeclarationOverloadStructure,
    OptionalKind,
    ParameterDeclarationStructure,
} from 'ts-morph';

import { GeneratorConfig, PathInfo } from '@src/core/types/index.js';
import { SwaggerParser } from "@src/core/parser.js";
import { ServiceMethodAnalyzer } from "@src/analysis/service-method-analyzer.js";
import { ServiceMethodModel } from '@src/analysis/service-method-types.js';
import { camelCase, pascalCase } from "@src/core/utils/index.js";

export class ServiceMethodGenerator {
    private analyzer: ServiceMethodAnalyzer;

    constructor(
        private readonly config: GeneratorConfig,
        readonly parser: SwaggerParser
    ) {
        this.analyzer = new ServiceMethodAnalyzer(config, parser);
    }

    public addServiceMethod(classDeclaration: ClassDeclaration, operation: PathInfo): void {
        const model = this.analyzer.analyze(operation);
        if (!model) {
            console.warn(`[ServiceMethodGenerator] Skipping method generation for operation without a methodName detected.`);
            return;
        }

        // Handle error typing generation (explicit export only if errors exist)
        let errorTypeAlias: string | undefined;
        if (model.errorResponses && model.errorResponses.length > 0) {
            const typeName = `${pascalCase(model.methodName)}Error`;
            const union = [...new Set(model.errorResponses.map(e => e.type))].join(' | ');
            // Add export type alias to source file
            classDeclaration.getSourceFile().addTypeAlias({
                name: typeName,
                isExported: true,
                type: union,
                docs: [`Error union for ${model.methodName}`]
            });
            errorTypeAlias = typeName;
        }

        const isSSE = model.responseSerialization === 'sse';
        const bodyStatements = this.emitMethodBody(model, operation, isSSE);
        const overloads = this.emitOverloads(model.methodName, model.responseType, model.parameters, model.isDeprecated, isSSE);

        // Use specific return type generics to support strict typing
        const returnType = `Observable<${model.responseType}>`;

        const docs = model.docs ? [model.docs] : [];
        if (errorTypeAlias) {
            docs.push(`\n@throws {${errorTypeAlias}}`);
        }

        classDeclaration.addMethod({
            name: model.methodName,
            parameters: [...model.parameters, {
                name: 'options',
                hasQuestionToken: true,
                type: `RequestOptions & { observe?: 'body' | 'events' | 'response', responseType?: 'arraybuffer' | 'blob' | 'json' | 'text' }`
            }],
            returnType: returnType,
            statements: bodyStatements,
            overloads: overloads,
            docs: docs
        });
    }

    private emitMethodBody(model: ServiceMethodModel, rawOp: PathInfo, isSSE: boolean): string {
        const lines: string[] = [];

        // 1. XML Logic (Legacy Support)
        const xmlParams = rawOp.parameters?.filter(p => p.content?.['application/xml']) ?? [];
        xmlParams.forEach(p => {
            const paramName = camelCase(p.name);
            const schema = p.content!['application/xml'].schema as any;
            const rootName = schema.xml?.name || p.name;
            const xmlConfig = (this.analyzer as any).getXmlConfig(schema, 5);
            lines.push(`let ${paramName}Serialized: any = ${paramName};`);
            lines.push(`if (${paramName} !== null && ${paramName} !== undefined) {`);
            lines.push(`  ${paramName}Serialized = XmlBuilder.serialize(${paramName}, '${rootName}', ${JSON.stringify(xmlConfig)});`);
            lines.push(`}`);
        });

        // 2. Path Construction
        let urlTemplate = model.urlTemplate;
        model.pathParams.forEach(p => {
            const serializeCall = `HttpParamsBuilder.serializePathParam('${p.originalName}', ${p.paramName}, '${p.style || 'simple'}', ${p.explode}, ${p.allowReserved}${p.serializationLink === 'json' ? ", 'json'" : ""})`;
            urlTemplate = urlTemplate.replace(`{${p.originalName}}`, `\${${serializeCall}}`);
        });

        // 3. Query String Logic (Legacy)
        const qsParam = rawOp.parameters?.find(p => (p.in as any) === 'querystring');
        let queryStringVariable = '';
        if (qsParam) {
            const pName = camelCase(qsParam.name);
            const hint = (qsParam as any).content?.['application/json'] ? ", 'json'" : "";
            lines.push(`const queryString = HttpParamsBuilder.serializeRawQuerystring(${pName}${hint});`);
            queryStringVariable = "${queryString ? '?' + queryString : ''}";
        }

        // 4. Base Path
        if (model.hasServers && model.basePath) {
            lines.push(`const basePath = '${model.basePath}';`);
        } else {
            lines.push(`const basePath = this.basePath;`);
        }
        lines.push(`const url = \`\${basePath}${urlTemplate}${queryStringVariable}\`;`);

        // 5. Query Params
        const standardQueryParams = model.queryParams.filter(p => p.originalName !== qsParam?.name);

        if (standardQueryParams.length > 0) {
            lines.push(`let params = new HttpParams({ encoder: new ApiParameterCodec(), fromObject: options?.params ?? {} });`);
            standardQueryParams.forEach(p => {
                const configObj = JSON.stringify({
                    name: p.originalName,
                    in: 'query',
                    style: p.style,
                    explode: p.explode,
                    allowReserved: p.allowReserved,
                    serialization: p.serializationLink
                });
                lines.push(`if (${p.paramName} != null) { params = HttpParamsBuilder.serializeQueryParam(params, ${configObj}, ${p.paramName}); }`);
            });
        }

        // 6. Headers
        lines.push(`let headers = options?.headers instanceof HttpHeaders ? options.headers : new HttpHeaders(options?.headers ?? {});`);
        model.headerParams.forEach(p => {
            const hint = p.serializationLink === 'json' ? ", 'json'" : "";
            lines.push(`if (${p.paramName} != null) { headers = headers.set('${p.originalName}', HttpParamsBuilder.serializeHeaderParam('${p.originalName}', ${p.paramName}, ${p.explode}${hint})); }`);
        });

        // 7. Cookies
        if (model.cookieParams.length > 0) {
            if (this.config.options.platform !== 'node') {
                lines.push(`// WARNING: Setting 'Cookie' headers manually is forbidden in browsers.`);
                lines.push(`if (typeof window !== 'undefined') { console.warn('Operation ${model.methodName} attempts to set "Cookie" header manually. This will fail in browsers.'); }`);
            }
            lines.push(`const __cookies: string[] = [];`);
            model.cookieParams.forEach(p => {
                const hint = p.serializationLink === 'json' ? ", 'json'" : "";
                lines.push(`if (${p.paramName} != null) { __cookies.push(HttpParamsBuilder.serializeCookieParam('${p.originalName}', ${p.paramName}, '${p.style || 'form'}', ${p.explode}, ${p.allowReserved}${hint})); }`);
            });
            lines.push(`if (__cookies.length > 0) { headers = headers.set('Cookie', __cookies.join('; ')); }`);
        }

        // 8. Security & Options
        let contextConstruction = `this.createContextWithClientId(options?.context)`;
        if (model.security.length > 0) {
            contextConstruction += `.set(SECURITY_CONTEXT_TOKEN, ${JSON.stringify(model.security)})`;
        }

        const isSeq = model.responseSerialization === 'json-seq' || model.responseSerialization === 'json-lines';
        const isXmlResp = model.responseSerialization === 'xml';

        // Force responseType: 'text' for custom parsing strategies (sequential JSON, XML)
        const responseTypeVal = (isSeq || isXmlResp) ? `'text'` : `options?.responseType`;

        let optionProperties = `
  observe: options?.observe, 
  reportProgress: options?.reportProgress, 
  responseType: ${responseTypeVal}, 
  withCredentials: options?.withCredentials, 
  context: ${contextConstruction}`;

        if (standardQueryParams.length > 0) optionProperties += `,\n  params`;
        optionProperties += `,\n  headers`;

        lines.push(`let requestOptions: HttpRequestOptions = {${optionProperties}\n};`);

        // 9. Body Handling
        let bodyArgument = 'null';
        const body = model.body;

        const legacyFormData = rawOp.parameters?.filter(p => (p as any).in === 'formData');
        const isUrlEnc = rawOp.consumes?.includes('application/x-www-form-urlencoded');

        if (legacyFormData && legacyFormData.length > 0) {
            if (isUrlEnc) {
                lines.push(`let formBody = new HttpParams();`);
                legacyFormData.forEach(p => {
                    const paramName = camelCase(p.name);
                    lines.push(`if (${paramName} != null) { formBody = formBody.append('${p.name}', ${paramName}); }`);
                });
                bodyArgument = 'formBody';
            } else {
                lines.push(`const formData = new FormData();`);
                legacyFormData.forEach(p => {
                    const paramName = camelCase(p.name);
                    lines.push(`if (${paramName} != null) { formData.append('${p.name}', ${paramName}); }`);
                });
                bodyArgument = 'formData';
            }
        } else if (body) {
            if (body.type === 'raw' || body.type === 'json') {
                bodyArgument = body.paramName;
            } else if (body.type === 'urlencoded') {
                lines.push(`const formBody = HttpParamsBuilder.serializeUrlEncodedBody(${body.paramName}, ${JSON.stringify(body.config)});`);
                bodyArgument = 'formBody';
            } else if (body.type === 'multipart') {
                lines.push(`const multipartConfig = ${JSON.stringify(body.config)};`);
                lines.push(`const multipartResult = MultipartBuilder.serialize(${body.paramName}, multipartConfig);`);
                lines.push(`if (multipartResult.headers) {`);
                lines.push(`  const newHeaders = requestOptions.headers instanceof HttpHeaders ? requestOptions.headers : new HttpHeaders(requestOptions.headers || {});`);
                lines.push(`  Object.entries(multipartResult.headers).forEach(([k, v]) => newHeaders.set(k, v));`);
                lines.push(`  requestOptions = { ...requestOptions, headers: newHeaders };`);
                lines.push(`}`);
                bodyArgument = 'multipartResult.content';
            } else if (body.type === 'xml') {
                lines.push(`const xmlBody = XmlBuilder.serialize(${body.paramName}, '${body.rootName}', ${JSON.stringify(body.config)});`);
                bodyArgument = 'xmlBody';
            }
        }

        if (isSSE) {
            lines.push(`
            return new Observable<${model.responseType}>(observer => { 
                const eventSource = new EventSource(url); 
                eventSource.onmessage = (event) => { 
                    try { 
                        observer.next(JSON.parse(event.data)); 
                    } catch (e) { 
                        observer.next(event.data); 
                    } 
                }; 
                eventSource.onerror = (error) => { 
                    observer.error(error); 
                    eventSource.close(); 
                }; 
                return () => eventSource.close(); 
            });`);
            return lines.join('\n');
        }

        // 10. HTTP Call
        const httpMethod = model.httpMethod.toLowerCase();
        const isStandardBody = ['post', 'put', 'patch', 'query'].includes(httpMethod);
        const isStandardNonBody = ['get', 'delete', 'head', 'options', 'jsonp'].includes(httpMethod);

        let httpCall = '';
        if (isStandardBody) {
            if (httpMethod === 'query') {
                httpCall = `this.http.request('QUERY', url, { ...requestOptions, body: ${bodyArgument} } as any)`;
            } else {
                httpCall = `this.http.${httpMethod}<${model.responseType}>(url, ${bodyArgument}, requestOptions as any)`;
            }
        } else if (bodyArgument !== 'null') {
            httpCall = `this.http.request<${model.responseType}>('${model.httpMethod}', url, { ...requestOptions, body: ${bodyArgument} } as any)`;
        } else if (isStandardNonBody) {
            httpCall = `this.http.${httpMethod}<${model.responseType}>(url, requestOptions as any)`;
        } else {
            httpCall = `this.http.request<${model.responseType}>('${model.httpMethod}', url, requestOptions as any)`;
        }

        // 11. Response Filtering/Transformation
        if (isSeq) {
            const delimiter = model.responseSerialization === 'json-seq' ? '\\x1e' : '\\n';
            lines.push(`return ${httpCall}.pipe(`);
            lines.push(`  map(response => {`);
            lines.push(`    if (typeof response !== 'string') return response as any;`);
            lines.push(`    const items = response.split('${delimiter}').filter(part => part.trim().length > 0);`);
            lines.push(`    return items.map(item => JSON.parse(item));`);
            lines.push(`  })`);
            lines.push(`);`);
        } else if (isXmlResp) {
            lines.push(`return ${httpCall}.pipe(`);
            lines.push(`  map(response => {`);
            lines.push(`    if (typeof response !== 'string') return response as any;`);
            lines.push(`    return XmlParser.parse(response, ${JSON.stringify(model.responseXmlConfig)});`);
            lines.push(`  })`);
            lines.push(`);`);
        } else {
            lines.push(`return ${httpCall};`);
        }

        return lines.join('\n');
    }

    private emitOverloads(methodName: string, responseType: string, parameters: OptionalKind<ParameterDeclarationStructure>[], isDeprecated: boolean, isSSE: boolean): OptionalKind<MethodDeclarationOverloadStructure>[] {
        const paramsDocs = parameters.map(p => `@param ${p.name} ${p.hasQuestionToken ? '(optional) ' : ''}`).join('\n');
        const finalResponseType = responseType === 'any' ? 'any' : (responseType || 'unknown');
        const deprecationDoc = isDeprecated ? '\n@deprecated' : '';

        if (isSSE) {
            return [{
                parameters: [...parameters],
                returnType: `Observable<${finalResponseType}>`,
                docs: [`${methodName} (Server-Sent Events).\n${paramsDocs}\n${deprecationDoc}`]
            }];
        }

        return [
            {
                parameters: [...parameters, {
                    name: 'options',
                    hasQuestionToken: true,
                    type: `RequestOptions & { observe?: 'body' }`
                }],
                returnType: `Observable<${finalResponseType}>`,
                docs: [`${methodName}. \n${paramsDocs}\n@param options The options for this request.${deprecationDoc}`]
            },
            {
                parameters: [...parameters, {
                    name: 'options',
                    hasQuestionToken: false,
                    type: `RequestOptions & { observe: 'response' }`
                }],
                // HttpResponse remains generic for full response access
                returnType: `Observable<HttpResponse<${finalResponseType}>>`,
                docs: [`${methodName}. \n${paramsDocs}\n@param options The options for this request, with response observation enabled.${deprecationDoc}`]
            },
            {
                parameters: [...parameters, {
                    name: 'options',
                    hasQuestionToken: false,
                    type: `RequestOptions & { observe: 'events' }`
                }],
                returnType: `Observable<HttpEvent<${finalResponseType}>>`,
                docs: [`${methodName}. \n${paramsDocs}\n@param options The options for this request, with event observation enabled.${deprecationDoc}`]
            }
        ].map(o => {
            if (parameters.some(p => p.hasQuestionToken) && o.parameters.find(p => p.name === 'options')) {
                o.parameters.find(p => p.name === 'options')!.hasQuestionToken = true;
            }
            return o;
        });
    }
}
