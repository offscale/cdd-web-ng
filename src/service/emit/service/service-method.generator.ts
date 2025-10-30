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

        serviceClass.addMethod({
            name: methodName,
            parameters: [
                ...parameters,
                { name: 'observe?', type: `'body' | 'response' | 'events'`},
                { name: 'options?', type: 'RequestOptions' }
            ],
            returnType: 'Observable<any>',
            overloads,
            statements: this.getMethodBody(operation, parameters),
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

        (operation.parameters || []).forEach(p => params.push({
            name: camelCase(p.name),
            type: getTypeScriptType(p.schema as SwaggerDefinition, this.config),
            hasQuestionToken: !p.required,
        }));

        if (operation.requestBody) {
            const bodyType = getRequestBodyType(operation.requestBody, this.config);
            const bodyName = isDataTypeInterface(bodyType) ? camelCase(bodyType) : 'body';
            params.push({ name: bodyName, type: bodyType, hasQuestionToken: !operation.requestBody.required });
        }

        return params.sort((a, b) => Number(a.hasQuestionToken) - Number(b.hasQuestionToken));
    }

    private getMethodOverloads(operation: PathInfo, params: OptionalKind<ParameterDeclarationStructure>[]): OptionalKind<MethodDeclarationOverloadStructure>[] {
        const successResponse = operation.responses?.['200'] || operation.responses?.['201'];
        const responseType = successResponse ? getResponseType(successResponse, this.config) : 'void';

        return [
            { parameters: [...params, { name: 'options?', type: 'RequestOptions' }], returnType: `Observable<${responseType}>` },
            { parameters: [...params, { name: 'observe', type: `'response'` }, { name: 'options?', type: 'RequestOptions' }], returnType: `Observable<HttpResponse<${responseType}>>`},
            { parameters: [...params, { name: 'observe', type: `'events'` }, { name: 'options?', type: 'RequestOptions' }], returnType: `Observable<HttpEvent<${responseType}>>` },
        ];
    }

    private getMethodBody(operation: PathInfo, parameters: OptionalKind<ParameterDeclarationStructure>[]): string {
        const pathParams = operation.parameters?.filter(p => p.in === 'path') || [];
        const queryParams = operation.parameters?.filter(p => p.in === 'query') || [];
        const headerParams = operation.parameters?.filter(p => p.in === 'header') || [];

        const bodyParam = parameters.find(p => !operation.parameters?.some(op => camelCase(op.name) === p.name));

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

        const requestOptions : string[] = [];
        if (hasParams) requestOptions.push('params');
        if (hasHeaders) requestOptions.push('headers');

        let allOptions = `
{
    ...options,
    observe: observe as any,
    context: this.createContextWithClientId(options?.context)
    ${requestOptions.length > 0 ? `, ${requestOptions.join(', ')}` : ''}
}`;

        const method = operation.method.toLowerCase();
        const httpCallArgs = ['post', 'put', 'patch'].includes(method)
            ? `url, ${bodyParam?.name || 'null'}, ${allOptions}`
            : `url, ${allOptions}`;

        body += `return this.http.${method}(${httpCallArgs});`;

        return body;
    }
}
