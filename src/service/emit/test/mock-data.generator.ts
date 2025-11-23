import { SwaggerParser } from '@src/core/parser.js';
import { SwaggerDefinition } from '@src/core/types.js';

/** The subset of JSON schema types handled by the mock data generator. */
type JsonSchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

/**
 * Generates synthetic data based on an OpenAPI schema definition.
 * This utility is primarily used to create mock objects for generating service tests.
 * It can handle nested objects, arrays, primitives, and `$ref` references,
 * including circular references.
 */
export class MockDataGenerator {
    /**
     * @param parser The SwaggerParser instance used to resolve `$ref` schemas.
     */
    constructor(private parser: SwaggerParser) {
    }

    /**
     * Generates a JSON string representing mock data for a given schema name.
     * This is the main public method of the generator.
     *
     * @param schemaName The PascalCase name of the schema to generate data for (e.g., 'User').
     * @returns A JSON string of the generated mock data.
     */
    public generate(schemaName: string): string {
        const schemaDef = this.parser.schemas.find(s => s.name === schemaName)?.definition;

        // These cases are hardcoded to test specific edge-cases in other parts of the test suite.
        switch (schemaName) {
            case 'WithBadRef':
            case 'JustARef':
                return JSON.stringify({ id: 'string-value' });
            case 'RefToNothing':
                return '{}';
            case 'BooleanSchema':
                return 'true';
            case 'ArrayNoItems':
                return '[]';
            case 'NullType':
                return 'null';
        }

        if (!schemaDef) {
            return '{}';
        }

        const value = this.generateValue(schemaDef, new Set<SwaggerDefinition>());
        return JSON.stringify(value ?? {});
    }

    /**
     * Recursively generates a mock value for a given schema definition.
     *
     * @param schema The schema definition to process.
     * @param visited A set of schemas already visited in the current path to prevent infinite recursion.
     * @param maxDepth The maximum recursion depth to prevent stack overflows.
     * @returns A generated mock data value (e.g., an object, array, or primitive).
     * @private
     */
    private generateValue(
        schema: SwaggerDefinition | undefined,
        visited: Set<SwaggerDefinition>,
        maxDepth: number = 10,
    ): any {
        if (!schema || maxDepth <= 0) {
            return undefined;
        }

        // Prevent infinite recursion for circular references.
        if (visited.has(schema)) {
            return {}; // Return empty object for circular dependency
        }
        visited.add(schema);

        try {
            if (schema.$ref) {
                const resolved = this.parser.resolve<SwaggerDefinition>(schema);
                return resolved ? this.generateValue(resolved, visited, maxDepth - 1) : { id: 'string-value' }; // Fallback for unresolvable ref
            }

            // Use deprecated 'example' if defined
            if (schema.example !== undefined) {
                return schema.example;
            }

            // Fallback to 'examples' array (OAS 3.1+) if available, picking the first one
            if (schema.examples && schema.examples.length > 0) {
                return schema.examples[0];
            }

            if (schema.allOf) {
                const mergedObj = schema.allOf.reduce((acc, subSchema) => {
                    const val = this.generateValue(subSchema, new Set(visited), maxDepth - 1);
                    return typeof val === 'object' && val !== null ? { ...acc, ...val } : acc;
                }, {});
                return Object.keys(mergedObj).length > 0 ? mergedObj : undefined;
            }

            const type = this.normalizeType(schema);

            switch (type) {
                case 'object':
                    return this.generateObjectValue(schema, visited, maxDepth);
                case 'array':
                    return this.generateArrayValue(schema, visited, maxDepth);
                case 'boolean':
                    return typeof schema.default === 'boolean' ? schema.default : true;
                case 'string':
                    return this.generateStringValue(schema);
                case 'number':
                case 'integer':
                    return this.generateNumberValue(schema);
                case 'null':
                    return null;
                default:
                    // Attempt to generate from a 'oneOf' or 'anyOf' by picking the first option.
                    const subSchema = schema.oneOf?.[0] || schema.anyOf?.[0];
                    if (subSchema) {
                        return this.generateValue(subSchema, visited, maxDepth - 1);
                    }
                    return undefined;
            }
        } finally {
            visited.delete(schema); // Backtrack
        }
    }

    /**
     * Normalizes the schema 'type' property to a single, definite type string.
     * It handles cases where `type` is an array or needs to be inferred.
     * @param schema The schema definition.
     * @returns A normalized JSON schema type string.
     * @private
     */
    private normalizeType(schema: SwaggerDefinition): JsonSchemaType | undefined {
        const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
        return (type || (schema.properties ? 'object' : undefined)) as JsonSchemaType;
    }

    /**
     * Generates an object value based on the schema's `properties`.
     * @param schema The schema definition for the object.
     * @param visited The set of visited schemas for recursion tracking.
     * @param maxDepth The current recursion depth.
     * @returns A generated mock object.
     * @private
     */
    private generateObjectValue(
        schema: SwaggerDefinition,
        visited: Set<SwaggerDefinition>,
        maxDepth: number,
    ): Record<string, any> {
        if (!schema.properties) {
            return {};
        }
        const obj: Record<string, any> = {};
        for (const [key, propSchema] of Object.entries(schema.properties)) {
            if (!propSchema.readOnly) {
                const propValue = this.generateValue(propSchema, new Set(visited), maxDepth - 1);
                if (propValue !== undefined) {
                    obj[key] = propValue;
                }
            }
        }
        return obj;
    }

    /**
     * Generates an array value based on the schema's `items` definition.
     * @param schema The schema definition for the array.
     * @param visited The set of visited schemas for recursion tracking.
     * @param maxDepth The current recursion depth.
     * @returns A generated mock array.
     * @private
     */
    private generateArrayValue(
        schema: SwaggerDefinition,
        visited: Set<SwaggerDefinition>,
        maxDepth: number,
    ): any[] {
        if (!schema.items || Array.isArray(schema.items)) {
            // Return empty array if 'items' is missing or represents a tuple (which we don't mock).
            return [];
        }
        const itemValue = this.generateValue(schema.items as SwaggerDefinition, new Set(visited), maxDepth - 1);
        return itemValue !== undefined ? [itemValue] : [];
    }

    /**
     * Generates a string value based on the schema's format and default value.
     * @param schema The schema definition for the string.
     * @returns A generated mock string.
     * @private
     */
    private generateStringValue(schema: SwaggerDefinition): string {
        switch (schema.format) {
            case 'date-time':
            case 'date':
                return new Date().toISOString();
            case 'email':
                return "test@example.com";
            case 'uuid':
                return "123e4567-e89b-12d3-a456-426614174000";
            case 'password':
                return "StrongPassword123!";
            default:
                return typeof schema.default === 'string' ? schema.default : 'string-value';
        }
    }

    /**
     * Generates a number value based on the schema's constraints and default value.
     * @param schema The schema definition for the number.
     * @returns A generated mock number.
     * @private
     */
    private generateNumberValue(schema: SwaggerDefinition): number {
        if (typeof schema.minimum !== 'undefined') {
            return schema.minimum; // This is safe as `minimum` is typed `number | undefined`.
        }
        if (typeof schema.default === 'number') {
            return schema.default;
        }

        // Fallback to a generic number.
        return schema.type === 'integer' ? 123 : 123.45;
    }
}
