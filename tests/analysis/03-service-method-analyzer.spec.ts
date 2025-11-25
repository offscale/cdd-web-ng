import { describe, expect, it } from 'vitest';
import { ServiceMethodAnalyzer } from '@src/analysis/service-method-analyzer.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, PathInfo } from '@src/core/types/index.js';

describe('Analysis: ServiceMethodAnalyzer', () => {

    /**
     * Helper to create a test environment with a spec.
     * @param spec The OpenAPI specification object.
     * @returns An initialized ServiceMethodAnalyzer instance.
     */
    const setupAnalyzer = (spec: any) => {
        const config: GeneratorConfig = { input: '', output: '', options: {} };
        const parser = new SwaggerParser(spec, config);
        const analyzer = new ServiceMethodAnalyzer(config, parser);
        return { analyzer, parser };
    };

    it('should use operation-level server override and resolve variables', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            servers: [{ url: 'https://global.api.com' }],
            paths: {
                '/test': {
                    get: {
                        operationId: 'testOp',
                        servers: [
                            {
                                url: 'https://{env}.specific.api.com/v1',
                                variables: {
                                    env: { default: 'prod' }
                                }
                            }
                        ],
                        responses: { '200': { description: 'OK' } }
                    }
                }
            }
        };

        const { analyzer } = setupAnalyzer(spec);
        const operation: PathInfo = {
            ...spec.paths['/test'].get,
            path: '/test',
            method: 'GET',
            methodName: 'testOp'
        } as PathInfo;

        const model = analyzer.analyze(operation);

        expect(model).toBeDefined();
        // This covers the logic on lines 71-72
        expect(model?.hasServers).toBe(true);
        expect(model?.basePath).toBe('https://prod.specific.api.com/v1');
    });

    it('should mark method as deprecated and add @deprecated tag to docs', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/old': {
                    get: {
                        operationId: 'getOld',
                        deprecated: true,
                        summary: 'An old operation.',
                        responses: { '200': { description: 'OK' } }
                    }
                }
            }
        };

        const { analyzer } = setupAnalyzer(spec);
        const operation: PathInfo = {
            ...spec.paths['/old'].get,
            path: '/old',
            method: 'GET',
            methodName: 'getOld'
        } as PathInfo;
        const model = analyzer.analyze(operation);

        // This covers the logic on line 81
        expect(model?.isDeprecated).toBe(true);
        expect(model?.docs).toContain('@deprecated');
    });

    it('should correctly parse advanced XML config properties (prefix, namespace, nodeType)', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/xml': {
                    post: {
                        operationId: 'postXml',
                        requestBody: {
                            content: {
                                'application/xml': {
                                    schema: {
                                        type: 'object',
                                        xml: {
                                            name: 'Root',
                                            prefix: 'api',
                                            namespace: 'http://api.example.com/schema',
                                            nodeType: 'element'
                                        },
                                        properties: {
                                            name: { type: 'string' }
                                        }
                                    }
                                }
                            }
                        },
                        responses: { '200': { description: 'OK' } }
                    }
                }
            }
        };
        const { analyzer } = setupAnalyzer(spec);
        const operation: PathInfo = {
            ...spec.paths['/xml'].post,
            path: '/xml',
            method: 'POST',
            methodName: 'postXml'
        } as PathInfo;

        const model = analyzer.analyze(operation);
        expect(model?.body?.type).toBe('xml');

        if (model?.body?.type === 'xml') {
            const xmlConfig = model.body.config;
            // This covers the previously uncovered branches in the private `getXmlConfig` method
            expect(xmlConfig.prefix).toBe('api');
            expect(xmlConfig.namespace).toBe('http://api.example.com/schema');
            expect(xmlConfig.nodeType).toBe('element');
        } else {
            // Fail the test explicitly if the body type is not XML
            expect.fail('Expected body type to be "xml"');
        }
    });
});
