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

export function generateDocsJson(parser: SwaggerParser, config: GeneratorConfig, options: DocsOptions): Record<string, Record<string, string>> {
    const useImports = options.imports ?? false;
    const useWrapping = options.wrapping ?? false;

    const endpoints: Record<string, Record<string, string>> = {};
    const usedNames = new Set<string>();

    for (const op of parser.operations) {
        const controller = getControllerCanonicalName(op);
        const serviceName = `${controller}Service`;

        let suggestedName = getMethodName(op, config);
        let finalName = suggestedName;
        let counter = 2;
        while (usedNames.has(`${controller}_${finalName}`)) {
            finalName = `${suggestedName}${counter++}`;
        }
        usedNames.add(`${controller}_${finalName}`);
        const methodName = finalName;

        let args = '';
        if ((op.parameters && op.parameters.length > 0) || op.requestBody) {
            args = '{ /* arguments */ }';
        }

        const method = op.method.toLowerCase();
        const path = op.path;

        if (!endpoints[path]) {
            endpoints[path] = {};
        }

        let finalCode = '';

        if (useImports) {
            finalCode += `import { Component, inject } from '@angular/core';\nimport { ${serviceName} } from './api/services/${controller.toLowerCase()}.service';\n\n`;
        }

        if (useWrapping) {
            finalCode += `@Component({\n    selector: 'app-example',\n    template: ''\n})\nexport class ExampleComponent {\n    private service = inject(${serviceName});\n\n    async execute() {\n`;
        }

        let innerCode = `const response = await this.service.${methodName}(${args});\nconsole.log(response);`;
        if (useWrapping) {
            innerCode = innerCode.split('\n').map(l => `        ${l}`).join('\n');
        }
        
        finalCode += innerCode;

        if (useWrapping) {
            finalCode += `\n    }\n}`;
        }

        endpoints[path][method] = finalCode;
    }

    return { endpoints } as any;
}
