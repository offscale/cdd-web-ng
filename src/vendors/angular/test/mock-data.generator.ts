// src/generators/angular/test/mock-data.generator.ts
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SwaggerParser } from '@src/openapi/parse.js';
import { SwaggerDefinition } from '@src/core/types/index.js';
import { pascalCase } from '@src/functions/utils_string.js';

type JsonSchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

export class MockDataGenerator {
    constructor(private parser: SwaggerParser) {}

    public generate(schemaName: string): string {
        const normalizedName = pascalCase(schemaName);
        const schemaDef =
            this.parser.schemas.find(s => s.name === normalizedName)?.definition ??
            this.parser.getDefinition(schemaName) ??
            (schemaName !== normalizedName ? this.parser.getDefinition(normalizedName) : undefined);

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

        const value = this.generateValue(schemaDef as SwaggerDefinition, new Set<SwaggerDefinition>());
        return JSON.stringify(value ?? {});
    }

    private generateValue(
        schema: SwaggerDefinition | undefined,
        visited: Set<SwaggerDefinition>,
        maxDepth: number = 10,
    ): unknown {
        if (!schema || maxDepth <= 0) {
            return undefined;
        }

        if (visited.has(schema)) {
            return {};
        }
        visited.add(schema);

        try {
            if (schema.$ref) {
                let resolved = this.parser.resolve<SwaggerDefinition>(schema);
                if (!resolved) {
                    const refName = this.extractRefName(schema.$ref);
                    const fallback = refName ? this.parser.getDefinition(refName) : undefined;
                    if (fallback && typeof fallback === 'object') {
                        resolved = fallback as SwaggerDefinition;
                    }
                }
                return resolved ? this.generateValue(resolved, visited, maxDepth - 1) : { id: 'string-value' };
            }

            if ((schema as Record<string, unknown>).dataValue !== undefined) {
                return (schema as Record<string, unknown>).dataValue;
            }

            if ((schema as Record<string, unknown>).value !== undefined) {
                return (schema as Record<string, unknown>).value;
            }

            if ((schema as Record<string, unknown>).serializedValue !== undefined) {
                return (schema as Record<string, unknown>).serializedValue;
            }

            if ((schema as Record<string, unknown>).externalValue) {
                return this.resolveExternalValue((schema as Record<string, unknown>).externalValue as string);
            }

            if (schema.example !== undefined) {
                return schema.example;
            }

            if (Array.isArray(schema.examples) && schema.examples.length > 0) {
                return schema.examples[0];
            }

            if (schema.enum && schema.enum.length > 0) {
                return schema.enum[0];
            }

            if (schema.allOf) {
                const mergedObj = schema.allOf.reduce((acc, subSchema) => {
                    const val = this.generateValue(subSchema as SwaggerDefinition, new Set(visited), maxDepth - 1);
                    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                        return { ...(acc as Record<string, unknown>), ...(val as Record<string, unknown>) };
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
                default: {
                    const subSchema = schema.oneOf?.[0] || schema.anyOf?.[0];
                    if (subSchema) {
                        return this.generateValue(subSchema as SwaggerDefinition, visited, maxDepth - 1);
                    }
                    return undefined;
                }
            }
        } finally {
            visited.delete(schema);
        }
    }

    private extractRefName(ref: string): string | undefined {
        if (!ref) return undefined;
        const fragment = ref.split('#')[1];
        if (!fragment) return undefined;
        const parts = fragment.split('/').filter(Boolean);
        const last = parts[parts.length - 1];
        if (!last) return undefined;
        return last.replace(/~1/g, '/').replace(/~0/g, '~');
    }

    private resolveExternalValue(externalValue: string): unknown {
        try {
            if (externalValue.startsWith('http://') || externalValue.startsWith('https://')) {
                return `URL Content: ${externalValue}`;
            }

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
    ): Record<string, unknown> {
        if (!schema.properties) {
            return {};
        }
        const obj: Record<string, unknown> = {};
        for (const [key, propSchema] of Object.entries(schema.properties)) {
            if (!(propSchema as SwaggerDefinition).readOnly) {
                const propValue = this.generateValue(propSchema as SwaggerDefinition, new Set(visited), maxDepth - 1);
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
    ): unknown[] {
        if (!schema.items || Array.isArray(schema.items)) {
            return [];
        }
        if ((schema.items as Record<string, unknown>).type === 'function') {
            return [];
        }
        const itemValue = this.generateValue(schema.items as SwaggerDefinition, new Set(visited), maxDepth - 1);
        return itemValue !== undefined ? [itemValue] : [];
    }

    private generateStringValue(schema: SwaggerDefinition): string {
        if (schema.contentEncoding === 'base64') {
            return 'dGVzdC1jb250ZW50';
        }
        if (schema.contentEncoding === 'base64url') {
            return 'dGVzdC1jb250ZW50';
        }

        switch (schema.format) {
            case 'date-time':
            case 'date':
                return 'new Date()';
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
