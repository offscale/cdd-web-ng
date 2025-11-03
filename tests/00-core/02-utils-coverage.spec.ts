import { describe, it, expect } from 'vitest';

import * as utils from '../../src/core/utils.js';
import { GeneratorConfig, SwaggerDefinition } from '../../src/core/types.js';
import { typeGenSpec } from '../shared/specs.js';

describe('Core: utils.ts (Coverage)', () => {
    const config: GeneratorConfig = {
        input: 'spec.json',
        output: './out',
        options: { dateType: 'string', enumStyle: 'enum' },
    };
    const configWithDate: GeneratorConfig = { ...config, options: { ...config.options, dateType: 'Date' } };

    it('getRequestBodyType should return "any" for undefined requestBody', () => {
        expect(utils.getRequestBodyType(undefined, config, [])).toBe('any');
    });

    it('getResponseType should return "any" for undefined response', () => {
        expect(utils.getResponseType(undefined, config, [])).toBe('any');
    });

    // Covers line 131 in utils.ts
    it('getTypeScriptType should return "any" for null or undefined schema', () => {
        expect(utils.getTypeScriptType(undefined, config, [])).toBe('any');
        expect(utils.getTypeScriptType(null, config, [])).toBe('any');
    });

    // Covers line 134-135: Unresolvable $ref
    it('getTypeScriptType should return "any" for unresolvable $ref', () => {
        const schema: SwaggerDefinition = { $ref: '#/components/schemas/NonExistentType' };
        const knownTypes = ['SomeOtherType'];
        expect(utils.getTypeScriptType(schema, config, knownTypes)).toBe('any');
    });

    // Covers line 138 (empty allOf)
    it('getTypeScriptType should handle empty `allOf` by returning `any`', () => {
        const schema: SwaggerDefinition = { allOf: [] };
        expect(utils.getTypeScriptType(schema, config, [])).toBe('any');
    });

    // Covers line 153-154 (additionalProperties: true)
    it('getTypeScriptType should handle `additionalProperties: true`', () => {
        const schema = typeGenSpec.components.schemas.FreeObject;
        expect(utils.getTypeScriptType(schema, config, [])).toBe('Record<string, any>');
    });

    // Covers line 207 (extractPaths with undefined)
    it('extractPaths should handle undefined swaggerPaths', () => {
        expect(utils.extractPaths(undefined)).toEqual([]);
    });

    it('getTypeScriptType should return "any" for unknown schema types', () => {
        const schema = { type: 'unknown_type' as any };
        expect(utils.getTypeScriptType(schema, config, [])).toBe('any');
    });

    it('getTypeScriptType should handle an empty string from a bad $ref pop()', () => {
        const schema = { $ref: '#/definitions/' }; // this will result in pop() returning ''
        expect(utils.getTypeScriptType(schema as any, config, [])).toBe('any');
    });

    it('getTypeScriptType should handle array with no items', () => {
        const schema: SwaggerDefinition = { type: 'array' };
        expect(utils.getTypeScriptType(schema, config, [])).toBe('any[]');
    });

    it('isDataTypeInterface should return false for union types', () => {
        const schema: SwaggerDefinition = { type: 'string', format: 'date-time', nullable: true };
        const type = utils.getTypeScriptType(schema, configWithDate, []); // "Date | null"
        expect(utils.isDataTypeInterface(type)).toBe(false);
    });

    it('isDataTypeInterface should return false for inline object definitions', () => {
        const type = '{ foo?: string }';
        expect(utils.isDataTypeInterface(type)).toBe(false);
    });
});
