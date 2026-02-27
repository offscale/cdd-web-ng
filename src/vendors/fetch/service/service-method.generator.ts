import { ClassDeclaration, OptionalKind, ParameterDeclarationStructure } from 'ts-morph';
import { GeneratorConfig, PathInfo } from '@src/core/types/index.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { ServiceMethodAnalyzer } from '@src/functions/parse_analyzer.js';
import { ParamSerialization, ServiceMethodModel } from '@src/functions/types.js';
import { camelCase, pascalCase } from '@src/functions/utils.js';

/**
 * Responsible for generating the specific content of individual operations inside a FetchService.
 * This class abstracts the logic to wrap endpoints in a standard native fetch execution flow.
 */
export class FetchServiceMethodGenerator {
    private analyzer: ServiceMethodAnalyzer;

    /**
     * Instantiates a new method generator.
     * @param config The global code generator settings.
     * @param parser A reference to the active OpenAPI parser.
     */
    constructor(
        private readonly config: GeneratorConfig,
        readonly parser: SwaggerParser,
    ) {
        this.analyzer = new ServiceMethodAnalyzer(config, parser);
    }

    /**
     * Evaluates a single OpenAPI path segment operation and translates it into a valid Fetch method.
     * @param classDeclaration The `ts-morph` AST element of the service class.
     * @param operation The raw `PathInfo` representation of the endpoint.
     */
    public addServiceMethod(classDeclaration: ClassDeclaration, operation: PathInfo): void {
        const model = this.analyzer.analyze(operation);
        if (!model) return;

        let errorTypeAlias: string | undefined;
        if (model.errorResponses && model.errorResponses.length > 0) {
            const typeName = `${pascalCase(model.methodName)}Error`;
            const union = [...new Set(model.errorResponses.map(e => e.type))].join(' | ');
            classDeclaration.getSourceFile().addTypeAlias({
                name: typeName,
                isExported: true,
                type: union,
            });
            errorTypeAlias = typeName;
        }

        const distinctTypes = [...new Set(model.responseVariants.map(v => v.type))];
        const returnType = distinctTypes.length > 1 ? distinctTypes.join(' | ') : model.responseType;

        const serverOptionType = '{ server?: number | string; serverVariables?: Record<string, string> }';

        classDeclaration.addMethod({
            name: model.methodName,
            isAsync: true,
            parameters: [
                ...model.parameters,
                {
                    name: 'options',
                    hasQuestionToken: true,
                    type: `RequestInit & ${serverOptionType}`,
                },
            ],
            returnType: `Promise<${returnType}>`,
            statements: this.emitMethodBody(model),
        });
    }

    /**
     * Translates the `ServiceMethodModel` into stringized valid TypeScript fetch code.
     * @param model An abstraction holding parameters, path values, query objects, headers, etc.
     * @returns A string containing the entire method implementation body block.
     */
    private emitMethodBody(model: ServiceMethodModel): string {
        const lines: string[] = [];

        let urlTemplate = model.urlTemplate;
        model.pathParams.forEach((p: ParamSerialization) => {
            const serializeCall = `ParameterSerializer.serializePathParam('${p.originalName}', ${p.paramName}, '${p.style || 'simple'}', ${p.explode}, ${p.allowReserved})`;
            urlTemplate = urlTemplate.replace(`{${p.originalName}}`, `\${${serializeCall}}`);
        });

        if (model.operationServers && model.operationServers.length > 0) {
            lines.push(`const operationServers = ${JSON.stringify(model.operationServers, null, 2)};`);
            lines.push(
                `const basePath = resolveServerUrl(operationServers, options?.server ?? 0, options?.serverVariables ?? {});`,
            );
        } else {
            lines.push(
                `const basePath = (options?.server !== undefined || options?.serverVariables !== undefined) ? getServerUrl(options?.server ?? 0, options?.serverVariables ?? {}) : this.basePath;`,
            );
        }

        lines.push(`const url = new URL(\`\${basePath}${urlTemplate}\`);`);

        if (model.queryParams.length > 0) {
            model.queryParams.forEach((p: ParamSerialization) => {
                const configObj = JSON.stringify({
                    name: p.originalName,
                    in: 'query',
                    style: p.style,
                    explode: p.explode,
                    allowReserved: p.allowReserved,
                });
                lines.push(
                    `const serialized_${p.paramName} = ParameterSerializer.serializeQueryParam(${configObj}, ${p.paramName});`,
                );
                lines.push(
                    `serialized_${p.paramName}.forEach((entry: any) => url.searchParams.append(entry.key, entry.value));`,
                );
            });
        }

        lines.push(`const headers = new Headers(options?.headers);`);
        model.headerParams.forEach((p: ParamSerialization) => {
            lines.push(
                `if (${p.paramName} != null) { headers.set('${p.originalName}', ParameterSerializer.serializeHeaderParam(${p.paramName}, ${p.explode})); }`,
            );
        });

        let bodyArgument = 'undefined';
        if (model.body) {
            if (model.body.type === 'raw' || model.body.type === 'json') {
                bodyArgument = `JSON.stringify(${model.body.paramName})`;
                lines.push(`if (!headers.has('Content-Type')) { headers.set('Content-Type', 'application/json'); }`);
            } else if (model.body.type === 'urlencoded') {
                lines.push(`const formBody = new URLSearchParams();`);
                lines.push(
                    `const urlParamEntries = ParameterSerializer.serializeUrlEncodedBody(${model.body.paramName}, ${JSON.stringify(model.body.config)});`,
                );
                lines.push(`urlParamEntries.forEach((entry: any) => formBody.append(entry.key, entry.value));`);
                bodyArgument = 'formBody';
                lines.push(
                    `if (!headers.has('Content-Type')) { headers.set('Content-Type', 'application/x-www-form-urlencoded'); }`,
                );
            }
        }

        lines.push(`const fetchOptions: RequestInit = { ...options, method: '${model.httpMethod}', headers };`);
        if (bodyArgument !== 'undefined') {
            lines.push(`fetchOptions.body = ${bodyArgument} as any;`);
        }

        lines.push(`const response = await fetch(url.toString(), fetchOptions);`);
        lines.push(`if (!response.ok) { throw new Error('Request failed: ' + response.statusText); }`);

        // Basic parsing for now
        if (model.responseSerialization === 'json' || !model.responseSerialization) {
            lines.push(`return response.json();`);
        } else if (model.responseSerialization === 'blob') {
            lines.push(`return response.blob();`);
        } else {
            lines.push(`return response.text() as any;`);
        }

        return lines.join(String.fromCharCode(10));
    }
}
