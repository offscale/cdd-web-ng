import { describe, it, expect } from 'vitest';
import { MockDataGenerator } from '@src/service/emit/test/mock-data.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types.js';
import { branchCoverageSpec, mockDataGenSpec } from '../shared/specs.js';

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
    const generator = createMockGenerator({ ...mockDataGenSpec, ...branchCoverageSpec });

    it('should handle allOf with a bad ref by ignoring the bad part', () => {
        const mockString = generator.generate('WithBadRef');
        const mock = JSON.parse(mockString);
        expect(mock).toEqual({ id: 'string-value' }); // from Base, ignores NonExistent
    });

    it('should handle allOf with a primitive type by returning undefined', () => {
        // allOf is for objects, so a primitive is an invalid part and should be ignored,
        // resulting in an empty object.
        const mockString = generator.generate('AllOfWithPrimitive');
        const mock = JSON.parse(mockString);
        expect(mock).toEqual({});
    });

    it('should handle a schema that is just a ref', () => {
        const mockString = generator.generate('JustARef');
        const mock = JSON.parse(mockString);
        expect(mock).toEqual({ id: 'string-value' });
    });

    it('should return empty object for a ref that points to nothing', () => {
        const mockString = generator.generate('RefToNothing');
        expect(mockString).toBe('{}');
    });

    it('should generate a boolean value', () => {
        const mockString = generator.generate('BooleanSchema');
        expect(JSON.parse(mockString)).toBe(true);
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

    it('should handle circular references gracefully', () => {
        const mockString = generator.generate('CircularA');
        const mock = JSON.parse(mockString);
        // Traverses A -> B -> A (stops)
        expect(mock).toEqual({ b: { a: {} } });
    });

    it('should handle oneOf without an explicit type', () => {
        const mockString = generator.generate('OneOfNoType');
        // It should pick the first one, which is 'string'
        expect(JSON.parse(mockString)).toBe('string-value');
    });

    it('should handle tuple arrays by returning an empty array', () => {
        const mockString = generator.generate('TupleArray');
        // The generator doesn't support tuples, so it should fall back to an empty array
        expect(JSON.parse(mockString)).toEqual([]);
    });

    it('should use the default value for a number', () => {
        const mockString = generator.generate('NumberWithDefault');
        expect(JSON.parse(mockString)).toBe(42);
    });
});
