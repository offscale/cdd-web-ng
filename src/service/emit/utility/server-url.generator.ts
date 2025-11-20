// src/service/emit/utility/server-url.generator.ts

import * as path from "node:path";
import { Project, VariableDeclarationKind } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";
import { SwaggerParser } from "../../../core/parser.js";

/**
 * Generates the `utils/server-url.ts` file.
 * This file provides constants and a helper function to access and construct
 * server URLs as defined in the OpenAPI spec, including variable substitution logic.
 */
export class ServerUrlGenerator {
    constructor(private parser: SwaggerParser, private project: Project) {
    }

    public generate(outputDir: string): void {
        if (this.parser.servers.length === 0) {
            // No servers defined in spec, skip generation.
            return;
        }

        const utilsDir = path.join(outputDir, "utils");
        const filePath = path.join(utilsDir, "server-url.ts");

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        // Define the type for Server Object to keep the generated code clean and typed
        sourceFile.addInterface({
            name: "ServerConfiguration",
            isExported: true,
            properties: [
                { name: "url", type: "string" },
                { name: "description", type: "string", hasQuestionToken: true },
                {
                    name: "variables",
                    hasQuestionToken: true,
                    type: "Record<string, { enum?: string[]; default: string; description?: string; }>"
                }
            ]
        });

        // Export the servers array
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [{
                name: "API_SERVERS",
                type: "ServerConfiguration[]",
                initializer: JSON.stringify(this.parser.servers, null, 2)
            }],
            docs: ["The list of servers defined in the OpenAPI specification."]
        });

        // Helper function to build the URL
        sourceFile.addFunction({
            name: "getServerUrl",
            isExported: true,
            parameters: [
                { name: "indexOrDescription", type: "number | string", initializer: "0" },
                { name: "variables", type: "Record<string, string>", hasQuestionToken: true }
            ],
            returnType: "string",
            docs: [
                "Gets the URL for a specific server definition, substituting variables if needed.",
                "@param indexOrDescription The index of the server in `API_SERVERS` or its description. Defaults to 0.",
                "@param variables A map of variable names to values to override the defaults.",
                "@throws Error if the server is not found.",
                "@returns The fully constructed URL."
            ],
            statements: writer => {
                writer.writeLine("let server: ServerConfiguration | undefined;");
                writer.writeLine("if (typeof indexOrDescription === 'number') {").indent(() => {
                    writer.writeLine("server = API_SERVERS[indexOrDescription];");
                }).writeLine("} else {").indent(() => {
                    writer.writeLine("server = API_SERVERS.find(s => s.description === indexOrDescription);");
                }).writeLine("}");

                writer.writeLine("if (!server) {").indent(() => {
                    writer.writeLine("throw new Error(`Server not found: ${indexOrDescription}`);");
                }).writeLine("}");

                writer.writeLine("let url = server.url;");
                writer.writeLine("if (server.variables) {").indent(() => {
                    writer.writeLine("Object.entries(server.variables).forEach(([key, config]) => {").indent(() => {
                        writer.writeLine("const value = variables?.[key] ?? config.default;");
                        writer.writeLine("// Simple substitution (e.g., {port})");
                        writer.writeLine("url = url.replace(new RegExp(`{${key}}`, 'g'), value);");
                    }).writeLine("});");
                }).writeLine("}");
                writer.writeLine("return url;");
            }
        });

        sourceFile.formatText();
    }
}
