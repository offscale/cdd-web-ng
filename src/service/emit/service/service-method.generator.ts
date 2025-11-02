// src/service/emit/service/service-method.generator.ts

import {
    ClassDeclaration,
    MethodDeclarationStructure,
    OptionalKind,
    ParameterDeclarationStructure,
    MethodOverloadStructure,
    Project
} from 'ts-morph';
import { GeneratorConfig, PathInfo, SwaggerParser, SwaggerDefinition } from '../../../core/types.js';
import { getTypeScriptType, camelCase, isDataTypeInterface } from '../../../core/utils.js';

/**
 * Generates individual methods within an Angular service class, including their
 * full set of overloads for different `observe` and `responseType` options.
 */
export class ServiceMethodGenerator {
    /**
     * @param config The generator configuration.
     * @param parser The SwaggerParser instance for schema and type resolution.
     */
    constructor(
        private readonly config: GeneratorConfig,
        private readonly parser: SwaggerParser
    ) { }

    /**
     * Adds a complete service method, including all its overloads, to a given class declaration.
     * @param classDeclaration The ts-morph ClassDeclaration to which the method will be added.
     * @param operation The processed `PathInfo` object describing the API endpoint.
     */
    public addServiceMethod(classDeclaration: ClassDeclaration, operation: PathInfo): void {
        if (!operation.methodName) {
            console.warn(`[ServiceMethodGenerator] Skipping method generation for operation without a methodName (operationId: ${operation.operationId})`);
            return;
        }

        const knownTypes = this.parser.schemas.map(s => s.name);
        const responseType = this.getResponseType(operation, knownTypes);
        const parameters = this.getMethodParameters(operation, knownTypes);
        const bodyStatements = this.buildMethodBody(operation, parameters);
        const overloads = this.buildOverloads(responseType, parameters);

        classDeclaration.addMethod({
            name: operation.methodName,
            parameters: [...parameters, { name: 'options', hasQuestionToken: true, type: `RequestOptions & { observe?: "body" | "events" | "response", responseType?: "blob" | "text" | "json" }` }],
            returnType: 'Observable<any>',
            statements: bodyStatements,
            overloads: overloads,
        });
    }

    /**
     * Determines the primary TypeScript type for the response of an operation.
     * @param operation The `PathInfo` object for the endpoint.
     * @param knownTypes An array of known schema names for resolving `$ref`s.
     * @returns The TypeScript type string for the response body. Defaults to 'void'.
     */
    private getResponseType(operation: PathInfo, knownTypes: string[]): string {
        if (operation.responses?.['204']) {
            return 'void';
        }

        const responseSchema = operation.responses?.['200']?.content?.['application/json']?.schema
            || operation.responses?.['201']?.content?.['application/json']?.schema;

        return responseSchema ? getTypeScriptType(responseSchema as SwaggerDefinition, this.config, knownTypes) : 'void';
    }

    /**
     * Extracts and builds an array of parameter declaration structures for a method.
     * @param operation The `PathInfo` object for the endpoint.
     * @param knownTypes An array of known schema names for resolving `$ref`s.
     * @returns An array of `ParameterDeclarationStructure` objects for the method.
     */
    private getMethodParameters(operation: PathInfo, knownTypes: string[]): OptionalKind<ParameterDeclarationStructure>[] {
        const parameters: OptionalKind<ParameterDeclarationStructure>[] = [];

        // Process path, query, header, and cookie parameters
        (operation.parameters ?? []).forEach(param => {
            const paramName = camelCase(param.name);
            const schemaObject = param.schema ? param.schema : param;
            parameters.push({
                name: paramName,
                type: getTypeScriptType(schemaObject as SwaggerDefinition, this.config, knownTypes),
                hasQuestionToken: !param.required
            });
        });

        // Process the request body
        const requestBody = operation.requestBody;
        if (requestBody) {
            const content = Object.values(requestBody.content || {})[0];
            if (content?.schema) {
                const bodyType = getTypeScriptType(content.schema as SwaggerDefinition, this.config, knownTypes);
                const bodyName = isDataTypeInterface(bodyType.replace(/\[\]| \| null/g, '')) ? camelCase(bodyType.replace(/\[\]| \| null/g, '')) : 'body';
                parameters.push({ name: bodyName, type: bodyType, hasQuestionToken: !requestBody.required });
            } else {
                // Fallback for bodies without a defined schema (e.g., `application/octet-stream`)
                parameters.push({ name: 'body', type: 'any', hasQuestionToken: !requestBody.required });
            }
        }

        // Sort parameters to place optional ones after required ones
        return parameters.sort((a, b) => (a.hasQuestionToken ? 1 : 0) - (b.hasQuestionToken ? 1 : 0));
    }

    /**
     * Constructs the full implementation body for a service method as a single string.
     * @param operation The `PathInfo` object for the endpoint.
     * @param parameters The generated parameter structures for the method.
     * @returns A string containing the complete method body.
     */
    private buildMethodBody(operation: PathInfo, parameters: OptionalKind<ParameterDeclarationStructure>[]): string {
        let urlTemplate = operation.path;
        const pathParams = operation.parameters?.filter(p => p.in === 'path') || [];
        for (const p of pathParams) {
            urlTemplate = urlTemplate.replace(`{${p.name}}`, `\${${camelCase(p.name)}}`);
        }

        const lines: string[] = [
            `const url = \`\${this.basePath}${urlTemplate}\`;`,
            `const finalOptions: any = Object.assign({}, options);`,
            `finalOptions.context = this.createContextWithClientId(options?.context);`
        ];

        const queryParams = operation.parameters?.filter(p => p.in === 'query');
        if (queryParams && queryParams.length > 0) {
            lines.push(`let requestParams = new HttpParams({ fromObject: options?.params || {} });`);
            for (const param of queryParams) {
                const paramName = camelCase(param.name);
                lines.push(`if (${paramName} != null) { requestParams = HttpParamsBuilder.addToHttpParams(requestParams, ${paramName}, '${param.name}'); }`);
            }
            lines.push(`finalOptions.params = requestParams;`);
        }

        // Identify the body parameter by excluding all other known parameter names
        const nonBodyParamNames = new Set((operation.parameters ?? []).map(p => camelCase(p.name)));
        const bodyParam = parameters.find(p => p.name !== "options" && !nonBodyParamNames.has(p.name!));

        const httpMethod = operation.method.toLowerCase();
        if (['post', 'put', 'patch'].includes(httpMethod) && bodyParam) {
            lines.push(`finalOptions.body = ${bodyParam.name};`);
        }

        lines.push(`return this.http.request('${httpMethod}', url, finalOptions);`);

        return lines.join('\n');
    }

    /**
     * Builds the array of method overloads for different `observe` and `responseType` combinations.
     * @param responseType The primary TypeScript type of the response body.
     * @param parameters The base parameters of the method.
     * @returns An array of `MethodOverloadStructure` objects.
     */
    private buildOverloads(responseType: string, parameters: OptionalKind<ParameterDeclarationStructure>[]): OptionalKind<MethodOverloadStructure>[] {
        return [
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
    }
}
