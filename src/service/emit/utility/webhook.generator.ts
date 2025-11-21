import * as path from "node:path";
import { Project, VariableDeclarationKind } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";
import { SwaggerParser } from "../../../core/parser.js";
import { extractPaths, getRequestBodyType, getResponseType, pascalCase } from "../../../core/utils.js";
import { PathInfo, PathItem } from "../../../core/types.js";

/**
 * Generates the `webhooks.ts` file.
 * This file exports TypeScript interfaces for Top-Level Webhooks defined in the OAS 3.1+ spec.
 * This helps consumers of the API implement listeners for these out-of-band notifications.
 */
export class WebhookGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project
    ) {
    }

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, "webhooks.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        // Import models needed for webhook payloads
        const requiredModels = new Set<string>();
        const registerModel = (type: string) => {
            // Simple check to detect likely model references (PascalCase) to add to imports
            if (type && type !== 'any' && /^[A-Z]/.test(type) && !['Date', 'Blob', 'File'].includes(type) && !type.includes('{') && !type.includes('<')) {
                // Strip array [] suffixes
                const modelName = type.replace(/\[\]/g, '');
                requiredModels.add(modelName);
            }
        };

        const webhooksFound: { name: string, interfaceName: string, method: string, requestType: string, responseType: string }[] = [];

        // Top-level webhooks logic
        // Webhooks are essentially named PathItems (key is name, not path)
        const webhooks = this.parser.spec.webhooks || {};

        Object.entries(webhooks).forEach(([webhookName, pathItemOrRef]) => {
            const resolved = this.parser.resolve(pathItemOrRef) as PathItem;
            if (!resolved) return;

            // Process the PathItem logic (extract operations)
            // We temporarily treat the webhook name as a 'path' for extraction purposes
            const subPaths = this.processWebhookPathItem(webhookName, resolved);

            subPaths.forEach(sub => {
                // Types for the payload coming FROM the server TO the client
                const requestType = getRequestBodyType(sub.requestBody, this.parser.config, this.parser.schemas.map(s => s.name));
                // Types for the response the client should send back
                const responseType = getResponseType(sub.responses?.[Object.keys(sub.responses || {})[0]], this.parser.config, this.parser.schemas.map(s => s.name));

                registerModel(requestType);

                // Naming convention: NewPet + Post + Payload
                const interfaceName = `${pascalCase(webhookName)}${pascalCase(sub.method)}Payload`;
                webhooksFound.push({
                    name: webhookName,
                    method: sub.method,
                    interfaceName,
                    requestType,
                    responseType
                });

                sourceFile.addTypeAlias({
                    isExported: true,
                    name: interfaceName,
                    type: requestType,
                    docs: [`Payload definition for webhook '${webhookName}' (${sub.method}).`]
                });
            });
        });

        if (webhooksFound.length > 0) {
            // Add imports
            const modelsImport = Array.from(requiredModels);
            if (modelsImport.length > 0) {
                sourceFile.addImportDeclaration({
                    moduleSpecifier: "./models",
                    namedImports: modelsImport
                });
            }

            // Create a constant registry to list available webhooks
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [{
                    name: "API_WEBHOOKS",
                    initializer: JSON.stringify(webhooksFound.map(c => ({
                        name: c.name,
                        method: c.method,
                        interfaceName: c.interfaceName
                    })), null, 2)
                }],
                docs: ["Metadata registry for identified webhooks."]
            });
        } else {
            sourceFile.addStatements("export {};");
        }

        sourceFile.formatText();

        // Prepend header comment at the very end to avoid AST manipulation conflicts
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }

    /**
     * Helper to process the internal structure of a Webhook PathItem.
     */
    private processWebhookPathItem(name: string, pathItem: PathItem): PathInfo[] {
        // Wrap in a map for the extractor
        const tempMap = { [name]: pathItem };
        return extractPaths(tempMap);
    }
}
