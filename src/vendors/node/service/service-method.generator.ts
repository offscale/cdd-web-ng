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
        readonly parser: SwaggerParser,
    ) {
        this.analyzer = new ServiceMethodAnalyzer(config, parser);
    }

    /**
     * Evaluates a single OpenAPI path segment operation and translates it into a valid Node request method.
     * @param classDeclaration The `ts-morph` AST element of the service class.
     * @param operation The raw `PathInfo` representation of the endpoint.
     */
    public addServiceMethod(classDeclaration: ClassDeclaration, operation: PathInfo): void {
        const model = this.analyzer.analyze(operation);
        if (!model) return;

        if (model.errorResponses && model.errorResponses.length > 0) {
            const typeName = `${pascalCase(model.methodName)}Error`;
            const union = [...new Set(model.errorResponses.map(e => e.type))].join(' | ');
            classDeclaration.getSourceFile().addTypeAlias({
                name: typeName,
                isExported: true,
                type: union,
            });
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

        lines.push(`const headers: Record<string, string> = { ...(options?.headers as Record<string, string>) };`);
        model.headerParams.forEach((p: ParamSerialization) => {
            lines.push(
                `if (${p.paramName} != null) { headers['${p.originalName}'] = ParameterSerializer.serializeHeaderParam(${p.paramName}, ${p.explode}); }`,
            );
        });

        let dataArgument = 'undefined';
        if (model.body) {
            if (model.body.type === 'raw' || model.body.type === 'json') {
                dataArgument = `JSON.stringify(${model.body.paramName})`;
                lines.push(`if (!headers['Content-Type']) { headers['Content-Type'] = 'application/json'; }`);
            } else if (model.body.type === 'urlencoded') {
                lines.push(`const formBody = new URLSearchParams();`);
                lines.push(
                    `const urlParamEntries = ParameterSerializer.serializeUrlEncodedBody(${model.body.paramName}, ${JSON.stringify(model.body.config)});`,
                );
                lines.push(`urlParamEntries.forEach((entry: any) => formBody.append(entry.key, entry.value));`);
                dataArgument = 'formBody.toString()';
                lines.push(
                    `if (!headers['Content-Type']) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; }`,
                );
            }
        }

        lines.push(
            `const requestOptions: import('node:http').RequestOptions | import('node:https').RequestOptions = { ...options, method: '${model.httpMethod.toUpperCase()}', headers };`,
        );

        lines.push(`return new Promise((resolve, reject) => {`);
        lines.push(`    const client = url.protocol === 'https:' ? https : http;`);
        lines.push(`    const req = client.request(url, requestOptions, (res) => {`);
        lines.push(`        const chunks: any[] = [];`);
        lines.push(`        res.on('data', (chunk) => chunks.push(chunk));`);
        lines.push(`        res.on('end', () => {`);
        lines.push(`            const buffer = Buffer.concat(chunks);`);
        lines.push(`            if (res.statusCode && res.statusCode >= 400) {`);
        lines.push(
            `                return reject(new Error('Request failed: ' + res.statusCode + ' ' + res.statusMessage));`,
        );
        lines.push(`            }`);
        if (model.responseSerialization === 'blob') {
            lines.push(`            resolve(buffer as any);`);
        } else if (model.responseSerialization === 'text') {
            lines.push(`            resolve(buffer.toString('utf-8') as any);`);
        } else {
            lines.push(`            try {`);
            lines.push(`                resolve(JSON.parse(buffer.toString('utf-8')));`);
            lines.push(`            } catch (e) {`);
            lines.push(`                resolve(buffer.toString('utf-8') as any);`);
            lines.push(`            }`);
        }
        lines.push(`        });`);
        lines.push(`    });`);
        lines.push(`    req.on('error', reject);`);

        if (dataArgument !== 'undefined') {
            lines.push(`    req.write(${dataArgument});`);
        }

        lines.push(`    req.end();`);
        lines.push(`});`);

        return lines.join(String.fromCharCode(10));
    }
}
