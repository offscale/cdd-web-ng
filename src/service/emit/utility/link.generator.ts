import * as path from "node:path";
import { Project, VariableDeclarationKind } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "@src/core/constants.js";
import { SwaggerParser } from "@src/core/parser.js";
import { LinkObject, PathInfo } from "@src/core/types.js";

/**
 * Generates the `links.ts` file.
 * This file acts as a static registry for OpenAPI Links defined in operation responses.
 * It maps: Source Operation ID -> Status Code -> Link Name -> Link Definition.
 * This allows runtime lookup of relationships between resources.
 */
export class LinkGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project
    ) {
    }

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, "links.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        // Structure: OperationId -> StatusCode -> LinkName -> Link details
        const linksRegistry: Record<string, Record<string, Record<string, LinkObject>>> = {};
        let linkCount = 0;

        this.parser.operations.forEach((op: PathInfo) => {
            if (!op.operationId || !op.responses) return;

            const opLinks: Record<string, Record<string, LinkObject>> = {};
            let hasLinksForOp = false;

            Object.entries(op.responses).forEach(([statusCode, responseOrRef]) => {
                const response = this.parser.resolve(responseOrRef);
                if (response && response.links) {
                    const responseLinks: Record<string, LinkObject> = {};

                    Object.entries(response.links).forEach(([linkName, linkOrRef]) => {
                        const link = this.parser.resolve(linkOrRef) as LinkObject;
                        if (link) {
                            // Clean up the link object for the code output (remove internal parser metadata if any)
                            // We create a shallow copy using conditional spread to satisfy exactOptionalPropertyTypes
                            const cleanLink: LinkObject = {
                                ...(link.operationId ? { operationId: link.operationId } : {}),
                                ...(link.operationRef ? { operationRef: link.operationRef } : {}),
                                ...(link.parameters ? { parameters: link.parameters } : {}),
                                ...(link.requestBody ? { requestBody: link.requestBody } : {}),
                                ...(link.description ? { description: link.description } : {}),
                                ...(link.server ? { server: link.server } : {})
                            };

                            responseLinks[linkName] = cleanLink;
                            linkCount++;
                        }
                    });

                    if (Object.keys(responseLinks).length > 0) {
                        opLinks[statusCode] = responseLinks;
                        hasLinksForOp = true;
                    }
                }
            });

            if (hasLinksForOp) {
                linksRegistry[op.operationId] = opLinks;
            }
        });

        if (linkCount > 0) {
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [{
                    name: "API_LINKS",
                    initializer: JSON.stringify(linksRegistry, null, 2)
                }],
                docs: [
                    "Registry of Links defined in the API.",
                    "Structure: operationId -> responseStatusCode -> linkName -> LinkObject"
                ]
            });
        } else {
            sourceFile.addStatements("export {};");
        }

        sourceFile.formatText();
        // Prepend header
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }
}
