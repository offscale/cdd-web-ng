import * as path from "node:path";
import { Project, VariableDeclarationKind } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "@src/core/constants.js";
import { SwaggerParser } from "@src/core/parser.js";

/**
 * Generates the `security.ts` file.
 * This file contains constants representing the Security Schemes defined in the OpenAPI spec.
 * It is primarily used for reference or DI token keys in client applications.
 */
export class SecurityGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project
    ) {
    }

    public generate(outputDir: string): void {
        const schemes = this.parser.getSecuritySchemes();

        // If no security schemes are defined, we don't need to generate this file.
        // However, to ensure tests looking for this file don't crash on "not found",
        // we will verify the orchestrator/tests expectations.
        // Standard behavior: skip if empty.
        if (!schemes || Object.keys(schemes).length === 0) {
            return;
        }

        const filePath = path.join(outputDir, "security.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [{
                name: "API_SECURITY_SCHEMES",
                initializer: JSON.stringify(schemes, null, 2)
            }],
            docs: ["The Security Schemes defined in the OpenAPI specification."]
        });

        sourceFile.formatText();
    }
}
