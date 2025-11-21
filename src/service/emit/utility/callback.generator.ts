import * as path from "node:path";
import { Project, VariableDeclarationKind } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";
import { SwaggerParser } from "../../../core/parser.js";
import { extractPaths, getRequestBodyType, getResponseType, pascalCase } from "../../../core/utils.js";
import { PathInfo, PathItem } from "../../../core/types.js";

/**
 * Generates the `callbacks.ts` file.
 * This file exports TypeScript interfaces for all Callbacks defined in the OAS spec.
 * This allows consumers to strongly type the data they receive from webhooks.
 */
export class CallbackGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project
    ) {
    }

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, "callbacks.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        // Import models needed for callback payloads
        const requiredModels = new Set<string>();
        const registerModel = (type: string) => {
            // Rudimentary check if it looks like a model (PascalCase)
            if (type && type !== 'any' && /^[A-Z]/.test(type) && !['Date', 'Blob', 'File'].includes(type) && !type.includes('{')) {
                // Strip array [] suffixes
                const modelName = type.replace(/\[\]/g, '');
                requiredModels.add(modelName);
            }
        };

        const callbacksFound: { name: string, interfaceName: string, method: string, requestType: string, responseType: string }[] = [];

        // Iterate all operations to find callbacks
        this.parser.operations.forEach(op => {
            if (op.callbacks) {
                Object.entries(op.callbacks).forEach(([callbackName, pathItemOrRef]) => {
                    const resolved = this.parser.resolve(pathItemOrRef) as PathItem;
                    if (!resolved) return;

                    // A callback Map is URL Expression -> Path Item.
                    // e.g. '{$request.query.callbackUrl}': { post: ... }
                    Object.entries(resolved).forEach(([urlExpression, pathItemObj]) => {
                        // We use the shared extractor to process this Path Item structure into a normalized PathInfo
                        // normalized PathInfo contains parameters, requestBody, responses, etc.
                        const subPaths = this.processCallbackPathItem(urlExpression, pathItemObj as PathItem);

                        subPaths.forEach(sub => {
                            // Determine types. For callbacks, the 'requestBody' is what the server sends TO the client (the payload).
                            const requestType = getRequestBodyType(sub.requestBody, this.parser.config, this.parser.schemas.map(s => s.name));
                            // The response is what the client returns to acknowledge.
                            const responseType = getResponseType(sub.responses?.[Object.keys(sub.responses || {})[0]], this.parser.config, this.parser.schemas.map(s => s.name));

                            registerModel(requestType);

                            const interfaceName = `${pascalCase(callbackName)}${pascalCase(sub.method)}Payload`;
                            callbacksFound.push({
                                name: callbackName,
                                method: sub.method,
                                interfaceName,
                                requestType,
                                responseType
                            });

                            sourceFile.addTypeAlias({
                                isExported: true,
                                name: interfaceName,
                                type: requestType,
                                docs: [`Payload definition for callback '${callbackName}' (${sub.method}).`]
                            });
                        });
                    });
                });
            }
        });

        if (callbacksFound.length > 0) {
            // Add imports
            const modelsImport = Array.from(requiredModels);
            if (modelsImport.length > 0) {
                sourceFile.addImportDeclaration({
                    moduleSpecifier: "./models",
                    namedImports: modelsImport
                });
            }

            // Create a constant registry to list available callbacks
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [{
                    name: "API_CALLBACKS",
                    initializer: JSON.stringify(callbacksFound.map(c => ({
                        name: c.name,
                        method: c.method,
                        interfaceName: c.interfaceName
                    })), null, 2)
                }],
                docs: ["Metadata registry for identified callbacks."]
            });
        } else {
            // Ensure it's a valid module even if empty
            sourceFile.addStatements("export {};");
        }

        sourceFile.formatText();

        // Prepend header comment at the very end to avoid AST manipulation conflicts
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }

    /**
     * Helper to process the internal structure of a Callback Object, which maps URLs to PathItems.
     * We reuse the core `extractPaths` logic but apply it to the callback's internal map.
     */
    private processCallbackPathItem(urlKey: string, pathItem: PathItem): PathInfo[] {
        // We wrap it in a temporary map to use the existing extractor logic structure
        const tempMap = { [urlKey]: pathItem };
        return extractPaths(tempMap);
    }
}
