import * as path from "node:path";
import { Project, VariableDeclarationKind } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "@src/core/constants.js";
import { SwaggerParser } from "@src/core/parser.js";
import { pascalCase } from "@src/core/utils.js";

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
                        // Resolve Ref/URI to Model Name
                        // e.g. "#/components/schemas/Cat" -> "Cat"
                        // e.g. "https://example.com/schemas/cat.json" -> "Cat"
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
     * Helper to extract the generator's Model Name from a reference string.
     * It attempts to resolve the reference to an actual schema definition object
     * managed by the parser, and then finds the name assigned to that definition.
     *
     * This supports:
     * 1. Local References (e.g. #/components/schemas/Pet)
     * 2. External URIs (e.g. https://api.com/models/Pet)
     * 3. Fallbacks for unresolvable types.
     */
    private resolveModelNameFromRef(ref: string): string {
        // 1. Try to resolve the reference to the actual schema object in memory
        const resolvedSchema = this.parser.resolveReference(ref);

        if (resolvedSchema) {
            // 2. Look up this definition object in the parser's normalized schemas list
            // to find the friendly Model Name (e.g. "Cat").
            // The parser schemas array maps names to the actual definition objects.
            const found = this.parser.schemas.find(entry => entry.definition === resolvedSchema);
            if (found) {
                return found.name;
            }
        }

        // 3. Fallback: Heuristic extraction if resolution fails or reference is not a registered model
        // (standard OpenAPI paths or file names)
        const parts = ref.split('/');
        let candidate = parts[parts.length - 1];

        // Remove query params or fragments if something went wrong with splitting
        candidate = candidate.split('?')[0].split('#')[0];

        // Remove file extension if present (e.g. user.json -> user)
        candidate = candidate.replace(/\.[^/.]+$/, "");

        return pascalCase(candidate);
    }
}
