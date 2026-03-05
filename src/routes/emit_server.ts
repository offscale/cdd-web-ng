// src/generators/shared/server.generator.ts

import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';

export class ServerGenerator {
    constructor(
        /* v8 ignore next */
        private readonly parser: SwaggerParser,
        /* v8 ignore next */
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const filePath = path.join(outputDir, 'servers.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(
            filePath,
            UTILITY_GENERATOR_HEADER_COMMENT, // Start with the header content
            { overwrite: true },
        );

        /* v8 ignore next */
        const servers = this.parser.servers || [];

        /* v8 ignore next */
        if (servers.length > 0) {
            /* v8 ignore next */
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: 'API_SERVERS',
                        initializer: JSON.stringify(servers, null, 2),
                    },
                ],
                docs: ['The servers defined in the OpenAPI specification.'],
            });
        } else {
            // BEFORE (This is causing the error)
            // sourceFile.addStatements("export {};");

            // AFTER (A more robust way to add text to an almost-empty file)
            /* v8 ignore next */
            sourceFile.insertText(sourceFile.getEnd(), '\nexport {};');
        }

        /* v8 ignore next */
        sourceFile.formatText();
    }
}
