import { Project, SourceFile } from 'ts-morph';
import * as path from 'node:path';
import { SwaggerParser } from '@src/openapi/parse.js';
import { GeneratorConfig, PathInfo } from '@src/core/types/index.js';
import { camelCase } from '@src/functions/utils.js';
import { SERVICE_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

function toTsIdentifier(name: string): string {
    return camelCase(name.replace(/[^\w]/g, ' '));
}

/**
 * Abstract Base Generator for Service Clients.
 * Handles the orchestration of looping through controllers and operations.
 * Subclasses implement the actual code generation logic (Angular, React, etc).
 */
export abstract class AbstractServiceGenerator {
    constructor(
        protected parser: SwaggerParser,
        protected project: Project,
        protected config: GeneratorConfig,
    ) {}

    /**
     * Main entry point. Loops through grouped paths and creates service files.
     */
    public generate(outputDir: string, groups: Record<string, PathInfo[]>): void {
        for (const [controllerName, operations] of Object.entries(groups)) {
            this.generateServiceFile(controllerName, operations, outputDir);
        }
    }

    /**
     * Generates a single service file/hook/class.
     */
    protected generateServiceFile(controllerName: string, operations: PathInfo[], outputDir: string): void {
        const cleanControllerName = toTsIdentifier(controllerName);
        const fileName = this.getFileName(cleanControllerName);
        const filePath = path.join(outputDir, fileName);

        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });
        sourceFile.addStatements(SERVICE_GENERATOR_HEADER_COMMENT);

        // 1. Abstraction: Generate Imports
        this.generateImports(sourceFile, operations);

        const usedNames = new Set<string>();

        // 2. Normalize Operation Names
        for (const op of operations) {
            let suggestedName = op.methodName;
            if (this.config.options.customizeMethodName && op.operationId) {
                suggestedName = this.config.options.customizeMethodName(op.operationId);
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

            let finalName = suggestedName;
            let counter = 2;
            while (usedNames.has(finalName)) {
                finalName = `${suggestedName}${counter++}`;
            }
            usedNames.add(finalName);
            op.methodName = finalName;
        }

        // 3. Abstraction: Generate Class/Function Body
        this.generateServiceContent(sourceFile, cleanControllerName, operations);

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
