import * as path from "node:path";
import { Project, VariableDeclarationKind } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "@src/core/constants.js";
import { SwaggerParser } from "@src/core/parser.js";
import { TagObject } from "@src/core/types.js";

/**
 * Generates the `tags.ts` file.
 * This file exports a registry of Tag Definitions found in the OpenAPI spec.
 * Tags are used to group operations logically. This registry allows the client
 * to access metadata like summaries, descriptions and external docs for those groups.
 */
export class TagGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project
    ) {
    }

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, "tags.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        // OpenAPI spec has tags at the root level
        const tagsFound = this.parser.spec.tags || [];

        // Transform to a normalized structure matching our TagObject interface
        // We map explicitly to avoid leaking internal parser properties if any
        const registry: TagObject[] = tagsFound.map((t: any) => ({
            name: t.name,
            ...(t.summary ? { summary: t.summary } : {}),
            ...(t.description ? { description: t.description } : {}),
            ...(t.externalDocs ? { externalDocs: t.externalDocs } : {}),
            ...(t.parent ? { parent: t.parent } : {}), // OAS 3.2
            ...(t.kind ? { kind: t.kind } : {}) // OAS 3.2
        }));

        // Create a lookup map for O(1) access by tag name
        const mapRegistry: Record<string, TagObject> = {};
        registry.forEach(t => {
            mapRegistry[t.name] = t;
        });

        if (registry.length > 0) {
            // Export List (Order preserved as per spec)
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [{
                    name: "API_TAGS",
                    initializer: JSON.stringify(registry, null, 2)
                }],
                docs: ["List of API Tags with metadata. Order is preserved from the spec."]
            });

            // Export Map
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [{
                    name: "API_TAGS_MAP",
                    initializer: JSON.stringify(mapRegistry, null, 2)
                }],
                docs: ["Lookup map for API Tags by name."]
            });
        } else {
            sourceFile.addStatements("export {};");
        }

        sourceFile.formatText();
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }
}
