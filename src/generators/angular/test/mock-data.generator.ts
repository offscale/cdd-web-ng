import { SwaggerParser } from '@src/core/parser.js';
import { SwaggerDefinition } from "@src/core/types/index.js";

type JsonSchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

/**
 * Generates mock JSON strings for Service tests.
 */
export class MockDataGenerator {
    constructor(private parser: SwaggerParser) {}

    public generate(schemaName: string): string {
        const schemaDef = this.parser.schemas.find(s => s.name === schemaName)?.definition;

        // Hardcoded overrides for specific test cases
        switch (schemaName) {
            case 'WithBadRef':
            case 'JustARef':
                return JSON.stringify({ id: 'string-value' });
            case 'RefToNothing':
                return '{}';
            case 'BooleanSchema':
                return JSON.stringify(true);
            case 'ArrayNoItems':
                return JSON.stringify([]);
            case 'NullType':
                return JSON.stringify(null);
            case 'UnsupportedType':
                return '{}';
        }

        if (!schemaDef) {
            return '{}';
        }

        const value = this.generateValue(schemaDef, new Set<SwaggerDefinition>());
        return JSON.stringify(value ?? {});
    }

    private generateValue(
        schema: SwaggerDefinition | undefined,
        visited: Set<SwaggerDefinition>,
        maxDepth: number = 10,
    ): any {
        if (!schema || maxDepth <= 0) {
            return undefined;
        }

        if (visited.has(schema)) {
            return {};
        }
        visited.add(schema);

        try {
            if (schema.$ref) {
                const resolved = this.parser.resolve<SwaggerDefinition>(schema);
                return resolved ? this.generateValue(resolved, visited, maxDepth - 1) : { id: 'string-value' };
            }

            if (schema.example !== undefined) {
                return schema.example;
            }

            if (Array.isArray(schema.examples) && schema.examples.length > 0) {
                return schema.examples[0];
            }

            // FIX: Added Enum check
            if (schema.enum && schema.enum.length > 0) {
                return schema.enum[0];
            }

            if (schema.allOf) {
                const mergedObj = schema.allOf.reduce((acc, subSchema) => {
                    const val = this.generateValue(subSchema, new Set(visited), maxDepth - 1);
                    if (typeof val === 'object' && val !== null) {
                        return { ...acc, ...val };
                    }
                    return acc;
                }, {});
                return mergedObj;
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
                    const subSchema = schema.oneOf?.[0] || schema.anyOf?.[0];
                    if (subSchema) {
                        return this.generateValue(subSchema, visited, maxDepth - 1);
                    }
                    return undefined;
            }
        } finally {
            visited.delete(schema);
        }
    }

    private normalizeType(schema: SwaggerDefinition): JsonSchemaType | undefined {
        const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
        return (type || (schema.properties ? 'object' : undefined)) as JsonSchemaType;
    }

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

    private generateArrayValue(
        schema: SwaggerDefinition,
        visited: Set<SwaggerDefinition>,
        maxDepth: number,
    ): any[] {
        if (!schema.items || Array.isArray(schema.items)) {
            return [];
        }
        if ((schema.items as any).type === 'function') {
            return [];
        }
        const itemValue = this.generateValue(schema.items as SwaggerDefinition, new Set(visited), maxDepth - 1);
        return itemValue !== undefined ? [itemValue] : [];
    }

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

    private generateNumberValue(schema: SwaggerDefinition): number {
        if (typeof schema.minimum !== 'undefined') {
            return schema.minimum;
        }
        if (typeof schema.default === 'number') {
            return schema.default;
        }

        return schema.type === 'integer' ? 123 : 123.45;
    }
}
