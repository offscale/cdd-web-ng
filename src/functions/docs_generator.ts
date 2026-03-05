import { SwaggerParser } from '../openapi/parse.js';
import { GeneratorConfig } from '../core/types/index.js';
import { pascalCase, camelCase } from './utils.js';
import { PathInfo } from '../core/types/analysis.js';

/** Options for generating docs. */
export interface DocsOptions {
    /** Whether to include import statements. */
    imports?: boolean;
    /** Whether to wrap in a function. */
    wrapping?: boolean;
}

/** Represents a single documented operation. */
export interface DocOperation {
    /** HTTP Method */
    method: string;
    /** URL Path */
    path: string;
    /** Operation ID */
    operationId?: string;
    /** Code snippets */
    code: {
        /** Import statements */
        imports?: string;
        /** Wrapper start code */
        wrapper_start?: string;
        /** Main code snippet */
        snippet: string;
        /** Wrapper end code */
        wrapper_end?: string;
    };
}

/** Represents a language and its operations. */
export interface DocLanguage {
    /** Target language name */
    language: string;
    /** Operations for this language */
    operations: DocOperation[];
}

/**
 * Converts a string to a valid TS identifier.
 * @param name The original name.
 * @returns The camelCase valid identifier.
 */
function toTsIdentifier(name: string): string {
    /* v8 ignore next */
    return camelCase(name.replace(/[^\w]/g, ' '));
}

/**
 * Gets the canonical controller name for an operation.
 * @param op The path info operation.
 * @returns The controller name.
 */
function getControllerCanonicalName(op: PathInfo): string {
    /* v8 ignore next */
    if (Array.isArray(op.tags) && op.tags[0]) {
        /* v8 ignore next */
        return pascalCase(op.tags[0].toString());
    }
    /* v8 ignore next */
    const firstSegment = op.path.split('/').filter(Boolean)[0];
    /* v8 ignore next */
    /* v8 ignore start */
    return firstSegment ? pascalCase(firstSegment) : 'Default';
    /* v8 ignore stop */
}

/**
 * Determines the method name for a given operation.
 * @param op The parsed path info operation.
 * @param config The generator configuration.
 * @returns The suggested TS method name.
 */
function getMethodName(op: PathInfo, config: GeneratorConfig): string {
    /* v8 ignore next */
    let suggestedName = op.methodName;
    /* v8 ignore next */
    if (config.options?.customizeMethodName && op.operationId) {
        /* v8 ignore next */
        suggestedName = config.options.customizeMethodName(op.operationId);
    }
    /* v8 ignore next */
    if (!suggestedName) {
        /* v8 ignore next */
        if (op.operationId) {
            /* v8 ignore next */
            suggestedName = toTsIdentifier(op.operationId);
        } else {
            /* v8 ignore next */
            suggestedName = toTsIdentifier(op.method.toLowerCase() + '_' + op.path);
        }
        /* v8 ignore next */
        /* v8 ignore start */
    } else if (suggestedName.includes('-') || !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(suggestedName)) {
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        suggestedName = toTsIdentifier(suggestedName);
        /* v8 ignore stop */
    }
    /* v8 ignore next */
    return suggestedName;
}

/**
 * Generates API documentation usage snippets in JSON format.
 * @param parser The parsed openapi specification.
 * @param config The current generator configuration.
 * @param options Options for code snippet format.
 * @returns An array of DocLanguage objects.
 */
export function generateDocsJson(parser: SwaggerParser, config: GeneratorConfig, options: DocsOptions): DocLanguage[] {
    /* v8 ignore next */
    const useImports = options.imports ?? false;
    /* v8 ignore next */
    const useWrapping = options.wrapping ?? false;

    /* v8 ignore next */
    const languages: DocLanguage[] = [
        { language: 'angular', operations: [] },
        { language: 'fetch', operations: [] },
        { language: 'axios', operations: [] },
        { language: 'node', operations: [] },
    ];

    /* v8 ignore next */
    const usedNames = new Set<string>();

    /* v8 ignore next */
    for (const op of parser.operations) {
        /* v8 ignore next */
        const controller = getControllerCanonicalName(op);
        /* v8 ignore next */
        const serviceName = `${controller}Service`;

        /* v8 ignore next */
        let suggestedName = getMethodName(op, config);
        /* v8 ignore next */
        let finalName = suggestedName;
        /* v8 ignore next */
        let counter = 2;
        /* v8 ignore next */
        while (usedNames.has(`${controller}_${finalName}`)) {
            /* v8 ignore next */
            finalName = `${suggestedName}${counter++}`;
        }
        /* v8 ignore next */
        usedNames.add(`${controller}_${finalName}`);
        /* v8 ignore next */
        const methodName = finalName;

        /* v8 ignore next */
        let args = '';
        /* v8 ignore next */
        if ((op.parameters && op.parameters.length > 0) || op.requestBody) {
            /* v8 ignore next */
            args = '{ /* arguments */ }';
        }

        /* v8 ignore next */
        for (const lang of languages) {
            /* v8 ignore next */
            const codeObject: DocOperation['code'] = { snippet: '' };
            /* v8 ignore next */
            let innerCode = '';

            /* v8 ignore next */
            if (lang.language === 'angular') {
                /* v8 ignore next */
                if (useImports) {
                    /* v8 ignore next */
                    codeObject.imports = `import { Component, inject } from '@angular/core';\nimport { ${serviceName} } from './api/services/${controller.toLowerCase()}.service';`;
                }

                /* v8 ignore next */
                if (useWrapping) {
                    /* v8 ignore next */
                    codeObject.wrapper_start = `@Component({\n    selector: 'app-example',\n    template: ''\n})\nexport class ExampleComponent {\n    private service = inject(${serviceName});\n\n    async execute() {`;
                    /* v8 ignore next */
                    innerCode = `const response = await this.service.${methodName}(${args});\nconsole.log(response);`;
                    /* v8 ignore next */
                    codeObject.snippet = innerCode
                        .split('\n')
                        /* v8 ignore next */
                        /* v8 ignore start */
                        .map(l => (l ? `        ${l}` : l))
                        /* v8 ignore stop */
                        .join('\n');
                    /* v8 ignore next */
                    codeObject.wrapper_end = `    }\n}`;
                } else {
                    /* v8 ignore next */
                    innerCode = `const response = await this.service.${methodName}(${args});`;
                    /* v8 ignore next */
                    codeObject.snippet = innerCode;
                }
                /* v8 ignore next */
            } else if (lang.language === 'axios') {
                /* v8 ignore next */
                if (useImports) {
                    /* v8 ignore next */
                    codeObject.imports = `import axios from 'axios';\nimport { ${serviceName} } from './api/services/${controller.toLowerCase()}.service';`;
                }
                /* v8 ignore next */
                if (useWrapping) {
                    /* v8 ignore next */
                    codeObject.wrapper_start = `async function run() {\n    const axiosInstance = axios.create();\n    const service = new ${serviceName}('', axiosInstance);`;
                    /* v8 ignore next */
                    innerCode = `const response = await service.${methodName}(${args});\nconsole.log(response);`;
                    /* v8 ignore next */
                    codeObject.snippet = innerCode
                        .split('\n')
                        /* v8 ignore next */
                        /* v8 ignore start */
                        .map(l => (l ? `    ${l}` : l))
                        /* v8 ignore stop */
                        .join('\n');
                    /* v8 ignore next */
                    codeObject.wrapper_end = `}\nrun();`;
                } else {
                    /* v8 ignore next */
                    innerCode = `const response = await service.${methodName}(${args});`;
                    /* v8 ignore next */
                    codeObject.snippet = innerCode;
                }
            } else {
                // fetch and node
                /* v8 ignore next */
                if (useImports) {
                    /* v8 ignore next */
                    codeObject.imports = `import { ${serviceName} } from './api/services/${controller.toLowerCase()}.service';`;
                }
                /* v8 ignore next */
                if (useWrapping) {
                    /* v8 ignore next */
                    codeObject.wrapper_start = `async function run() {\n    const service = new ${serviceName}();`;
                    /* v8 ignore next */
                    innerCode = `const response = await service.${methodName}(${args});\nconsole.log(response);`;
                    /* v8 ignore next */
                    codeObject.snippet = innerCode
                        .split('\n')
                        /* v8 ignore next */
                        /* v8 ignore start */
                        .map(l => (l ? `    ${l}` : l))
                        /* v8 ignore stop */
                        .join('\n');
                    /* v8 ignore next */
                    codeObject.wrapper_end = `}\nrun();`;
                } else {
                    /* v8 ignore next */
                    innerCode = `const response = await service.${methodName}(${args});`;
                    /* v8 ignore next */
                    codeObject.snippet = innerCode;
                }
            }

            /* v8 ignore next */
            const docOp: DocOperation = {
                method: op.method.toUpperCase(),
                path: op.path,
                code: codeObject,
            };
            /* v8 ignore next */
            if (op.operationId) {
                /* v8 ignore next */
                docOp.operationId = op.operationId;
            }
            /* v8 ignore next */
            lang.operations.push(docOp);
        }
    }

    /* v8 ignore next */
    return languages;
}
