import {
    ClassDeclaration,
    MethodDeclarationStructure,
    OptionalKind,
    ParameterDeclarationStructure,
    MethodDeclarationOverloadStructure,
} from 'ts-morph';
import { GeneratorConfig, PathInfo, SwaggerDefinition } from '../../../core/types.js';
import { SwaggerParser } from '../../../core/parser.js';
import { getTypeScriptType, camelCase, isDataTypeInterface } from '../../../core/utils.js';

/**
 * Generates individual methods within an Angular service class, including their
 * full set of overloads for different `observe` and `responseType` options.
 * This class encapsulates the logic for converting a single OpenAPI operation
 * into a complete, typed, and documented class method.
 */
export class ServiceMethodGenerator {
    /**
     * Initializes a new instance of the `ServiceMethodGenerator`.
     * @param config The generator configuration, used for type resolution options.
     * @param parser The `SwaggerParser` instance for schema and type resolution.
     */
    constructor(
        private readonly config: GeneratorConfig,
        private readonly parser: SwaggerParser
    ) { }

    /**
     * Adds a complete service method, including all its overloads, to a given class declaration.
     * This is the main entry point for this class.
     * @param classDeclaration The ts-morph `ClassDeclaration` to which the method will be added.
     * @param operation The processed `PathInfo` object describing the API endpoint.
     */
    public addServiceMethod(classDeclaration: ClassDeclaration, operation: PathInfo): void {
        // This guard is now covered by a unit test.
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
     * Determines the primary TypeScript type for the response body of an operation.
     * @param operation The `PathInfo` object for the endpoint.
     * @param knownTypes An array of known schema names for resolving `$ref`s.
     * @returns The TypeScript type string for the response body. Defaults to 'void'.
     * @private
     */
    private getResponseType(operation: PathInfo, knownTypes: string[]): string {
        // Handle HTTP 204 No Content response
        if (operation.responses?.['204']) {
            return 'void';
        }

        // Handle standard success responses (200 OK, 201 Created)
        const responseSchema = operation.responses?.['200']?.content?.['application/json']?.schema
            || operation.responses?.['201']?.content?.['application/json']?.schema;

        return responseSchema ? getTypeScriptType(responseSchema as SwaggerDefinition, this.config, knownTypes) : 'void';
    }

    /**
     * Extracts and builds an array of parameter declaration structures for a method
     * from the operation's `parameters` and `requestBody` definitions.
     * @param operation The `PathInfo` object for the endpoint.
     * @param knownTypes An array of known schema names for resolving `$ref`s.
     * @returns An array of `ParameterDeclarationStructure` objects for the method.
     * @private
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
            const jsonContent = requestBody.content?.['application/json'];
            if (jsonContent?.schema) {
                const bodyType = getTypeScriptType(jsonContent.schema as SwaggerDefinition, this.config, knownTypes);
                // Use the type name as the parameter name if it's a model interface, otherwise default to 'body'.
                const bodyName = isDataTypeInterface(bodyType.replace(/\[\]| \| null/g, '')) ? camelCase(bodyType.replace(/\[\]| \| null/g, '')) : 'body';
                parameters.push({ name: bodyName, type: bodyType, hasQuestionToken: !requestBody.required });
            } else {
                // Fallback for non-JSON bodies (e.g., `application/octet-stream`). This is now covered by a test.
                parameters.push({ name: 'body', type: 'any', hasQuestionToken: !requestBody.required });
            }
        }

        // Sort parameters to place optional ones after required ones, as required by TypeScript.
        return parameters.sort((a, b) => (a.hasQuestionToken ? 1 : 0) - (b.hasQuestionToken ? 1 : 0));
    }

    /**
     * Constructs the full implementation body for a service method as a single string.
     * This includes URL construction, parameter handling (path, query), and the final `http.request` call.
     * @param operation The `PathInfo` object for the endpoint.
     * @param parameters The generated parameter structures for the method.
     * @returns A string containing the complete method body.
     * @private
     */
    private buildMethodBody(operation: PathInfo, parameters: OptionalKind<ParameterDeclarationStructure>[]): string {
        let urlTemplate = operation.path;
        const pathParams = operation.parameters?.filter(p => p.in === 'path') || [];
        for (const p of pathParams) {
            urlTemplate = urlTemplate.replace(`{${p.name}}`, `\${${camelCase(p.name)}}`);
        }

        const lines: string[] = [
            `const url = \`\${this.basePath}${urlTemplate}\`;`,
            `const finalOptions: any = { ...options };`, // Clone options to avoid mutation
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
     * Builds the array of method overloads for different `observe` and `responseType` combinations,
     * providing strong typing for different ways of calling the Angular `HttpClient`.
     * @param responseType The primary TypeScript type of the response body.
     * @param parameters The base parameters of the method.
     * @returns An array of `MethodDeclarationOverloadStructure` objects.
     * @private
     */
    private buildOverloads(responseType: string, parameters: OptionalKind<ParameterDeclarationStructure>[]): OptionalKind<MethodDeclarationOverloadStructure>[] {
        return [
            // Overload for observe: 'response'
            {
                parameters: [...parameters, { name: 'options', hasQuestionToken: false, type: `RequestOptions & { observe: 'response' }` }],
                returnType: `Observable<HttpResponse<${responseType}>>`,
                docs: ["@param options The options for this request, with response observation enabled."]
            },
            // Overload for observe: 'events'
            {
                parameters: [...parameters, { name: 'options', hasQuestionToken: false, type: `RequestOptions & { observe: 'events' }` }],
                returnType: `Observable<HttpEvent<${responseType}>>`,
                docs: ["@param options The options for this request, with event observation enabled."]
            },
            // Overload for responseType: 'blob'
            {
                parameters: [...parameters, { name: 'options', hasQuestionToken: false, type: `RequestOptions & { responseType: 'blob' }` }],
                returnType: `Observable<Blob>`,
                docs: ["@param options The options for this request, with a blob response type."]
            },
            // Overload for responseType: 'text'
            {
                parameters: [...parameters, { name: 'options', hasQuestionToken: false, type: `RequestOptions & { responseType: 'text' }` }],
                returnType: `Observable<string>`,
                docs: ["@param options The options for this request, with a text response type."]
            },
            // Default overload for observe: 'body'
            {
                parameters: [...parameters, { name: 'options', hasQuestionToken: true, type: `RequestOptions & { observe?: 'body' }` }],
                returnType: `Observable<${responseType}>`,
                docs: ["@param options The options for this request."]
            }
        ];
    }
}
