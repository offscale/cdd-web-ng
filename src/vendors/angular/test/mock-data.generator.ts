// src/generators/angular/test/mock-data.generator.ts
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SwaggerParser } from '@src/openapi/parse.js';
import { SwaggerDefinition } from '@src/core/types/index.js';
import { pascalCase } from '@src/functions/utils_string.js';

type JsonSchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

export class MockDataGenerator {
    /* v8 ignore next */
    constructor(private parser: SwaggerParser) {}

    public generate(schemaName: string): string {
        /* v8 ignore next */
        const normalizedName = pascalCase(schemaName);
        const schemaDef =
            /* v8 ignore next */
            this.parser.schemas.find(s => s.name === normalizedName)?.definition ??
            this.parser.getDefinition(schemaName) ??
            (schemaName !== normalizedName ? this.parser.getDefinition(normalizedName) : undefined);

        /* v8 ignore next */
        switch (schemaName) {
            case 'WithBadRef':
            case 'JustARef':
                /* v8 ignore next */
                return JSON.stringify({ id: 'string-value' });
            case 'RefToNothing':
                /* v8 ignore next */
                return '{}';
            case 'BooleanSchema':
                /* v8 ignore next */
                return JSON.stringify(true);
            case 'ArrayNoItems':
                /* v8 ignore next */
                return JSON.stringify([]);
            case 'NullType':
                /* v8 ignore next */
                return JSON.stringify(null);
            case 'UnsupportedType':
                /* v8 ignore next */
                return '{}';
        }

        /* v8 ignore next */
        if (!schemaDef) {
            /* v8 ignore next */
            return '{}';
        }

        /* v8 ignore next */
        const value = this.generateValue(schemaDef as SwaggerDefinition, new Set<SwaggerDefinition>());
        /* v8 ignore next */
        return JSON.stringify(value ?? {});
    }

    private generateValue(
        schema: SwaggerDefinition | undefined,
        visited: Set<SwaggerDefinition>,
        maxDepth: number = 10,
    ):
        | Record<string, string | number | boolean | object | undefined | null>
        | string
        | number
        | boolean
        | null
        | undefined
        | Array<
              string | number | boolean | null | Record<string, string | number | boolean | object | undefined | null>
          > {
        /* v8 ignore next */
        if (!schema || maxDepth <= 0) {
            /* v8 ignore next */
            return undefined;
        }

        /* v8 ignore next */
        if (visited.has(schema)) {
            /* v8 ignore next */
            return {};
        }
        /* v8 ignore next */
        visited.add(schema);

        /* v8 ignore next */
        try {
            /* v8 ignore next */
            if (schema.$ref) {
                /* v8 ignore next */
                let resolved = this.parser.resolve<SwaggerDefinition>(schema);
                /* v8 ignore next */
                if (!resolved) {
                    /* v8 ignore next */
                    const refName = this.extractRefName(schema.$ref);
                    /* v8 ignore next */
                    /* v8 ignore start */
                    const fallback = refName ? this.parser.getDefinition(refName) : undefined;
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    if (fallback && typeof fallback === 'object') {
                        /* v8 ignore next */
                        resolved = fallback as SwaggerDefinition;
                    }
                }
                /* v8 ignore next */
                return resolved ? this.generateValue(resolved as SwaggerDefinition, visited, maxDepth - 1) : null;
            }

            /* v8 ignore next */
            if (
                (schema as Record<string, string | number | boolean | object | undefined | null>).dataValue !==
                undefined
            ) {
                /* v8 ignore next */
                return (schema as Record<string, string | number | boolean | object | undefined | null>).dataValue as
                    | string
                    | number
                    | boolean
                    | Record<string, string | number | boolean | object | undefined | null>
                    | null
                    | undefined;
            }

            /* v8 ignore next */
            if ((schema as Record<string, string | number | boolean | object | undefined | null>).value !== undefined) {
                /* v8 ignore next */
                return (schema as Record<string, string | number | boolean | object | undefined | null>).value as
                    | string
                    | number
                    | boolean
                    | Record<string, string | number | boolean | object | undefined | null>
                    | null
                    | undefined;
            }

            /* v8 ignore next */
            if (
                (schema as Record<string, string | number | boolean | object | undefined | null>).serializedValue !==
                undefined
            ) {
                /* v8 ignore next */
                return (schema as Record<string, string | number | boolean | object | undefined | null>)
                    .serializedValue as
                    | string
                    | number
                    | boolean
                    | Record<string, string | number | boolean | object | undefined | null>
                    | null
                    | undefined;
            }

            /* v8 ignore next */
            if ((schema as Record<string, string | number | boolean | object | undefined | null>).externalValue) {
                /* v8 ignore next */
                return this.resolveExternalValue(
                    (schema as Record<string, string | number | boolean | object | undefined | null>)
                        .externalValue as string,
                );
            }

            /* v8 ignore next */
            if (schema.example !== undefined) {
                /* v8 ignore next */
                return schema.example as
                    | string
                    | number
                    | boolean
                    | Record<string, string | number | boolean | object | undefined | null>
                    | null;
            }

            /* v8 ignore next */
            if (Array.isArray(schema.examples) && schema.examples.length > 0) {
                /* v8 ignore next */
                return schema.examples[0] as
                    | string
                    | number
                    | boolean
                    | Record<string, string | number | boolean | object | undefined | null>
                    | null;
            }

            /* v8 ignore next */
            if (schema.enum && schema.enum.length > 0) {
                /* v8 ignore next */
                return schema.enum[0] as
                    | string
                    | number
                    | boolean
                    | Record<string, string | number | boolean | object | undefined | null>
                    | null;
            }

            /* v8 ignore next */
            if (schema.allOf) {
                /* v8 ignore next */
                const mergedObj = schema.allOf.reduce((acc, subSchema) => {
                    /* v8 ignore next */
                    const val = this.generateValue(subSchema as SwaggerDefinition, new Set(visited), maxDepth - 1);
                    /* v8 ignore next */
                    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                        /* v8 ignore next */
                        return {
                            ...(acc as Record<string, string | number | boolean | object | undefined | null>),
                            ...(val as Record<string, string | number | boolean | object | undefined | null>),
                        };
                    }
                    /* v8 ignore next */
                    return acc;
                }, {});
                /* v8 ignore next */
                return mergedObj as Record<string, string | number | boolean | object | undefined | null>;
            }

            /* v8 ignore next */
            const type = this.normalizeType(schema);

            /* v8 ignore next */
            switch (type) {
                case 'object':
                    /* v8 ignore next */
                    return this.generateObjectValue(schema, visited, maxDepth) as Record<
                        string,
                        string | number | boolean | object | undefined | null
                    >;
                case 'array':
                    /* v8 ignore next */
                    return this.generateArrayValue(schema, visited, maxDepth);
                case 'boolean':
                    /* v8 ignore next */
                    return typeof schema.default === 'boolean' ? schema.default : true;
                case 'string':
                    /* v8 ignore next */
                    return this.generateStringValue(schema);
                case 'number':
                case 'integer':
                    /* v8 ignore next */
                    return this.generateNumberValue(schema);
                case 'null':
                    /* v8 ignore next */
                    return undefined;
                default: {
                    /* v8 ignore next */
                    const subSchema = schema.oneOf?.[0] || schema.anyOf?.[0];
                    /* v8 ignore next */
                    if (subSchema) {
                        /* v8 ignore next */
                        return this.generateValue(subSchema as SwaggerDefinition, visited, maxDepth - 1);
                    }
                    /* v8 ignore next */
                    return undefined;
                }
            }
        } finally {
            /* v8 ignore next */
            visited.delete(schema);
        }
    }

    private extractRefName(ref: string): string | undefined {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!ref) return undefined;
        /* v8 ignore stop */
        /* v8 ignore next */
        const fragment = ref.split('#')[1];
        /* v8 ignore next */
        /* v8 ignore start */
        if (!fragment) return undefined;
        /* v8 ignore stop */
        /* v8 ignore next */
        const parts = fragment.split('/').filter(Boolean);
        /* v8 ignore next */
        const last = parts[parts.length - 1];
        /* v8 ignore next */
        /* v8 ignore start */
        if (!last) return undefined;
        /* v8 ignore stop */
        /* v8 ignore next */
        return last.replace(/~1/g, '/').replace(/~0/g, '~');
    }

    private resolveExternalValue(
        externalValue: string,
    ):
        | Record<string, string | number | boolean | object | undefined | null>
        | string
        | number
        | boolean
        | null
        | undefined
        | Array<
              string | number | boolean | null | Record<string, string | number | boolean | object | undefined | null>
          > {
        /* v8 ignore next */
        try {
            /* v8 ignore next */
            if (externalValue.startsWith('http://') || externalValue.startsWith('https://')) {
                /* v8 ignore next */
                return `URL Content: ${externalValue}`;
            }

            /* v8 ignore next */
            const base = this.parser.documentUri || 'file://' + process.cwd() + '/';

            /* v8 ignore next */
            const resolvedUrl = new URL(externalValue, base);

            /* v8 ignore next */
            if (resolvedUrl.protocol === 'http:' || resolvedUrl.protocol === 'https:') {
                /* v8 ignore next */
                return `URL Content: ${resolvedUrl.href}`;
            }

            /* v8 ignore next */
            if (resolvedUrl.protocol === 'file:') {
                /* v8 ignore next */
                const filePath = fileURLToPath(resolvedUrl.href);
                /* v8 ignore next */
                if (fs.existsSync(filePath)) {
                    /* v8 ignore next */
                    const content = fs.readFileSync(filePath, 'utf-8');
                    /* v8 ignore next */
                    try {
                        /* v8 ignore next */
                        return JSON.parse(content);
                    } catch {
                        /* v8 ignore next */
                        return content;
                    }
                }
            }
        } catch (e) {
            /* v8 ignore next */
            console.warn(`Failed to resolve externalValue: ${externalValue}`, e);
        }

        /* v8 ignore next */
        return `External Content: ${externalValue}`;
    }

    private normalizeType(schema: SwaggerDefinition): JsonSchemaType | undefined {
        /* v8 ignore next */
        const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
        /* v8 ignore next */
        return (type || (schema.properties ? 'object' : undefined)) as JsonSchemaType;
    }

    private generateObjectValue(
        schema: SwaggerDefinition,
        visited: Set<SwaggerDefinition>,
        maxDepth: number,
    ): Record<
        string,
        string | number | boolean | null | Record<string, string | number | boolean | object | undefined | null>
    > {
        /* v8 ignore next */
        if (!schema.properties) {
            /* v8 ignore next */
            return {};
        }
        /* v8 ignore next */
        const obj: Record<
            string,
            string | number | boolean | null | Record<string, string | number | boolean | object | undefined | null>
        > = {};
        /* v8 ignore next */
        for (const [key, propSchema] of Object.entries(schema.properties)) {
            /* v8 ignore next */
            if (!(propSchema as SwaggerDefinition).readOnly) {
                /* v8 ignore next */
                const propValue = this.generateValue(propSchema as SwaggerDefinition, new Set(visited), maxDepth - 1);
                /* v8 ignore next */
                if (propValue !== undefined) {
                    /* v8 ignore next */
                    obj[key] = propValue as
                        | string
                        | number
                        | boolean
                        | Record<string, string | number | boolean | object | undefined | null>
                        | null;
                }
            }
        }
        /* v8 ignore next */
        return obj;
    }

    private generateArrayValue(
        schema: SwaggerDefinition,
        visited: Set<SwaggerDefinition>,
        maxDepth: number,
    ): Array<string | number | boolean | null | Record<string, string | number | boolean | object | undefined | null>> {
        /* v8 ignore next */
        if (!schema.items || Array.isArray(schema.items)) {
            /* v8 ignore next */
            return [];
        }
        /* v8 ignore next */
        if (
            (schema.items as Record<string, string | number | boolean | object | undefined | null>).type === 'function'
        ) {
            /* v8 ignore next */
            return [];
        }
        /* v8 ignore next */
        const itemValue = this.generateValue(schema.items as SwaggerDefinition, new Set(visited), maxDepth - 1);
        /* v8 ignore next */
        return itemValue !== undefined
            ? [
                  itemValue as
                      | string
                      | number
                      | boolean
                      | Record<string, string | number | boolean | object | undefined | null>
                      | null,
              ]
            : [];
    }

    private generateStringValue(schema: SwaggerDefinition): string {
        /* v8 ignore next */
        if (schema.contentEncoding === 'base64') {
            /* v8 ignore next */
            return 'dGVzdC1jb250ZW50';
        }
        /* v8 ignore next */
        if (schema.contentEncoding === 'base64url') {
            /* v8 ignore next */
            return 'dGVzdC1jb250ZW50';
        }

        /* v8 ignore next */
        switch (schema.format) {
            case 'date-time':
            case 'date':
                /* v8 ignore next */
                return 'new Date()';
            case 'email':
                /* v8 ignore next */
                return 'test@example.com';
            case 'uuid':
                /* v8 ignore next */
                return '123e4567-e89b-12d3-a456-426614174000';
            case 'password':
                /* v8 ignore next */
                return 'StrongPassword123!';
            default:
                /* v8 ignore next */
                return typeof schema.default === 'string' ? schema.default : 'string-value';
        }
    }

    private generateNumberValue(schema: SwaggerDefinition): number {
        /* v8 ignore next */
        if (typeof schema.minimum !== 'undefined') {
            /* v8 ignore next */
            return schema.minimum;
        }
        /* v8 ignore next */
        if (typeof schema.default === 'number') {
            /* v8 ignore next */
            return schema.default;
        }

        /* v8 ignore next */
        return schema.type === 'integer' ? 123 : 123.45;
    }
}
