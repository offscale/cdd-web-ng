import { describe, expect, it } from 'vitest';

import * as utils from '../../src/core/utils.js';
import { GeneratorConfig, SwaggerDefinition } from '../../src/core/types.js';
import { typeGenSpec } from '../shared/specs.js';

/**
 * @fileoverview
 * This file contains targeted tests for `src/core/utils.ts` to cover specific
 * edge cases and branches that are not hit by the main unit tests. Its primary
 * purpose is to increase test coverage by exercising less common code paths.
 */
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

    it('getTypeScriptType should return "any" for null or undefined schema', () => {
        expect(utils.getTypeScriptType(undefined, config, [])).toBe('any');
        expect(utils.getTypeScriptType(null, config, [])).toBe('any');
    });

    it('getTypeScriptType should return "any" for unresolvable $ref', () => {
        const schema: SwaggerDefinition = { $ref: '#/components/schemas/NonExistentType' };
        const knownTypes: string[] = ['SomeOtherType'];
        expect(utils.getTypeScriptType(schema, config, knownTypes)).toBe('any');
    });

    it('getTypeScriptType should handle empty `allOf` by returning `any`', () => {
        const schema: SwaggerDefinition = { allOf: [] };
        expect(utils.getTypeScriptType(schema, config, [])).toBe('any');
    });

    it('getTypeScriptType should handle `additionalProperties: true`', () => {
        const schema = typeGenSpec.components.schemas.FreeObject;
        expect(utils.getTypeScriptType(schema, config, [])).toBe('Record<string, any>');
    });

    it('extractPaths should handle undefined swaggerPaths', () => {
        expect(utils.extractPaths(undefined)).toEqual([]);
    });

    it('getTypeScriptType should handle array with no items', () => {
        const schema: SwaggerDefinition = { type: 'array' };
        expect(utils.getTypeScriptType(schema, config, [])).toBe('any[]');
    });

    it('isDataTypeInterface should return false for union types', () => {
        const schema: SwaggerDefinition = { type: 'string', format: 'date-time', nullable: true };
        const type: string = utils.getTypeScriptType(schema, configWithDate, []); // "Date | null"
        expect(utils.isDataTypeInterface(type)).toBe(false);
    });
});
