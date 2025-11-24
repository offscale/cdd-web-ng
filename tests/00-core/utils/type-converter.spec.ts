import { describe, expect, it } from 'vitest';
import * as utils from '@src/core/utils/type-converter.js';
import { GeneratorConfig, SwaggerDefinition } from '@src/core/types/index.js';
import { typeGenSpec } from '../../shared/specs.js';

describe('Core Utils: Type Converter', () => {
    const config: GeneratorConfig = {
        input: 'spec.json',
        output: './out',
        options: { dateType: 'string', enumStyle: 'enum' },
    };
    const configWithDate: GeneratorConfig = { ...config, options: { ...config.options, dateType: 'Date' } };

    describe('getTypeScriptType', () => {
        it('should return `{ [key: string]: any }` for an object schema with no properties', () => {
            const schema: SwaggerDefinition = { type: 'object' };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('{ [key: string]: any }');
        });

        it('should return "any" for unknown schema types', () => {
            const schema = { type: 'unknown_type' };
            expect(utils.getTypeScriptType(schema as any, config)).toBe('any');
        });

        it('should return "any" for null or undefined schema', () => {
            expect(utils.getTypeScriptType(undefined, config, [])).toBe('any');
            expect(utils.getTypeScriptType(null, config, [])).toBe('any');
        });

        it('should resolve $dynamicRef to a known type', () => {
            const schema: SwaggerDefinition = { $dynamicRef: '#/components/schemas/DynamicUser' };
            const knownTypes = ['DynamicUser'];
            expect(utils.getTypeScriptType(schema, config, knownTypes)).toBe('DynamicUser');
        });

        it('should resolve contentSchema inner type for string encoded JSON', () => {
            const schema: SwaggerDefinition = {
                type: 'string',
                contentEncoding: 'identity',
                contentMediaType: 'application/json',
                contentSchema: { type: 'number' }
            };
            const result = utils.getTypeScriptType(schema, config, []);
            expect(result).toBe('string /* JSON: number */');
        });

        it('should return Blob for binary/non-json strings', () => {
            const schema: SwaggerDefinition = { type: 'string', contentMediaType: 'image/png' };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('Blob');
        });

        it('should handle `additionalProperties: true`', () => {
            const schema = typeGenSpec.components.schemas.FreeObject as any;
            expect(utils.getTypeScriptType(schema, config, [])).toBe('{ [key: string]: any }');
        });

        it('should handle `unevaluatedProperties: false` (OAS 3.1 Strictness)', () => {
            const schema: SwaggerDefinition = {
                type: 'object',
                properties: { id: { type: 'string' } },
                unevaluatedProperties: false
            };
            const type = utils.getTypeScriptType(schema, config, []);
            expect(type).toContain("id?: string");
            expect(type).not.toContain("[key: string]");
        });
    });

    describe('isDataTypeInterface', () => {
        it('should return true for model names', () => {
            expect(utils.isDataTypeInterface('User')).toBe(true);
        });
        it('should return false for primitives', () => {
            expect(utils.isDataTypeInterface('string')).toBe(false);
            expect(utils.isDataTypeInterface('any')).toBe(false);
        });
        it('should return false for union types', () => {
            const schema: SwaggerDefinition = { type: 'string', format: 'date-time', nullable: true };
            const type: string = utils.getTypeScriptType(schema, configWithDate, []);
            expect(utils.isDataTypeInterface(type)).toBe(false);
        });
    });
});
