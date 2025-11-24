import * as path from "node:path";
import { Project, VariableDeclarationKind } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../core/constants.js";
import { SwaggerParser } from '@src/core/parser.js';
import { HeaderObject, PathInfo, SwaggerDefinition } from "@src/core/types/index.js";

export class ResponseHeaderRegistryGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project
    ) {
    }

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, "response-headers.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        const registry: Record<string, Record<string, Record<string, string>>> = {};
        let headerCount = 0;

        this.parser.operations.forEach((op: PathInfo) => {
            if (!op.operationId || !op.responses) return;

            const opHeaders: Record<string, Record<string, string>> = {};
            let hasHeadersForOp = false;

            Object.entries(op.responses).forEach(([statusCode, response]) => {
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
                docs: ["Registry of Response Headers defined in the API."]
            });
        } else {
            sourceFile.addStatements("export {};");
        }

        sourceFile.formatText();
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }

    private getHeaderTypeHint(header: HeaderObject): string {
        if (header.content) {
            const contentType = Object.keys(header.content)[0];
            if (contentType && contentType.includes('json')) {
                return 'json';
            }
            return 'string';
        }

        const schema = header.schema || header;
        const resolvedSchema = this.parser.resolve(schema) as SwaggerDefinition;

        if (!resolvedSchema) return 'string';

        if (resolvedSchema.type === 'array') return 'array';
        if (resolvedSchema.type === 'integer' || resolvedSchema.type === 'number') return 'number';
        if (resolvedSchema.type === 'boolean') return 'boolean';
        if (resolvedSchema.type === 'object') return 'json';

        return 'string';
    }
}
