import { ClassDeclaration, OptionalKind, ParameterDeclarationStructure, MethodDeclarationOverloadStructure } from 'ts-morph';
import { GeneratorConfig, PathInfo, SwaggerDefinition, RequestBody, SwaggerResponse } from '../../../core/types.js';
import { camelCase, isDataTypeInterface, getRequestBodyType, getResponseType, getTypeScriptType } from '../../../core/utils.js';
import { SwaggerParser } from '../../../core/parser.js';

/**
 * Responsible for generating individual methods within an Angular service class,
 * including their parameters, overloads, and implementation body.
 */
export class ServiceMethodGenerator {
    constructor(private config: GeneratorConfig, private parser: SwaggerParser) {}

    /**
     * Adds a complete method (including overloads and implementation) to a service class
     * based on a single OpenAPI operation.
     * @param serviceClass The ts-morph ClassDeclaration to add the method to.
     * @param operation The PathInfo object describing the API operation.
     */
    public addServiceMethod(serviceClass: ClassDeclaration, operation: PathInfo) {
        const methodName = this.getMethodName(operation);
        const parameters = this.getMethodParameters(operation);
        const overloads = this.getMethodOverloads(operation, parameters);
        const successResponse = operation.responses?.['200'] || operation.responses?.['201'];
        const responseType = successResponse ? getResponseType(successResponse, this.config) : 'void';

        serviceClass.addMethod({
            name: methodName,
            // --- START FIX ---
            // The IMPLEMENTATION signature. Notice 'observe' is gone.
            // It combines all parameters from all possible overloads.
            parameters: [
                ...parameters,
                // Make 'observe' an optional property within a combined options object
                { name: 'options?', type: `RequestOptions & { observe?: 'body' | 'response' | 'events' }` }
            ],
            // --- END FIX ---
            returnType: 'Observable<any>',
            overloads,
            statements: this.getMethodBody(operation, parameters, responseType),
        });
    }

    private getMethodName(operation: PathInfo): string {
        if (this.config.options.customizeMethodName) {
            if (!operation.operationId) {
                throw new Error(`Operation ID is required for method name customization: (${operation.method}) ${operation.path}`);
            }
            return this.config.options.customizeMethodName(operation.operationId);
        }
        const defaultName = operation.operationId
            ? camelCase(operation.operationId)
            : camelCase(`${operation.method} ${operation.path.replace(/[\/{}]/g, ' ')}`);

        return defaultName;
    }

    private getMethodParameters(operation: PathInfo): OptionalKind<ParameterDeclarationStructure>[] {
        const params: OptionalKind<ParameterDeclarationStructure>[] = [];
        let bodyParam: OptionalKind<ParameterDeclarationStructure> | null = null;

        (operation.parameters || []).forEach(p => params.push({
            name: camelCase(p.name),
            type: getTypeScriptType(p.schema as SwaggerDefinition, this.config),
            hasQuestionToken: !p.required,
        }));

        if (operation.requestBody) {
            const bodyType = getRequestBodyType(operation.requestBody, this.config);
            // --- START FIX ---
            // Force the body parameter name to always be 'body' for consistency.
            const bodyName = 'body';
            // --- END FIX ---
            bodyParam = { name: bodyName, type: bodyType, hasQuestionToken: !operation.requestBody.required };
        }

        const sortedParams = params.sort((a, b) => Number(a.hasQuestionToken) - Number(b.hasQuestionToken));

        if (bodyParam) {
            return [bodyParam, ...sortedParams];
        }

        return sortedParams;
    }

    private getMethodOverloads(operation: PathInfo, params: OptionalKind<ParameterDeclarationStructure>[]): OptionalKind<MethodDeclarationOverloadStructure>[] {
        const successResponse = operation.responses?.['200'] || operation.responses?.['201'];
        const responseType = successResponse ? getResponseType(successResponse, this.config) : 'void';

        // These are the PUBLIC signatures. They are what the user sees.
        return [
            // Overload for observe: 'body' (default)
            {
                parameters: [...params, { name: 'options?', type: 'RequestOptions' }],
                returnType: `Observable<${responseType}>`
            },
            // Overload for observe: 'response'
            {
                parameters: [...params, { name: 'options', type: `RequestOptions & { observe: 'response' }` }],
                returnType: `Observable<HttpResponse<${responseType}>>`
            },
            // Overload for observe: 'events'
            {
                parameters: [...params, { name: 'options', type: `RequestOptions & { observe: 'events' }` }],
                returnType: `Observable<HttpEvent<${responseType}>>`
            },
        ];
    }


    private getMethodBody(operation: PathInfo, parameters: OptionalKind<ParameterDeclarationStructure>[], responseType: string): string {
        const pathParams = operation.parameters?.filter(p => p.in === 'path') || [];
        const queryParams = operation.parameters?.filter(p => p.in === 'query') || [];
        const headerParams = operation.parameters?.filter(p => p.in === 'header') || [];

        const bodyParam = parameters.find(p => p.name === 'body'); // Find by the consistent name

        let pathTreated = operation.path;
        pathParams.forEach(p => {
            pathTreated = pathTreated.replace(`{${p.name}}`, `\${${camelCase(p.name)}}`);
        });

        let body = `const url = \`\${this.basePath}${pathTreated}\`;\n\n`;

        let hasParams = false;
        if (queryParams.length > 0) {
            hasParams = true;
            body += `let params = new HttpParams();\n`;
            queryParams.forEach(p => {
                const paramName = camelCase(p.name);
                body += `if (${paramName} != null) params = HttpParamsBuilder.addToHttpParams(params, ${paramName}, '${p.name}');\n`;
            });
        }
        if(hasParams) body += '\n';

        let hasHeaders = false;
        if (headerParams.length > 0) {
            hasHeaders = true;
            body += `let headers = new HttpHeaders();\n`;
            headerParams.forEach(p => {
                const paramName = camelCase(p.name);
                body += `if (${paramName} != null) headers = headers.append('${p.name}', String(${paramName}));\n`;
            });
        }
        if(hasHeaders) body += '\n';

        // --- START FIX ---
        // We now build a single options object and pass it. The 'observe' property
        // comes directly from the combined 'options' parameter.
        const finalOptions: string[] = ['...options', 'context: this.createContextWithClientId(options?.context)'];
        if (hasParams) finalOptions.push('params');
        if (hasHeaders) finalOptions.push('headers');

        let allOptions = `{ ${finalOptions.join(', ')} }`;

        const method = operation.method.toLowerCase();
        const httpCallArgs = ['post', 'put', 'patch'].includes(method)
            ? `url, ${bodyParam?.name || 'null'}, ${allOptions}`
            : `url, ${allOptions}`;

        body += `return this.http.${method}<${responseType}>(${httpCallArgs} as any);`; // Use 'as any' as a final escape hatch for HttpClient's complex types
        // --- END FIX ---

        return body;
    }
}
