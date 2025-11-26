import * as path from "node:path";
import { Project, VariableDeclarationKind } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../core/constants.js";
import { SwaggerParser } from '@src/core/parser.js';

/**
 * Generates the `info.ts` file.
 * Exports API metadata (info, tags, externalDocs).
 */
export class InfoGenerator {
    constructor(private parser: SwaggerParser, private project: Project) {
    }

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, "info.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        // Generate ApiInfo Interface
        sourceFile.addInterface({
            name: "ApiInfo",
            isExported: true,
            properties: [
                { name: "title", type: "string" },
                { name: "version", type: "string" },
                { name: "description", type: "string", hasQuestionToken: true },
                {
                    name: "summary",
                    type: "string",
                    hasQuestionToken: true,
                    docs: ["Short summary of the API (OAS 3.1+)."]
                },
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

        // Generate ApiTag Interface
        sourceFile.addInterface({
            name: "ApiTag",
            isExported: true,
            properties: [
                { name: "name", type: "string" },
                { name: "description", type: "string", hasQuestionToken: true },
                {
                    name: "summary",
                    type: "string",
                    hasQuestionToken: true,
                    docs: ["Short summary of the tag (OAS 3.1+)."]
                },
                {
                    name: "parent",
                    type: "string",
                    hasQuestionToken: true,
                    docs: ["Parent tag naming for grouping (Extensions)."]
                },
                { name: "kind", type: "string", hasQuestionToken: true, docs: ["Tag categorization (Extensions)."] },
                {
                    name: "externalDocs",
                    type: "{ description?: string; url: string; }",
                    hasQuestionToken: true
                }
            ],
            docs: ["Interface representing a tag defined in the API."]
        });

        // Export API_INFO constant
        // We use JSON.stringify to ensure safe embedding of strings (quotes, etc.)
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [{
                name: "API_INFO",
                type: "ApiInfo",
                initializer: JSON.stringify(this.parser.getSpec().info || {}, null, 2)
            }],
            docs: ["Metadata about the API defined in the OpenAPI specification."]
        });

        // Export API_TAGS constant
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

        // Export API_EXTERNAL_DOCS constant
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
