import * as path from "node:path";
import { Project, VariableDeclarationKind } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "@src/core/constants.js";
import { SwaggerParser } from "@src/core/parser.js";
import { HeaderObject, PathInfo, SwaggerDefinition } from "@src/core/types.js";

/**
 * Generates the `response-headers.ts` file.
 * This file acts as a static registry for Response Headers defined in the API.
 * It maps: Operation ID -> Status Code -> Header Name -> Header Type (runtime hint).
 * This allows the runtime `ResponseHeaderService` to correctly parse/coerce string header values
 * into booleans, numbers, or JSON objects matching the generated interfaces.
 */
export class ResponseHeaderRegistryGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project
    ) {
    }

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, "response-headers.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        // Structure: OperationId -> StatusCode -> { [headerName]: 'string' | 'number' | 'boolean' | 'array' | 'json' }
        const registry: Record<string, Record<string, Record<string, string>>> = {};
        let headerCount = 0;

        this.parser.operations.forEach((op: PathInfo) => {
            if (!op.operationId || !op.responses) return;

            const opHeaders: Record<string, Record<string, string>> = {};
            let hasHeadersForOp = false;

            Object.entries(op.responses).forEach(([statusCode, response]) => {
                // In extractPaths, response headers are already resolved/normalized somewhat,
                // but we should check if we need to resolve a $ref on the response itself first if strictly following structure,
                // currently `extractPaths` resolves the response object structure but keeps headers inside.

                // Note: extractPaths returns type `SwaggerResponse` which has `headers` Record.
                if (response.headers) {
                    const headerConfig: Record<string, string> = {};

                    Object.entries(response.headers).forEach(([headerName, headerOrRef]) => {
                        const headerDef = this.parser.resolve(headerOrRef) as HeaderObject;
                        if (!headerDef) return;

                        const typeHint = this.getHeaderTypeHint(headerDef);
                        if (typeHint) {
                            headerConfig[headerName] = typeHint;
                        }
                    });

                    if (Object.keys(headerConfig).length > 0) {
                        opHeaders[statusCode] = headerConfig;
                        hasHeadersForOp = true;
                        headerCount += Object.keys(headerConfig).length;
                    }
                }
            });

            if (hasHeadersForOp) {
                registry[op.operationId] = opHeaders;
            }
        });

        if (headerCount > 0) {
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [{
                    name: "API_RESPONSE_HEADERS",
                    initializer: JSON.stringify(registry, null, 2)
                }],
                docs: [
                    "Registry of Response Headers defined in the API.",
                    "Structure: operationId -> responseStatusCode -> headerName -> typeHint"
                ]
            });
        } else {
            sourceFile.addStatements("export {};");
        }

        sourceFile.formatText();
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }

    /**
     * Determines the runtime type coercion required for a header.
     * Valid hints: 'string', 'number', 'boolean', 'array', 'json'
     */
    private getHeaderTypeHint(header: HeaderObject): string {
        // 1. Check 'content' (OAS 3.x complex serialization)
        if (header.content) {
            const contentType = Object.keys(header.content)[0];
            if (contentType && contentType.includes('json')) {
                return 'json';
            }
            // Text/Plain via content map
            return 'string';
        }

        // 2. Check 'schema' (OAS 3.x / Swagger 2 with schema adapter)
        // extractPaths normalizes Swagger 2 items into a schema structure for basic types usually,
        // or we might have raw properties.
        const schema = header.schema || header; // Fallback for Swagger 2 simple properties mixed in

        // Resolve schema if it's a ref
        const resolvedSchema = this.parser.resolve(schema) as SwaggerDefinition;

        if (!resolvedSchema) return 'string';

        if (resolvedSchema.type === 'array') {
            // Arrays in headers usually mean comma-separated or multiple headers.
            // The HttpClient returns lazy/string array. We mark as array for specific handling if needed.
            return 'array';
        }

        if (resolvedSchema.type === 'integer' || resolvedSchema.type === 'number') {
            return 'number';
        }

        if (resolvedSchema.type === 'boolean') {
            return 'boolean';
        }

        // Objects in 'schema' (without content map) for headers are often simple mappings or explode=true...
        // but complex objects in headers are generally JSON strings if not exploded.
        if (resolvedSchema.type === 'object') {
            return 'json';
        }

        return 'string';
    }
}
