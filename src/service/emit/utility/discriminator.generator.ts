import * as path from "node:path";
import { Project, VariableDeclarationKind } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "@src/core/constants.js";
import { SwaggerParser } from "@src/core/parser.js";

/**
 * Generates the `discriminators.ts` file.
 * This file acts as a runtime registry for handling polymorphism.
 * It maps parent model names to their discriminator property and, if available,
 * the mapping values to specific child model definitions.
 */
export class DiscriminatorGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project
    ) {
    }

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, "discriminators.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        // Structure: ParentModelName -> { propertyName: string, mapping: Record<string, string> }
        // The mapping values will be the cleaned Model Names (not raw refs).
        const registry: Record<string, { propertyName: string, mapping?: Record<string, string> }> = {};
        let count = 0;

        this.parser.schemas.forEach(entry => {
            const schema = entry.definition;
            const modelName = entry.name;

            // Handle both Swagger 2.0 (string) and OpenAPI 3.0+ (object) discriminator formats
            // Note: The TypeScript interface definitions might type this strictly, but parsed JSON might be a string.
            const rawDiscriminator = (schema as any).discriminator;

            if (!rawDiscriminator) {
                return;
            }

            let propertyName = "";
            let mapping: Record<string, string> | undefined = undefined;

            if (typeof rawDiscriminator === 'string') {
                propertyName = rawDiscriminator;
                // Swagger 2 doesn't have explicit mapping in the discriminator field itself.
                // Implicit mapping is implied by the model names matching the value.
            } else {
                // OpenAPI 3.0+ object
                propertyName = rawDiscriminator.propertyName;

                if (rawDiscriminator.mapping) {
                    mapping = {};
                    Object.entries(rawDiscriminator.mapping).forEach(([key, refValue]) => {
                        // Resolve Ref to Model Name
                        // e.g. "#/components/schemas/Cat" -> "Cat"
                        const childModelName = this.resolveModelNameFromRef(refValue as string);
                        if (childModelName) {
                            mapping![key] = childModelName;
                        }
                    });
                }
            }

            if (propertyName) {
                registry[modelName] = { propertyName };
                if (mapping && Object.keys(mapping).length > 0) {
                    registry[modelName].mapping = mapping;
                }
                count++;
            }
        });

        if (count > 0) {
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [{
                    name: "API_DISCRIMINATORS",
                    initializer: JSON.stringify(registry, null, 2)
                }],
                docs: [
                    "Registry of Polymorphic Discriminators.",
                    "Keys are parent model names. Values contain the property name to check and an optional mapping of values to child model names."
                ]
            });
        } else {
            sourceFile.addStatements("export {};");
        }

        sourceFile.formatText();
        // Prepend header
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }

    /**
     * Helper to extract the simple model name from a reference string.
     * Falls back to basic string manipulation if reference resolution is complex.
     */
    private resolveModelNameFromRef(ref: string): string {
        // 1. Try standard Ref resolution if the parser supports looking up names
        // (Often the parser resolves to the object, but we need the Name key)

        // 2. Heuristic extraction (standard OpenAPI paths)
        // #/components/schemas/Name
        // #/definitions/Name
        const parts = ref.split('/');
        const candidate = parts[parts.length - 1];

        return candidate; // Simple extraction is sufficient for 99% of gen cases where ref matches model name
    }
}
