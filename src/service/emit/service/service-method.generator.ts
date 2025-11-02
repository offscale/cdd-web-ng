// src/service/emit/service/service-method.generator.ts

import { ClassDeclaration, MethodDeclarationStructure, OptionalKind, ParameterDeclarationStructure, MethodOverloadStructure } from 'ts-morph';
import { GeneratorConfig, PathInfo, SwaggerParser, SwaggerDefinition } from '../../../core/types.js';
import { getTypeScriptType, camelCase, isDataTypeInterface } from '../../../core/utils.js';

export class ServiceMethodGenerator {
    constructor(
        private readonly config: GeneratorConfig,
        private readonly parser: SwaggerParser
    ) { }

    private getResponseType(operation: PathInfo): string {
        if (operation.responses?.['204']) return 'void';
        const responseSchema = operation.responses?.['200']?.content?.['application/json']?.schema
            || operation.responses?.['201']?.content?.['application/json']?.schema;
        return responseSchema ? getTypeScriptType(responseSchema as SwaggerDefinition, this.config) : 'void';
    }

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
            const bodyName = isDataTypeInterface(bodyType.replace(/\[\]| \| null/g, '')) ? camelCase(bodyType.replace(/\[\]| \| null/g, '')) : 'body';
            parameters.push({
                name: bodyName,
                type: bodyType,
                hasQuestionToken: !operation.requestBody?.required
            });
        }
        return parameters.sort((a, b) => (a.hasQuestionToken ? 1 : 0) - (b.hasQuestionToken ? 1 : 0));
    }

    public addServiceMethod(classDeclaration: ClassDeclaration, operation: PathInfo): void {
        const responseType = this.getResponseType(operation);
        const parameters = this.getMethodParameters(operation);
        const bodyStatements = this.buildMethodBody(operation, parameters);

        // Define all overloads in a structured array
        const overloads: OptionalKind<MethodOverloadStructure>[] = [
            {
                parameters: [...parameters, { name: 'options', type: `RequestOptions & { observe: 'response' }` }],
                returnType: `Observable<HttpResponse<${responseType}>>`
            },
            {
                parameters: [...parameters, { name: 'options', type: `RequestOptions & { observe: 'events' }` }],
                returnType: `Observable<HttpEvent<${responseType}>>`
            },
            {
                parameters: [...parameters, { name: 'options', type: `RequestOptions & { responseType: 'blob' }` }],
                returnType: `Observable<Blob>`
            },
            {
                parameters: [...parameters, { name: 'options', type: `RequestOptions & { responseType: 'text' }` }],
                returnType: `Observable<string>`
            },
            {
                parameters: [...parameters, { name: 'options', hasQuestionToken: true, type: `RequestOptions & { observe?: 'body' }` }],
                returnType: `Observable<${responseType}>`
            }
        ];

        // Add the method with its implementation and overloads in a single, atomic operation
        const impl = classDeclaration.addMethod({
            name: operation.methodName!,
            parameters: [...parameters, { name: 'options', hasQuestionToken: true, type: `RequestOptions & { observe?: "body" | "events" | "response", responseType?: "blob" | "text" | "json" }` }],
            returnType: 'Observable<any>',
            statements: bodyStatements,
            overloads: overloads,
        });

        impl.getSourceFile().formatText();
    }

    private buildMethodBody(
        operation: PathInfo,
        parameters: OptionalKind<ParameterDeclarationStructure>[]
    ): string {
        // Replace all path param placeholders
        let urlTemplate = operation.path;
        const pathParams = operation.parameters?.filter(p => p.in === 'path') || [];
        for (const p of pathParams) {
            const placeholder = `{${p.name}}`;
            const paramName = camelCase(p.name);
            urlTemplate = urlTemplate.split(placeholder).join(`\$\{${paramName}\}`);
        }

        const lines: string[] = [];
        lines.push(`const url = \`\${this.basePath}${urlTemplate}\`;`);
        lines.push(`const finalOptions: any = Object.assign({}, options);`);
        lines.push(`finalOptions.context = this.createContextWithClientId(options?.context);`);

        const queryParams = operation.parameters?.filter(p => p.in === 'query');
        if (queryParams && queryParams.length > 0) {
            lines.push(`let requestParams = new HttpParams({ fromObject: options?.params || {} });`);
            for (const param of queryParams) {
                const paramName = camelCase(param.name);
                lines.push(
                    `if (${paramName} != null) { requestParams = HttpParamsBuilder.addToHttpParams(requestParams, ${paramName}, '${param.name}'); }`
                );
            }
            lines.push(`finalOptions.params = requestParams;`);
        }

        // Find path+query parameter names so we know which parameter is the body
        const pathAndQueryParamNames = new Set(
            (operation.parameters ?? []).map(p => camelCase(p.name))
        );
        const bodyParams = parameters.filter(
            p => !pathAndQueryParamNames.has(p.name) && p.name !== "options"
        );
        const bodyParam = bodyParams.length > 0 ? bodyParams[0] : undefined;

        const httpMethod = operation.method.toLowerCase();
        if (['post', 'put', 'patch'].includes(httpMethod) && bodyParam) {
            lines.push(`finalOptions.body = ${bodyParam.name};`);
        }

        lines.push(`return this.http.request('${httpMethod}', url, finalOptions);`);

        return lines.join('\n');
    }
}
