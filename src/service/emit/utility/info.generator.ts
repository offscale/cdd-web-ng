import * as path from "node:path";
import { Project, VariableDeclarationKind } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";
import { SwaggerParser } from "../../../core/parser.js";

/**
 * Generates the `info.ts` file.
 * This file exports the metadata found in the OpenAPI `info` object (title, version, etc.)
 * as a runtime constant, allowing the application to access API details.
 */
export class InfoGenerator {
    constructor(private parser: SwaggerParser, private project: Project) {
    }

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, "info.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        // Define a runtime interface for the Info object so the constant is typed.
        // We reproduce the structure here to keep the generated code self-contained
        // and independent of the generator's internal types.
        sourceFile.addInterface({
            name: "ApiInfo",
            isExported: true,
            properties: [
                { name: "title", type: "string" },
                { name: "version", type: "string" },
                { name: "description", type: "string", hasQuestionToken: true },
                { name: "summary", type: "string", hasQuestionToken: true },
                { name: "termsOfService", type: "string", hasQuestionToken: true },
                {
                    name: "contact",
                    type: "{ name?: string; url?: string; email?: string; }",
                    hasQuestionToken: true
                },
                {
                    name: "license",
                    type: "{ name: string; url?: string; identifier?: string; }",
                    hasQuestionToken: true
                },
            ],
            docs: ["Interface representing the metadata of the API."]
        });

        // Export the actual data from the parsed spec
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [{
                name: "API_INFO",
                type: "ApiInfo",
                initializer: JSON.stringify(this.parser.spec.info, null, 2)
            }],
            docs: ["Metadata about the API defined in the OpenAPI specification."]
        });

        sourceFile.formatText();
    }
}
