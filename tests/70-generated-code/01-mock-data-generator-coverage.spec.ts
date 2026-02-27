import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SwaggerParser } from '@src/openapi/parse.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { MockDataGenerator } from '@src/vendors/angular/test/mock-data.generator.js';

vi.mock('node:fs');

// A single, comprehensive spec to test all branches of the mock data generator.
const mockDataGenSpec = {
    openapi: '3.0.0',
    info: { title: 'Mock Data Gen Spec', version: '1.0' },
    paths: {},
    components: {
        schemas: {
            // Schemas for existing tests
            Base: { type: 'object', properties: { id: { type: 'string' } } },
            WithBadRef: {
                allOf: [{ $ref: '#/components/schemas/Base' }, { $ref: '#/components/schemas/NonExistent' }],
            },
            AllOfWithPrimitive: { allOf: [{ type: 'string' }] },
            JustARef: { $ref: '#/components/schemas/Base' },
            RefToNothing: { $ref: '#/components/schemas/NonExistent' },
            BooleanSchema: { type: 'boolean' },
            ArrayNoItems: { type: 'array' },
            ObjectNoProps: { type: 'object' },
            NullType: { type: 'null' },
            WithExample: { type: 'string', example: 'hello from example' },
            WithExamplesFallback: { type: 'string', examples: ['fallback example 1', 'fallback example 2'] },
            WithExternalValue: { externalValue: 'examples/data.json' },
            WithExternalUrl: { externalValue: 'http://example.com/data.json' },
            CircularA: { properties: { b: { $ref: '#/components/schemas/CircularB' } } },
            CircularB: { properties: { a: { $ref: '#/components/schemas/CircularA' } } },
            OneOfNoType: { oneOf: [{ type: 'string' }, { type: 'number' }] },
            TupleArray: { type: 'array', items: [{ type: 'string' }, { type: 'number' }] },
            NumberWithDefault: { type: 'number', default: 42 },

            // New schemas for 100% coverage
            AllOfWithNull: { allOf: [{ type: 'null' }, { type: 'object', properties: { name: { type: 'string' } } }] },
            DeepNest1: { type: 'object', properties: { nest2: { $ref: '#/components/schemas/DeepNest2' } } },
            DeepNest2: { type: 'object', properties: { nest3: { $ref: '#/components/schemas/DeepNest3' } } },
            DeepNest3: { type: 'object', properties: { nest4: { $ref: '#/components/schemas/DeepNest4' } } },
            DeepNest4: { type: 'object', properties: { nest5: { $ref: '#/components/schemas/DeepNest5' } } },
            DeepNest5: { type: 'object', properties: { nest6: { $ref: '#/components/schemas/DeepNest6' } } },
            DeepNest6: { type: 'object', properties: { nest7: { $ref: '#/components/schemas/DeepNest7' } } },
            DeepNest7: { type: 'object', properties: { nest8: { $ref: '#/components/schemas/DeepNest8' } } },
            DeepNest8: { type: 'object', properties: { nest9: { $ref: '#/components/schemas/DeepNest9' } } },
            DeepNest9: { type: 'object', properties: { nest10: { $ref: '#/components/schemas/DeepNest10' } } },
            DeepNest10: { type: 'object', properties: { nest11: { $ref: '#/components/schemas/DeepNest11' } } },
            DeepNest11: { type: 'object', properties: { name: { type: 'string' } } }, // The end of the chain

            AnyOfSchema: { anyOf: [{ type: 'boolean' }, { type: 'string' }] },
            UnsupportedType: { type: 'function' }, // A type not in the switch
            StringArrayType: { type: ['string', 'null'] },
            InferredObjectType: { properties: { name: { type: 'string' } } },
            ArrayWithUnsupportedItems: { type: 'array', items: { type: 'function' } },
            ArrayWithUnknownItem: { type: 'array', items: { type: 'funky' } },
            StringFormats: {
                type: 'object',
                properties: {
                    myDate: { type: 'string', format: 'date' },
                    myDateTime: { type: 'string', format: 'date-time' },
                    myUuid: { type: 'string', format: 'uuid' },
                    myPassword: { type: 'string', format: 'password' },
                    myEmail: { type: 'string', format: 'email' },
                    myBase64: { type: 'string', contentEncoding: 'base64' },
                    myBase64Url: { type: 'string', contentEncoding: 'base64url' },
                },
            },
            StringWithNonStringDefault: { type: 'string', default: 123 },
            BooleanWithDefault: { type: 'boolean', default: false },
            StringWithStringDefault: { type: 'string', default: 'my-default' },
            NumberWithMin: { type: 'number', minimum: 55.5 },
            IntegerWithNonNumberDefault: { type: 'integer', default: 'hello' },
            NumberWithNonNumberDefault: { type: 'number', default: 'hello' },
            UnresolvableRefWrapper: {
                type: 'object',
                properties: {
                    badProp: { $ref: '#/components/schemas/NonExistent' },
                },
            },
            DataValueSchema: { dataValue: { id: 1 } },
            ValueSchema: { value: 'raw-value' },
            SerializedValueSchema: { serializedValue: 'serialized-value' },
            UnknownTypeSchema: { type: 'funky' },
            ExternalRelativeHttp: { externalValue: 'relative.json' },
            ExternalInvalidUrl: { externalValue: 'http://[invalid' },
            ExternalMissingFile: { externalValue: 'missing.json' },
        },
    },
};

describe('Generated Code: MockDataGenerator (Coverage)', () => {
    const createMockGenerator = (spec: object): MockDataGenerator => {
        const config: GeneratorConfig = {
            input: '',
            output: '/out',
            options: { dateType: 'string', enumStyle: 'enum' },
        };
        // FIX: Provide a valid absolute file URI for the parser base to ensure
        // URL resolution and fileURLToPath() work correctly in environments.
        const documentUri = pathToFileURL(path.resolve(process.cwd(), 'spec.json')).href;
        const parser = new SwaggerParser(spec as any, config, undefined, documentUri);
        return new MockDataGenerator(parser);
    };
    const generator = createMockGenerator(mockDataGenSpec);

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should handle externalValue by resolving local files', () => {
        // type-coverage:ignore-next-line
        (fs.existsSync as any).mockReturnValue(true);
        // type-coverage:ignore-next-line
        (fs.readFileSync as any).mockReturnValue(JSON.stringify({ foo: 'bar' }));

        const mockString = generator.generate('WithExternalValue');
        // MockDataGenerator returns JSON stringified value, so parsing it should give original object
        // type-coverage:ignore-next-line
        const mock = JSON.parse(mockString);
        // type-coverage:ignore-next-line
        expect(mock).toEqual({ foo: 'bar' });
        expect(fs.readFileSync).toHaveBeenCalled();
    });

    it('should return raw file content when externalValue is not JSON', () => {
        // type-coverage:ignore-next-line
        (fs.existsSync as any).mockReturnValue(true);
        // type-coverage:ignore-next-line
        (fs.readFileSync as any).mockReturnValue('plain text');

        const mockString = generator.generate('WithExternalValue');
        // type-coverage:ignore-next-line
        const mock = JSON.parse(mockString);
        // type-coverage:ignore-next-line
        expect(mock).toBe('plain text');
    });

    it('should handle externalValue with remote URL by referencing content URL', () => {
        const mockString = generator.generate('WithExternalUrl');
        // type-coverage:ignore-next-line
        const mock = JSON.parse(mockString);
        // type-coverage:ignore-next-line
        expect(mock).toContain('URL Content: http://example.com/data.json');
        expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('should prioritize dataValue, value, and serializedValue in that order', () => {
        expect(JSON.parse(generator.generate('DataValueSchema'))).toEqual({ id: 1 });
        expect(JSON.parse(generator.generate('ValueSchema'))).toBe('raw-value');
        expect(JSON.parse(generator.generate('SerializedValueSchema'))).toBe('serialized-value');
    });

    it('should return empty object for unknown types without oneOf/anyOf', () => {
        const mockString = generator.generate('UnknownTypeSchema');
        expect(JSON.parse(mockString)).toEqual({});
    });

    it('should handle allOf containing a null type by ignoring it', () => {
        const mockString = generator.generate('AllOfWithNull');
        // type-coverage:ignore-next-line
        const mock = JSON.parse(mockString);
        // type-coverage:ignore-next-line
        expect(mock).toEqual({ name: 'string-value' });
    });

    it('should handle allOf with a bad ref by ignoring the bad part', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const mockString = generator.generate('WithBadRef');
        // type-coverage:ignore-next-line
        const mock = JSON.parse(mockString);
        // type-coverage:ignore-next-line
        expect(mock).toEqual({ id: 'string-value' });
        warnSpy.mockRestore();
    });

    it('should handle allOf with a primitive type by returning an empty object', () => {
        const mockString = generator.generate('AllOfWithPrimitive');
        // type-coverage:ignore-next-line
        const mock = JSON.parse(mockString);
        // type-coverage:ignore-next-line
        expect(mock).toEqual({});
    });

    it('should handle a schema that is just a ref', () => {
        const mockString = generator.generate('JustARef');
        // type-coverage:ignore-next-line
        const mock = JSON.parse(mockString);
        // type-coverage:ignore-next-line
        expect(mock).toEqual({ id: 'string-value' });
    });

    it('should return empty object for a hardcoded ref that points to nothing', () => {
        // This hits the hardcoded `case 'RefToNothing'` in `generate()`
        const mockString = generator.generate('RefToNothing');
        expect(mockString).toBe('{}');
    });

    it('should handle an unresolvable ref inside an object', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        // This tests the `resolve()` fallback logic within `generateValue()`
        const mockString = generator.generate('UnresolvableRefWrapper');
        // type-coverage:ignore-next-line
        const mock = JSON.parse(mockString);
        // type-coverage:ignore-next-line
        expect(mock).toEqual({ badProp: { id: 'string-value' } });
        warnSpy.mockRestore();
    });

    it('should generate a boolean value', () => {
        const mockString = generator.generate('BooleanSchema');
        expect(JSON.parse(mockString)).toBe(true);
    });

    it('should use the default for a boolean', () => {
        const mockString = generator.generate('BooleanWithDefault');
        expect(JSON.parse(mockString)).toBe(false);
    });

    it('should generate an empty array for array with no items', () => {
        const mockString = generator.generate('ArrayNoItems');
        expect(JSON.parse(mockString)).toEqual([]);
    });

    it('should generate an empty object for object with no properties', () => {
        const mockString = generator.generate('ObjectNoProps');
        expect(JSON.parse(mockString)).toEqual({});
    });

    it('should return null for a null type schema', () => {
        const mockString = generator.generate('NullType');
        expect(JSON.parse(mockString)).toBeNull();
    });

    it('should use example property if present', () => {
        const mockString = generator.generate('WithExample');
        expect(JSON.parse(mockString)).toBe('hello from example');
    });

    it('should check examples array if example property is missing (e.g. OAS 3.1)', () => {
        const mockString = generator.generate('WithExamplesFallback');
        expect(JSON.parse(mockString)).toBe('fallback example 1');
    });

    it('should handle circular references gracefully', () => {
        const mockString = generator.generate('CircularA');
        // type-coverage:ignore-next-line
        const mock = JSON.parse(mockString);
        // type-coverage:ignore-next-line
        expect(mock).toEqual({ b: { a: {} } });
    });

    it('should handle oneOf', () => {
        const mockString = generator.generate('OneOfNoType');
        expect(JSON.parse(mockString)).toBe('string-value');
    });

    it('should handle anyOf by picking the first option', () => {
        const mockString = generator.generate('AnyOfSchema');
        expect(JSON.parse(mockString)).toBe(true); // first option is boolean
    });

    it('should handle tuple arrays by returning an empty array', () => {
        const mockString = generator.generate('TupleArray');
        expect(JSON.parse(mockString)).toEqual([]);
    });

    it('should use the default value for a number', () => {
        const mockString = generator.generate('NumberWithDefault');
        expect(JSON.parse(mockString)).toBe(42);
    });

    it('should use the minimum value for a number', () => {
        const mockString = generator.generate('NumberWithMin');
        expect(JSON.parse(mockString)).toBe(55.5);
    });

    it('should fall back to a default number if default is not a number', () => {
        const mockString = generator.generate('NumberWithNonNumberDefault');
        expect(JSON.parse(mockString)).toBe(123.45);
    });

    it('should handle various string formats including contentEncoding', () => {
        const mockString = generator.generate('StringFormats');
        // type-coverage:ignore-next-line
        const mock = JSON.parse(mockString);
        // type-coverage:ignore-next-line
        expect(mock).toHaveProperty('myDate');
        // type-coverage:ignore-next-line
        expect(mock).toHaveProperty('myDateTime');
        // type-coverage:ignore-next-line
        expect(mock.myEmail).toBe('test@example.com');
        // type-coverage:ignore-next-line
        expect(mock.myUuid).toBe('123e4567-e89b-12d3-a456-426614174000');
        // type-coverage:ignore-next-line
        expect(mock.myPassword).toBe('StrongPassword123!');
        // The test data for base64 encoding
        // type-coverage:ignore-next-line
        expect(mock.myBase64).toBe('dGVzdC1jb250ZW50');
        // type-coverage:ignore-next-line
        expect(mock.myBase64Url).toBe('dGVzdC1jb250ZW50');
    });

    it('should fall back to default string if default value is not a string', () => {
        const mockString = generator.generate('StringWithNonStringDefault');
        expect(JSON.parse(mockString)).toBe('string-value');
    });

    it('should use the default value for a string if it is a string', () => {
        const mockString = generator.generate('StringWithStringDefault');
        expect(JSON.parse(mockString)).toBe('my-default');
    });

    it('should fall back to a default integer if default is not a number', () => {
        const mockString = generator.generate('IntegerWithNonNumberDefault');
        expect(JSON.parse(mockString)).toBe(123);
    });

    it('should handle `type` as array', () => {
        const mockString = generator.generate('StringArrayType');
        expect(JSON.parse(mockString)).toBe('string-value');
    });

    it('should handle inferred object type', () => {
        const mockString = generator.generate('InferredObjectType');
        // type-coverage:ignore-next-line
        const mock = JSON.parse(mockString);
        // type-coverage:ignore-next-line
        expect(mock).toEqual({ name: 'string-value' });
    });

    it('should return undefined for unsupported types', () => {
        const mockString = generator.generate('UnsupportedType');
        // If the top-level is undefined, it becomes {}
        expect(mockString).toBe('{}');
    });

    it('should return an empty array for an array of unsupported items', () => {
        const mockString = generator.generate('ArrayWithUnsupportedItems');
        expect(JSON.parse(mockString)).toEqual([]);
    });

    it('should return empty array when array items resolve to undefined', () => {
        const mockString = generator.generate('ArrayWithUnknownItem');
        expect(JSON.parse(mockString)).toEqual([]);
    });

    it('should resolve externalValue relative to an http base', () => {
        const config: GeneratorConfig = {
            input: '',
            output: '/out',
            options: { dateType: 'string', enumStyle: 'enum' },
        };
        const parser = new SwaggerParser(mockDataGenSpec as any, config, undefined, 'https://example.com/spec.json');
        const customGenerator = new MockDataGenerator(parser);

        const mockString = customGenerator.generate('ExternalRelativeHttp');
        // type-coverage:ignore-next-line
        const mock = JSON.parse(mockString);
        // type-coverage:ignore-next-line
        expect(mock).toContain('URL Content: https://example.com/relative.json');
    });

    it('should fall back for non-file protocol externalValue resolution', () => {
        const config: GeneratorConfig = {
            input: '',
            output: '/out',
            options: { dateType: 'string', enumStyle: 'enum' },
        };
        const parser = new SwaggerParser(mockDataGenSpec as any, config, undefined, 'ftp://example.com/spec.json');
        const customGenerator = new MockDataGenerator(parser);

        const mockString = customGenerator.generate('ExternalRelativeHttp');
        // type-coverage:ignore-next-line
        const mock = JSON.parse(mockString);
        // type-coverage:ignore-next-line
        expect(mock).toContain('External Content: relative.json');
    });

    it('should fall back when externalValue file is missing or invalid', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const config: GeneratorConfig = {
            input: '',
            output: '/out',
            options: { dateType: 'string', enumStyle: 'enum' },
        };
        const invalidBaseParser = new SwaggerParser(mockDataGenSpec as any, config, undefined, 'http://[invalid');
        const invalidBaseGenerator = new MockDataGenerator(invalidBaseParser);
        // type-coverage:ignore-next-line
        const invalid = JSON.parse(invalidBaseGenerator.generate('ExternalRelativeHttp'));
        // type-coverage:ignore-next-line
        expect(invalid).toContain('External Content: relative.json');

        const parser = new SwaggerParser(mockDataGenSpec as any, config);
        // type-coverage:ignore-next-line
        (parser as any).documentUri = '';
        const customGenerator = new MockDataGenerator(parser);

        // type-coverage:ignore-next-line
        (fs.existsSync as any).mockReturnValue(false);
        // type-coverage:ignore-next-line
        const missing = JSON.parse(customGenerator.generate('ExternalMissingFile'));
        // type-coverage:ignore-next-line
        expect(missing).toContain('External Content: missing.json');

        warnSpy.mockRestore();
    });

    it('should return undefined for deep recursion to hit maxDepth', () => {
        const mockString = generator.generate('DeepNest1');
        // type-coverage:ignore-next-line
        const mock = JSON.parse(mockString);
        // type-coverage:ignore-next-line
        const nest5 = mock.nest2.nest3.nest4.nest5;
        // type-coverage:ignore-next-line
        expect(nest5).toBeDefined();
        // Because maxDepth was hit, the generator returned `undefined` for nest6,
        // so it was not added as a property to the nest5 object.
        // type-coverage:ignore-next-line
        expect(nest5).not.toHaveProperty('nest6');
    });
});
