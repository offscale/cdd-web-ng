import { describe, expect, it } from 'vitest';
import * as utils from '@src/core/utils/spec-extractor.js';
import { SwaggerDefinition } from "@src/core/types/index.js";

describe('Core Utils: Spec Extractor', () => {
    describe('extractPaths', () => {
        it('should return empty array for an undefined or empty paths object', () => {
            expect(utils.extractPaths(undefined)).toEqual([]);
            expect(utils.extractPaths({})).toEqual([]);
        });

        it('should extract Swagger 2.0 body parameters correctly', () => {
            const swaggerPaths = {
                '/test': {
                    post: {
                        responses: {},
                        parameters: [{ name: 'body', in: 'body', schema: { type: 'string' } }]
                    }
                }
            };
            const paths = utils.extractPaths(swaggerPaths as any);
            expect(paths.length).toBe(1);
            expect(paths[0].requestBody).toBeDefined();
            expect(paths[0].requestBody?.content?.['application/json'].schema).toEqual({ type: 'string' });
        });

        it('should prefer explicit requestBody over body parameter if both exist (OAS 3 priority)', () => {
            const swaggerPaths = {
                '/conflict': {
                    post: {
                        responses: {},
                        requestBody: { content: { 'text/plain': { schema: { type: 'number' } } } },
                        // Legacy body param should be ignored if requestBody is present in OAS 3
                        parameters: [{ name: 'ignored', in: 'body', schema: { type: 'string' } }]
                    }
                }
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            // Should use the requestBody definition
            expect(pathInfo.requestBody?.content?.['text/plain'].schema).toEqual({ type: 'number' });
        });

        it('should extract the QUERY method', () => {
            const swaggerPaths = {
                '/search': { query: { operationId: 'querySearch', responses: { '200': {} } } }
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            expect(pathInfo.method).toBe('QUERY');
        });

        it('should extract additionalOperations (OAS 3.2)', () => {
            const swaggerPaths = {
                '/res': { additionalOperations: { LOCK: { operationId: 'lock', responses: {} } } }
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            expect(pathInfo.method).toBe('LOCK');
        });

        it('should normalize security pointers', () => {
            const swaggerPaths = {
                '/sec': {
                    get: {
                        operationId: 'getSec',
                        security: [{ '#/components/securitySchemes/MyAuth': ['scope'] }],
                        responses: {}
                    }
                }
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            expect(pathInfo.security![0]).toHaveProperty('MyAuth');
        });

        it('should merge Path Item $ref properties', () => {
            const resolveRef = (ref: string) => {
                if (ref === 'Target') return { summary: 'Base', get: { responses: {} } };
                return undefined;
            };
            const swaggerPaths = {
                '/p': { $ref: 'Target', summary: 'Override' }
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any, resolveRef as any);
            expect(pathInfo.summary).toBe('Override');
        });

        it('should normalize Swagger 2.0 collectionFormat variants', () => {
            const swaggerPaths = {
                '/coll': {
                    get: {
                        parameters: [
                            { name: 'c', in: 'query', collectionFormat: 'csv' },
                            { name: 's', in: 'query', collectionFormat: 'ssv' },
                            { name: 'p', in: 'query', collectionFormat: 'pipes' },
                            { name: 'm', in: 'query', collectionFormat: 'multi' }
                        ],
                        responses: {}
                    }
                }
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            const ps = pathInfo.parameters!;

            expect(ps.find(p => p.name === 'c')?.style).toBe('form');
            expect(ps.find(p => p.name === 'c')?.explode).toBe(false);

            expect(ps.find(p => p.name === 's')?.style).toBe('spaceDelimited');

            expect(ps.find(p => p.name === 'p')?.style).toBe('pipeDelimited');

            expect(ps.find(p => p.name === 'm')?.style).toBe('form');
            expect(ps.find(p => p.name === 'm')?.explode).toBe(true);
        });

        it('should handle parameters with content instead of schema (OAS 3)', () => {
            const swaggerPaths = {
                '/deep': {
                    get: {
                        parameters: [{
                            name: 'q', in: 'query',
                            content: { 'application/json': { schema: { type: 'string' } } }
                        }],
                        responses: {}
                    }
                }
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            expect(pathInfo.parameters![0].schema).toEqual({ type: 'string' });
        });

        it('should construct schema from flat parameter properties if schema is missing', () => {
            const swaggerPaths = {
                '/flat': {
                    get: {
                        parameters: [{
                            name: 'q', in: 'query',
                            type: 'array',
                            items: { type: 'string' },
                            format: 'uuid'
                        }],
                        responses: {}
                    }
                }
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            const schema = pathInfo.parameters![0].schema;
            expect(schema).toBeDefined();
            const schema0: SwaggerDefinition = schema as SwaggerDefinition;
            expect(schema0.type).toBe('array');
            expect((schema0!.items as any).type).toBe('string');
            expect(schema0!.format).toBe('uuid');
        });

        it('should handle Swagger 2.0 Response wrapper objects', () => {
            const swaggerPaths = {
                '/resp': {
                    get: {
                        responses: {
                            '200': {
                                description: 'OK',
                                schema: { type: 'string' },
                                headers: { X: { type: 'string' } }
                            }
                        }
                    }
                }
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            expect(pathInfo).toBeDefined();
            const resp = pathInfo.responses!['200'];
            // Swagger 2 response schema moves to content.application/json.schema
            expect(resp.content?.['application/json'].schema).toEqual({ type: 'string' });
            expect(resp.headers!['X']).toBeDefined();
        });

        it('should extract the QUERY method from paths (OAS 3.2)', () => {
            // Redundant check kept for regression/completeness from prior files
            const swaggerPaths = {
                '/search': {
                    query: {
                        operationId: 'querySearch',
                        responses: { '200': { description: 'ok' } }
                    }
                }
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            expect(pathInfo).toBeDefined();
            expect(pathInfo.method).toBe('QUERY');
            expect(pathInfo.operationId).toBe('querySearch');
        });

        it('should propagate x- properties on operations and parameters', () => {
            const swaggerPaths = {
                '/test': {
                    get: {
                        operationId: 'getTest',
                        'x-custom-op': 'op-value',
                        parameters: [{
                            name: 'param',
                            in: 'query',
                            schema: { type: 'string' },
                            'x-custom-param': 'param-value'
                        }],
                        responses: { '200': { description: 'OK' } }
                    }
                }
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            expect((pathInfo as any)['x-custom-op']).toBe('op-value');
            expect((pathInfo.parameters![0] as any)['x-custom-param']).toBe('param-value');
        });
    });
});
