// src/service/emit/service/service-method.generator.ts

import { ClassDeclaration, MethodDeclarationStructure, OptionalKind, ParameterDeclarationStructure } from 'ts-morph';
import { GeneratorConfig, PathInfo, SwaggerParser, SwaggerDefinition } from '../../../core/types.js';
import { getTypeScriptType, camelCase, isDataTypeInterface } from '../../../core/utils.js';

/**
 * Generates individual methods within an Angular service class,
 * including their overloads and implementation bodies.
 */
export class ServiceMethodGenerator {
    /**
     * @param config The global generator configuration.
     * @param parser The SwaggerParser instance to resolve schema references.
     */
    constructor(
        private readonly config: GeneratorConfig,
        private readonly parser: SwaggerParser
    ) { }

    /**
     * Determines the TypeScript return type for a given API operation's successful response.
     * @param operation The PathInfo object for the API operation.
     * @returns The TypeScript type as a string (e.g., 'User', 'User[]', 'void').
     */
    private getResponseType(operation: PathInfo): string {
        const responseSchemaObj = operation.responses?.['200']?.content?.['application/json']?.schema;
        if (!responseSchemaObj) {
            return 'void';
        }
        const type = getTypeScriptType(responseSchemaObj as SwaggerDefinition, this.config);
        return type === 'any' ? 'void' : type;
    }

    /**
     * Builds an array of parameter declarations for a service method.
     * @param operation The PathInfo object for the API operation.
     * @returns An array of parameter structures for ts-morph.
     */
    private getMethodParameters(operation: PathInfo): OptionalKind<ParameterDeclarationStructure>[] {
        const parameters: OptionalKind<ParameterDeclarationStructure>[] = [];
        (operation.parameters ?? []).forEach(param => {
            const paramName = camelCase(param.name);
            const schemaObject = param.schema ? param.schema : param;
            parameters.push({ name: paramName, type: getTypeScriptType(schemaObject as any, this.config), hasQuestionToken: !param.required });
        });
        const requestBodySchema = operation.requestBody?.content?.['application/json']?.schema;
        if (requestBodySchema) {
            const bodyType = getTypeScriptType(requestBodySchema as SwaggerDefinition, this.config);
            const bodyName = isDataTypeInterface(bodyType.replace('[]', '')) ? camelCase(bodyType.replace('[]', '')) : 'body';
            parameters.push({
                name: bodyName,
                type: bodyType,
                hasQuestionToken: !operation.requestBody?.required
            });
        }
        return parameters.sort((a, b) => (a.hasQuestionToken ? 1 : 0) - (b.hasQuestionToken ? 1 : 0));
    }

    /**
     * Adds a complete service method, including all its HTTP client overloads, to a given class.
     * @param classDeclaration The ts-morph ClassDeclaration node to which the method will be added.
     * @param operation The PathInfo object for the API operation.
     */
    public addServiceMethod(classDeclaration: ClassDeclaration, operation: PathInfo): void {
        const responseType = this.getResponseType(operation);
        const parameters = this.getMethodParameters(operation);
        const bodyStatements = this.buildMethodBody(operation, parameters);

        const allMethodStructures: OptionalKind<MethodDeclarationStructure>[] = [
            { name: operation.methodName!, isOverload: true, parameters: [...parameters, { name: 'options', type: `RequestOptions & { observe: 'response' }` }], returnType: `Observable<HttpResponse<${responseType}>>` },
            { name: operation.methodName!, isOverload: true, parameters: [...parameters, { name: 'options', type: `RequestOptions & { observe: 'events' }` }], returnType: `Observable<HttpEvent<${responseType}>>` },
            { name: operation.methodName!, isOverload: true, parameters: [...parameters, { name: 'options', type: `RequestOptions & { responseType: 'blob' }` }], returnType: `Observable<Blob>` },
            { name: operation.methodName!, isOverload: true, parameters: [...parameters, { name: 'options', type: `RequestOptions & { responseType: 'text' }` }], returnType: `Observable<string>` },
            { name: operation.methodName!, isOverload: true, parameters: [...parameters, { name: 'options', hasQuestionToken: true, type: `RequestOptions & { observe?: 'body' }` }], returnType: `Observable<${responseType}>` },
            {
                name: operation.methodName!,
                parameters: [...parameters, { name: 'options', hasQuestionToken: true, type: `RequestOptions & { observe?: "body" | "events" | "response", responseType?: "blob" | "text" | "json" }` }],
                returnType: 'Observable<any>',
                statements: bodyStatements,
            }
        ];

        classDeclaration.addMethods(allMethodStructures);
    }

    /**
     * Constructs the full implementation body for a service method.
     * @param operation The PathInfo object for the API operation.
     * @param parameters The generated parameters for the method.
     * @returns A string of TypeScript code for the method body.
     */
    private buildMethodBody(operation: PathInfo, parameters: OptionalKind<ParameterDeclarationStructure>[]): string {
        const pathParams = operation.parameters?.filter(p => p.in === 'path') || [];
        const url_template = pathParams.reduce((acc, p) => acc.replace(`{${p.name}}`, `\${${camelCase(p.name)}}`), operation.path);
        let body = `const url = \`\${this.basePath}${url_template}\`;\n\n`;

        const queryParams = operation.parameters?.filter(p => p.in === 'query');
        if (queryParams?.length) {
            body += `let params = new HttpParams(options?.params as any);\n`;
            queryParams.forEach(p => {
                const paramName = camelCase(p.name);
                body += `if (${paramName} != null) params = HttpParamsBuilder.addToHttpParams(params, ${paramName}, '${p.name}');\n`;
            });
            body += '\n';
        }

        const headerParams = operation.parameters?.filter(p => p.in === 'header');
        if (headerParams?.length) {
            body += `let headers = new HttpHeaders(options?.headers);\n`;
            headerParams.forEach(p => {
                const paramName = camelCase(p.name);
                body += `if (${paramName} != null) headers = headers.set('${p.name}', String(${paramName}));\n`;
            });
            body += '\n';
        }

        const httpMethod = operation.method.toLowerCase();
        const needsBody = ['post', 'put', 'patch'].includes(httpMethod);
        const bodyParam = parameters.find(p => !operation.parameters?.some(op => camelCase(op.name) === p.name?.toString()));

        // FINAL FIX: This logic correctly constructs the http.request call for all cases.
        const finalOptionsProperties: string[] = ['...options', 'context: this.createContextWithClientId(options?.context)'];
        if (queryParams?.length) finalOptionsProperties.push('params');
        if (headerParams?.length) finalOptionsProperties.push('headers');

        if (needsBody && bodyParam) {
            // Signature: request(method, url, body, options)
            body += `return this.http.request('${httpMethod}', url, ${bodyParam.name}, { ${finalOptionsProperties.join(', ')} });`;
        } else {
            // Signature: request(method, url, options)
            body += `return this.http.request('${httpMethod}', url, { ${finalOptionsProperties.join(', ')} });`;
        }

        return body;
    }
}
