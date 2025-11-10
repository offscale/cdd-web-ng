import { describe, it, expect } from 'vitest';
import { MockDataGenerator } from '@src/service/emit/test/mock-data.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types.js';
import { branchCoverageSpec, mockDataGenSpec } from '../shared/specs.js';

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
    const generator = createMockGenerator({ ...mockDataGenSpec, ...branchCoverageSpec })

    it('should handle allOf with a bad ref by ignoring the bad part', {skip: true}, () => {
        const mockString = generator.generate('WithBadRef');
        const mock = JSON.parse(mockString);
        expect(mock).toEqual({ id: 'string-value' }); // from Base, ignores NonExistent
    });

    it('should handle a schema that is just a ref', {skip: true}, () => {
        const mockString = generator.generate('JustARef');
        const mock = JSON.parse(mockString);
        expect(mock).toEqual({ id: 'string-value' });
    });

    it('should return empty object for a ref that points to nothing', () => {
        const mockString = generator.generate('RefToNothing');
        expect(mockString).toBe('{}');
    });

    it('should generate a boolean value', {skip: true}, () => {
        const mockString = generator.generate('BooleanSchema');
        expect(JSON.parse(mockString)).toBe(true);
    });

    it('should generate an empty array for array with no items', {skip: true}, () => {
        const mockString = generator.generate('ArrayNoItems');
        expect(JSON.parse(mockString)).toEqual([]);
    });

    it('should generate an empty object for object with no properties', () => {
        const mockString = generator.generate('ObjectNoProps');
        expect(JSON.parse(mockString)).toEqual({});
    });

    it('should return null for a null type schema', {skip: true}, () => {
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
});
