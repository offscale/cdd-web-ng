import { describe, expect, it } from 'vitest';
import { ServiceMethodAnalyzer } from '@src/analysis/service-method-analyzer.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, PathInfo } from '@src/core/types/index.js';

describe('Analysis: ServiceMethodAnalyzer', () => {

    const setupAnalyzer = (spec: any) => {
        const config: GeneratorConfig = { input: '', output: '', options: {} };
        const parser = new SwaggerParser(spec, config);
        const analyzer = new ServiceMethodAnalyzer(config, parser);
        return { analyzer, parser };
    };

    it('should return null if operation has no methodName', () => {
        const { analyzer } = setupAnalyzer({ openapi: '3.0.0', info: { title: 'T', version: '1' }, paths: {} });
        // @ts-ignore forcing incorrect input
        const model = analyzer.analyze({ method: 'get', path: '/test' });
        expect(model).toBeNull();
    });

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
                                variables: { env: { default: 'prod' } }
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

        expect(model?.isDeprecated).toBe(true);
        expect(model?.docs).toContain('@deprecated');
    });

    it('should correctly parse advanced XML config properties and stop at depth limit', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            components: {
                schemas: {
                    Node: {
                        type: 'object',
                        xml: { name: 'node' },
                        properties: {
                            child: { $ref: '#/components/schemas/Node' }
                        }
                    }
                }
            },
            paths: {
                '/xml': {
                    post: {
                        operationId: 'postXml',
                        requestBody: {
                            content: {
                                'application/xml': {
                                    schema: { $ref: '#/components/schemas/Node' }
                                }
                            }
                        },
                        responses: { '200': {} }
                    }
                }
            }
        };
        const { analyzer } = setupAnalyzer(spec);
        const operation = {
            ...spec.paths['/xml'].post,
            path: '/xml',
            method: 'POST',
            methodName: 'postXml'
        } as PathInfo;

        const model = analyzer.analyze(operation);
        expect(model?.body?.type).toBe('xml');

        if (model?.body?.type === 'xml') {
            const config = model.body.config;
            // Ref should default to 'none'
            expect(config.nodeType).toBe('none');
            // Should exist for a few levels deep
            expect(config.properties.child).toBeDefined();
            expect(config.properties.child.properties.child).toBeDefined();
        }
    });

    it('should handle various JSON content types detection', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/test': {
                    get: {
                        // Parameter with various content types
                        parameters: [
                            { name: 'a', in: 'query', content: { 'application/json': {} } }, // Standard
                            { name: 'b', in: 'query', content: { 'application/json; charset=utf-8': {} } }, // JSON compatible subtype
                            { name: 'c', in: 'query', content: { '*/*': {} } } // Wildcard
                        ],
                        responses: {}
                    }
                }
            }
        };
        const { analyzer } = setupAnalyzer(spec);
        const op = { ...spec.paths['/test'].get, method: 'GET', path: '/test', methodName: 'test' } as PathInfo;
        const model = analyzer.analyze(op);

        const pA = model?.queryParams.find(p => p.originalName === 'a');
        const pB = model?.queryParams.find(p => p.originalName === 'b');
        const pC = model?.queryParams.find(p => p.originalName === 'c');

        expect(pA?.serializationLink).toBe('json');
        expect(pB?.serializationLink).toBe('json');
        expect(pC?.serializationLink).toBe('json');
    });

    it('should merge XML configuration from allOf schemas', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'XML allOf', version: '1.0' },
            components: {
                schemas: {
                    Base: {
                        type: 'object',
                        properties: { id: { type: 'string', xml: { attribute: true } } }
                    },
                    Extended: {
                        allOf: [
                            { $ref: '#/components/schemas/Base' },
                            // Add local XML config to ensure it is picked up by getXmlConfig
                            { type: 'object', properties: { name: { type: 'string', xml: { attribute: true } } } }
                        ],
                        xml: { name: 'Extended' }
                    }
                }
            },
            paths: {
                '/xml-allof': {
                    post: {
                        operationId: 'postXmlAllOf',
                        requestBody: {
                            content: {
                                'application/xml': {
                                    schema: { $ref: '#/components/schemas/Extended' }
                                }
                            }
                        },
                        responses: { '200': {} }
                    }
                }
            }
        };
        const { analyzer } = setupAnalyzer(spec);
        const operation = {
            ...spec.paths['/xml-allof'].post,
            path: '/xml-allof',
            method: 'POST',
            methodName: 'postXmlAllOf'
        } as PathInfo;

        const model = analyzer.analyze(operation);
        expect(model?.body?.type).toBe('xml');

        if (model?.body?.type === 'xml') {
            const config = model.body.config;
            // Should include properties from Base (via allOf)
            expect(config.properties.id).toBeDefined();
            expect(config.properties.id.attribute).toBe(true);
            // Should include local properties
            expect(config.properties.name).toBeDefined();
        }
    });

    // Test for line 267: Unresolved ref in getXmlConfig
    it('should return empty config for unresolvable schema ref', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: {},
            components: { schemas: { Broken: { $ref: '#/missing' } } }
        };
        const { analyzer } = setupAnalyzer(spec);
        // Using private/internal method via cast to test specific logic
        const config = (analyzer as any).getXmlConfig({ $ref: '#/missing' }, 5);
        expect(config).toEqual({});
    });

    // Test for line 81: Legacy fallback request schema
    it('should use request body schema type as fallback return type (legacy behavior)', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Legacy', version: '1.0' },
            paths: {
                '/echo': {
                    post: {
                        methodName: 'echo',
                        // No responses defined
                        responses: {},
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: { type: 'string' }
                                }
                            }
                        }
                    }
                }
            }
        };
        const { analyzer } = setupAnalyzer(spec);
        const op = { ...spec.paths['/echo'].post, path: '/echo', method: 'POST' } as any;
        const model = analyzer.analyze(op);

        // The fallback logic sees no valid response code, checks requestBody schema, sees 'string'.
        expect(model?.responseType).toBe('string');
    });

    // Test for line ~135: unknown/any content type
    it('should prioritize application/json but handle unknown content type with schema', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/post': {
                    post: {
                        methodName: 'post',
                        requestBody: {
                            content: {
                                'application/vnd.custom+json': {
                                    schema: { type: 'integer' }
                                }
                            }
                        },
                        responses: {}
                    }
                }
            }
        };
        const { analyzer } = setupAnalyzer(spec);
        const op = { ...spec.paths['/post'].post, path: '/post', method: 'POST' } as any;
        const model = analyzer.analyze(op);

        // Should pick up the integer schema from the custom content type
        const bodyParam = model?.parameters.find(p => p.name === 'body');
        expect(bodyParam?.type).toBe('number');
    });

    // Test for XML array config (line 243)
    it('should handle XML array config (items)', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'XML Array', version: '1.0' },
            paths: {},
            components: {
                schemas: {
                    List: {
                        type: 'array',
                        xml: { wrapped: true },
                        items: {
                            type: 'string',
                            xml: { name: 'Item' }
                        }
                    }
                }
            }
        };
        const { analyzer } = setupAnalyzer(spec);
        const schema = spec.components.schemas.List;

        // Public analyze() would trigger this via post/response, testing logic directly here
        const config = (analyzer as any).getXmlConfig(schema, 5);

        expect(config.wrapped).toBe(true);
        expect(config.items).toBeDefined();
        expect(config.items.name).toBe('Item');
    });

    // Test for XML extended fields (namespace, prefix, etc)
    it('should extract advanced XML attributes', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'XML Adv', version: '1.0' },
            paths: {},
            components: {
                schemas: {
                    Adv: {
                        type: 'object',
                        xml: {
                            prefix: 'ex',
                            namespace: 'http://example.com',
                            nodeType: 'element'
                        }
                    }
                }
            }
        };
        const { analyzer } = setupAnalyzer(spec);
        const config = (analyzer as any).getXmlConfig(spec.components.schemas.Adv, 5);

        expect(config.prefix).toBe('ex');
        expect(config.namespace).toBe('http://example.com');
        expect(config.nodeType).toBe('element');
    });

    it('should infer correct default XML nodeTypes per OAS 3.2', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'XML Defaults', version: '1.0' },
            components: {
                schemas: {
                    Target: { type: 'string', xml: { name: 'Target' } },
                    RefWrapper: { $ref: '#/components/schemas/Target' },
                    ArrayWrapper: { type: 'array', items: { type: 'string' } },
                    StandardObject: { type: 'object', properties: { a: { type: 'string' } } },
                    LegacyWrapped: { type: 'array', items: { type: 'string' }, xml: { wrapped: true } }
                }
            }
        };
        const { analyzer } = setupAnalyzer(spec);

        // 1. Reference Wrapper -> Should default to 'none'
        // We pass the wrapper directly (mimicking usage in a property or root)
        const refConfig = (analyzer as any).getXmlConfig({ $ref: '#/components/schemas/Target' }, 5);
        expect(refConfig.nodeType).toBe('none');

        // 2. Array -> Should default to 'none'
        const arrayConfig = (analyzer as any).getXmlConfig(spec.components.schemas.ArrayWrapper, 5);
        expect(arrayConfig.nodeType).toBe('none');

        // 3. Standard Object -> Should default to 'element'
        const objConfig = (analyzer as any).getXmlConfig(spec.components.schemas.StandardObject, 5);
        expect(objConfig.nodeType).toBe('element');

        // 4. Legacy Wrapped Array -> Should default to 'element'
        const wrappedConfig = (analyzer as any).getXmlConfig(spec.components.schemas.LegacyWrapped, 5);
        expect(wrappedConfig.nodeType).toBe('element');
    });
});
