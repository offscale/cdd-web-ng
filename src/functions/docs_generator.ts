import { SwaggerParser } from '../openapi/parse.js';
import { GeneratorConfig } from '../core/types/index.js';
import { pascalCase, camelCase } from './utils.js';
import { PathInfo } from '../core/types/analysis.js';

interface DocsOptions {
    imports?: boolean;
    wrapping?: boolean;
}

interface DocOperation {
    method: string;
    path: string;
    operationId?: string;
    code: {
        imports?: string;
        wrapper_start?: string;
        snippet: string;
        wrapper_end?: string;
    };
}

interface DocLanguage {
    language: string;
    operations: DocOperation[];
}

function toTsIdentifier(name: string): string {
    return camelCase(name.replace(/[^\w]/g, ' '));
}

function getControllerCanonicalName(op: PathInfo): string {
    if (Array.isArray(op.tags) && op.tags[0]) {
        return pascalCase(op.tags[0].toString());
    }
    const firstSegment = op.path.split('/').filter(Boolean)[0];
    return firstSegment ? pascalCase(firstSegment) : 'Default';
}

function getMethodName(op: PathInfo, config: GeneratorConfig): string {
    let suggestedName = op.methodName;
    if (config.options?.customizeMethodName && op.operationId) {
        suggestedName = config.options.customizeMethodName(op.operationId);
    }
    if (!suggestedName) {
        if (op.operationId) {
            suggestedName = toTsIdentifier(op.operationId);
        } else {
            suggestedName = toTsIdentifier(op.method.toLowerCase() + '_' + op.path);
        }
    } else if (suggestedName.includes('-') || !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(suggestedName)) {
        suggestedName = toTsIdentifier(suggestedName);
    }
    return suggestedName;
}

export function generateDocsJson(parser: SwaggerParser, config: GeneratorConfig, options: DocsOptions): DocLanguage[] {
    const operations: DocOperation[] = [];

    // We assume default toggles are false if not explicitly provided,
    // but the cli command will pass the toggle flags.
    const useImports = options.imports ?? false;
    const useWrapping = options.wrapping ?? false;

    // We can group operations to avoid duplicate names in case we need strictly unique method names
    // as AbstractServiceGenerator does, but here we just need a reasonable representation for docs.
    const usedNames = new Set<string>();

    for (const op of parser.operations) {
        const controller = getControllerCanonicalName(op);
        const serviceName = `${controller}Service`;

        let suggestedName = getMethodName(op, config);
        let finalName = suggestedName;
        let counter = 2;
        const dedupeKey = `${controller}_${finalName}`;
        while (usedNames.has(dedupeKey)) {
            finalName = `${suggestedName}${counter++}`;
        }
        usedNames.add(`${controller}_${finalName}`);

        const methodName = finalName;

        let codeObject: DocOperation['code'] = { snippet: '' };

        // Simple heuristic for TS arguments
        let args = '';
        if ((op.parameters && op.parameters.length > 0) || op.requestBody) {
            args = '{ /* arguments */ }';
        }

        if (useImports) {
            codeObject.imports = `import { ${serviceName} } from './services/${controller}Service';`;
        }

        let innerCode = '';
        if (useImports || useWrapping) {
            if (!useWrapping) {
                // if imports is true but wrapping is false, we might want top-level await syntax
                innerCode += `const service = new ${serviceName}();\n`;
                innerCode += `const response = await service.${methodName}(${args});\n`;
                innerCode += `console.log(response);`;
            } else {
                innerCode += `const service = new ${serviceName}();\n`;
                innerCode += `const response = await service.${methodName}(${args});\n`;
                innerCode += `console.log(response);`;
            }
        } else {
            // Very concise syntax
            innerCode += `await new ${serviceName}().${methodName}(${args});`;
        }
        codeObject.snippet = innerCode;

        if (useWrapping) {
            codeObject.wrapper_start = `export async function call${pascalCase(methodName)}() {`;
            codeObject.snippet = innerCode
                .split('\n')
                .map(l => (l ? `    ${l}` : l))
                .join('\n');
            codeObject.wrapper_end = `}`;
        }

        const docOp: DocOperation = {
            method: op.method.toUpperCase(),
            path: op.path,
            code: codeObject,
        };
        if (op.operationId) {
            docOp.operationId = op.operationId;
        }
        operations.push(docOp);
    }

    return [
        {
            language: 'typescript',
            operations,
        },
    ];
}
