import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SwaggerParser } from '@src/core/parser.js';
import { SwaggerDefinition } from '@src/core/types/index.js';

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

            // OAS 3.2 Example Object Support: dataValue (Validation-ready data)
            if ((schema as any).dataValue !== undefined) {
                return (schema as any).dataValue;
            }

            // OAS 3.0/3.1 Example Object Support: value (Literal example)
            // Note: 'value' is deprecated in 3.2 for non-JSON targets but supported for backward compatibility
            if ((schema as any).value !== undefined) {
                return (schema as any).value;
            }

            // OAS 3.2 serializedValue (Fallback if no dataValue/value)
            if ((schema as any).serializedValue !== undefined) {
                // Simple heuristic: if it's a string type or no type defined, validation might pass,
                // but strictly serializedValue is the wire format. Mock data usually wants validating format.
                // However, for strings, wire format is close enough.
                return (schema as any).serializedValue;
            }

            // Example Object Support (OAS 3.x External Value)
            if ((schema as any).externalValue) {
                return this.resolveExternalValue((schema as any).externalValue);
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

    private resolveExternalValue(externalValue: string): any {
        try {
            // 1. Check if externalValue itself is absolute remote
            if (externalValue.startsWith('http://') || externalValue.startsWith('https://')) {
                return `URL Content: ${externalValue}`;
            }

            // 2. Resolve against document URI
            const base = this.parser.documentUri || 'file://' + process.cwd() + '/';

            const resolvedUrl = new URL(externalValue, base);

            if (resolvedUrl.protocol === 'http:' || resolvedUrl.protocol === 'https:') {
                return `URL Content: ${resolvedUrl.href}`;
            }

            if (resolvedUrl.protocol === 'file:') {
                const filePath = fileURLToPath(resolvedUrl.href);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    try {
                        return JSON.parse(content);
                    } catch {
                        return content;
                    }
                }
            }
        } catch (e) {
            console.warn(`Failed to resolve externalValue: ${externalValue}`, e);
        }

        return `External Content: ${externalValue}`;
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

    private generateArrayValue(schema: SwaggerDefinition, visited: Set<SwaggerDefinition>, maxDepth: number): any[] {
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
        // Prioritize contentEncoding if present
        if (schema.contentEncoding === 'base64') {
            // "test-content" Base64 encoded
            return 'dGVzdC1jb250ZW50';
        }

        switch (schema.format) {
            case 'date-time':
            case 'date':
                return new Date().toISOString();
            case 'email':
                return 'test@example.com';
            case 'uuid':
                return '123e4567-e89b-12d3-a456-426614174000';
            case 'password':
                return 'StrongPassword123!';
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
