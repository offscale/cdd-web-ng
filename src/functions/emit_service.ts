import { Project, SourceFile } from 'ts-morph';
import * as path from 'node:path';
import { SwaggerParser } from '@src/openapi/parse.js';
import { GeneratorConfig, PathInfo } from '@src/core/types/index.js';
import { camelCase } from '@src/functions/utils.js';
import { SERVICE_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

function toTsIdentifier(name: string): string {
    /* v8 ignore next */
    return camelCase(name.replace(/[^\w]/g, ' '));
}

/**
 * Abstract Base Generator for Service Clients.
 * Handles the orchestration of looping through controllers and operations.
 * Subclasses implement the actual code generation logic (Angular, React, etc).
 */
export abstract class AbstractServiceGenerator {
    constructor(
        /* v8 ignore next */
        protected parser: SwaggerParser,
        /* v8 ignore next */
        protected project: Project,
        /* v8 ignore next */
        protected config: GeneratorConfig,
    ) {}

    /**
     * Main entry point. Loops through grouped paths and creates service files.
     */
    public generate(outputDir: string, groups: Record<string, PathInfo[]>): void {
        /* v8 ignore next */
        for (const [controllerName, operations] of Object.entries(groups)) {
            /* v8 ignore next */
            this.generateServiceFile(controllerName, operations, outputDir);
        }
    }

    /**
     * Generates a single service file/hook/class.
     */
    protected generateServiceFile(controllerName: string, operations: PathInfo[], outputDir: string): void {
        /* v8 ignore next */
        const cleanControllerName = toTsIdentifier(controllerName);
        /* v8 ignore next */
        const fileName = this.getFileName(cleanControllerName);
        /* v8 ignore next */
        const filePath = path.join(outputDir, fileName);

        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });
        /* v8 ignore next */
        sourceFile.addStatements(SERVICE_GENERATOR_HEADER_COMMENT);

        // 1. Abstraction: Generate Imports
        /* v8 ignore next */
        this.generateImports(sourceFile, operations);

        /* v8 ignore next */
        const usedNames = new Set<string>();

        // 2. Normalize Operation Names
        /* v8 ignore next */
        for (const op of operations) {
            /* v8 ignore next */
            let suggestedName = op.methodName;
            /* v8 ignore next */
            if (this.config.options.customizeMethodName && op.operationId) {
                /* v8 ignore next */
                suggestedName = this.config.options.customizeMethodName(op.operationId);
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
            } else if (suggestedName.includes('-') || !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(suggestedName)) {
                /* v8 ignore next */
                suggestedName = toTsIdentifier(suggestedName);
            }

            /* v8 ignore next */
            let finalName = suggestedName;
            /* v8 ignore next */
            let counter = 2;
            /* v8 ignore next */
            while (usedNames.has(finalName)) {
                /* v8 ignore next */
                finalName = `${suggestedName}${counter++}`;
            }
            /* v8 ignore next */
            usedNames.add(finalName);
            /* v8 ignore next */
            op.methodName = finalName;
        }

        // 3. Abstraction: Generate Class/Function Body
        /* v8 ignore next */
        this.generateServiceContent(sourceFile, cleanControllerName, operations);

        /* v8 ignore next */
        sourceFile.formatText();
    }

    /** Returns the filename (e.g. users.service.ts or useUsers.ts) */
    protected abstract getFileName(controllerName: string): string;

    /** Implementation specific imports */
    protected abstract generateImports(sourceFile: SourceFile, operations: PathInfo[]): void;

    /** Implementation specific content (Class vs Function, Methods) */
    protected abstract generateServiceContent(
        sourceFile: SourceFile,
        controllerName: string,
        operations: PathInfo[],
    ): void;
}
