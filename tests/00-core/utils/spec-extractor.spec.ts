import { describe, expect, it } from 'vitest';

import * as utils from '@src/core/utils/spec-extractor.js';

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

        it('should extract the QUERY method from paths (OAS 3.2)', () => {
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

        it('should extract "additionalOperations" (OAS 3.2)', () => {
            const swaggerPaths = {
                '/resource': {
                    additionalOperations: {
                        COPY: {
                            operationId: 'copyResource',
                            responses: { '200': { description: 'Copied' } }
                        }
                    }
                }
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            expect(pathInfo).toBeDefined();
            expect(pathInfo.method).toBe('COPY');
            expect(pathInfo.operationId).toBe('copyResource');
        });

        it('should normalize Security Requirement keys defined as URI pointers', () => {
            const swaggerPaths = {
                '/secure': {
                    get: {
                        operationId: 'getSecure',
                        security: [{ '#/components/securitySchemes/MyAuth': ['read:scope'] }],
                        responses: {}
                    }
                }
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);

            expect(pathInfo.security).toBeDefined();
            expect(pathInfo.security![0]).toHaveProperty('MyAuth');
            expect(pathInfo.security![0]['MyAuth']).toEqual(['read:scope']);
        });

        it('should extract and merge Path Item $ref properties', () => {
            const resolveRef = (ref: string) => {
                if (ref === '#/components/pathItems/StandardOp') {
                    return {
                        summary: 'Original Summary',
                        get: { operationId: 'getStandard', responses: {} }
                    };
                }
                return undefined;
            };

            const swaggerPaths = {
                '/merged': {
                    $ref: '#/components/pathItems/StandardOp',
                    summary: 'Overridden Summary',
                    description: 'New Description'
                }
            };

            const [pathInfo] = utils.extractPaths(swaggerPaths as any, resolveRef as any);

            expect(pathInfo).toBeDefined();
            expect(pathInfo.summary).toBe('Overridden Summary');
            expect(pathInfo.description).toBe('New Description');
            expect(pathInfo.operationId).toBe('getStandard');
        });

        it('should handle path items with no top-level parameters', () => {
            const swaggerPaths = {
                '/test': { get: { operationId: 'test', responses: {} } } // No 'parameters' key on the path item
            };
            const paths = utils.extractPaths(swaggerPaths as any);
            expect(paths.length).toBe(1);
            expect(paths[0].parameters).toEqual([]); // Should default to empty array
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

        it('should normalize Swagger 2.0 collectionFormat for "ssv" and "pipes"', () => {
            const swaggerPaths = {
                '/s2-formats': {
                    get: {
                        parameters: [
                            {
                                name: 'ssv',
                                in: 'query',
                                type: 'array',
                                items: { type: 'string' },
                                collectionFormat: 'ssv'
                            },
                            {
                                name: 'pipes',
                                in: 'query',
                                type: 'array',
                                items: { type: 'string' },
                                collectionFormat: 'pipes'
                            }
                        ]
                    }
                }
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);
            const ssvParam = pathInfo.parameters!.find(p => p.name === 'ssv');
            const pipesParam = pathInfo.parameters!.find(p => p.name === 'pipes');

            expect(ssvParam?.style).toBe('spaceDelimited');
            expect(ssvParam?.explode).toBe(false);
            expect(pipesParam?.style).toBe('pipeDelimited');
            expect(pipesParam?.explode).toBe(false);
        });
    });
});
