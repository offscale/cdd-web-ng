import { describe, expect, it } from 'vitest';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types.js';
import { MockDataGenerator } from "@src/service/emit/test/mock-data.generator.js";

// A single, comprehensive spec to test all branches of the mock data generator.
const mockDataGenSpec = {
    openapi: '3.0.0', info: { title: 'Mock Data Gen Spec', version: '1.0' }, paths: {},
    components: {
        schemas: {
            // Schemas for existing tests
            Base: { type: 'object', properties: { id: { type: 'string' } } },
            WithBadRef: { allOf: [{ $ref: '#/components/schemas/Base' }, { $ref: '#/components/schemas/NonExistent' }] },
            AllOfWithPrimitive: { allOf: [{ type: 'string' }] },
            JustARef: { $ref: '#/components/schemas/Base' },
            RefToNothing: { $ref: '#/components/schemas/NonExistent' },
            BooleanSchema: { type: 'boolean' },
            ArrayNoItems: { type: 'array' },
            ObjectNoProps: { type: 'object' },
            NullType: { type: 'null' },
            WithExample: { type: 'string', example: 'hello from example' },
            WithExamplesFallback: { type: 'string', examples: ['fallback example 1', 'fallback example 2'] },
            CircularA: { properties: { b: { $ref: '#/components/schemas/CircularB' } } },
            CircularB: { properties: { a: { $ref: '#/components/schemas/CircularA' } } },
            OneOfNoType: { oneOf: [{ type: 'string' }, { type: 'number' }] },
            TupleArray: { type: 'array', items: [{ type: 'string' }, { type: 'number' }] },
            NumberWithDefault: { type: 'number', default: 42 },

            // New schemas for 100% coverage
            AllOfWithNull: { allOf: [{ type: 'null' }, { type: 'object', properties: { name: { type: 'string' } } }] },
            DeepNest1: { properties: { nest2: { $ref: '#/components/schemas/DeepNest2' } } },
            DeepNest2: { properties: { nest3: { $ref: '#/components/schemas/DeepNest3' } } },
            DeepNest3: { properties: { nest4: { $ref: '#/components/schemas/DeepNest4' } } },
            DeepNest4: { properties: { nest5: { $ref: '#/components/schemas/DeepNest5' } } },
            DeepNest5: { properties: { nest6: { $ref: '#/components/schemas/DeepNest6' } } },
            DeepNest6: { properties: { nest7: { $ref: '#/components/schemas/DeepNest7' } } },
            DeepNest7: { properties: { nest8: { $ref: '#/components/schemas/DeepNest8' } } },
            DeepNest8: { properties: { nest9: { $ref: '#/components/schemas/DeepNest9' } } },
            DeepNest9: { properties: { nest10: { $ref: '#/components/schemas/DeepNest10' } } },
            DeepNest10: { properties: { nest11: { $ref: '#/components/schemas/DeepNest11' } } },
            DeepNest11: { properties: { name: { type: 'string' } } }, // The end of the chain

            AnyOfSchema: { anyOf: [{ type: 'boolean' }, { type: 'string' }] },
            UnsupportedType: { type: 'function' }, // A type not in the switch
            StringArrayType: { type: ['string', 'null'] },
            InferredObjectType: { properties: { name: { type: 'string' } } },
            ArrayWithUnsupportedItems: { type: 'array', items: { type: 'function' } },
            StringFormats: {
                type: 'object',
                properties: {
                    myDate: { type: 'string', format: 'date' },
                    myUuid: { type: 'string', format: 'uuid' },
                    myPassword: { type: 'string', format: 'password' }
                }
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
                    badProp: { $ref: '#/components/schemas/NonExistent' }
                }
            }
        }
    }
};

describe('Generated Code: MockDataGenerator (Coverage)', () => {
    const createMockGenerator = (spec: object): MockDataGenerator => {
        const config: GeneratorConfig = {
            input: '',
            output: '/out',
            options: { dateType: 'string', enumStyle: 'enum' },
        };
        const parser = new SwaggerParser(spec as any, config);
        return new MockDataGenerator(parser);
    };
    const generator = createMockGenerator(mockDataGenSpec);

    it('should handle allOf containing a null type by ignoring it', () => {
        const mockString = generator.generate('AllOfWithNull');
        const mock = JSON.parse(mockString);
        expect(mock).toEqual({ name: 'string-value' });
    });

    it('should handle allOf with a bad ref by ignoring the bad part', () => {
        const mockString = generator.generate('WithBadRef');
        const mock = JSON.parse(mockString);
        expect(mock).toEqual({ id: 'string-value' });
    });

    it('should handle allOf with a primitive type by returning an empty object', () => {
        const mockString = generator.generate('AllOfWithPrimitive');
        const mock = JSON.parse(mockString);
        expect(mock).toEqual({});
    });

    it('should handle a schema that is just a ref', () => {
        const mockString = generator.generate('JustARef');
        const mock = JSON.parse(mockString);
        expect(mock).toEqual({ id: 'string-value' });
    });

    it('should return empty object for a hardcoded ref that points to nothing', () => {
        // This hits the hardcoded `case 'RefToNothing'` in `generate()`
        const mockString = generator.generate('RefToNothing');
        expect(mockString).toBe('{}');
    });

    it('should handle an unresolvable ref inside an object', () => {
        // This tests the `resolve()` fallback logic within `generateValue()`
        const mockString = generator.generate('UnresolvableRefWrapper');
        const mock = JSON.parse(mockString);
        expect(mock).toEqual({ badProp: { id: 'string-value' } });
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
        const mock = JSON.parse(mockString);
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

    it('should handle various string formats', () => {
        const mockString = generator.generate('StringFormats');
        const mock = JSON.parse(mockString);
        expect(mock).toHaveProperty('myDate');
        expect(mock.myUuid).toBe('123e4567-e89b-12d3-a456-426614174000');
        expect(mock.myPassword).toBe('StrongPassword123!');
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
        const mock = JSON.parse(mockString);
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

    it('should return undefined for deep recursion to hit maxDepth', () => {
        const mockString = generator.generate('DeepNest1');
        const mock = JSON.parse(mockString);
        const nest5 = mock.nest2.nest3.nest4.nest5;
        expect(nest5).toBeDefined();
        // Because maxDepth was hit, the generator returned `undefined` for nest6,
        // so it was not added as a property to the nest5 object.
        expect(nest5).not.toHaveProperty('nest6');
    });
});
