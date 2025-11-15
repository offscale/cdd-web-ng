import { describe, expect, it } from 'vitest';

import * as utils from '../../src/core/utils.js';
import { GeneratorConfig, RequestBody, SwaggerDefinition } from '../../src/core/types.js';
import { branchCoverageSpec, typeGenSpec } from '../shared/specs.js';

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

    describe('getRequestBodyType', () => {
        it('should return "any" if request body is undefined', () => {
            expect(utils.getRequestBodyType(undefined, config, [])).toBe('any');
        });

        it('should return "any" if request body has no content property', () => {
            const requestBody: RequestBody = { required: false }; // no `content` key
            expect(utils.getRequestBodyType(requestBody, config, [])).toBe('any');
        });

        it('should return the correct type for a valid request body', () => {
            const requestBody: RequestBody = {
                content: {
                    'application/json': {
                        schema: { type: 'number' },
                    },
                },
            };
            expect(utils.getRequestBodyType(requestBody, config, [])).toBe('number');
        });
    });

    it('getResponseType should return "any" for undefined response', () => {
        expect(utils.getResponseType(undefined, config, [])).toBe('any');
    });

    describe('getTypeScriptType', () => {
        it('should return "any" for null or undefined schema', () => {
            expect(utils.getTypeScriptType(undefined, config, [])).toBe('any');
            expect(utils.getTypeScriptType(null, config, [])).toBe('any');
        });

        it('should return "any" for file type', () => {
            const schema: SwaggerDefinition = { type: 'file' };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('any');
        });

        it('should return "any" for default switch case with unknown type', () => {
            const schema: SwaggerDefinition = { type: 'unknown' as any };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('any');
        });

        it('should return "any" for default switch case with array type', () => {
            const schema: SwaggerDefinition = { type: ['string', 'null'] };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('any');
        });

        it('should handle $ref ending in a slash resulting in an empty pop', () => {
            const schema: SwaggerDefinition = { $ref: '#/definitions/users/' };
            expect(utils.getTypeScriptType(schema, config, ['User'])).toBe('any');
        });

        it('should return "any" for unresolvable $ref', () => {
            const schema: SwaggerDefinition = { $ref: '#/components/schemas/NonExistentType' };
            const knownTypes: string[] = ['SomeOtherType'];
            expect(utils.getTypeScriptType(schema, config, knownTypes)).toBe('any');
        });

        it('should handle empty `allOf` by returning `any`', () => {
            const schema: SwaggerDefinition = { allOf: [] };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('any');
        });

        it('should handle empty `oneOf` by returning `any`', () => {
            const schema: SwaggerDefinition = { oneOf: [] };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('any');
        });

        it('should handle `additionalProperties: true`', () => {
            const schema = typeGenSpec.components.schemas.FreeObject;
            expect(utils.getTypeScriptType(schema, config, [])).toBe('Record<string, any>');
        });

        it('should handle array with no items', () => {
            const schema: SwaggerDefinition = { type: 'array' };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('any[]');
        });

        it('should handle property names that need quoting', () => {
            const schema: SwaggerDefinition = {
                type: 'object',
                properties: {
                    'with-hyphen': { type: 'string' },
                },
            };
            expect(utils.getTypeScriptType(schema, config, [])).toBe("{ 'with-hyphen'?: string }");
        });

        it('should correctly handle optional vs required properties', () => {
            const schema: SwaggerDefinition = {
                type: 'object',
                properties: {
                    'required-prop': { type: 'string' },
                    'optional-prop': { type: 'string' },
                },
                required: ['required-prop'],
            };
            const expected = "{ 'required-prop': string; 'optional-prop'?: string }";
            expect(utils.getTypeScriptType(schema, config, [])).toBe(expected);
        });

        it('should correctly handle an integer schema type', () => {
            const schema: SwaggerDefinition = { type: 'integer' };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('number');
        });
    });

    describe('extractPaths', () => {
        it('should handle undefined swaggerPaths', () => {
            expect(utils.extractPaths(undefined)).toEqual([]);
        });

        it('should handle operations with no request body or body param', () => {
            const paths = utils.extractPaths(branchCoverageSpec.paths);
            const op = paths.find(p => p.operationId === 'getNoBody');
            expect(op).toBeDefined();
            expect(op!.requestBody).toBeUndefined();
        });

        it('should normalize Swagger 2.0 responses with a schema', () => {
            const swaggerPaths = {
                '/test': {
                    get: {
                        operationId: 'getTest',
                        responses: {
                            '200': {
                                description: 'A successful response',
                                schema: { type: 'string' },
                            },
                        },
                    },
                },
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            expect(pathInfo).toBeDefined();
            expect(pathInfo.responses?.['200'].content).toEqual({
                'application/json': { schema: { type: 'string' } },
            });
            expect(pathInfo.responses?.['200'].description).toBe('A successful response');
        });

        it('should handle swagger 2.0 response without a schema', () => {
            const swaggerPaths = {
                '/test': {
                    get: {
                        responses: { '200': { description: 'ok' } }
                    }
                }
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            expect(pathInfo.responses!['200'].content).toBeUndefined();
        });

        it('should handle responses with non-json content', () => {
            const paths = utils.extractPaths(branchCoverageSpec.paths);
            const op = paths.find(p => p.operationId === 'getNoBody');
            expect(op).toBeDefined();
            expect(op!.responses!['200'].content!['text/plain'].schema).toEqual({ type: 'string' });
        });
    });

    it('isDataTypeInterface should return false for union types', () => {
        const schema: SwaggerDefinition = { type: 'string', format: 'date-time', nullable: true };
        const type: string = utils.getTypeScriptType(schema, configWithDate, []); // "Date | null"
        expect(utils.isDataTypeInterface(type)).toBe(false);
    });

    it('getInterceptorsTokenName should use default client name when none is provided', () => {
        expect(utils.getInterceptorsTokenName()).toBe('HTTP_INTERCEPTORS_DEFAULT');
    });

    it('should correctly handle a boolean schema type', () => {
        const schema: SwaggerDefinition = { type: 'boolean' };
        expect(utils.getTypeScriptType(schema, config, [])).toBe('boolean');
    });

    it('should handle single quotes in enum values', () => {
        const schema: SwaggerDefinition = { type: 'string', enum: ["it's a value"] };
        expect(utils.getTypeScriptType(schema, config, [])).toBe(`'it\\'s a value'`);
    });
});
