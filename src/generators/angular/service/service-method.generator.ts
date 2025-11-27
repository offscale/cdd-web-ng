import {
    ClassDeclaration,
    MethodDeclarationOverloadStructure,
    OptionalKind,
    ParameterDeclarationStructure,
} from 'ts-morph';

import { GeneratorConfig, PathInfo } from '@src/core/types/index.js';
import { SwaggerParser } from '@src/core/parser.js';
import { ServiceMethodAnalyzer } from '@src/analysis/service-method-analyzer.js';
import { ResponseVariant, ServiceMethodModel } from '@src/analysis/service-method-types.js';
import { camelCase, pascalCase } from '@src/core/utils/index.js';

export class ServiceMethodGenerator {
    private analyzer: ServiceMethodAnalyzer;

    constructor(
        private readonly config: GeneratorConfig,
        readonly parser: SwaggerParser,
    ) {
        this.analyzer = new ServiceMethodAnalyzer(config, parser);
    }

    public addServiceMethod(classDeclaration: ClassDeclaration, operation: PathInfo): void {
        const model = this.analyzer.analyze(operation);
        if (!model) {
            console.warn(
                `[ServiceMethodGenerator] Skipping method generation for operation without a methodName detected.`,
            );
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
                docs: [`Error union for ${model.methodName}`],
            });
            errorTypeAlias = typeName;
        }

        const isSSE = model.responseSerialization === 'sse';

        // Determine if we need content negotiation overloads
        // We have negotiation if there are multiple valid success variants with different mediaTypes
        const distinctVariants = model.responseVariants.filter(
            (v, i, a) => a.findIndex(t => t.mediaType === v.mediaType) === i && v.mediaType !== '',
        );
        const hasContentNegotiation = distinctVariants.length > 1;

        const bodyStatements = this.emitMethodBody(model, operation, isSSE, hasContentNegotiation);
        const overloads = this.emitOverloads(
            model.methodName,
            model.responseType,
            model.parameters,
            model.isDeprecated,
            isSSE,
            model.responseVariants,
        );

        // Default return type for implementation signature (widest type)
        // If multiple variants, we return a union of their types.
        let returnType = `Observable<${model.responseType}>`;
        if (hasContentNegotiation) {
            const unionType = [...new Set(model.responseVariants.map(v => v.type))].join(' | ');
            returnType = `Observable<${unionType}>`;
        }

        const docs = model.docs ? [model.docs] : [];
        if (errorTypeAlias) {
            docs.push(`\n@throws {${errorTypeAlias}}`);
        }

        classDeclaration.addMethod({
            name: model.methodName,
            parameters: [
                ...model.parameters,
                {
                    name: 'options',
                    hasQuestionToken: true,
                    type: `RequestOptions & { observe?: 'body' | 'events' | 'response', responseType?: 'arraybuffer' | 'blob' | 'json' | 'text' }`,
                },
            ],
            returnType: returnType,
            statements: bodyStatements,
            overloads: overloads,
            docs: docs,
        });
    }

    private emitMethodBody(
        model: ServiceMethodModel,
        rawOp: PathInfo,
        isSSE: boolean,
        hasContentNegotiation: boolean,
    ): string {
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
            lines.push(
                `  ${paramName}Serialized = XmlBuilder.serialize(${paramName}, '${rootName}', ${JSON.stringify(xmlConfig)});`,
            );
            lines.push(`}`);
        });

        // 2. Path Construction (Using generic serializer)
        let urlTemplate = model.urlTemplate;
        model.pathParams.forEach(p => {
            const serializeCall = `ParameterSerializer.serializePathParam('${p.originalName}', ${p.paramName}, '${p.style || 'simple'}', ${p.explode}, ${p.allowReserved}${p.serializationLink === 'json' ? ", 'json'" : ''})`;
            urlTemplate = urlTemplate.replace(`{${p.originalName}}`, `\${${serializeCall}}`);
        });

        // 3. Query String Logic (Legacy) - adapted to generic serializer
        const qsParam = rawOp.parameters?.find(p => (p.in as any) === 'querystring');
        let queryStringVariable = '';
        if (qsParam) {
            const pName = camelCase(qsParam.name);
            const hint = (qsParam as any).content?.['application/json'] ? ", 'json'" : '';
            lines.push(`const queryString = ParameterSerializer.serializeRawQuerystring(${pName}${hint});`);
            queryStringVariable = "${queryString ? '?' + queryString : ''}";
        }

        // 4. Base Path
        if (model.hasServers && model.basePath) {
            lines.push(`const basePath = '${model.basePath}';`);
        } else {
            lines.push(`const basePath = this.basePath;`);
        }
        lines.push(`const url = \`\${basePath}${urlTemplate}${queryStringVariable}\`;`);

        // 5. Query Params (Using generic serializer and adapting to Angular HttpParams)
        const standardQueryParams = model.queryParams.filter(p => p.originalName !== qsParam?.name);

        if (standardQueryParams.length > 0) {
            // Angular HttpParams requires 'encoder'
            lines.push(
                `let params = new HttpParams({ encoder: new ApiParameterCodec(), fromObject: options?.params ?? {} });`,
            );
            standardQueryParams.forEach(p => {
                const configObj = JSON.stringify({
                    name: p.originalName,
                    in: 'query',
                    style: p.style,
                    explode: p.explode,
                    allowReserved: p.allowReserved,
                    serialization: p.serializationLink,
                    // Support for OAS 3.2 allowEmptyValue - passed via config object
                    allowEmptyValue: (p as any).allowEmptyValue,
                });
                lines.push(
                    `const serialized_${p.paramName} = ParameterSerializer.serializeQueryParam(${configObj}, ${p.paramName});`,
                );
                lines.push(
                    `serialized_${p.paramName}.forEach(entry => params = params.append(entry.key, entry.value));`,
                );
            });
        }

        // 6. Headers
        lines.push(
            `let headers = options?.headers instanceof HttpHeaders ? options.headers : new HttpHeaders(options?.headers ?? {});`,
        );
        model.headerParams.forEach(p => {
            const hint = p.serializationLink === 'json' ? ", 'json'" : '';
            lines.push(
                `if (${p.paramName} != null) { headers = headers.set('${p.originalName}', ParameterSerializer.serializeHeaderParam(${p.paramName}, ${p.explode}${hint})); }`,
            );
        });

        // 7. Cookies
        if (model.cookieParams.length > 0) {
            if (this.config.options.platform !== 'node') {
                lines.push(`// WARNING: Setting 'Cookie' headers manually is forbidden in browsers.`);
                lines.push(
                    `if (typeof window !== 'undefined') { console.warn('Operation ${model.methodName} attempts to set "Cookie" header manually. This will fail in browsers.'); }`,
                );
            }
            lines.push(`const __cookies: string[] = [];`);
            model.cookieParams.forEach(p => {
                const hint = p.serializationLink === 'json' ? ", 'json'" : '';
                lines.push(
                    `if (${p.paramName} != null) { __cookies.push(ParameterSerializer.serializeCookieParam('${p.originalName}', ${p.paramName}, '${p.style || 'form'}', ${p.explode}, ${p.allowReserved}${hint})); }`,
                );
            });
            lines.push(`if (__cookies.length > 0) { headers = headers.set('Cookie', __cookies.join('; ')); }`);
        }

        // 8. Content Negotiation Setup
        if (hasContentNegotiation) {
            lines.push(`const acceptHeader = headers.get('Accept');`);
        }

        // 9. Security & Options
        let contextConstruction = `this.createContextWithClientId(options?.context)`;
        if (model.security.length > 0) {
            contextConstruction += `.set(SECURITY_CONTEXT_TOKEN, ${JSON.stringify(model.security)})`;
        }
        if (model.extensions && Object.keys(model.extensions).length > 0) {
            contextConstruction += `.set(EXTENSIONS_CONTEXT_TOKEN, ${JSON.stringify(model.extensions)})`;
        }

        let responseTypeVal = `options?.responseType`;

        if (hasContentNegotiation) {
            const xmlOrSeqCondition = model.responseVariants
                .filter(v => v.serialization === 'xml' || v.serialization.startsWith('json-'))
                .map(v => `acceptHeader?.includes('${v.mediaType}')`)
                .join(' || ');

            if (xmlOrSeqCondition) {
                responseTypeVal = `(${xmlOrSeqCondition}) ? 'text' : (options?.responseType ?? 'json')`;
            }
        } else {
            const isSeq = model.responseSerialization === 'json-seq' || model.responseSerialization === 'json-lines';
            const isXmlResp = model.responseSerialization === 'xml';
            if (isSeq || isXmlResp) responseTypeVal = `'text'`;
        }

        let optionProperties = `
  observe: options?.observe, 
  reportProgress: options?.reportProgress, 
  responseType: ${responseTypeVal}, 
  withCredentials: options?.withCredentials, 
  context: ${contextConstruction}`;

        if (standardQueryParams.length > 0) optionProperties += `,\n  params`;
        optionProperties += `,\n  headers`;

        lines.push(`let requestOptions: HttpRequestOptions = {${optionProperties}\n};`);

        // 10. Body Handling
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
                if (model.requestEncodingConfig) {
                    lines.push(`if (${body.paramName} !== null && ${body.paramName} !== undefined) {`);
                    lines.push(
                        `  ${body.paramName} = ContentEncoder.encode(${body.paramName}, ${JSON.stringify(model.requestEncodingConfig)});`,
                    );
                    lines.push(`}`);
                }
            } else if (body.type === 'urlencoded') {
                // Use generic serializer then adapt to Angular HttpParams
                lines.push(
                    `const urlParamEntries = ParameterSerializer.serializeUrlEncodedBody(${body.paramName}, ${JSON.stringify(body.config)});`,
                );
                lines.push(`let formBody = new HttpParams({ encoder: new ApiParameterCodec() });`);
                lines.push(`urlParamEntries.forEach(entry => formBody = formBody.append(entry.key, entry.value));`);
                bodyArgument = 'formBody';
            } else if (body.type === 'multipart') {
                lines.push(`const multipartConfig = ${JSON.stringify(body.config)};`);
                lines.push(`const multipartResult = MultipartBuilder.serialize(${body.paramName}, multipartConfig);`);
                lines.push(`if (multipartResult.headers) {`);
                lines.push(
                    `  const newHeaders = requestOptions.headers instanceof HttpHeaders ? requestOptions.headers : new HttpHeaders(requestOptions.headers || {});`,
                );
                lines.push(`  Object.entries(multipartResult.headers).forEach(([k, v]) => newHeaders.set(k, v));`);
                lines.push(`  requestOptions = { ...requestOptions, headers: newHeaders };`);
                lines.push(`}`);
                bodyArgument = 'multipartResult.content';
            } else if (body.type === 'xml') {
                lines.push(
                    `const xmlBody = XmlBuilder.serialize(${body.paramName}, '${body.rootName}', ${JSON.stringify(body.config)});`,
                );
                bodyArgument = 'xmlBody';
            }
        }

        if (isSSE) {
            lines.push(`
            return new Observable<${model.responseType}>(observer => { 
                const eventSource = new EventSource(url); 
                eventSource.onmessage = (event) => { 
                    try { observer.next(JSON.parse(event.data)); } catch (e) { observer.next(event.data); } 
                }; 
                eventSource.onerror = (error) => { observer.error(error); eventSource.close(); }; 
                return () => eventSource.close(); 
            });`);
            return lines.join('\n');
        }

        // 11. HTTP Call
        const httpMethod = model.httpMethod.toLowerCase();
        const isStandardBody = ['post', 'put', 'patch', 'query'].includes(httpMethod);
        const isStandardNonBody = ['get', 'delete', 'head', 'options', 'jsonp'].includes(httpMethod);

        const returnGeneric = `any`;

        let httpCall: string;
        if (isStandardBody) {
            if (httpMethod === 'query') {
                httpCall = `this.http.request('QUERY', url, { ...requestOptions, body: ${bodyArgument} } as any)`;
            } else {
                httpCall = `this.http.${httpMethod}<${returnGeneric}>(url, ${bodyArgument}, requestOptions as any)`;
            }
        } else if (bodyArgument !== 'null') {
            httpCall = `this.http.request<${returnGeneric}>('${model.httpMethod}', url, { ...requestOptions, body: ${bodyArgument} } as any)`;
        } else if (isStandardNonBody) {
            httpCall = `this.http.${httpMethod}<${returnGeneric}>(url, requestOptions as any)`;
        } else {
            httpCall = `this.http.request<${returnGeneric}>('${model.httpMethod}', url, requestOptions as any)`;
        }

        // 12. Response Transformation Logic
        if (hasContentNegotiation) {
            lines.push(`return ${httpCall}.pipe(`);
            lines.push(`  map(response => {`);

            model.responseVariants.forEach(v => {
                const check = `acceptHeader?.includes('${v.mediaType}')`;
                lines.push(`    // Handle ${v.mediaType}`);
                if (v.isDefault) lines.push(`    // Default fallback`);

                const isXml = v.serialization === 'xml';
                const isSeq = v.serialization === 'json-seq' || v.serialization === 'json-lines';

                if (isXml) {
                    lines.push(`    if (${check}) {`);
                    lines.push(`       if (typeof response !== 'string') return response;`);
                    lines.push(`       return XmlParser.parse(response, ${JSON.stringify(v.xmlConfig)});`);
                    lines.push(`    }`);
                } else if (isSeq) {
                    const delimiter = v.serialization === 'json-seq' ? '\\x1e' : '\\n';
                    lines.push(`    if (${check}) {`);
                    lines.push(`       if (typeof response !== 'string') return response;`);
                    lines.push(
                        `       return response.split('${delimiter}').filter((p: string) => p.trim().length > 0).map((i: string) => JSON.parse(i));`,
                    );
                    lines.push(`    }`);
                } else if (v.decodingConfig) {
                    lines.push(`    if (${check}) {`);
                    lines.push(`       return ContentDecoder.decode(response, ${JSON.stringify(v.decodingConfig)});`);
                    lines.push(`    }`);
                }
            });

            const def = model.responseVariants.find(v => v.isDefault);
            if (def && def.decodingConfig) {
                lines.push(`    // Default decoding`);
                lines.push(`    return ContentDecoder.decode(response, ${JSON.stringify(def.decodingConfig)});`);
            } else {
                lines.push(`    return response;`);
            }

            lines.push(`  })`);
            lines.push(`);`);
        } else {
            const isSeq = model.responseSerialization === 'json-seq' || model.responseSerialization === 'json-lines';
            const isXmlResp = model.responseSerialization === 'xml';

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
            } else if (model.responseDecodingConfig) {
                lines.push(`return ${httpCall}.pipe(`);
                lines.push(`  map(response => {`);
                lines.push(
                    `    return ContentDecoder.decode(response, ${JSON.stringify(model.responseDecodingConfig)});`,
                );
                lines.push(`  })`);
                lines.push(`);`);
            } else {
                lines.push(`return ${httpCall};`);
            }
        }

        return lines.join('\n');
    }

    private emitOverloads(
        methodName: string,
        responseType: string,
        parameters: OptionalKind<ParameterDeclarationStructure>[],
        isDeprecated: boolean,
        isSSE: boolean,
        variants: ResponseVariant[],
    ): OptionalKind<MethodDeclarationOverloadStructure>[] {
        const paramsDocs = parameters
            .map(p => `@param ${p.name} ${p.hasQuestionToken ? '(optional) ' : ''}`)
            .join('\n');
        const defaultResponseType = responseType === 'any' ? 'any' : responseType || 'unknown';
        const deprecationDoc = isDeprecated ? '\n@deprecated' : '';
        const overloads: OptionalKind<MethodDeclarationOverloadStructure>[] = [];

        if (isSSE) {
            return [
                {
                    parameters: [...parameters],
                    returnType: `Observable<${defaultResponseType}>`,
                    docs: [`${methodName} (Server-Sent Events).\n${paramsDocs}\n${deprecationDoc}`],
                },
            ];
        }

        const distinctVariants = variants.filter(
            (v, i, a) => a.findIndex(t => t.mediaType === v.mediaType) === i && v.mediaType !== '',
        );

        if (distinctVariants.length > 1) {
            for (const variant of distinctVariants) {
                overloads.push({
                    parameters: [
                        ...parameters,
                        {
                            name: 'options',
                            hasQuestionToken: false,
                            type: `RequestOptions & { headers: { 'Accept': '${variant.mediaType}' } }`,
                        },
                    ],
                    returnType: `Observable<${variant.type}>`,
                    docs: [
                        `${methodName} (${variant.mediaType})\n${paramsDocs}\n@param options Options with Accept header '${variant.mediaType}'${deprecationDoc}`,
                    ],
                });
            }
        }

        overloads.push({
            parameters: [
                ...parameters,
                {
                    name: 'options',
                    hasQuestionToken: true,
                    type: `RequestOptions & { observe?: 'body' }`,
                },
            ],
            returnType: `Observable<${defaultResponseType}>`,
            docs: [`${methodName}. \n${paramsDocs}\n@param options The options for this request.${deprecationDoc}`],
        });

        overloads.push({
            parameters: [
                ...parameters,
                {
                    name: 'options',
                    hasQuestionToken: false,
                    type: `RequestOptions & { observe: 'response' }`,
                },
            ],
            returnType: `Observable<HttpResponse<${defaultResponseType}>>`,
            docs: [
                `${methodName}. \n${paramsDocs}\n@param options The options for this request, with response observation enabled.${deprecationDoc}`,
            ],
        });

        overloads.push({
            parameters: [
                ...parameters,
                {
                    name: 'options',
                    hasQuestionToken: false,
                    type: `RequestOptions & { observe: 'events' }`,
                },
            ],
            returnType: `Observable<HttpEvent<${defaultResponseType}>>`,
            docs: [
                `${methodName}. \n${paramsDocs}\n@param options The options for this request, with event observation enabled.${deprecationDoc}`,
            ],
        });

        return overloads.map(o => {
            if (parameters.some(p => p.hasQuestionToken) && o.parameters?.find(p => p.name === 'options')) {
                o.parameters.find(p => p.name === 'options')!.hasQuestionToken = true;
            }
            return o;
        });
    }
}
