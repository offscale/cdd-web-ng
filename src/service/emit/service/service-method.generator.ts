import {
    ClassDeclaration,
    MethodDeclarationOverloadStructure,
    OptionalKind,
    ParameterDeclarationStructure,
    WriterFunction,
} from 'ts-morph';
import { GeneratorConfig, Parameter, PathInfo, SwaggerDefinition } from '@src/core/types.js';
import { camelCase, getTypeScriptType, isDataTypeInterface } from '@src/core/utils.js';
import { SwaggerParser } from "@src/core/parser.js";

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
        const overloads = this.buildOverloads(operation.methodName, responseType, parameters, operation.deprecated);

        let docText =
            (operation.summary || operation.description || `Performs a ${operation.method} request to ${operation.path}.`) +
            (operation.description && operation.summary ? `\n\n${operation.description}` : '');

        if (operation.externalDocs?.url) {
            docText += `\n\n@see ${operation.externalDocs.url} ${operation.externalDocs.description || ''}`.trimEnd();
        }

        if (operation.deprecated) {
            docText += `\n\n@deprecated`;
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
        if (!operation.responses) return 'any';

        const responses = operation.responses;
        if (responses['204']) return 'void';

        const specificCode = Object.keys(responses).find(code => /^2\d{2}$/.test(code));
        const rangeCode = responses['2XX'] ? '2XX' : undefined;
        const defaultCode = responses['default'] ? 'default' : undefined;

        const targetCode = specificCode || rangeCode || defaultCode;

        if (targetCode) {
            const responseSchema = responses[targetCode]?.content?.['application/json']?.schema;
            if (responseSchema) {
                return getTypeScriptType(responseSchema as SwaggerDefinition, this.config, knownTypes);
            }
        }

        const requestSchema = operation.requestBody?.content?.['application/json']?.schema;
        if (requestSchema) {
            return getTypeScriptType(requestSchema as SwaggerDefinition, this.config, knownTypes);
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
                hasQuestionToken: !param.required,
                leadingTrivia: param.deprecated ? [`/** @deprecated */ `] : (undefined as unknown as string | WriterFunction | (string | WriterFunction)[])
            });
        });
        const requestBody = operation.requestBody;
        if (requestBody) {
            let contentType = Object.keys(requestBody.content || {})[0];
            if (requestBody.content?.['application/json']) contentType = 'application/json';
            else if (requestBody.content?.['application/xml']) contentType = 'application/xml';

            const content = requestBody.content?.[contentType!];
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

        // OAS 3.2 `in: querystring` Support
        const querystringParams = operation.parameters?.filter(p => p.in === 'querystring') ?? [];
        let queryStringVariable = '';

        if (querystringParams.length > 0) {
            const p = querystringParams[0]; // OAS Note: MUST NOT appear more than once
            const paramName = camelCase(p.name);
            const serializationHint = this.isJsonContent(p) ? ", 'json'" : "";
            lines.push(`const queryString = HttpParamsBuilder.serializeRawQuerystring(${paramName}${serializationHint});`);
            queryStringVariable = "${queryString ? '?' + queryString : ''}";
        }

        if (operation.servers && operation.servers.length > 0) {
            const serverUrl = operation.servers[0].url;
            let resolvedUrl = serverUrl;
            if (operation.servers[0].variables) {
                Object.entries(operation.servers[0].variables).forEach(([key, variable]) => {
                    resolvedUrl = resolvedUrl.replace(`{${key}}`, variable.default);
                });
            }
            lines.push(`const basePath = '${resolvedUrl}';`);
        } else {
            lines.push(`const basePath = this.basePath;`);
        }

        lines.push(`const url = \`\${basePath}${urlTemplate}${queryStringVariable}\`;`);

        const queryParams = operation.parameters?.filter(p => p.in === 'query') ?? [];
        if (queryParams.length > 0) {
            lines.push(`let params = new HttpParams({ fromObject: options?.params ?? {} });`);
            queryParams.forEach(p => {
                const paramName = camelCase(p.name);
                const paramDefJson = JSON.stringify(p);
                lines.push(`if (${paramName} != null) { params = HttpParamsBuilder.serializeQueryParam(params, ${paramDefJson}, ${paramName}); }`);
            });
        }

        const headerParams = operation.parameters?.filter(p => p.in === 'header') ?? [];
        const cookieParams = operation.parameters?.filter(p => p.in === 'cookie') ?? [];

        lines.push(`let headers = options?.headers instanceof HttpHeaders ? options.headers : new HttpHeaders(options?.headers ?? {});`);

        if (headerParams.length > 0) {
            headerParams.forEach(p => {
                const paramName = camelCase(p.name);
                const explode = p.explode ?? false;
                const serializationArg = this.isJsonContent(p) ? ", 'json'" : "";
                lines.push(`if (${paramName} != null) { headers = headers.set('${p.name}', HttpParamsBuilder.serializeHeaderParam('${p.name}', ${paramName}, ${explode}${serializationArg})); }`);
            });
        }

        if (cookieParams.length > 0) {
            console.warn(`[ServiceMethodGenerator] Warning: Operation '${operation.methodName}' (Path: ${operation.path}) defines parameters with 'in: cookie'. Setting the 'Cookie' header manually is forbidden in standard browser environments.`);
            lines.push(`// WARNING: Setting 'Cookie' headers manually is forbidden in browsers.`);
            lines.push(`console.warn('Operation ${operation.methodName} attempts to set "Cookie" header manually. This will fail in browsers.');`);

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

        const hasGlobalSecurity = Object.keys(this.parser.getSecuritySchemes()).length > 0;
        const hasSecurityOverride = operation.security && operation.security.length === 0;
        let contextConstruction = `this.createContextWithClientId(options?.context)`;

        if (hasGlobalSecurity && hasSecurityOverride) {
            contextConstruction += `.set(SKIP_AUTH_CONTEXT_TOKEN, true)`;
        }

        // Security Scopes Collection
        if (operation.security && operation.security.length > 0) {
            const distinctScopes = new Set<string>();
            operation.security.forEach(requirement => {
                Object.values(requirement).forEach(scopes => {
                    scopes.forEach(scope => distinctScopes.add(scope));
                });
            });

            if (distinctScopes.size > 0) {
                const scopesArrayString = JSON.stringify(Array.from(distinctScopes));
                contextConstruction += `.set(AUTH_SCOPES_CONTEXT_TOKEN, ${scopesArrayString})`;
            }
        }

        let optionProperties = `
  observe: options?.observe, 
  reportProgress: options?.reportProgress, 
  responseType: options?.responseType, 
  withCredentials: options?.withCredentials, 
  context: ${contextConstruction}`;

        // Always include headers, but params only if defined.
        if (queryParams.length > 0) optionProperties += `,\n  params`;
        optionProperties += `,\n  headers`;

        lines.push(`let requestOptions: HttpRequestOptions = {${optionProperties}\n};`);

        let bodyArgument = 'null';
        const nonBodyOpParams = new Set((operation.parameters ?? []).map(p => camelCase(p.name)));
        const bodyParam = parameters.find(p => !nonBodyOpParams.has(p.name!));

        const hasMultipartContent = !!operation.requestBody?.content?.['multipart/form-data'];
        const hasUrlEncodedContent = !!operation.requestBody?.content?.['application/x-www-form-urlencoded'];
        const hasXmlContent = !!operation.requestBody?.content?.['application/xml'];

        const isUrlEncodedForm = operation.consumes?.includes('application/x-www-form-urlencoded') || hasUrlEncodedContent;
        const isMultipartForm = operation.consumes?.includes('multipart/form-data') || hasMultipartContent;
        const formDataParams = operation.parameters?.filter(p => (p as { in?: string }).in === 'formData');

        const multipartContent = operation.requestBody?.content?.['multipart/form-data'];
        const urlEncodedContent = operation.requestBody?.content?.['application/x-www-form-urlencoded'];
        const xmlContent = operation.requestBody?.content?.['application/xml'];

        const hasOas3MultipartBody = isMultipartForm && !!bodyParam && !!multipartContent;
        const hasOas3UrlEncodedBody = isUrlEncodedForm && !!bodyParam && !!urlEncodedContent;
        const hasOas3XmlBody = hasXmlContent && !!bodyParam && !!xmlContent;

        if (isUrlEncodedForm && formDataParams?.length) {
            lines.push(`let formBody = new HttpParams();`);
            formDataParams.forEach(p => {
                const paramName = camelCase(p.name);
                lines.push(`if (${paramName} != null) { formBody = formBody.append('${p.name}', ${paramName}); }`);
            });
            bodyArgument = 'formBody';
        } else if (hasOas3UrlEncodedBody) {
            const bodyName = bodyParam!.name;
            const encodings = urlEncodedContent!.encoding || {};
            const encodingMapString = JSON.stringify(encodings);
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
            // Implement MultipartBuilder for OAS 3.x support with custom headers
            const bodyName = bodyParam!.name;
            const encodings = multipartContent!.encoding || {};
            const encodingMapString = JSON.stringify(encodings);

            lines.push(`const multipartConfig = ${encodingMapString};`);
            lines.push(`const multipartResult = MultipartBuilder.serialize(${bodyName}, multipartConfig);`);

            // If manual serialization (Blob) is used due to custom headers, we must merge the Content-Type header
            lines.push(`if (multipartResult.headers) {`);
            lines.push(`  const newHeaders = requestOptions.headers instanceof HttpHeaders ? requestOptions.headers : new HttpHeaders(requestOptions.headers || {});`);
            lines.push(`  Object.entries(multipartResult.headers).forEach(([k, v]) => newHeaders.set(k, v));`);
            lines.push(`  requestOptions = { ...requestOptions, headers: newHeaders };`);
            lines.push(`}`);

            bodyArgument = 'multipartResult.content';
        } else if (hasOas3XmlBody) {
            const bodyName = bodyParam!.name;
            const schema = xmlContent!.schema as SwaggerDefinition;
            const xmlConfig = this.getXmlConfig(schema, 5);
            const rootName = schema.xml?.name || 'root';
            lines.push(`const xmlBody = XmlBuilder.serialize(${bodyName}, '${rootName}', ${JSON.stringify(xmlConfig)});`);
            bodyArgument = 'xmlBody';
        } else if (bodyParam) {
            bodyArgument = bodyParam.name!;
        }

        const httpMethod = operation.method.toLowerCase();
        const isStandardBodyMethod = ['post', 'put', 'patch', 'query'].includes(httpMethod);
        const isStandardNonBodyMethod = ['get', 'delete', 'head', 'options', 'jsonp'].includes(httpMethod);

        if (isStandardBodyMethod) {
            if (httpMethod === 'query') {
                lines.push(`return this.http.request('QUERY', url, { ...requestOptions, body: ${bodyArgument} } as any);`);
            } else {
                lines.push(`return this.http.${httpMethod}(url, ${bodyArgument}, requestOptions as any);`);
            }
        } else if (bodyArgument !== 'null') {
            lines.push(`return this.http.request('${operation.method.toUpperCase()}', url, { ...requestOptions, body: ${bodyArgument} } as any);`);
        } else if (isStandardNonBodyMethod) {
            lines.push(`return this.http.${httpMethod}(url, requestOptions as any);`);
        } else {
            lines.push(`return this.http.request('${operation.method.toUpperCase()}', url, requestOptions as any);`);
        }

        return lines.join('\n');
    }

    private getXmlConfig(schema: SwaggerDefinition | undefined, depth: number): any {
        if (!schema || depth <= 0) return {};
        const resolved = this.parser.resolve(schema);
        if (!resolved) return {};
        const config: any = {};
        if (resolved.xml?.name) config.name = resolved.xml.name;
        if (resolved.xml?.attribute) config.attribute = true;
        if (resolved.xml?.wrapped) config.wrapped = true;
        if (resolved.type === 'array' && resolved.items) {
            config.items = this.getXmlConfig(resolved.items as SwaggerDefinition, depth - 1);
        }
        if (resolved.properties) {
            config.properties = {};
            Object.entries(resolved.properties).forEach(([propName, propSchema]) => {
                const propConfig = this.getXmlConfig(propSchema, depth - 1);
                if (Object.keys(propConfig).length > 0) {
                    config.properties[propName] = propConfig;
                }
            });
        }
        if (resolved.allOf) {
            resolved.allOf.forEach(sub => {
                const subConfig = this.getXmlConfig(sub, depth - 1);
                if (subConfig.properties) {
                    config.properties = { ...config.properties, ...subConfig.properties };
                }
            });
        }
        return config;
    }

    private buildOverloads(methodName: string, responseType: string, parameters: OptionalKind<ParameterDeclarationStructure>[], isDeprecated?: boolean): OptionalKind<MethodDeclarationOverloadStructure>[] {
        const paramsDocs = parameters.map(p => `@param ${p.name} ${p.hasQuestionToken ? '(optional) ' : ''}`).join('\n');
        const finalResponseType = responseType === 'any' ? 'any' : (responseType || 'unknown');

        const deprecationDoc = isDeprecated ? '\n@deprecated' : '';

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
            if (parameters.some(p => p.hasQuestionToken)) o.parameters.find(p => p.name === 'options')!.hasQuestionToken = true;
            return o;
        });
    }
}
