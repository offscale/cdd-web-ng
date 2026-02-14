import { describe, expect, it } from 'vitest';

import * as utils from '@src/core/utils/type-converter.js';
import { GeneratorConfig, SwaggerDefinition } from '@src/core/types/index.js';

describe('Core Utils: Type Converter', () => {
    const config: GeneratorConfig = {
        input: 'spec.json',
        output: './out',
        options: { dateType: 'string', enumStyle: 'enum', int64Type: 'number' },
    };
    const configWithDate: GeneratorConfig = { ...config, options: { ...config.options, dateType: 'Date' } };

    describe('getTypeScriptType', () => {
        it('should treat boolean schema "true" as any', () => {
            expect(utils.getTypeScriptType(true, config, [])).toBe('any');
        });

        it('should treat boolean schema "false" as never', () => {
            expect(utils.getTypeScriptType(false, config, [])).toBe('never');
        });

        describe('Literal Types based on `const` (OAS 3.1)', () => {
            it('should generate a string literal type', () => {
                const schema: SwaggerDefinition = { type: 'string', const: 'active' };
                expect(utils.getTypeScriptType(schema, config, [])).toBe("'active'");
            });

            it('should generate a number literal type', () => {
                const schema: SwaggerDefinition = { type: 'integer', const: 12345 };
                expect(utils.getTypeScriptType(schema, config, [])).toBe('12345');
            });

            it('should generate a boolean literal type', () => {
                const schema: SwaggerDefinition = { type: 'boolean', const: false };
                expect(utils.getTypeScriptType(schema, config, [])).toBe('false');
            });

            it('should generate a null literal type via const', () => {
                const schema: SwaggerDefinition = { type: 'null', const: null };
                expect(utils.getTypeScriptType(schema, config, [])).toBe('null');
            });

            it('should fallback to any for non-primitive const values', () => {
                const schema: SwaggerDefinition = { const: { nested: true } };
                expect(utils.getTypeScriptType(schema, config, [])).toBe('any');
            });

            it('should prefer const over type/enum if present', () => {
                const schema: SwaggerDefinition = {
                    type: 'string',
                    enum: ['A', 'B'],
                    const: 'C', // Edge case where const contradicts enum (technically invalid spec, but const is strict validation)
                };
                expect(utils.getTypeScriptType(schema, config, [])).toBe("'C'");
            });

            it('should escape single quotes in string const', () => {
                const schema: SwaggerDefinition = { type: 'string', const: "User's Name" };
                expect(utils.getTypeScriptType(schema, config, [])).toBe("'User\\'s Name'");
            });
        });

        it('should return "string" for simple string schema', () => {
            const schema: SwaggerDefinition = { type: 'string' };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('string');
        });

        it('should handle Ref types found in knownTypes', () => {
            const schema: SwaggerDefinition = { $ref: '#/components/schemas/User' };
            const knownTypes = ['User'];
            expect(utils.getTypeScriptType(schema, config, knownTypes)).toBe('User');
        });

        it('should return "any" for Ref types NOT found in knownTypes', () => {
            const schema: SwaggerDefinition = { $ref: '#/components/schemas/UnknownUser' };
            expect(utils.getTypeScriptType(schema, config, ['User'])).toBe('any');
        });

        it('should resolve $dynamicRef to a known type', () => {
            const schema: SwaggerDefinition = { $dynamicRef: '#/components/schemas/DynamicUser' };
            const knownTypes = ['DynamicUser'];
            expect(utils.getTypeScriptType(schema, config, knownTypes)).toBe('DynamicUser');
        });

        it('should return "any" for unresolvable $dynamicRef', () => {
            const schema = { $dynamicRef: '#/components/schemas/HiddenDynamic' };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('any');
        });

        it('should fall back to any when $ref has an empty segment', () => {
            const schema: SwaggerDefinition = { $ref: '#/components/schemas/' };
            expect(utils.getTypeScriptType(schema, config, ['User'])).toBe('any');
        });

        it('should fall back to any when $dynamicRef has an empty segment', () => {
            const schema: SwaggerDefinition = { $dynamicRef: '#/components/schemas/' };
            expect(utils.getTypeScriptType(schema, config, ['DynamicUser'])).toBe('any');
        });

        it('should handle array of types (nullable)', () => {
            const schema: SwaggerDefinition = { type: ['string', 'null'] as any };
            expect(utils.getTypeScriptType(schema, config)).toBe('string | null');
        });

        it('should honor nullable flag for OAS 3.0 schemas', () => {
            const schema: SwaggerDefinition = { type: 'string', nullable: true };
            expect(utils.getTypeScriptType(schema, config)).toBe('string | null');
        });

        it('should handle oneOf compositions', () => {
            const schema: SwaggerDefinition = { oneOf: [{ type: 'string' }, { type: 'number' }] };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('string | number');
        });

        it('should handle anyOf compositions', () => {
            const schema: SwaggerDefinition = { anyOf: [{ type: 'boolean' }, { $ref: '#/components/schemas/User' }] };
            expect(utils.getTypeScriptType(schema, config, ['User'])).toBe('boolean | User');
        });

        it('should handle allOf compositions (intersection)', () => {
            const schema: SwaggerDefinition = {
                allOf: [{ $ref: '#/components/schemas/A' }, { $ref: '#/components/schemas/B' }],
            };
            expect(utils.getTypeScriptType(schema, config, ['A', 'B'])).toBe('A & B');
        });

        // ENUMS
        it('should use named enum title if present in knownTypes', () => {
            const schema: SwaggerDefinition = { type: 'string', enum: ['A', 'B'], title: 'MyEnum' };
            expect(utils.getTypeScriptType(schema, config, ['MyEnum'])).toBe('MyEnum');
        });

        it('should generate a union type for enum if style is "union"', () => {
            const conf = { ...config, options: { ...config.options, enumStyle: 'union' as const } };
            const schema: SwaggerDefinition = { type: 'string', enum: ['A', 'B'] };
            expect(utils.getTypeScriptType(schema, conf, [])).toBe("'A' | 'B'");
        });

        it('should generate a union type if enumStyle="enum" invalid/missing title and fallen through to type check', () => {
            // Case where enum logic in getTypeScriptType falls through because title is missing/unknown
            // and type is string -> calling getStringType which handles enum explicitly.
            const schema: SwaggerDefinition = { type: 'string', enum: ['X', 'Y'], title: 'UnknownEnum' };
            // UnknownEnum is NOT in knownTypes, so it falls through.
            expect(utils.getTypeScriptType(schema, config, [])).toBe("'X' | 'Y'");
        });

        it('should handle null values in enums', () => {
            const schema: SwaggerDefinition = { type: 'string', enum: ['A', null as any] };
            expect(
                utils.getTypeScriptType(
                    schema,
                    {
                        ...config,
                        options: { enumStyle: 'union' } as any,
                    },
                    [],
                ),
            ).toBe("'A' | null");
        });

        // STRING Variants
        it('should resolve contentSchema inner type for string encoded JSON', () => {
            const schema: SwaggerDefinition = {
                type: 'string',
                contentMediaType: 'application/json',
                contentSchema: { type: 'number' },
            };
            const result = utils.getTypeScriptType(schema, config, []);
            // Expect the inner type 'number' directly now that we auto-decode
            expect(result).toBe('number');
        });

        it('should return Blob for known binary contentMediaType when unencoded', () => {
            const schema: SwaggerDefinition = { type: 'string', contentMediaType: 'image/png' };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('Blob');
        });

        it('should return string for text contentMediaType', () => {
            const schema: SwaggerDefinition = { type: 'string', contentMediaType: 'text/plain' };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('string');
        });

        it('should return string for xml contentMediaType', () => {
            const schema: SwaggerDefinition = { type: 'string', contentMediaType: 'application/xml' };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('string');
        });

        it('should return string when contentEncoding is set for binary media types', () => {
            const schema: SwaggerDefinition = {
                type: 'string',
                contentMediaType: 'image/png',
                contentEncoding: 'base64',
            };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('string');
        });

        it('should return Blob for raw binary schemas with only contentMediaType', () => {
            const schema: SwaggerDefinition = { contentMediaType: 'image/png' };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('Blob');
        });

        it('should default to string if contentMediaType is json but no contentSchema is present', () => {
            const schema: SwaggerDefinition = { type: 'string', contentMediaType: 'application/json' };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('string');
        });

        it('should return Date if format is date/date-time and config is Date', () => {
            expect(utils.getTypeScriptType({ type: 'string', format: 'date' }, configWithDate)).toBe('Date');
            expect(utils.getTypeScriptType({ type: 'string', format: 'date-time' }, configWithDate)).toBe('Date');
        });

        it('should return string if format is date/date-time and config is string', () => {
            expect(utils.getTypeScriptType({ type: 'string', format: 'date' }, config)).toBe('string');
        });

        it('should return Blob for binary string format', () => {
            expect(utils.getTypeScriptType({ type: 'string', format: 'binary' }, config)).toBe('Blob');
        });

        // NUMBERS
        it('should generate a union type for numeric enums', () => {
            const schema: SwaggerDefinition = { type: 'number', enum: [10, 20.5, 30] };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('10 | 20.5 | 30');
        });

        it('should fall back to number enum handling when title is unknown', () => {
            const schema: SwaggerDefinition = { type: 'number', enum: [1, 2], title: 'UnknownEnum' };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('1 | 2');
        });

        it('should use configured int64Type', () => {
            const conf = { ...config, options: { ...config.options, int64Type: 'string' as const } };
            const schema: SwaggerDefinition = { type: 'integer', format: 'int64' };
            expect(utils.getTypeScriptType(schema, conf, [])).toBe('string');
        });

        it('should default to number for standard integer', () => {
            const schema: SwaggerDefinition = { type: 'integer' };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('number');
        });

        // ARRAYS
        it('should handle tuple types (items as array)', () => {
            const schema: SwaggerDefinition = {
                type: 'array',
                items: [{ type: 'string' }, { type: 'number' }],
            };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('[string, number]');
        });

        it('should handle prefixItems without explicit type', () => {
            const schema: SwaggerDefinition = {
                prefixItems: [{ type: 'string' }, { type: 'number' }],
            };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('[string, number]');
        });

        it('should handle prefixItems with rest items', () => {
            const schema: SwaggerDefinition = {
                prefixItems: [{ type: 'string' }, { type: 'number' }],
                items: { oneOf: [{ type: 'string' }, { type: 'number' }] },
            };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('[string, number, ...(string | number)[]]');
        });

        it('should use unevaluatedItems as rest type for prefixItems tuples', () => {
            const schema: SwaggerDefinition = {
                prefixItems: [{ type: 'string' }, { type: 'number' }],
                unevaluatedItems: { type: 'boolean' },
            };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('[string, number, ...boolean[]]');
        });

        it('should use unevaluatedItems when items are absent', () => {
            const schema: SwaggerDefinition = {
                type: 'array',
                unevaluatedItems: { type: 'string' },
            };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('string[]');
        });

        it('should translate unevaluatedItems=false into never[]', () => {
            const schema: SwaggerDefinition = {
                type: 'array',
                unevaluatedItems: false,
            };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('never[]');
        });

        it('should correctly wrap union types in arrays with parentheses', () => {
            const schema: SwaggerDefinition = {
                type: 'array',
                items: { oneOf: [{ type: 'string' }, { type: 'number' }] },
            };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('(string | number)[]');
        });

        it('should handle simple array types', () => {
            const schema: SwaggerDefinition = { type: 'array', items: { type: 'string' } };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('string[]');
        });

        it('should default array items to any when items is missing', () => {
            const schema: SwaggerDefinition = { type: 'array' };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('any[]');
        });

        // OBJECTS
        it('should return `{ [key: string]: any }` for object schema with no properties', () => {
            const schema: SwaggerDefinition = { type: 'object' };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('{ [key: string]: any }');
        });

        it('should handle `additionalProperties: true`', () => {
            const schema: SwaggerDefinition = { type: 'object', additionalProperties: true };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('{ [key: string]: any }');
        });

        it('should handle `additionalProperties` schema', () => {
            const schema: SwaggerDefinition = { type: 'object', additionalProperties: { type: 'number' } };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('{ [key: string]: number }');
        });

        it('should handle `unevaluatedProperties` schema', () => {
            const schema: SwaggerDefinition = { type: 'object', unevaluatedProperties: { type: 'string' } };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('{ [key: string]: string }');
        });

        it('should handle `unevaluatedProperties: true`', () => {
            const schema: SwaggerDefinition = { type: 'object', unevaluatedProperties: true };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('{ [key: string]: any }');
        });

        it('should include patternProperties in index signature', () => {
            const schema: SwaggerDefinition = {
                type: 'object',
                patternProperties: {
                    '^S_': { type: 'string' },
                    '^I_': { type: 'integer' },
                },
            };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('{ [key: string]: string | number }');
        });

        it('should merge patternProperties with explicit properties', () => {
            const schema: SwaggerDefinition = {
                type: 'object',
                properties: {
                    fixed: { type: 'string' },
                },
                patternProperties: {
                    '^x-': { type: 'number' },
                },
            };
            const res = utils.getTypeScriptType(schema, config, []);
            expect(res).toContain('fixed?: string');
            expect(res).toContain('[key: string]: number | any');
        });

        it('should return closed object when additionalProperties and unevaluatedProperties are false', () => {
            const schema: SwaggerDefinition = {
                type: 'object',
                properties: {},
                additionalProperties: false,
                unevaluatedProperties: false,
            };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('{}');
        });

        it('should return index signature when properties are empty but object is open', () => {
            const schema: SwaggerDefinition = {
                type: 'object',
                properties: {},
            };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('{ [key: string]: any }');
        });

        it('should return index signature for empty properties with additionalProperties schema', () => {
            const schema: SwaggerDefinition = {
                type: 'object',
                properties: {},
                additionalProperties: { type: 'string' },
            };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('{ [key: string]: string }');
        });

        it('should return closed object when properties are absent but additionalProperties is false', () => {
            const schema: SwaggerDefinition = {
                type: 'object',
                additionalProperties: false,
            };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('{}');
        });

        it('should handle explicit properties with optionality', () => {
            const schema: SwaggerDefinition = {
                type: 'object',
                required: ['req'],
                properties: {
                    req: { type: 'string' },
                    opt: { type: 'number' },
                },
            };
            const res = utils.getTypeScriptType(schema, config, []);
            expect(res).toContain('req: string');
            expect(res).toContain('opt?: number');
        });

        it('should include index signature alongside explicit properties', () => {
            const schema: SwaggerDefinition = {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                },
                additionalProperties: { type: 'number' },
            };
            const res = utils.getTypeScriptType(schema, config, []);
            expect(res).toContain('id?: string');
            expect(res).toContain('[key: string]: number | any');
        });

        it('should quote invalid identifier keys', () => {
            const schema: SwaggerDefinition = {
                type: 'object',
                properties: { 'mk.1': { type: 'string' } },
            };
            const res = utils.getTypeScriptType(schema, config, []);
            expect(res).toContain("'mk.1'?: string");
        });

        // OTHER TYPES
        it('should handle file type', () => {
            expect(utils.getTypeScriptType({ type: 'file' }, config)).toBe('File');
        });

        it('should handle boolean type', () => {
            expect(utils.getTypeScriptType({ type: 'boolean' }, config)).toBe('boolean');
        });

        it('should handle null type', () => {
            expect(utils.getTypeScriptType({ type: 'null' }, config)).toBe('null');
        });

        it('should infer object type from properties if type undefined', () => {
            const schema = { properties: { id: { type: 'string' } } };
            expect(utils.getTypeScriptType(schema as any, config, [])).toContain('id?: string');
        });

        it('should return "any" for unknown schema types in switch default', () => {
            const schema = { type: 'alien-type' };
            expect(utils.getTypeScriptType(schema as any, config)).toBe('any');
        });

        it('should return "any" for null or undefined schema input', () => {
            expect(utils.getTypeScriptType(undefined as any, config, [])).toBe('any');
            expect(utils.getTypeScriptType(null as any, config, [])).toBe('any');
        });
    });

    describe('getRequestBodyType', () => {
        it('should return "any" if requestBody is undefined or empty', () => {
            expect(utils.getRequestBodyType(undefined, config, [])).toBe('any');
            expect(utils.getRequestBodyType({ content: undefined as any }, config, [])).toBe('any');
        });

        it('should prioritize JSON content types', () => {
            const rb = {
                content: {
                    'text/plain': { schema: { type: 'string' } },
                    'application/json': { schema: { type: 'number' } },
                },
            };
            expect(utils.getRequestBodyType(rb as any, config, [])).toBe('number');
        });

        it('should prefer specific media types over wildcard ranges', () => {
            const rb = {
                content: {
                    'application/*': { schema: { type: 'string' } },
                    'application/json': { schema: { type: 'number' } },
                },
            };
            expect(utils.getRequestBodyType(rb as any, config, [])).toBe('number');
        });

        it('should prefer structured JSON media types over text', () => {
            const rb = {
                content: {
                    'text/plain': { schema: { type: 'string' } },
                    'application/vnd.acme+json': { schema: { type: 'boolean' } },
                },
            };
            expect(utils.getRequestBodyType(rb as any, config, [])).toBe('boolean');
        });

        it('should fallback to first available key if no priority match', () => {
            const rb = {
                content: {
                    'image/png': { schema: { type: 'string', format: 'binary' } },
                },
            };
            expect(utils.getRequestBodyType(rb as any, config, [])).toBe('Blob');
        });

        it('should return "any" if content map exists but fallback schema is missing', () => {
            const rb = {
                content: {
                    'image/png': {
                        /* no schema */
                    },
                },
            };
            expect(utils.getRequestBodyType(rb as any, config, [])).toBe('any');
        });
    });

    describe('getResponseType', () => {
        it('should return "void" if response is undefined or empty', () => {
            expect(utils.getResponseType(undefined, config, [])).toBe('void');
            expect(utils.getResponseType({}, config, [])).toBe('void');
        });

        it('should return schema type for application/json', () => {
            const resp = { content: { 'application/json': { schema: { type: 'boolean' } } } };
            expect(utils.getResponseType(resp as any, config, [])).toBe('boolean');
        });

        it('should prefer specific media types over wildcard ranges', () => {
            const resp = {
                content: {
                    'text/*': { schema: { type: 'string' } },
                    'text/plain': { schema: { type: 'number' } },
                },
            };
            expect(utils.getResponseType(resp as any, config, [])).toBe('number');
        });

        it('should prefer structured JSON media types over text', () => {
            const resp = {
                content: {
                    'text/plain': { schema: { type: 'string' } },
                    'application/vnd.acme+json': { schema: { type: 'boolean' } },
                },
            };
            expect(utils.getResponseType(resp as any, config, [])).toBe('boolean');
        });

        it('should return "void" if no keys exist in content', () => {
            const resp = { content: {} };
            expect(utils.getResponseType(resp as any, config, [])).toBe('void');
        });

        it('should fallback to first key if no JSON found', () => {
            const resp = { content: { 'text/csv': { schema: { type: 'string' } } } };
            expect(utils.getResponseType(resp as any, config, [])).toBe('string');
        });

        it('should return "void" if fallback content has no schema', () => {
            const resp = {
                content: {
                    'image/png': {
                        /* no schema */
                    },
                },
            };
            expect(utils.getResponseType(resp as any, config, [])).toBe('void');
        });
    });

    describe('isDataTypeInterface', () => {
        it('should return true for model names', () => {
            expect(utils.isDataTypeInterface('User')).toBe(true);
        });
        it('should return false for primitives', () => {
            expect(utils.isDataTypeInterface('string')).toBe(false);
            expect(utils.isDataTypeInterface('any')).toBe(false);
            expect(utils.isDataTypeInterface('Date')).toBe(false);
            expect(utils.isDataTypeInterface('Blob')).toBe(false);
            expect(utils.isDataTypeInterface('File')).toBe(false);
            expect(utils.isDataTypeInterface('Buffer')).toBe(false);
        });
        it('should return true for generic classes that are not primitives', () => {
            expect(utils.isDataTypeInterface('MyType<string>')).toBe(true);
        });
        it('should return false if base type is primitive generic', () => {
            expect(utils.isDataTypeInterface('object<string>')).toBe(false);
        });
        it('should return false for union/intersection types', () => {
            expect(utils.isDataTypeInterface('A | B')).toBe(false);
            expect(utils.isDataTypeInterface('A & B')).toBe(false);
        });
        it('should return false for inline object signatures', () => {
            expect(utils.isDataTypeInterface('{ id: string }')).toBe(false);
        });
        it('should return false for comments in type string', () => {
            expect(utils.isDataTypeInterface('string /* JSON: number */')).toBe(false);
        });
        it('should return false for quoted string unions', () => {
            expect(utils.isDataTypeInterface("'active' | 'inactive'")).toBe(false);
        });
        it('should return false for empty strings', () => {
            expect(utils.isDataTypeInterface('')).toBe(false);
        });
    });
});
