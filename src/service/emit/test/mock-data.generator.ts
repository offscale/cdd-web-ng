import { SwaggerParser } from '../../../core/parser.js';
import { SwaggerDefinition } from '../../../core/types.js';

/**
 * Generates mock data objects from OpenAPI schemas for use in tests.
 * It recursively traverses schema definitions to produce a representative
 * object with placeholder values, respecting formats and compositions (`allOf`).
 */
export class MockDataGenerator {
    constructor(private parser: SwaggerParser) {}

    public generate(schemaName: string): string {
        const schema = this.parser.schemas.find(s => s.name === schemaName)?.definition;
        if (!schema) {
            return '{}';
        }
        const mockObject = this.generateValue(schema, new Set());
        return JSON.stringify(mockObject, null, 2);
    }

    /**
     * The core recursive value generation logic.
     * @param schema The schema definition to generate a value for.
     * @param visited A set to track visited schemas and prevent infinite recursion in cyclic definitions.
     * @returns A mock value (e.g., object, string, number) corresponding to the schema.
     * @private
     */
    private generateValue(schema: SwaggerDefinition, visited: Set<SwaggerDefinition>): any {
        if (schema.example) {
            return schema.example;
        }

        if (visited.has(schema)) {
            return {};
        }
        visited.add(schema);

        if (schema.allOf) {
            const combined = schema.allOf.reduce((acc, subSchemaRef) => {
                const subSchema = this.parser.resolve(subSchemaRef);
                if (!subSchema) return acc;
                return { ...acc, ...this.generateValue(subSchema, visited) };
            }, {});
            visited.delete(schema);
            return combined;
        }

        if (schema.$ref) {
            const resolved = this.parser.resolve(schema);
            const result = resolved ? this.generateValue(resolved, visited) : {};
            visited.delete(schema);
            return result;
        }

        switch (schema.type) {
            case 'string':
                if (schema.format === 'date-time' || schema.format === 'date') return new Date().toISOString();
                if (schema.format === 'email') return 'test@example.com';
                if (schema.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000';
                return 'string-value';
            case 'number':
            case 'integer':
                return schema.minimum ?? (schema.default ?? 123);
            case 'boolean':
                return schema.default ?? true;
            case 'array':
                if (schema.items && !Array.isArray(schema.items)) {
                    return [this.generateValue(schema.items as SwaggerDefinition, visited)];
                }
                return [];
            case 'object':
                const obj: Record<string, any> = {};
                if (schema.properties) {
                    for (const [propName, propSchema] of Object.entries(schema.properties)) {
                        // Per OpenAPI spec, readOnly properties should not be sent in request bodies.
                        if (!propSchema.readOnly) {
                            obj[propName] = this.generateValue(propSchema, visited);
                        }
                    }
                }
                visited.delete(schema);
                return obj;
            default:
                visited.delete(schema);
                return null;
        }
    }
}
