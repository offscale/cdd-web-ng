import { describe, expect, it } from 'vitest';

import * as utils from '@src/core/utils.js';
import { GeneratorConfig, RequestBody, SwaggerDefinition } from '@src/core/types.js';
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
        options: {
            generateServices: true,
            admin: false,
            generateServiceTests: true,
            dateType: 'string',
            enumStyle: 'enum'
        },
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
            const schema = typeGenSpec.components.schemas.FreeObject as any;
            expect(utils.getTypeScriptType(schema, config, [])).toBe('{ [key: string]: any }');
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

        // NEW TESTS FOR ADVANCED JSON SCHEMA SUPPORT

        it('should handle "const" keyword for string literals', () => {
            const schema: SwaggerDefinition = { const: 'Success' };
            expect(utils.getTypeScriptType(schema, config, [])).toBe("'Success'");
        });

        it('should handle "const" keyword for string with quotes', () => {
            const schema: SwaggerDefinition = { const: "It's OK" };
            expect(utils.getTypeScriptType(schema, config, [])).toBe("'It\\'s OK'");
        });

        it('should handle "const" keyword for numbers', () => {
            const schema: SwaggerDefinition = { const: 123.45 };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('123.45');
        });

        it('should handle "const" keyword for boolean', () => {
            const schema: SwaggerDefinition = { const: true };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('true');
        });

        it('should handle "const": null', () => {
            const schema: SwaggerDefinition = { const: null };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('null');
        });

        it('should fallback to "any" for complex "const" values', () => {
            const schema: SwaggerDefinition = { const: { a: 1 } };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('any');
        });

        it('should map contentMediaType defined strings to Blob (OpenAPI 3.1)', () => {
            const schema: SwaggerDefinition = { type: 'string', contentMediaType: 'image/png' };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('Blob');
        });

        it('should map contentMediaType to Blob even if format is not binary', () => {
            const schema: SwaggerDefinition = { type: 'string', contentMediaType: 'application/octet-stream' };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('Blob');
        });

        it('should handle patternProperties mapped to Record', () => {
            const schema: SwaggerDefinition = {
                type: 'object',
                patternProperties: {
                    '^\\d+$': { type: 'number' }
                }
            };
            expect(utils.getTypeScriptType(schema, config, [])).toBe('{ [key: string]: number }');
        });

        it('should merge patternProperties and additionalProperties types in Record', () => {
            const schema: SwaggerDefinition = {
                type: 'object',
                patternProperties: {
                    '^S_': { type: 'string' }
                },
                additionalProperties: { type: 'boolean' }
            };
            // Should be string | boolean
            const type = utils.getTypeScriptType(schema, config, []);
            expect(type).toContain('string');
            expect(type).toContain('boolean');
            expect(type).toContain('[key: string]:');
        });
    });

    describe('extractPaths', () => {
        it('should handle undefined swaggerPaths', () => {
            expect(utils.extractPaths(undefined)).toEqual([]);
        });

        // New test for QUERY method support
        it('should extract the QUERY method from paths', () => {
            const swaggerPaths = {
                '/search': {
                    query: { // 'query' is now a recognized method in OAS 3.2
                        operationId: 'querySearch',
                        responses: { '200': { description: 'ok' } }
                    }
                }
            };
            // Cast to any because standard Swagger types don't include 'query' yet
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            expect(pathInfo).toBeDefined();
            expect(pathInfo.method).toBe('QUERY');
            expect(pathInfo.operationId).toBe('querySearch');
        });

        it('should handle operations with no request body or body param', () => {
            const paths = utils.extractPaths(branchCoverageSpec.paths as any);
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

        it('should copy "content" property (OAS 3.x) to the normalized parameter', () => {
            const swaggerPaths = {
                '/test': {
                    get: {
                        operationId: 'getWithContent',
                        parameters: [
                            {
                                name: 'filter',
                                in: 'query',
                                content: {
                                    'application/json': {
                                        schema: { type: 'object', properties: { a: { type: 'string' } } }
                                    }
                                }
                            }
                        ],
                        responses: { '200': { description: 'ok' } }
                    }
                }
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            const param = pathInfo.parameters![0];
            expect(param.content).toBeDefined();
            expect(param.content!['application/json']).toBeDefined();
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

        it('should extract swagger 2.0 response headers', () => {
            const swaggerPaths = {
                '/headers': {
                    get: {
                        responses: {
                            '200': {
                                description: 'ok',
                                headers: {
                                    'X-Rate-Limit': { type: 'integer' }
                                }
                            }
                        }
                    }
                }
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            const headers = pathInfo.responses!['200'].headers;
            expect(headers).toBeDefined();
            expect(headers!['X-Rate-Limit']).toHaveProperty('type', 'integer');
        });

        it('should handle responses with non-json content', () => {
            const paths = utils.extractPaths(branchCoverageSpec.paths as any);
            const op = paths.find(p => p.operationId === 'getNoBody');
            expect(op).toBeDefined();
            expect(op!.responses!['200'].content!['text/plain'].schema).toEqual({ type: 'string' });
        });

        it('should process operations with Swagger 2.0 params and no responses object', () => {
            const swaggerPaths = {
                '/test': {
                    get: {
                        operationId: 'getTest',
                        tags: ['Test'],
                        parameters: [
                            // Swagger 2.0 style param without 'schema' key
                            { name: 'limit', in: 'query', type: 'integer', format: 'int32' },
                            // Param without 'required' or 'description'
                            { name: 'offset', in: 'query', type: 'integer' },
                        ],
                        // No 'responses' object at all
                    },
                },
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            expect(pathInfo).toBeDefined();
            expect(pathInfo.operationId).toBe('getTest');
            expect(pathInfo.responses).toEqual({});
            expect(pathInfo.parameters).toHaveLength(2);

            const limitParam = pathInfo.parameters!.find(p => p.name === 'limit')!;
            expect(limitParam.schema).toEqual({ type: 'integer', format: 'int32', items: undefined });
            expect(limitParam).not.toHaveProperty('required');
            expect(limitParam).not.toHaveProperty('description');

            const offsetParam = pathInfo.parameters!.find(p => p.name === 'offset')!;
            expect(offsetParam.schema).toEqual({ type: 'integer', format: undefined, items: undefined });
        });

        it('should extract security overrides', () => {
            const swaggerPaths = {
                '/secure-override': {
                    get: {
                        security: [], // Explicit override
                        responses: {}
                    }
                },
                '/secure-default': {
                    get: {
                        // Implicitly inherits global security
                        responses: {}
                    }
                }
            } as any;
            const paths = utils.extractPaths(swaggerPaths);
            const overrideOp = paths.find(p => p.path === '/secure-override');
            const defaultOp = paths.find(p => p.path === '/secure-default');

            expect(overrideOp?.security).toEqual([]);
            expect(defaultOp?.security).toBeUndefined();
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
