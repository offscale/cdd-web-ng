import * as path from "node:path";
import { Project, VariableDeclarationKind } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "@src/core/constants.js";
import { SwaggerParser } from "@src/core/parser.js";

/**
 * Generates the `info.ts` file.
 * This file exports the metadata found in the OpenAPI `info` object, as well as
 * root-level `tags` and `externalDocs`, allowing the application to access API details at runtime.
 */
export class InfoGenerator {
    constructor(private parser: SwaggerParser, private project: Project) {
    }

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, "info.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        // Define a runtime interface for the Info object so the constant is typed.
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

        sourceFile.addInterface({
            name: "ApiTag",
            isExported: true,
            properties: [
                { name: "name", type: "string" },
                { name: "description", type: "string", hasQuestionToken: true },
                { name: "summary", type: "string", hasQuestionToken: true },
                { name: "parent", type: "string", hasQuestionToken: true },
                { name: "kind", type: "string", hasQuestionToken: true },
                {
                    name: "externalDocs",
                    type: "{ description?: string; url: string; }",
                    hasQuestionToken: true
                }
            ],
            docs: ["Interface representing a tag defined in the API."]
        });

        // Export the Info data from the parsed spec
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [{
                name: "API_INFO",
                type: "ApiInfo",
                initializer: JSON.stringify(this.parser.getSpec().info, null, 2)
            }],
            docs: ["Metadata about the API defined in the OpenAPI specification."]
        });

        // Export the Tags data from the parsed spec
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [{
                name: "API_TAGS",
                type: "ApiTag[]",
                initializer: JSON.stringify(this.parser.getSpec().tags || [], null, 2)
            }],
            docs: ["List of tags defined in the OpenAPI specification."]
        });

        // Export External Documentation from the parsed spec
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [{
                name: "API_EXTERNAL_DOCS",
                type: "{ description?: string; url: string; } | undefined",
                initializer: JSON.stringify(this.parser.getSpec().externalDocs, null, 2)
            }],
            docs: ["Global external documentation defined in the OpenAPI specification."]
        });

        sourceFile.formatText();
    }
}
