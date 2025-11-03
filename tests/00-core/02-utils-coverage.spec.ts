import { describe, expect, it } from 'vitest';

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

    it('should handle string with format: binary', () => {
        const schema: SwaggerDefinition = { type: 'string', format: 'binary' };
        expect(utils.getTypeScriptType(schema, config, [])).toBe('Blob');
    });

    it('should escape single quotes in string enums', () => {
        const schema: SwaggerDefinition = { type: 'string', enum: ["it's a string"] };
        expect(utils.getTypeScriptType(schema, config, [])).toBe("'it\\'s a string'");
    });

    it('should correctly handle OAS3 requestBody in extractPaths', () => {
        const swaggerPaths = {
            '/test': { post: { requestBody: { content: { 'application/json': { schema: { type: 'number' } } } } } }
        };
        const paths = utils.extractPaths(swaggerPaths as any);
        expect(paths.length).toBe(1);
        expect(paths[0].requestBody).toBeDefined();
        expect(paths[0].requestBody?.content?.['application/json']?.schema).toEqual({ type: 'number' });
    });

    describe('isUrl', () => {
        it('should return true for valid URLs', () => {
            expect(utils.isUrl('http://example.com')).toBe(true);
            expect(utils.isUrl('https://example.com/path?query=1')).toBe(true);
        });

        it('should return false for invalid URLs or local paths', () => {
            expect(utils.isUrl('not a url')).toBe(false);
            expect(utils.isUrl('/local/path/spec.json')).toBe(false);
            expect(utils.isUrl('example.com')).toBe(false);
        });
    });
    it('kebabCase should handle strings with spaces', () => {
        expect(utils.kebabCase('Hello World')).toBe('hello-world');
    });
});
