import {
    SwaggerDefinition,
    ExampleObject
} from '../../core/types/index.js';
import { SwaggerParser } from '../../core/parser.js';

/**
 * Generates mock data structures based on OpenAPI schemas.
 * Prioritizes explicit examples (including `externalValue`), then schema-level examples,
 * then generates structure based on types.
 */
export class MockDataGenerator {
    constructor(private parser: SwaggerParser) {}

    /**
     * Generates a mock value for the given schema.
     * @param schema The schema definition.
     * @param explicitExamples Optional map of Example Objects (e.g. from MediaType).
     * @param currentDocUri Optional context for resolving relative externalValues.
     */
    public generate(
        schema: SwaggerDefinition | null | undefined,
        explicitExamples?: Record<string, ExampleObject | { $ref: string }>,
        currentDocUri?: string
    ): any {
        if (!schema) return null;

        // 1. Check Explicit Examples (MediaType/Parameter level)
        if (explicitExamples) {
            const firstKey = Object.keys(explicitExamples)[0];
            if (firstKey) {
                const exObj = this.parser.resolve(explicitExamples[firstKey]);
                if (exObj) {
                    if (exObj.value !== undefined) return exObj.value;
                    if (exObj.externalValue) {
                        return this.resolveExternalValue(exObj.externalValue, currentDocUri);
                    }
                }
            }
        }

        // 2. Check Schema-level `example` (Deprecated but common)
        if (schema.example !== undefined) {
            return schema.example;
        }

        // 3. Check Schema-level `examples` (OAS 3.1)
        if (schema.examples && Array.isArray(schema.examples) && schema.examples.length > 0) {
            return schema.examples[0];
        }

        // 4. Check `default`
        if (schema.default !== undefined) {
            return schema.default;
        }

        // 5. Generate based on types
        return this.generateByType(schema, currentDocUri);
    }

    private resolveExternalValue(ref: string, currentDocUri?: string): any {
        // Attempt to resolve using the parser's cache.
        // If the file was pre-loaded (e.g. via $id or prior traversal), 'resolveReference' will find it.
        const resolved = this.parser.resolveReference(ref, currentDocUri);
        if (resolved !== undefined) {
            return resolved;
        }
        // Fallback: If we can't load it synchronously, meaningful placeholder is better than random noise.
        return `[Mock Data: External Value at ${ref}]`;
    }

    private generateByType(schema: SwaggerDefinition, currentDocUri?: string): any {
        // Resolve references
        if (schema.$ref) {
            const resolved = this.parser.resolveReference<SwaggerDefinition>(schema.$ref, currentDocUri);
            return resolved ? this.generate(resolved, undefined, currentDocUri) : {};
        }

        // Basic types
        if (schema.type === 'string') {
            if (schema.enum) return schema.enum[0];
            if (schema.format === 'date') return '2024-01-01';
            if (schema.format === 'date-time') return '2024-01-01T12:00:00Z';
            return 'string_value';
        }
        if (schema.type === 'number' || schema.type === 'integer') {
            if (schema.enum) return schema.enum[0];
            return 0;
        }
        if (schema.type === 'boolean') {
            return true;
        }
        if (schema.type === 'array') {
            const itemSchema = Array.isArray(schema.items) ? schema.items[0] : schema.items;
            // Generate 1 item
            return [this.generate(itemSchema as SwaggerDefinition, undefined, currentDocUri)];
        }
        if (schema.type === 'object' || schema.properties) {
            const result: Record<string, any> = {};
            if (schema.properties) {
                for (const [key, prop] of Object.entries(schema.properties)) {
                    result[key] = this.generate(prop, undefined, currentDocUri);
                }
            }
            return result;
        }

        return {};
    }
}