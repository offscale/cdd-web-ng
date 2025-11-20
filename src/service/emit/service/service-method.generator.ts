import {
    ClassDeclaration,
    MethodDeclarationOverloadStructure,
    OptionalKind,
    ParameterDeclarationStructure,
} from 'ts-morph';
import { GeneratorConfig, Parameter, PathInfo, SwaggerDefinition } from '@src/core/types.js';
import { camelCase, getTypeScriptType, isDataTypeInterface } from '@src/core/utils.js';
import { HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { SwaggerParser } from "@src/core/parser.js";

/** A strongly-typed representation of Angular's HttpRequest options. */
interface HttpRequestOptions {
    headers?: HttpHeaders;
    context?: HttpContext;
    params?: HttpParams;
    reportProgress?: boolean;
    responseType?: 'arraybuffer' | 'blob' | 'json' | 'text';
    withCredentials?: boolean;
    observe?: 'body' | 'events' | 'response';
}

/**
 * Generates individual methods within a generated Angular service class.
 * This class handles parameter mapping, response type resolution, method body construction,
 * and the creation of observable-based method overloads for different response types.
 */
export class ServiceMethodGenerator {
    constructor(
        private readonly config: GeneratorConfig,
        private readonly parser: SwaggerParser
    ) {
    }

    public addServiceMethod(classDeclaration: ClassDeclaration, operation: PathInfo): void {
        if (!operation.methodName) {
            console.warn(`[ServiceMethodGenerator] Skipping method generation for operation without a methodName (operationId: ${operation.operationId})`);
            return;
        }

        const knownTypes = this.parser.schemas.map(s => s.name);
        const responseType = this.getResponseType(operation, knownTypes);
        const parameters = this.getMethodParameters(operation, knownTypes);
        const bodyStatements = this.buildMethodBody(operation, parameters);
        const overloads = this.buildOverloads(operation.methodName, responseType, parameters);

        let docText =
            (operation.summary || operation.description || `Performs a ${operation.method} request to ${operation.path}.`) +
            (operation.description && operation.summary ? `\n\n${operation.description}` : '');

        if (operation.externalDocs?.url) {
            docText += `\n\n@see ${operation.externalDocs.url} ${operation.externalDocs.description || ''}`.trimEnd();
        }

        classDeclaration.addMethod({
            name: operation.methodName,
            parameters: [...parameters, {
                name: 'options',
                hasQuestionToken: true,
                type: `RequestOptions & { observe?: 'body' | 'events' | 'response', responseType?: 'arraybuffer' | 'blob' | 'json' | 'text' }`
            }],
            returnType: 'Observable<any>',
            statements: bodyStatements,
            overloads: overloads,
            docs: [docText]
        });
    }

    private getResponseType(operation: PathInfo, knownTypes: string[]): string {
        if (operation.responses?.['204']) return 'void';

        const successCode = Object.keys(operation.responses ?? {}).find(code => code.startsWith('2'));
        if (successCode) {
            const responseSchema = operation.responses![successCode]?.content?.['application/json']?.schema;
            if (responseSchema) {
                return getTypeScriptType(responseSchema as SwaggerDefinition, this.config, knownTypes);
            }
        }

        const httpMethod = operation.method.toLowerCase();
        if (httpMethod === 'post' || httpMethod === 'put') {
            const requestSchema = operation.requestBody?.content?.['application/json']?.schema;
            if (requestSchema) {
                return getTypeScriptType(requestSchema as SwaggerDefinition, this.config, knownTypes);
            }
        }

        return 'any';
    }

    private getMethodParameters(operation: PathInfo, knownTypes: string[]): OptionalKind<ParameterDeclarationStructure>[] {
        const parameters: OptionalKind<ParameterDeclarationStructure>[] = [];

        (operation.parameters ?? []).forEach(param => {
            const paramName = camelCase(param.name);
            let effectiveSchema = param.schema;
            if (param.content) {
                const firstType = Object.keys(param.content)[0];
                if (firstType && param.content[firstType].schema) {
                    effectiveSchema = param.content[firstType].schema as SwaggerDefinition;
                }
            }
            const paramType = getTypeScriptType(effectiveSchema, this.config, knownTypes);

            parameters.push({
                name: paramName,
                type: paramType,
                hasQuestionToken: !param.required
            });
        });

        const requestBody = operation.requestBody;
        if (requestBody) {
            const content = requestBody.content?.[Object.keys(requestBody.content)[0]];
            if (content?.schema) {
                let bodyType = getTypeScriptType(content.schema as SwaggerDefinition, this.config, knownTypes);
                const rawBodyType = bodyType.replace(/\[\]| \| null/g, '');

                if (knownTypes.includes(rawBodyType)) {
                    const schemaObj = this.parser.schemas.find(s => s.name === rawBodyType);
                    const definition = schemaObj?.definition;
                    if (definition && this.needsRequestType(definition)) {
                        bodyType = bodyType.replace(rawBodyType, `${rawBodyType}Request`);
                    }
                }

                const bodyName = isDataTypeInterface(rawBodyType) ? camelCase(rawBodyType) : 'body';
                parameters.push({ name: bodyName, type: bodyType, hasQuestionToken: !requestBody.required });
            } else {
                parameters.push({ name: 'body', type: 'unknown', hasQuestionToken: !requestBody.required });
            }
        }

        return parameters.sort((a, b) => (a.hasQuestionToken ? 1 : 0) - (b.hasQuestionToken ? 1 : 0));
    }

    private needsRequestType(definition: SwaggerDefinition): boolean {
        if (!definition.properties) return false;
        return Object.values(definition.properties).some(p => p.readOnly || p.writeOnly);
    }

    private isJsonContent(p: Parameter): boolean {
        if (!p.content) return false;
        const keys = Object.keys(p.content);
        return keys.some(k => k.includes('application/json') || k.includes('*/*'));
    }

    private buildMethodBody(operation: PathInfo, parameters: OptionalKind<ParameterDeclarationStructure>[]): string {
        let urlTemplate = operation.path;
        operation.parameters?.filter(p => p.in === 'path').forEach(p => {
            const jsParam = camelCase(p.name);
            const style = p.style || 'simple';
            const explode = p.explode ?? false;
            const allowReserved = p.allowReserved ?? false;
            const serializationArg = this.isJsonContent(p) ? ", 'json'" : "";
            urlTemplate = urlTemplate.replace(`{${p.name}}`, `\${HttpParamsBuilder.serializePathParam('${p.name}', ${jsParam}, '${style}', ${explode}, ${allowReserved}${serializationArg})}`);
        });

        const lines: string[] = [];

        const querystringParams = operation.parameters?.filter(p => p.in === 'querystring') ?? [];
        if (querystringParams.length > 0) {
            lines.push(`// TODO: querystring parameters are not handled by Angular's HttpClient. You may need to handle them manually by constructing the URL. 
console.warn('The following querystring parameters are not automatically handled:', ${JSON.stringify(querystringParams.map(p => p.name))});`);
        }

        lines.push(`const url = \`\${this.basePath}${urlTemplate}\`;`);

        const requestOptions: HttpRequestOptions = {};

        const queryParams = operation.parameters?.filter(p => p.in === 'query') ?? [];
        if (queryParams.length > 0) {
            lines.push(`let params = new HttpParams({ fromObject: options?.params ?? {} });`);
            queryParams.forEach(p => {
                const paramName = camelCase(p.name);
                const paramDefJson = JSON.stringify(p);
                lines.push(`if (${paramName} != null) { params = HttpParamsBuilder.serializeQueryParam(params, ${paramDefJson}, ${paramName}); }`);
            });
            requestOptions.params = 'params' as any;
        }

        const headerParams = operation.parameters?.filter(p => p.in === 'header') ?? [];
        const cookieParams = operation.parameters?.filter(p => p.in === 'cookie') ?? [];

        if (headerParams.length > 0 || cookieParams.length > 0) {
            lines.push(`let headers = options?.headers instanceof HttpHeaders ? options.headers : new HttpHeaders(options?.headers ?? {});`);

            headerParams.forEach(p => {
                const paramName = camelCase(p.name);
                const explode = p.explode ?? false;
                const serializationArg = this.isJsonContent(p) ? ", 'json'" : "";
                lines.push(`if (${paramName} != null) { headers = headers.set('${p.name}', HttpParamsBuilder.serializeHeaderParam('${p.name}', ${paramName}, ${explode}${serializationArg})); }`);
            });

            if (cookieParams.length > 0) {
                lines.push(`const __cookies: string[] = [];`);
                cookieParams.forEach(p => {
                    const paramName = camelCase(p.name);
                    const style = p.style || 'form';
                    const explode = p.explode ?? true;
                    const serializationArg = this.isJsonContent(p) ? ", 'json'" : "";
                    lines.push(`if (${paramName} != null) { __cookies.push(HttpParamsBuilder.serializeCookieParam('${p.name}', ${paramName}, '${style}', ${explode}${serializationArg})); }`);
                });
                lines.push(`if (__cookies.length > 0) { headers = headers.set('Cookie', __cookies.join('; ')); }`);
            }

            requestOptions.headers = 'headers' as any;
        }

        const hasGlobalSecurity = Object.keys(this.parser.getSecuritySchemes()).length > 0;
        const hasSecurityOverride = operation.security && operation.security.length === 0;
        let contextConstruction = `this.createContextWithClientId(options?.context)`;

        if (hasGlobalSecurity && hasSecurityOverride) {
            contextConstruction += `.set(SKIP_AUTH_CONTEXT_TOKEN, true)`;
        }

        let optionProperties = `
  observe: options?.observe, 
  reportProgress: options?.reportProgress, 
  responseType: options?.responseType, 
  withCredentials: options?.withCredentials, 
  context: ${contextConstruction}`;

        if (requestOptions.params) {
            optionProperties += `,\n  params`;
        }
        if (requestOptions.headers) {
            optionProperties += `,\n  headers`;
        }

        lines.push(`const requestOptions: HttpRequestOptions = {${optionProperties}\n};`);

        let bodyArgument = 'null';
        const nonBodyOpParams = new Set((operation.parameters ?? []).map(p => camelCase(p.name)));
        const bodyParam = parameters.find(p => !nonBodyOpParams.has(p.name!));

        const hasMultipartContent = !!operation.requestBody?.content?.['multipart/form-data'];
        const hasUrlEncodedContent = !!operation.requestBody?.content?.['application/x-www-form-urlencoded'];

        const isUrlEncodedForm = operation.consumes?.includes('application/x-www-form-urlencoded') || hasUrlEncodedContent;
        const isMultipartForm = operation.consumes?.includes('multipart/form-data') || hasMultipartContent;
        const formDataParams = operation.parameters?.filter(p => (p as { in?: string }).in === 'formData');

        const multipartContent = operation.requestBody?.content?.['multipart/form-data'];
        const urlEncodedContent = operation.requestBody?.content?.['application/x-www-form-urlencoded'];
        const hasOas3MultipartBody = isMultipartForm && !!bodyParam && !!multipartContent;
        const hasOas3UrlEncodedBody = isUrlEncodedForm && !!bodyParam && !!urlEncodedContent;

        if (isUrlEncodedForm && formDataParams?.length) {
            lines.push(`let formBody = new HttpParams();`);
            formDataParams.forEach(p => {
                const paramName = camelCase(p.name);
                lines.push(`if (${paramName} != null) { formBody = formBody.append('${p.name}', ${paramName}); }`);
            });
            bodyArgument = 'formBody';
        } else if (hasOas3UrlEncodedBody) {
            // OAS 3.0 UrlEncoded Body Handling
            const bodyName = bodyParam!.name;
            const encodings = urlEncodedContent!.encoding || {};
            const encodingMapString = JSON.stringify(encodings);
            // We use a builder method to handle style/explode per property rules on the body object
            lines.push(`const formBody = HttpParamsBuilder.serializeUrlEncodedBody(${bodyName}, ${encodingMapString});`);
            bodyArgument = 'formBody';

        } else if (isMultipartForm && formDataParams?.length) {
            lines.push(`const formData = new FormData();`);
            formDataParams.forEach(p => {
                const paramName = camelCase(p.name);
                lines.push(`if (${paramName} != null) { formData.append('${p.name}', ${paramName}); }`);
            });
            bodyArgument = 'formData';
        } else if (hasOas3MultipartBody) {
            // OAS 3.0 Multipart Body Handling (Single Object -> FormData)
            const bodyName = bodyParam!.name;
            lines.push(`const formData = new FormData();`);
            lines.push(`if (${bodyName}) {`);

            // Extract encodings if they exist
            const encodings = multipartContent!.encoding || {};
            const encodingMapString = JSON.stringify(encodings);
            lines.push(` const encodings = ${encodingMapString} as Record<string, { contentType?: string }>;`);

            lines.push(` Object.entries(${bodyName}).forEach(([key, value]) => {`);
            lines.push(`  if (value === undefined || value === null) return;`);
            lines.push(`  const encoding = encodings[key];`);
            lines.push(`  if (encoding?.contentType) {`);
            // Improved Content-Type Handling: Not everything is JSON.
            lines.push(`    const content = encoding.contentType.includes('application/json') ? JSON.stringify(value) : String(value);`);
            lines.push(`    const blob = new Blob([content], { type: encoding.contentType });`);
            lines.push(`    formData.append(key, blob);`);
            lines.push(`  } else {`);
            // Standard append
            lines.push(`    if (value instanceof Blob || value instanceof File) { formData.append(key, value); }`);
            lines.push(`    else { formData.append(key, String(value)); }`);
            lines.push(`  }`);
            lines.push(` });`);
            lines.push(`}`);
            bodyArgument = 'formData';
        } else if (bodyParam) {
            bodyArgument = bodyParam.name!;
        }

        const httpMethod = operation.method.toLowerCase();
        if (['post', 'put', 'patch'].includes(httpMethod)) {
            lines.push(`return this.http.${httpMethod}(url, ${bodyArgument}, requestOptions as any);`);
        } else {
            lines.push(`return this.http.${httpMethod}(url, requestOptions as any);`);
        }

        return lines.join('\n');
    }

    private buildOverloads(methodName: string, responseType: string, parameters: OptionalKind<ParameterDeclarationStructure>[]): OptionalKind<MethodDeclarationOverloadStructure>[] {
        const paramsDocs = parameters.map(p => `@param ${p.name} ${p.hasQuestionToken ? '(optional) ' : ''}`).join('\n');
        const finalResponseType = responseType === 'any' ? 'any' : (responseType || 'unknown');

        return [
            {
                parameters: [...parameters, {
                    name: 'options',
                    hasQuestionToken: true,
                    type: `RequestOptions & { observe?: 'body' }`
                }],
                returnType: `Observable<${finalResponseType}>`,
                docs: [`${methodName}. \n${paramsDocs}\n@param options The options for this request.`]
            },
            {
                parameters: [...parameters, {
                    name: 'options',
                    hasQuestionToken: false,
                    type: `RequestOptions & { observe: 'response' }`
                }],
                returnType: `Observable<HttpResponse<${finalResponseType}>>`,
                docs: [`${methodName}. \n${paramsDocs}\n@param options The options for this request, with response observation enabled.`]
            },
            {
                parameters: [...parameters, {
                    name: 'options',
                    hasQuestionToken: false,
                    type: `RequestOptions & { observe: 'events' }`
                }],
                returnType: `Observable<HttpEvent<${finalResponseType}>>`,
                docs: [`${methodName}. \n${paramsDocs}\n@param options The options for this request, with event observation enabled.`]
            },
        ].map(overload => {
            const hasOptionalParam = parameters.some(p => p.hasQuestionToken);
            if (hasOptionalParam) {
                overload.parameters.find(p => p.name === 'options')!.hasQuestionToken = true;
            }
            return overload;
        });
    }
}
