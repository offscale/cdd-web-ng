import {
    ClassDeclaration,
    OptionalKind,
    ParameterDeclarationStructure,
    MethodDeclarationOverloadStructure,
} from 'ts-morph';
import { GeneratorConfig, PathInfo, SwaggerDefinition } from '../../../core/types.js';
import { SwaggerParser } from '../../../core/parser.js';
import { getTypeScriptType, camelCase, isDataTypeInterface } from '../../../core/utils.js';

/**
 * Generates individual methods within a generated Angular service class.
 * This class handles parameter mapping, response type resolution, method body construction,
 * and the creation of observable-based method overloads for different response types.
 */
export class ServiceMethodGenerator {
    constructor(
        private readonly config: GeneratorConfig,
        private readonly parser: SwaggerParser
    ) { }

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

        classDeclaration.addMethod({
            name: operation.methodName,
            parameters: [...parameters, { name: 'options', hasQuestionToken: true, type: `RequestOptions & { observe?: 'body' | 'events' | 'response', responseType?: 'arraybuffer' | 'blob' | 'json' | 'text' }` }],
            returnType: 'Observable<any>',
            statements: bodyStatements,
            overloads: overloads,
            docs: [
                (operation.summary || operation.description || `Performs a ${operation.method} request to ${operation.path}.`) +
                (operation.description && operation.summary ? `\n\n${operation.description}` : '')
            ]
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
            const schemaObject = param.schema ? param.schema as SwaggerDefinition : param as unknown as SwaggerDefinition;
            let paramType = getTypeScriptType(schemaObject, this.config, knownTypes);
            if ((param as any).type === 'file') paramType = 'any';

            parameters.push({
                name: paramName,
                type: paramType,
                hasQuestionToken: !param.required
            });
        });

        const requestBody = operation.requestBody;
        if (requestBody) {
            // FIX: Look at the first available content type's schema, not just application/json.
            const content = requestBody.content?.[Object.keys(requestBody.content)[0]];
            if (content?.schema) {
                let bodyType = getTypeScriptType(content.schema as SwaggerDefinition, this.config, knownTypes);
                const bodyName = isDataTypeInterface(bodyType.replace(/\[\]| \| null/g, '')) ? camelCase(bodyType.replace(/\[\]| \| null/g, '')) : 'body';
                parameters.push({ name: bodyName, type: bodyType, hasQuestionToken: !requestBody.required });
            } else {
                parameters.push({ name: 'body', type: 'unknown', hasQuestionToken: !requestBody.required });
            }
        }

        return parameters.sort((a, b) => (a.hasQuestionToken ? 1 : 0) - (b.hasQuestionToken ? 1 : 0));
    }

    private buildMethodBody(operation: PathInfo, parameters: OptionalKind<ParameterDeclarationStructure>[]): string {
        let urlTemplate = operation.path;
        operation.parameters?.filter(p => p.in === 'path').forEach(p => {
            urlTemplate = urlTemplate.replace(`{${p.name}}`, `\${${camelCase(p.name)}}`);
        });

        const lines = [`const url = \`\${this.basePath}${urlTemplate}\`;`];

        const queryParams = operation.parameters?.filter(p => p.in === 'query') ?? [];
        if (queryParams.length > 0) {
            lines.push(`let params = new HttpParams({ fromObject: options?.params ?? {} });`);
            queryParams.forEach(p => {
                const paramName = camelCase(p.name);
                lines.push(`if (${paramName} != null) { params = HttpParamsBuilder.addToHttpParams(params, ${paramName}, '${p.name}'); }`);
            });
        }

        const headerParams = operation.parameters?.filter(p => p.in === 'header') ?? [];
        if (headerParams.length > 0) {
            lines.push(`let headers = options?.headers instanceof HttpHeaders ? options.headers : new HttpHeaders(options?.headers ?? {});`);
            headerParams.forEach(p => {
                const paramName = camelCase(p.name);
                lines.push(`if (${paramName} != null) { headers = headers.set('${p.name}', String(${paramName})); }`);
            });
        }

        lines.push(`const requestOptions: any = {`);
        lines.push(`  observe: options?.observe,`);
        if (queryParams.length > 0) lines.push(`  params,`);
        if (headerParams.length > 0) lines.push(`  headers,`);
        lines.push(`  reportProgress: options?.reportProgress,`);
        lines.push(`  responseType: options?.responseType,`);
        lines.push(`  withCredentials: options?.withCredentials,`);
        lines.push(`  context: this.createContextWithClientId(options?.context)`);
        lines.push(`};`);

        let bodyArgument = 'null';
        const nonBodyOpParams = new Set((operation.parameters ?? []).map(p => camelCase(p.name)));
        const bodyParam = parameters.find(p => !nonBodyOpParams.has(p.name!));

        const isUrlEncodedForm = operation.consumes?.includes('application/x-www-form-urlencoded');
        const isMultipartForm = operation.consumes?.includes('multipart/form-data');
        const formDataParams = operation.parameters?.filter(p => (p as any).in === 'formData');

        if (isUrlEncodedForm && formDataParams?.length) {
            lines.push(`let formBody = new HttpParams();`);
            formDataParams.forEach(p => {
                const paramName = camelCase(p.name);
                lines.push(`if (${paramName} != null) { formBody = formBody.append('${p.name}', ${paramName}); }`);
            });
            bodyArgument = 'formBody';
        } else if (isMultipartForm && formDataParams?.length) {
            lines.push(`const formData = new FormData();`);
            formDataParams.forEach(p => {
                const paramName = camelCase(p.name);
                lines.push(`if (${paramName} != null) { formData.append('${p.name}', ${paramName}); }`);
            });
            bodyArgument = 'formData';
        } else if (bodyParam) {
            bodyArgument = bodyParam.name!;
        }

        const httpMethod = operation.method.toLowerCase();
        if (['post', 'put', 'patch'].includes(httpMethod)) {
            lines.push(`return this.http.${httpMethod}(url, ${bodyArgument}, requestOptions);`);
        } else {
            lines.push(`return this.http.${httpMethod}(url, requestOptions);`);
        }

        return lines.join('\n');
    }

    private buildOverloads(methodName: string, responseType: string, parameters: OptionalKind<ParameterDeclarationStructure>[]): OptionalKind<MethodDeclarationOverloadStructure>[] {
        const paramsDocs = parameters.map(p => `@param ${p.name} ${p.hasQuestionToken ? '(optional) ' : ''}`).join('\n');
        const finalResponseType = responseType === 'any' ? 'any' : (responseType || 'unknown');

        return [
            {
                parameters: [...parameters, { name: 'options', hasQuestionToken: true, type: `RequestOptions & { observe?: 'body' }` }],
                returnType: `Observable<${finalResponseType}>`,
                docs: [`${methodName}. \n${paramsDocs}\n@param options The options for this request.`]
            },
            {
                parameters: [...parameters, { name: 'options', hasQuestionToken: false, type: `RequestOptions & { observe: 'response' }` }],
                returnType: `Observable<HttpResponse<${finalResponseType}>>`,
                docs: [`${methodName}. \n${paramsDocs}\n@param options The options for this request, with response observation enabled.`]
            },
            {
                parameters: [...parameters, { name: 'options', hasQuestionToken: false, type: `RequestOptions & { observe: 'events' }` }],
                returnType: `Observable<HttpEvent<${finalResponseType}>>`,
                docs: [`${methodName}. \n${paramsDocs}\n@param options The options for this request, with event observation enabled.`]
            },
        ].map(overload => {
            const hasOptionalParam = parameters.some(p => p.hasQuestionToken);
            if (hasOptionalParam) {
                const optionsParam = overload.parameters.find(p => p.name === 'options');
                if (optionsParam) {
                    optionsParam.hasQuestionToken = true;
                }
            }
            return overload;
        });
    }
}
