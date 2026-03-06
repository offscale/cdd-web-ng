import { ClassDeclaration } from 'ts-morph';
import { GeneratorConfig, PathInfo } from '@src/core/types/index.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { ServiceMethodAnalyzer } from '@src/functions/parse_analyzer.js';
import { ParamSerialization, ServiceMethodModel } from '@src/functions/types.js';
import { pascalCase } from '@src/functions/utils.js';

/**
 * Responsible for generating the specific content of individual operations inside a NodeService.
 * This class abstracts the logic to wrap endpoints in a standard Node.js `http`/`https` execution flow.
 */
export class NodeServiceMethodGenerator {
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
     * Evaluates a single OpenAPI path segment operation and translates it into a valid Node request method.
     * @param classDeclaration The `ts-morph` AST element of the service class.
     * @param operation The raw `PathInfo` representation of the endpoint.
     */
    public addServiceMethod(classDeclaration: ClassDeclaration, operation: PathInfo): void {
        /* v8 ignore next */
        const model = this.analyzer.analyze(operation);
        /* v8 ignore next */
        if (!model) return;

        /* v8 ignore next */
        if (model.errorResponses.length > 0) {
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
                    type: `import('node:http').RequestOptions & ${serverOptionType}`,
                },
            ],
            returnType: `Promise<${returnType}>`,
            statements: this.emitMethodBody(model),
        });
    }

    /**
     * Translates the `ServiceMethodModel` into stringized valid TypeScript Node.js code.
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
            const serializeCall = `ParameterSerializer.serializePathParam('${p.originalName}', ${p.paramName}, '${p.style}', ${p.explode}, ${p.allowReserved})`;
            /* v8 ignore next */
            urlTemplate = urlTemplate.replace(`{${p.originalName}}`, `\${${serializeCall}}`);
        });

        /* v8 ignore next */
        if (model.operationServers?.length) {
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
                    `serialized_${p.paramName}.forEach((entry: { key: string; value: string }) => url.searchParams.append(entry.key, entry.value));`,
                );
            });
        }

        /* v8 ignore next */
        lines.push(`const headers: Record<string, string> = { ...(options?.headers as Record<string, string>) };`);
        /* v8 ignore next */
        model.headerParams.forEach((p: ParamSerialization) => {
            /* v8 ignore next */
            lines.push(
                `if (${p.paramName} != null) { headers['${p.originalName}'] = ParameterSerializer.serializeHeaderParam(${p.paramName}, ${p.explode}); }`,
            );
        });

        /* v8 ignore next */
        let dataArgument = 'undefined';
        /* v8 ignore next */
        if (model.body) {
            /* v8 ignore next */
            if (model.body.type === 'raw' || model.body.type === 'json') {
                /* v8 ignore next */
                dataArgument = `JSON.stringify(${model.body.paramName})`;
                /* v8 ignore next */
                lines.push(`if (!headers['Content-Type']) { headers['Content-Type'] = 'application/json'; }`);
                /* v8 ignore next */
            } else if (model.body.type === 'urlencoded') {
                /* v8 ignore next */
                lines.push(`const formBody = new URLSearchParams();`);
                /* v8 ignore next */
                lines.push(
                    `const urlParamEntries = ParameterSerializer.serializeUrlEncodedBody(${model.body.paramName}, ${JSON.stringify(model.body.config)});`,
                );
                /* v8 ignore next */
                lines.push(
                    `urlParamEntries.forEach((entry: { key: string; value: string }) => formBody.append(entry.key, entry.value));`,
                );
                /* v8 ignore next */
                dataArgument = 'formBody.toString()';
                /* v8 ignore next */
                lines.push(
                    `if (!headers['Content-Type']) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; }`,
                );
            } else {
                /* v8 ignore next */
                dataArgument = model.body.paramName;
            }
        }

        /* v8 ignore next */
        lines.push(
            `const requestOptions: import('node:http').RequestOptions | import('node:https').RequestOptions = { ...options, method: '${model.httpMethod.toUpperCase()}', headers };`,
        );

        /* v8 ignore next */
        lines.push(`return new Promise((resolve, reject) => {`);
        /* v8 ignore next */
        lines.push(`    const client = url.protocol === 'https:' ? https : http;`);
        /* v8 ignore next */
        lines.push(`    const req = client.request(url, requestOptions, (res) => {`);
        /* v8 ignore next */
        lines.push(`        const chunks: unknown[] = [];`);
        /* v8 ignore next */
        lines.push(`        res.on('data', (chunk) => chunks.push(chunk));`);
        /* v8 ignore next */
        lines.push(`        res.on('end', () => {`);
        /* v8 ignore next */
        lines.push(`            const buffer = Buffer.concat(chunks);`);
        /* v8 ignore next */
        lines.push(`            if (res.statusCode && res.statusCode >= 400) {`);
        /* v8 ignore next */
        lines.push(
            `                return reject(new Error('Request failed: ' + res.statusCode + ' ' + res.statusMessage));`,
        );
        /* v8 ignore next */
        lines.push(`            }`);
        /* v8 ignore next */
        if (model.responseSerialization === 'blob' || model.responseSerialization === 'arraybuffer') {
            /* v8 ignore next */
            lines.push(`            resolve(buffer as unknown);`);
            /* v8 ignore next */
        } else if (model.responseSerialization === 'text') {
            /* v8 ignore next */
            lines.push(`            resolve(buffer.toString('utf-8') as unknown);`);
        } else {
            /* v8 ignore next */
            lines.push(`            try {`);
            /* v8 ignore next */
            lines.push(`                resolve(JSON.parse(buffer.toString('utf-8')));`);
            /* v8 ignore next */
            lines.push(`            } catch (e) {`);
            /* v8 ignore next */
            lines.push(`                resolve(buffer.toString('utf-8') as unknown);`);
            /* v8 ignore next */
            lines.push(`            }`);
        }
        /* v8 ignore next */
        lines.push(`        });`);
        /* v8 ignore next */
        lines.push(`    });`);
        /* v8 ignore next */
        lines.push(`    req.on('error', reject);`);

        /* v8 ignore next */
        if (dataArgument !== 'undefined') {
            /* v8 ignore next */
            lines.push(`    req.write(${dataArgument});`);
        }

        /* v8 ignore next */
        lines.push(`    req.end();`);
        /* v8 ignore next */
        lines.push(`});`);

        /* v8 ignore next */
        return lines.join(String.fromCharCode(10));
    }
}
