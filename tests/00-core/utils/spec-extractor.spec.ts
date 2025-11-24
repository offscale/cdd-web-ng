import { describe, expect, it } from 'vitest';
import * as utils from '@src/core/utils/spec-extractor.js';
import { branchCoverageSpec } from '../../shared/specs.js';

describe('Core Utils: Spec Extractor', () => {
    describe('extractPaths', () => {
        it('should handle empty paths object', () => {
            const paths = utils.extractPaths({});
            expect(paths).toEqual([]);
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
    });
});
