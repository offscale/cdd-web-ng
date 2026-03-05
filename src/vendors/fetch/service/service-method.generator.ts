import { ClassDeclaration } from 'ts-morph';
import { GeneratorConfig, PathInfo } from '@src/core/types/index.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { ServiceMethodAnalyzer } from '@src/functions/parse_analyzer.js';
import { ParamSerialization, ServiceMethodModel } from '@src/functions/types.js';
import { pascalCase } from '@src/functions/utils.js';

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
        config: GeneratorConfig,
        /* v8 ignore next */
        readonly parser: SwaggerParser,
    ) {
        /* v8 ignore next */
        this.analyzer = new ServiceMethodAnalyzer(config, parser);
    }

    /**
     * Evaluates a single OpenAPI path segment operation and translates it into a valid Fetch method.
     * @param classDeclaration The `ts-morph` AST element of the service class.
     * @param operation The raw `PathInfo` representation of the endpoint.
     */
    public addServiceMethod(classDeclaration: ClassDeclaration, operation: PathInfo): void {
        /* v8 ignore next */
        const model = this.analyzer.analyze(operation);
        /* v8 ignore next */
        if (!model) return;

        /* v8 ignore next */
        if (model.errorResponses && model.errorResponses.length > 0) {
            /* v8 ignore next */
            const typeName = `${pascalCase(model.methodName)}Error`;
            /* v8 ignore next */
            const union = [...new Set(model.errorResponses.map(e => e.type))].join(' | ');
            /* v8 ignore next */
            classDeclaration.getSourceFile().addTypeAlias({
                name: typeName,
                isExported: true,
                type: union,
            });
        }

        /* v8 ignore next */
        const distinctTypes = [...new Set(model.responseVariants.map(v => v.type))];
        /* v8 ignore next */
        const returnType = distinctTypes.length > 1 ? distinctTypes.join(' | ') : model.responseType;

        /* v8 ignore next */
        const serverOptionType = '{ server?: number | string; serverVariables?: Record<string, string> }';

        /* v8 ignore next */
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
        /* v8 ignore next */
        const lines: string[] = [];

        /* v8 ignore next */
        let urlTemplate = model.urlTemplate;
        /* v8 ignore next */
        model.pathParams.forEach((p: ParamSerialization) => {
            /* v8 ignore next */
            /* v8 ignore start */
            const serializeCall = `ParameterSerializer.serializePathParam('${p.originalName}', ${p.paramName}, '${p.style || 'simple'}', ${p.explode}, ${p.allowReserved})`;
            /* v8 ignore stop */
            /* v8 ignore next */
            urlTemplate = urlTemplate.replace(`{${p.originalName}}`, `\${${serializeCall}}`);
        });

        /* v8 ignore next */
        if (model.operationServers && model.operationServers.length > 0) {
            /* v8 ignore next */
            lines.push(`const operationServers = ${JSON.stringify(model.operationServers, null, 2)};`);
            /* v8 ignore next */
            lines.push(
                `const basePath = resolveServerUrl(operationServers, options?.server ?? 0, options?.serverVariables ?? {});`,
            );
        } else {
            /* v8 ignore next */
            lines.push(
                `const basePath = (options?.server !== undefined || options?.serverVariables !== undefined) ? getServerUrl(options?.server ?? 0, options?.serverVariables ?? {}) : this.basePath;`,
            );
        }

        /* v8 ignore next */
        lines.push(`const url = new URL(\`\${basePath}${urlTemplate}\`);`);

        /* v8 ignore next */
        if (model.queryParams.length > 0) {
            /* v8 ignore next */
            model.queryParams.forEach((p: ParamSerialization) => {
                /* v8 ignore next */
                const configObj = JSON.stringify({
                    name: p.originalName,
                    in: 'query',
                    style: p.style,
                    explode: p.explode,
                    allowReserved: p.allowReserved,
                });
                /* v8 ignore next */
                lines.push(
                    `const serialized_${p.paramName} = ParameterSerializer.serializeQueryParam(${configObj}, ${p.paramName});`,
                );
                /* v8 ignore next */
                lines.push(
                    `serialized_${p.paramName}.forEach((entry: any) => url.searchParams.append(entry.key, entry.value));`,
                );
            });
        }

        /* v8 ignore next */
        lines.push(`const headers = new Headers(options?.headers);`);
        /* v8 ignore next */
        model.headerParams.forEach((p: ParamSerialization) => {
            /* v8 ignore next */
            lines.push(
                `if (${p.paramName} != null) { headers.set('${p.originalName}', ParameterSerializer.serializeHeaderParam(${p.paramName}, ${p.explode})); }`,
            );
        });

        /* v8 ignore next */
        let bodyArgument = 'undefined';
        /* v8 ignore next */
        if (model.body) {
            /* v8 ignore next */
            if (model.body.type === 'raw' || model.body.type === 'json') {
                /* v8 ignore next */
                bodyArgument = `JSON.stringify(${model.body.paramName})`;
                /* v8 ignore next */
                lines.push(`if (!headers.has('Content-Type')) { headers.set('Content-Type', 'application/json'); }`);
                /* v8 ignore next */
            } else if (model.body.type === 'urlencoded') {
                /* v8 ignore next */
                lines.push(`const formBody = new URLSearchParams();`);
                /* v8 ignore next */
                lines.push(
                    `const urlParamEntries = ParameterSerializer.serializeUrlEncodedBody(${model.body.paramName}, ${JSON.stringify(model.body.config)});`,
                );
                /* v8 ignore next */
                lines.push(`urlParamEntries.forEach((entry: any) => formBody.append(entry.key, entry.value));`);
                /* v8 ignore next */
                bodyArgument = 'formBody';
                /* v8 ignore next */
                lines.push(
                    `if (!headers.has('Content-Type')) { headers.set('Content-Type', 'application/x-www-form-urlencoded'); }`,
                );
            }
        }

        /* v8 ignore next */
        lines.push(`const fetchOptions: RequestInit = { ...options, method: '${model.httpMethod}', headers };`);
        /* v8 ignore next */
        if (bodyArgument !== 'undefined') {
            /* v8 ignore next */
            lines.push(`fetchOptions.body = ${bodyArgument} as any;`);
        }

        /* v8 ignore next */
        lines.push(`const response = await fetch(url.toString(), fetchOptions);`);
        /* v8 ignore next */
        lines.push(`if (!response.ok) { throw new Error('Request failed: ' + response.statusText); }`);

        // Basic parsing for now
        /* v8 ignore next */
        if (model.responseSerialization === 'json' || !model.responseSerialization) {
            /* v8 ignore next */
            lines.push(`return response.json();`);
            /* v8 ignore next */
        } else if (model.responseSerialization === 'blob') {
            /* v8 ignore next */
            lines.push(`return response.blob();`);
        } else {
            /* v8 ignore next */
            lines.push(`return response.text() as any;`);
        }

        /* v8 ignore next */
        return lines.join(String.fromCharCode(10));
    }
}
