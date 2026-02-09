import { describe, expect, it } from 'vitest';

import * as utils from '@src/core/utils/spec-extractor.js';
import { SwaggerDefinition } from '@src/core/types/index.js';

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
                        parameters: [{ name: 'body', in: 'body', schema: { type: 'string' } }],
                    },
                },
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
                        parameters: [{ name: 'ignored', in: 'body', schema: { type: 'string' } }],
                    },
                },
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            // Should use the requestBody definition
            expect(pathInfo.requestBody?.content?.['text/plain'].schema).toEqual({ type: 'number' });
        });

        it('should extract the QUERY method', () => {
            const swaggerPaths = {
                '/search': { query: { operationId: 'querySearch', responses: { '200': {} } } },
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            expect(pathInfo.method).toBe('QUERY');
        });

        it('should extract additionalOperations (OAS 3.2)', () => {
            const swaggerPaths = {
                '/res': { additionalOperations: { LOCK: { operationId: 'lock', responses: {} } } },
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
                        responses: {},
                    },
                },
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            expect(pathInfo.security![0]).toHaveProperty('MyAuth');
        });

        it('should NOT normalize security pointers if key matches a component name (OAS 3.2 Precedence)', () => {
            // Case: Security scheme named "http://auth.com" exists in components.
            // The security requirement key matches this exact name.
            // It should NOT be normalized (split by /), preserving the URI-like name as the key.
            const swaggerPaths = {
                '/secure': {
                    get: {
                        security: [{ 'http://auth.com': [] }],
                        responses: {},
                    },
                },
            };
            const components = {
                securitySchemes: {
                    'http://auth.com': { type: 'http', scheme: 'basic' },
                },
            };

            const [pathInfo] = utils.extractPaths(swaggerPaths as any, undefined, components as any);

            expect(pathInfo.security).toBeDefined();
            // Should have preserved the key exactly
            expect(pathInfo.security![0]).toHaveProperty('http://auth.com');
            // Should NOT have normalized it to 'auth.com' or similar
            expect(Object.keys(pathInfo.security![0])[0]).toBe('http://auth.com');
        });

        it('should merge Path Item $ref properties', () => {
            const resolveRef = (ref: string) => {
                if (ref === 'Target') return { summary: 'Base', get: { responses: {} } };
                return undefined;
            };
            const swaggerPaths = {
                '/p': { $ref: 'Target', summary: 'Override' },
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
                            { name: 'm', in: 'query', collectionFormat: 'multi' },
                        ],
                        responses: {},
                    },
                },
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
                        parameters: [
                            {
                                name: 'q',
                                in: 'query',
                                content: { 'application/json': { schema: { type: 'string' } } },
                            },
                        ],
                        responses: {},
                    },
                },
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            expect(pathInfo.parameters![0].schema).toEqual({ type: 'string' });
        });

        it('should construct schema from flat parameter properties if schema is missing', () => {
            const swaggerPaths = {
                '/flat': {
                    get: {
                        parameters: [
                            {
                                name: 'q',
                                in: 'query',
                                type: 'array',
                                items: { type: 'string' },
                                format: 'uuid',
                            },
                        ],
                        responses: {},
                    },
                },
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
                                headers: { X: { type: 'string' } },
                            },
                        },
                    },
                },
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
                        responses: { '200': { description: 'ok' } },
                    },
                },
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
                        parameters: [
                            {
                                name: 'param',
                                in: 'query',
                                schema: { type: 'string' },
                                'x-custom-param': 'param-value',
                            },
                        ],
                        responses: { '200': { description: 'OK' } },
                    },
                },
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            expect((pathInfo as any)['x-custom-op']).toBe('op-value');
            expect((pathInfo.parameters![0] as any)['x-custom-param']).toBe('param-value');
        });

        it('should merge path-level and operation-level parameters and preserve flags', () => {
            const swaggerPaths = {
                '/items/{id}': {
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            schema: { type: 'string' },
                            description: 'Path id',
                        },
                    ],
                    get: {
                        parameters: [
                            {
                                name: 'filter',
                                in: 'query',
                                schema: { type: 'string' },
                                allowReserved: true,
                                allowEmptyValue: true,
                            },
                        ],
                        responses: {},
                    },
                },
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            const idParam = pathInfo.parameters!.find(p => p.name === 'id')!;
            const filterParam = pathInfo.parameters!.find(p => p.name === 'filter')!;

            expect(idParam.description).toBe('Path id');
            expect(filterParam.allowReserved).toBe(true);
            expect(filterParam.allowEmptyValue).toBe(true);
        });

        it('should tolerate non-array path parameters and use path-level description fallback', () => {
            const swaggerPaths = {
                '/desc': {
                    parameters: null,
                    description: 'Path description',
                    get: { responses: {} },
                },
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            expect(pathInfo.description).toBe('Path description');
        });

        it('should include externalDocs when provided on operation', () => {
            const swaggerPaths = {
                '/docs': {
                    get: {
                        operationId: 'getDocs',
                        externalDocs: { url: 'https://example.com', description: 'More docs' },
                        responses: {},
                    },
                },
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            expect(pathInfo.externalDocs?.url).toBe('https://example.com');
        });

        it('should ignore undefined parameters and apply default explode rules', () => {
            const swaggerPaths = {
                '/mix': {
                    parameters: [undefined, { name: 'shared', in: 'query', schema: { type: 'string' } }],
                    get: {
                        parameters: [null, { name: 'op', in: 'query', schema: { type: 'string' }, style: 'form' }],
                        responses: {},
                    },
                },
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            const opParam = pathInfo.parameters!.find(p => p.name === 'op');
            expect(opParam?.explode).toBe(true);
        });

        it('should preserve explicit explode values when provided', () => {
            const swaggerPaths = {
                '/explode': {
                    get: {
                        parameters: [
                            {
                                name: 'q',
                                in: 'query',
                                explode: false,
                                schema: { type: 'string' },
                            },
                        ],
                        responses: {},
                    },
                },
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            expect(pathInfo.parameters![0].explode).toBe(false);
        });
    });
});
