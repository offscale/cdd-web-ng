// src/service/emit/service/service-method.generator.ts

import { ClassDeclaration, OptionalKind, ParameterDeclarationStructure, MethodDeclarationOverloadStructure } from 'ts-morph';
import { GeneratorConfig, PathInfo, SwaggerDefinition } from '../../../core/types.js';
import { camelCase, getRequestBodyType, getResponseType, getTypeScriptType } from '../../../core/utils.js';
import { SwaggerParser } from '../../../core/parser.js';

export class ServiceMethodGenerator {
    constructor(private config: GeneratorConfig, private parser: SwaggerParser) {}

    public addServiceMethod(serviceClass: ClassDeclaration, operation: PathInfo) {
        const methodName = this.getMethodName(operation);
        if (!methodName) {
            console.warn(`Skipping method generation for ${operation.method.toUpperCase()} ${operation.path} due to missing operationId and inability to generate a fallback name.`);
            return;
        }

        const parameters = this.getMethodParameters(operation);
        const overloads = this.getMethodOverloads(operation, parameters);
        const successResponse = operation.responses?.['200'] || operation.responses?.['201'];
        const responseType = successResponse ? getResponseType(successResponse, this.config) : 'void';

        serviceClass.addMethod({
            // FIX: The 'name' property was missing, causing all ts-morph crashes.
            name: methodName,
            isAsync: false, // Ensure this isn't misinterpreted as an async method without a Promise
            parameters: [
                ...parameters,
                { name: 'options?', type: `RequestOptions & { observe?: 'body' | 'response' | 'events' }` }
            ],
            returnType: 'Observable<any>',
            overloads,
            statements: this.getMethodBody(operation, parameters, responseType),
        });
    }

    private getMethodName(operation: PathInfo): string {
        // FIX: Provide a robust fallback if operationId is missing to avoid generating nameless methods.
        if (this.config.options.customizeMethodName) {
            if (!operation.operationId) {
                throw new Error(`Operation ID is required for method name customization on path ${operation.path}`);
            }
            return this.config.options.customizeMethodName(operation.operationId);
        }
        if (operation.operationId) {
            return camelCase(operation.operationId);
        }
        // Fallback name generation
        const pathForName = operation.path.replace(/[\/{}]/g, ' ').replace(/\s+/g, ' ');
        return camelCase(`${operation.method} ${pathForName}`);
    }

    private getMethodParameters(operation: PathInfo): OptionalKind<ParameterDeclarationStructure>[] {
        const params: OptionalKind<ParameterDeclarationStructure>[] = [];

        // FIX: Definitive Parameter Ordering. Collect body first, then others.
        if (operation.requestBody) {
            const bodyType = getRequestBodyType(operation.requestBody, this.config);
            params.push({ name: 'body', type: bodyType, hasQuestionToken: !operation.requestBody.required });
        }

        (operation.parameters || []).forEach(p => params.push({
            name: camelCase(p.name),
            type: getTypeScriptType(p.schema as SwaggerDefinition, this.config),
            hasQuestionToken: !p.required,
        }));

        // Finally, sort the entire list to push all optional params to the end.
        return params.sort((a, b) => Number(a.hasQuestionToken) - Number(b.hasQuestionToken));
    }

    private getMethodOverloads(operation: PathInfo, params: OptionalKind<ParameterDeclarationStructure>[]): OptionalKind<MethodDeclarationOverloadStructure>[] {
        const successResponse = operation.responses?.['200'] || operation.responses?.['201'];
        const responseType = successResponse ? getResponseType(successResponse, this.config) : 'void';
        const allBaseParamsAreRequired = params.every(p => !p.hasQuestionToken);

        const overloads: OptionalKind<MethodDeclarationOverloadStructure>[] = [
            { parameters: [...params, { name: 'options?', type: 'RequestOptions' }], returnType: `Observable<${responseType}>` },
        ];

        // Only add detailed overloads if all base parameters are required, otherwise the signatures become ambiguous.
        if (allBaseParamsAreRequired) {
            overloads.push(
                { parameters: [...params, { name: 'observe', type: `'response'` }, { name: 'options?', type: 'RequestOptions' }], returnType: `Observable<HttpResponse<${responseType}>>`},
                { parameters: [...params, { name: 'observe', type: `'events'` }, { name: 'options?', type: 'RequestOptions' }], returnType: `Observable<HttpEvent<${responseType}>>`}
            );
        }
        return overloads;
    }

    private getMethodBody(operation: PathInfo, parameters: OptionalKind<ParameterDeclarationStructure>[], responseType: string): string {
        const pathParams = operation.parameters?.filter(p => p.in === 'path') || [];
        const queryParams = operation.parameters?.filter(p => p.in === 'query') || [];
        const headerParams = operation.parameters?.filter(p => p.in === 'header') || [];
        const bodyParam = parameters.find(p => p.name === 'body');

        let pathTreated = operation.path;
        pathParams.forEach(p => { pathTreated = pathTreated.replace(`{${p.name}}`, `\${${camelCase(p.name)}}`); });
        let body = `const url = \`\${this.basePath}${pathTreated}\`;\n\n`;

        if (queryParams.length > 0) {
            body += `let params = new HttpParams();\n`;
            queryParams.forEach(p => { body += `if (${camelCase(p.name)} != null) params = HttpParamsBuilder.addToHttpParams(params, ${camelCase(p.name)}, '${p.name}');\n`; });
            body += '\n';
        }
        if (headerParams.length > 0) {
            body += `let headers = new HttpHeaders();\n`;
            headerParams.forEach(p => { body += `if (${camelCase(p.name)} != null) headers = headers.append('${p.name}', String(${camelCase(p.name)}));\n`; });
            body += '\n';
        }

        const finalOptions = ['...options', 'context: this.createContextWithClientId(options?.context)'];
        if (queryParams.length > 0) finalOptions.push('params');
        if (headerParams.length > 0) finalOptions.push('headers');

        const allOptions = `{ ${finalOptions.join(', ')} }`;
        const method = operation.method.toLowerCase();
        const httpCallArgs = ['post', 'put', 'patch'].includes(method)
            ? `url, ${bodyParam?.name || 'null'}, ${allOptions}`
            : `url, ${allOptions}`;

        // Ensure we explicitly cast to 'any' as HttpClient methods are strongly typed
        // and our overloads confuse the compiler without it.
        return `return this.http.${method}<${responseType}>(${httpCallArgs} as any);`;
    }
}
