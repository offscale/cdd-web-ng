import { describe, it, expect } from 'vitest';
import { MockDataGenerator } from '@src/service/emit/test/mock-data.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types.js';
import { mockDataGenSpec } from '../shared/specs.js';

/**
 * @fileoverview
 * This file contains targeted tests for the `MockDataGenerator` to cover specific
 * edge cases related to schema composition (`allOf`), references (`$ref`), and
 * various primitive types that were not previously covered.
 */
describe('Generated Code: MockDataGenerator (Coverage)', () => {
    const createMockGenerator = (spec: object): MockDataGenerator => {
        const config: GeneratorConfig = { input: '', output: '/out', options: { dateType: 'string', enumStyle: 'enum' } };
        const parser = new SwaggerParser(spec as any, config);
        return new MockDataGenerator(parser);
    };

    const generator = createMockGenerator(mockDataGenSpec);

    it('should handle allOf with a bad ref by ignoring the bad part', () => {
        const mockString = generator.generate('WithBadRef');
        const mock = JSON.parse(mockString);
        expect(mock).toEqual({ id: 'string-value' }); // from Base, ignores NonExistent
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
});
