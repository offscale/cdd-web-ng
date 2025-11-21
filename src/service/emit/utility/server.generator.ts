import * as path from "node:path";
import { Project, VariableDeclarationKind } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";
import { SwaggerParser } from "../../../core/parser.js";

/**
 * Generates the `servers.ts` file.
 * This file provides a dynamic registry of Server Configurations.
 * It manages Base URLs, Server Variables, and provides a helper to resolve URLs at runtime.
 * Support includes:
 * - Root level servers (Global defaults)
 * - Path level overrides (Rare but valid)
 * - Operation level overrides
 */
export class ServerGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project
    ) {
    }

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, "servers.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        // 1. Extract Global Servers
        const globalServers = this.parser.spec.servers || [{ url: '/' }];

        // 2. Structure the metadata
        // We want a const object that looks like:
        // export const API_SERVERS = {
        //   server1: { url: "...", description: "...", variables: { ... } },
        //   server2: ...
        // }
        // However, OAS servers is an Array without keys. We will key them by index or 'description' if unique.

        const formattedServers = globalServers.map(s => ({
            url: s.url,
            description: s.description || 'Default configuration',
            name: s.name, // OAS 3.2 support
            variables: s.variables || {}
        }));

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [{
                name: "API_SERVERS",
                initializer: JSON.stringify(formattedServers, null, 2)
            }],
            docs: ["List of Server Configurations defined in the OpenAPI Spec."]
        });

        // 3. Add Helper Function to build URLs
        // This function takes a template URL and a variables object and returns the resolved string.
        // e.g. https://{region}.api.com -> https://eu-west.api.com
        sourceFile.addFunction({
            isExported: true,
            name: "buildServerUrl",
            parameters: [
                { name: "serverIndex", type: "number", initializer: "0" },
                { name: "variables", type: "Record<string, string>", hasQuestionToken: true }
            ],
            returnType: "string",
            docs: ["Resolves a server URL by index, substituting variables if present."],
            statements: (writer) => {
                writer.writeLine(`const server = API_SERVERS[serverIndex] || API_SERVERS[0];`);
                writer.writeLine(`let url = server.url;`);

                // Logic to replace {var} with value
                writer.write("if (server.variables && variables) {").block(() => {
                    writer.writeLine("Object.keys(variables).forEach(key => {");
                    writer.indent().writeLine(`// Only replace if the variable matches the spec's definition of substitutions`);
                    writer.writeLine(`if (server.variables[key]) {`);
                    // Simple regex replacement for {key}
                    writer.indent().writeLine(`url = url.replace(new RegExp('{' + key + '}', 'g'), variables[key]);`);
                    writer.writeLine("}");
                    writer.writeLine("});");
                });
                writer.write("}");

                // Clean up default variable values if user didn't provide them
                writer.write("if (server.variables) {").block(() => {
                    writer.writeLine("Object.entries(server.variables).forEach(([key, config]) => {");
                    writer.indent().writeLine(`// If the variable is still in the URL (matches {key}), replace with default`);
                    writer.writeLine(`if (url.includes('{' + key + '}')) {`);
                    writer.indent().writeLine(`url = url.replace(new RegExp('{' + key + '}', 'g'), config.default);`);
                    writer.writeLine("}");
                    writer.writeLine("});");
                });
                writer.write("}");

                writer.writeLine("return url;");
            }
        });

        sourceFile.formatText();
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }
}
