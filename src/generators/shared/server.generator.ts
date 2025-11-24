// src/generators/shared/server.generator.ts

import * as path from "node:path";
import { Project, VariableDeclarationKind } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../core/constants.js";
import { SwaggerParser } from "../../core/parser.js";

export class ServerGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project
    ) {
    }

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, "servers.ts");
        const sourceFile = this.project.createSourceFile(
            filePath,
            UTILITY_GENERATOR_HEADER_COMMENT, // Start with the header content
            { overwrite: true }
        );

        const servers = this.parser.servers || [];

        if (servers.length > 0) {
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [{
                    name: "API_SERVERS",
                    initializer: JSON.stringify(servers, null, 2)
                }],
                docs: ["The servers defined in the OpenAPI specification."]
            });
        } else {
            // BEFORE (This is causing the error)
            // sourceFile.addStatements("export {};");

            // AFTER (A more robust way to add text to an almost-empty file)
            sourceFile.insertText(sourceFile.getEnd(), "\nexport {};");
        }

        sourceFile.formatText();
    }
}
