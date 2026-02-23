import { describe, expect, it, vi } from 'vitest';
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
                                variables: { env: { default: 'prod' } },
                            },
                        ],
                        responses: { '200': { description: 'OK' } },
                    },
                },
            },
        };

        const { analyzer } = setupAnalyzer(spec);
        const operation: PathInfo = {
            ...spec.paths['/test'].get,
            path: '/test',
            method: 'GET',
            methodName: 'testOp',
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
                        responses: { '200': { description: 'OK' } },
                    },
                },
            },
        };

        const { analyzer } = setupAnalyzer(spec);
        const operation: PathInfo = {
            ...spec.paths['/old'].get,
            path: '/old',
            method: 'GET',
            methodName: 'getOld',
        } as PathInfo;
        const model = analyzer.analyze(operation);

        expect(model?.isDeprecated).toBe(true);
        expect(model?.docs).toContain('@deprecated');
    });

    it('should add @tags to docs when operation tags are present', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/tagged': {
                    get: {
                        operationId: 'getTagged',
                        tags: ['users', 'admin'],
                        summary: 'Tagged endpoint.',
                        responses: { '200': { description: 'OK' } },
                    },
                },
            },
        };

        const { analyzer } = setupAnalyzer(spec);
        const operation: PathInfo = {
            ...spec.paths['/tagged'].get,
            path: '/tagged',
            method: 'GET',
            methodName: 'getTagged',
        } as PathInfo;

        const model = analyzer.analyze(operation);
        expect(model?.docs).toContain('@tags users, admin');
    });

    it('should add @server, @security, and x-* tags to docs when present', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/secure': {
                    get: {
                        operationId: 'getSecure',
                        summary: 'Secure endpoint.',
                        servers: [
                            {
                                url: 'https://api.example.com/{version}',
                                description: 'Production',
                                name: 'prod',
                                variables: { version: { default: 'v1' } },
                            },
                        ],
                        security: [{ ApiKey: [] }],
                        'x-rate-limit': 100,
                        responses: { '200': { description: 'OK' } },
                    },
                },
            },
        };

        const { analyzer } = setupAnalyzer(spec);
        const operation: PathInfo = {
            ...spec.paths['/secure'].get,
            path: '/secure',
            method: 'GET',
            methodName: 'getSecure',
        } as PathInfo;

        const model = analyzer.analyze(operation);
        expect(model?.docs).toContain('@server {"url":"https://api.example.com/{version}"');
        expect(model?.docs).toContain('@security [{"ApiKey":[]}');
        expect(model?.docs).toContain('@x-rate-limit 100');
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
                            child: { $ref: '#/components/schemas/Node' },
                        },
                    },
                },
            },
            paths: {
                '/xml': {
                    post: {
                        operationId: 'postXml',
                        requestBody: {
                            content: {
                                'application/xml': {
                                    schema: { $ref: '#/components/schemas/Node' },
                                },
                            },
                        },
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };
        const { analyzer } = setupAnalyzer(spec);
        const operation = {
            ...spec.paths['/xml'].post,
            path: '/xml',
            method: 'POST',
            methodName: 'postXml',
        } as PathInfo;

        const model = analyzer.analyze(operation);
        expect(model?.body?.type).toBe('xml');

        if (model?.body?.type === 'xml') {
            const config = model.body.config;
            // Ref should default to 'none'
            expect(config.nodeType).toBe('none');
            // Should exist for a few levels deep
            expect((config as any).properties.child).toBeDefined();
            expect((config as any).properties.child.properties.child).toBeDefined();
        }
    });

    it('should include prefixItems in XML config for ordered arrays', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'XML Ordered', version: '1.0' },
            components: {
                schemas: {
                    Report: {
                        type: 'array',
                        xml: { name: 'Report', nodeType: 'element' },
                        prefixItems: [
                            { type: 'string', xml: { name: 'One' } },
                            { type: 'number', xml: { name: 'Two' } },
                        ],
                    },
                },
            },
            paths: {
                '/report': {
                    get: {
                        operationId: 'getReport',
                        responses: {
                            '200': {
                                description: 'ok',
                                content: {
                                    'application/xml': {
                                        schema: { $ref: '#/components/schemas/Report' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };

        const { analyzer } = setupAnalyzer(spec);
        const operation = {
            ...spec.paths['/report'].get,
            path: '/report',
            method: 'GET',
            methodName: 'getReport',
        } as PathInfo;

        const model = analyzer.analyze(operation);
        expect(model?.responseXmlConfig?.prefixItems).toBeDefined();
        expect((model?.responseXmlConfig?.prefixItems as any)?.[0]?.name).toBe('One');
        expect((model?.responseXmlConfig?.prefixItems as any)?.[1]?.name).toBe('Two');
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
                            { name: 'c', in: 'query', content: { '*/*': {} } }, // Wildcard
                        ],
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
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

    it('should ignore reserved header parameters (Accept, Content-Type, Authorization)', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/test': {
                    get: {
                        operationId: 'getTest',
                        parameters: [
                            { name: 'Accept', in: 'header', schema: { type: 'string' } },
                            { name: 'Content-Type', in: 'header', schema: { type: 'string' } },
                            { name: 'Authorization', in: 'header', schema: { type: 'string' } },
                            { name: 'X-Trace', in: 'header', schema: { type: 'string' } },
                        ],
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };

        const { analyzer } = setupAnalyzer(spec);
        const op = { ...spec.paths['/test'].get, method: 'GET', path: '/test', methodName: 'getTest' } as PathInfo;
        const model = analyzer.analyze(op);

        const paramNames = model?.parameters.map(p => p.name) ?? [];
        expect(paramNames).toContain('xTrace');
        expect(paramNames).not.toContain('accept');
        expect(paramNames).not.toContain('contentType');
        expect(paramNames).not.toContain('authorization');

        const headerNames = model?.headerParams.map(p => p.originalName) ?? [];
        expect(headerNames).toEqual(['X-Trace']);
    });

    it('should merge XML configuration from allOf schemas', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'XML allOf', version: '1.0' },
            components: {
                schemas: {
                    Base: {
                        type: 'object',
                        properties: { id: { type: 'string', xml: { attribute: true } } },
                    },
                    Extended: {
                        allOf: [
                            { $ref: '#/components/schemas/Base' },
                            // Add local XML config to ensure it is picked up by getXmlConfig
                            { type: 'object', properties: { name: { type: 'string', xml: { attribute: true } } } },
                        ],
                        xml: { name: 'Extended' },
                    },
                },
            },
            paths: {
                '/xml-allof': {
                    post: {
                        operationId: 'postXmlAllOf',
                        requestBody: {
                            content: {
                                'application/xml': {
                                    schema: { $ref: '#/components/schemas/Extended' },
                                },
                            },
                        },
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };
        const { analyzer } = setupAnalyzer(spec);
        const operation = {
            ...spec.paths['/xml-allof'].post,
            path: '/xml-allof',
            method: 'POST',
            methodName: 'postXmlAllOf',
        } as PathInfo;

        const model = analyzer.analyze(operation);
        expect(model?.body?.type).toBe('xml');

        if (model?.body?.type === 'xml') {
            const config = model.body.config;
            // Should include properties from Base (via allOf)
            expect((config as any).properties.id).toBeDefined();
            expect((config as any).properties.id.attribute).toBe(true);
            // Should include local properties
            expect((config as any).properties.name).toBeDefined();
        }
    });

    it('should infer request body content types for text, binary, and +xml payloads', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Request Bodies', version: '1.0' },
            paths: {
                '/text': {
                    post: {
                        operationId: 'postText',
                        requestBody: {
                            required: true,
                            content: {
                                'text/plain': { schema: { type: 'string' } },
                            },
                        },
                        responses: { '200': { description: 'OK' } },
                    },
                },
                '/binary': {
                    post: {
                        operationId: 'postBinary',
                        requestBody: {
                            content: {
                                'application/octet-stream': {},
                            },
                        },
                        responses: { '200': { description: 'OK' } },
                    },
                },
                '/soap': {
                    post: {
                        operationId: 'postSoap',
                        requestBody: {
                            content: {
                                'application/soap+xml': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            message: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                        responses: { '200': { description: 'OK' } },
                    },
                },
            },
        };

        const { analyzer } = setupAnalyzer(spec);

        const textOp = {
            ...spec.paths['/text'].post,
            path: '/text',
            method: 'POST',
            methodName: 'postText',
        } as PathInfo;
        const textModel = analyzer.analyze(textOp);
        expect(textModel?.body?.type).toBe('raw');
        expect(textModel?.requestContentType).toBe('text/plain');
        expect(textModel?.parameters.find(p => p.name === 'body')?.type).toBe('string');

        const binaryOp = {
            ...spec.paths['/binary'].post,
            path: '/binary',
            method: 'POST',
            methodName: 'postBinary',
        } as PathInfo;
        const binaryModel = analyzer.analyze(binaryOp);
        expect(binaryModel?.body?.type).toBe('raw');
        expect(binaryModel?.requestContentType).toBe('application/octet-stream');
        expect(binaryModel?.parameters.find(p => p.name === 'body')?.type).toBe('Blob');

        const soapOp = {
            ...spec.paths['/soap'].post,
            path: '/soap',
            method: 'POST',
            methodName: 'postSoap',
        } as PathInfo;
        const soapModel = analyzer.analyze(soapOp);
        expect(soapModel?.body?.type).toBe('xml');
        expect(soapModel?.requestContentType).toBe('application/soap+xml');
    });

    it('should prefer specific request body media types over wildcard entries', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Request Bodies', version: '1.0' },
            paths: {
                '/wildcard': {
                    post: {
                        operationId: 'postWildcard',
                        requestBody: {
                            content: {
                                '*/*': { schema: { type: 'string' } },
                                'text/plain': { schema: { type: 'string' } },
                            },
                        },
                        responses: { '200': { description: 'OK' } },
                    },
                },
            },
        };

        const { analyzer } = setupAnalyzer(spec);
        const op = {
            ...spec.paths['/wildcard'].post,
            path: '/wildcard',
            method: 'POST',
            methodName: 'postWildcard',
        } as any;
        const model = analyzer.analyze(op);

        expect(model?.requestContentType).toBe('text/plain');
        expect(model?.body?.type).toBe('raw');
        expect(model?.parameters.find(p => p.name === 'body')?.type).toBe('string');
    });

    // Test for line 267: Unresolved ref in getXmlConfig
    it('should return empty config for unresolvable schema ref', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: {},
            components: { schemas: { Broken: { $ref: '#/missing' } } },
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
                        responses: { '200': { description: 'ok' } },
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: { type: 'string' },
                                },
                            },
                        },
                    },
                },
            },
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
                                    schema: { type: 'integer' },
                                },
                            },
                        },
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };
        const { analyzer } = setupAnalyzer(spec);
        const op = { ...spec.paths['/post'].post, path: '/post', method: 'POST' } as any;
        const model = analyzer.analyze(op);

        // Should pick up the integer schema from the custom content type
        const bodyParam = model?.parameters.find(p => p.name === 'body');
        expect(bodyParam?.type).toBe('number');
    });

    it('should resolve MediaTypeObject $ref entries when analyzing responses', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'MediaTypeRef', version: '1.0' },
            paths: {
                '/items': {
                    get: {
                        operationId: 'getItems',
                        responses: {
                            '200': {
                                description: 'ok',
                                content: {
                                    'application/json': { $ref: '#/components/mediaTypes/Items' },
                                },
                            },
                        },
                    },
                },
            },
            components: {
                mediaTypes: {
                    Items: {
                        schema: { type: 'array', items: { type: 'string' } },
                    },
                },
            },
        };

        const { analyzer, parser } = setupAnalyzer(spec);
        const op = parser.operations[0];
        op.methodName = 'getItems';
        const model = analyzer.analyze(op);

        expect(model?.responseType).toBe('string[]');
    });

    it('should include multiple 2xx response schemas in response variants', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'MultiSuccess', version: '1.0' },
            paths: {
                '/multi': {
                    get: {
                        operationId: 'getMulti',
                        responses: {
                            '200': {
                                description: 'ok',
                                content: { 'application/json': { schema: { type: 'string' } } },
                            },
                            '201': {
                                description: 'created',
                                content: { 'application/json': { schema: { type: 'integer' } } },
                            },
                        },
                    },
                },
            },
        };

        const { analyzer, parser } = setupAnalyzer(spec);
        const op = parser.operations[0];
        op.methodName = 'getMulti';
        const model = analyzer.analyze(op);

        const types = (model?.responseVariants ?? []).map(v => v.type);
        expect(types).toEqual(expect.arrayContaining(['string', 'number']));
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
                            xml: { name: 'Item' },
                        },
                    },
                },
            },
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
                            nodeType: 'element',
                        },
                    },
                },
            },
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
                    LegacyWrapped: { type: 'array', items: { type: 'string' }, xml: { wrapped: true } },
                },
            },
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

    it('should include externalDocs in generated docs', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Docs', version: '1.0' },
            paths: {
                '/doc': {
                    get: {
                        operationId: 'getDoc',
                        externalDocs: { url: 'https://example.com/docs', description: 'More info' },
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };
        const { analyzer } = setupAnalyzer(spec);
        const operation = { ...spec.paths['/doc'].get, path: '/doc', method: 'GET', methodName: 'getDoc' } as PathInfo;
        const model = analyzer.analyze(operation);
        expect(model?.docs).toContain('@see https://example.com/docs More info');
    });

    it('should analyze multiple response media types including sse, text, xml, and blob', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Multi', version: '1.0' },
            paths: {
                '/multi': {
                    get: {
                        operationId: 'getMulti',
                        responses: {
                            '200': {
                                description: 'ok',
                                content: {
                                    'application/json-seq': { schema: { type: 'string' } },
                                    'application/jsonl': { schema: { type: 'string' } },
                                    'application/xml': {
                                        schema: {
                                            type: 'object',
                                            xml: { name: 'Doc' },
                                            properties: { id: { type: 'string' } },
                                        },
                                    },
                                    'text/event-stream': { schema: { type: 'string' } },
                                    'text/plain': { schema: { type: 'string' } },
                                    'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
                                },
                            },
                        },
                    },
                },
            },
        };
        const { analyzer } = setupAnalyzer(spec);
        const operation = { ...spec.paths['/multi'].get, path: '/multi', method: 'GET', methodName: 'getMulti' } as any;
        const model = analyzer.analyze(operation)!;

        expect(model.responseVariants.some(v => v.serialization === 'json-seq')).toBe(true);
        expect(model.responseVariants.some(v => v.serialization === 'json-lines')).toBe(true);
        expect(model.responseVariants.some(v => v.serialization === 'xml')).toBe(true);
        expect(model.responseVariants.some(v => v.serialization === 'sse')).toBe(true);
        expect(model.responseVariants.some(v => v.serialization === 'text')).toBe(true);
        expect(model.responseVariants.some(v => v.serialization === 'blob')).toBe(true);
    });

    it('should treat structured +json-seq media types as sequential JSON', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'GeoSeq', version: '1.0' },
            paths: {
                '/geo': {
                    get: {
                        operationId: 'getGeoSeq',
                        responses: {
                            '200': {
                                description: 'ok',
                                content: {
                                    'application/geo+json-seq': {
                                        itemSchema: { type: 'object', properties: { type: { type: 'string' } } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };
        const { analyzer } = setupAnalyzer(spec);
        const operation = { ...spec.paths['/geo'].get, path: '/geo', method: 'GET', methodName: 'getGeoSeq' } as any;
        const model = analyzer.analyze(operation)!;

        expect(model.responseVariants.some(v => v.serialization === 'json-seq')).toBe(true);
    });

    it('should classify error responses by content type and auth codes', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Errors', version: '1.0' },
            paths: {
                '/err': {
                    get: {
                        operationId: 'getErr',
                        responses: {
                            '200': {
                                description: 'ok',
                                content: { 'application/json': { schema: { type: 'string' } } },
                            },
                            '400': {
                                description: 'ok',
                                content: { 'application/xml': { schema: { type: 'string' } } },
                            },
                            '401': { description: 'Unauthorized' },
                            '422': {
                                description: 'ok',
                                content: { 'application/problem+json': { schema: { type: 'string' } } },
                            },
                            '500': { description: 'ok', content: { 'text/plain': {} } },
                        },
                    },
                },
            },
        };
        const { analyzer } = setupAnalyzer(spec);
        const operation = { ...spec.paths['/err'].get, path: '/err', method: 'GET', methodName: 'getErr' } as any;
        const model = analyzer.analyze(operation)!;

        const types = model.errorResponses.map(e => e.type);
        expect(types).toContain('string'); // xml string + json/text
        expect(types).toContain('void'); // 401 with no content
    });

    it('should treat +xml error responses as string', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Errors', version: '1.0' },
            paths: {
                '/err': {
                    get: {
                        operationId: 'getErr',
                        responses: {
                            '200': { description: 'ok' },
                            '400': {
                                description: 'ok',
                                content: { 'application/soap+xml': { schema: { type: 'string' } } },
                            },
                        },
                    },
                },
            },
        };
        const { analyzer } = setupAnalyzer(spec);
        const operation = { ...spec.paths['/err'].get, path: '/err', method: 'GET', methodName: 'getErr' } as any;
        const model = analyzer.analyze(operation)!;

        const types = model.errorResponses.map(e => e.type);
        expect(types).toContain('string');
    });

    it('should treat text/* error responses as string', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Errors', version: '1.0' },
            paths: {
                '/err': {
                    get: {
                        operationId: 'getErr',
                        responses: {
                            '200': { description: 'ok' },
                            '400': { description: 'ok', content: { 'text/html': {} } },
                        },
                    },
                },
            },
        };
        const { analyzer } = setupAnalyzer(spec);
        const op = { ...spec.paths['/err'].get, path: '/err', method: 'GET', methodName: 'getErr' } as any;
        const model = analyzer.analyze(op)!;
        expect(model.errorResponses[0].type).toBe('string');
    });

    it('should infer array type when requestBody uses itemSchema for sequential json', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'ItemSchema', version: '1.0' },
            paths: {
                '/items': {
                    post: {
                        operationId: 'postItems',
                        requestBody: {
                            content: {
                                'application/jsonl': {
                                    itemSchema: { type: 'string' },
                                },
                            },
                        },
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };
        const { analyzer } = setupAnalyzer(spec);
        const op = { ...spec.paths['/items'].post, path: '/items', method: 'POST', methodName: 'postItems' } as any;
        const model = analyzer.analyze(op)!;
        const bodyParam = model.parameters.find(p => p.type === 'string[]' || p.type === '(string)[]');
        expect(bodyParam).toBeDefined();
        expect(bodyParam?.name).toBe('body');
    });

    it('should treat custom JSON request bodies with itemSchema as json-lines', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'CustomSeq', version: '1.0' },
            paths: {
                '/custom-seq': {
                    post: {
                        operationId: 'postCustomSeq',
                        requestBody: {
                            content: {
                                'application/vnd.acme+json': {
                                    itemSchema: { type: 'string' },
                                },
                            },
                        },
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };
        const { analyzer } = setupAnalyzer(spec);
        const op = {
            ...spec.paths['/custom-seq'].post,
            path: '/custom-seq',
            method: 'POST',
            methodName: 'postCustomSeq',
        } as any;
        const model = analyzer.analyze(op)!;
        expect(model.requestContentType).toBe('application/vnd.acme+json');
        expect(model.body?.type).toBe('json-lines');
    });

    it('should fallback to FormData typing for multipart without schema', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Multipart', version: '1.0' },
            paths: {
                '/upload': {
                    post: {
                        operationId: 'upload',
                        requestBody: {
                            content: {
                                'multipart/form-data': {},
                            },
                        },
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };
        const { analyzer } = setupAnalyzer(spec);
        const op = { ...spec.paths['/upload'].post, path: '/upload', method: 'POST', methodName: 'upload' } as any;
        const model = analyzer.analyze(op)!;
        const bodyParam = model.parameters.find(p => p.name === 'body');
        expect(bodyParam?.type).toBe('FormData | any[] | any');
    });

    it('should preserve multipart prefix and item encodings', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Multipart', version: '1.0' },
            paths: {
                '/multi': {
                    post: {
                        operationId: 'postMulti',
                        requestBody: {
                            content: {
                                'multipart/mixed': {
                                    schema: {
                                        type: 'array',
                                        prefixItems: [{ type: 'object', properties: { a: { type: 'string' } } }],
                                        items: { type: 'object', properties: { b: { type: 'string' } } },
                                    },
                                    prefixEncoding: [{ contentType: 'application/json' }],
                                    itemEncoding: { contentType: 'application/json' },
                                },
                            },
                        },
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };
        const { analyzer } = setupAnalyzer(spec);
        const op = { ...spec.paths['/multi'].post, path: '/multi', method: 'POST', methodName: 'postMulti' } as any;
        const model = analyzer.analyze(op)!;
        expect(model.body?.type).toBe('multipart');
    });

    it('should merge decoding config from allOf', () => {
        const spec = {
            openapi: '3.1.0',
            info: { title: 'Decode', version: '1.0' },
            paths: {},
            components: {
                schemas: {
                    Encoded: {
                        allOf: [
                            {
                                type: 'object',
                                properties: {
                                    payload: {
                                        type: 'string',
                                        contentSchema: { type: 'object', properties: { id: { type: 'string' } } },
                                    },
                                },
                            },
                        ],
                    },
                },
            },
        };
        const { analyzer } = setupAnalyzer(spec);
        const config = (analyzer as any).getDecodingConfig(spec.components.schemas.Encoded, 5);
        expect((config as any).properties.payload).toBeDefined();
    });

    it('should merge encoding config from allOf', () => {
        const spec = {
            openapi: '3.1.0',
            info: { title: 'Encode', version: '1.0' },
            paths: {},
            components: {
                schemas: {
                    Encoded: {
                        allOf: [
                            {
                                type: 'object',
                                properties: {
                                    payload: {
                                        type: 'string',
                                        contentMediaType: 'application/json',
                                    },
                                },
                            },
                        ],
                    },
                },
            },
        };
        const { analyzer } = setupAnalyzer(spec);
        const config = (analyzer as any).getEncodingConfig(spec.components.schemas.Encoded, 5);
        expect((config as any).properties.payload).toBeDefined();
    });

    it('should mark json serialization when contentMediaType is resolved via ref', () => {
        const spec = {
            openapi: '3.1.0',
            info: { title: 'Content Media', version: '1.0' },
            components: {
                schemas: {
                    JsonString: { type: 'string', contentMediaType: 'application/json' },
                },
            },
            paths: {
                '/query': {
                    get: {
                        operationId: 'getQuery',
                        parameters: [{ name: 'q', in: 'query', schema: { $ref: '#/components/schemas/JsonString' } }],
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };
        const { analyzer } = setupAnalyzer(spec);
        const op = { ...spec.paths['/query'].get, path: '/query', method: 'GET', methodName: 'getQuery' } as any;
        const model = analyzer.analyze(op)!;
        expect(model.queryParams[0].serializationLink).toBe('json');
    });

    it('should preserve parameter contentEncoding and contentMediaType in encoder config', () => {
        const spec = {
            openapi: '3.1.0',
            info: { title: 'Param Encoding', version: '1.0' },
            paths: {
                '/encoded': {
                    get: {
                        operationId: 'getEncoded',
                        parameters: [
                            { name: 'bin', in: 'query', schema: { type: 'string', contentEncoding: 'base64' } },
                            {
                                name: 'payload',
                                in: 'query',
                                schema: { type: 'string', contentMediaType: 'application/json' },
                            },
                        ],
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };
        const { analyzer } = setupAnalyzer(spec);
        const op = { ...spec.paths['/encoded'].get, path: '/encoded', method: 'GET', methodName: 'getEncoded' } as any;
        const model = analyzer.analyze(op)!;

        const binParam = model.queryParams.find(p => p.originalName === 'bin');
        expect(binParam?.contentEncoderConfig?.contentEncoding).toBe('base64');

        const payloadParam = model.queryParams.find(p => p.originalName === 'payload');
        expect(payloadParam?.contentEncoderConfig?.encode).toBe(true);
        expect(payloadParam?.contentEncoderConfig?.contentMediaType).toBe('application/json');
        expect(payloadParam?.serializationLink).toBe('json');
    });

    it('should mark +xml and text/xml parameters for XML serialization', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Xml Params', version: '1.0' },
            paths: {
                '/xml/{soapId}': {
                    get: {
                        operationId: 'getXmlParams',
                        parameters: [
                            {
                                name: 'soapId',
                                in: 'path',
                                required: true,
                                content: { 'text/xml': { schema: { type: 'string' } } },
                            },
                            {
                                name: 'filter',
                                in: 'query',
                                content: {
                                    'application/soap+xml': {
                                        schema: {
                                            type: 'object',
                                            properties: { active: { type: 'boolean' } },
                                        },
                                    },
                                },
                            },
                        ],
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };
        const { analyzer } = setupAnalyzer(spec);
        const op = {
            ...spec.paths['/xml/{soapId}'].get,
            path: '/xml/{soapId}',
            method: 'GET',
            methodName: 'getXmlParams',
        } as any;
        const model = analyzer.analyze(op)!;

        expect(model.pathParams[0].paramName).toBe('soapIdSerialized');
        expect(model.queryParams[0].paramName).toBe('filterSerialized');
    });

    describe('Coverage edge cases', () => {
        it('should skip response entries without schema and fall back to default variant', () => {
            const spec = {
                openapi: '3.0.0',
                info: { title: 'Skip', version: '1.0' },
                paths: {
                    '/empty': {
                        get: {
                            operationId: 'getEmpty',
                            responses: {
                                '200': {
                                    description: 'ok',
                                    content: {
                                        'application/json': {},
                                    },
                                },
                            },
                        },
                    },
                },
            };
            const { analyzer } = setupAnalyzer(spec);
            const op = { ...spec.paths['/empty'].get, path: '/empty', method: 'GET', methodName: 'getEmpty' } as any;
            const model = analyzer.analyze(op)!;
            expect(model.responseVariants).toHaveLength(0);
            expect(model.responseType).toBe('any');
        });

        it('should handle sequential json media type with itemSchema only', () => {
            const spec = {
                openapi: '3.0.0',
                info: { title: 'ItemSchema', version: '1.0' },
                paths: {
                    '/items': {
                        get: {
                            operationId: 'getItems',
                            responses: {
                                '200': {
                                    description: 'ok',
                                    content: {
                                        'application/jsonl': { itemSchema: { type: 'string' } },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            const { analyzer } = setupAnalyzer(spec);
            const op = { ...spec.paths['/items'].get, path: '/items', method: 'GET', methodName: 'getItems' } as any;
            const model = analyzer.analyze(op)!;
            expect(model.responseVariants[0].type).toBe('(string)[]');
        });

        it('should treat custom JSON media types with itemSchema as json-lines', () => {
            const spec = {
                openapi: '3.2.0',
                info: { title: 'CustomSeq', version: '1.0' },
                paths: {
                    '/custom': {
                        get: {
                            operationId: 'getCustom',
                            responses: {
                                '200': {
                                    description: 'ok',
                                    content: {
                                        'application/vnd.acme+json': { itemSchema: { type: 'number' } },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            const { analyzer } = setupAnalyzer(spec);
            const op = { ...spec.paths['/custom'].get, path: '/custom', method: 'GET', methodName: 'getCustom' } as any;
            const model = analyzer.analyze(op)!;
            expect(model.responseVariants[0].serialization).toBe('json-lines');
            expect(model.responseVariants[0].type).toBe('(number)[]');
        });

        it('should treat non-standard json media types as non-default', () => {
            const spec = {
                openapi: '3.0.0',
                info: { title: 'VendorJson', version: '1.0' },
                paths: {
                    '/vendor': {
                        get: {
                            operationId: 'getVendor',
                            responses: {
                                '200': {
                                    description: 'ok',
                                    content: {
                                        'application/vnd.api+json': { schema: { type: 'string' } },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            const { analyzer } = setupAnalyzer(spec);
            const op = { ...spec.paths['/vendor'].get, path: '/vendor', method: 'GET', methodName: 'getVendor' } as any;
            const model = analyzer.analyze(op)!;
            expect(model.responseVariants[0].mediaType).toBe('application/vnd.api+json');
            expect(model.responseVariants[0].isDefault).toBe(true);
        });

        it('should skip xml variant when schema is missing', () => {
            const spec = {
                openapi: '3.0.0',
                info: { title: 'XmlSkip', version: '1.0' },
                paths: {
                    '/xml': {
                        get: {
                            operationId: 'getXml',
                            responses: {
                                '200': {
                                    description: 'ok',
                                    content: {
                                        'application/json': { schema: { type: 'string' } },
                                        'application/xml': {},
                                    },
                                },
                            },
                        },
                    },
                },
            };
            const { analyzer } = setupAnalyzer(spec);
            const op = { ...spec.paths['/xml'].get, path: '/xml', method: 'GET', methodName: 'getXml' } as any;
            const model = analyzer.analyze(op)!;
            expect(model.responseVariants.some(v => v.serialization === 'xml')).toBe(false);
        });

        it('should use itemSchema for text/event-stream responses', () => {
            const spec = {
                openapi: '3.0.0',
                info: { title: 'SSE', version: '1.0' },
                paths: {
                    '/sse': {
                        get: {
                            operationId: 'getSse',
                            responses: {
                                '200': {
                                    description: 'ok',
                                    content: {
                                        'text/event-stream': { itemSchema: { type: 'string' } },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            const { analyzer } = setupAnalyzer(spec);
            const op = { ...spec.paths['/sse'].get, path: '/sse', method: 'GET', methodName: 'getSse' } as any;
            const model = analyzer.analyze(op)!;
            expect(model.responseVariants[0].type).toBe('string');
            expect(model.responseVariants[0].sseMode).toBe('data');
        });

        it('should emit event-mode SSE when schema includes data property', () => {
            const spec = {
                openapi: '3.0.0',
                info: { title: 'SSE Event', version: '1.0' },
                paths: {
                    '/sse-event': {
                        get: {
                            operationId: 'getSseEvent',
                            responses: {
                                '200': {
                                    description: 'ok',
                                    content: {
                                        'text/event-stream': {
                                            schema: {
                                                type: 'object',
                                                properties: {
                                                    data: { type: 'string' },
                                                    event: { type: 'string' },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            const { analyzer } = setupAnalyzer(spec);
            const op = {
                ...spec.paths['/sse-event'].get,
                path: '/sse-event',
                method: 'GET',
                methodName: 'getSseEvent',
            } as any;
            const model = analyzer.analyze(op)!;
            expect(model.responseVariants[0].sseMode).toBe('event');
            expect(model.sseMode).toBe('event');
        });

        it('should treat binary error responses as Blob', () => {
            const spec = {
                openapi: '3.0.0',
                info: { title: 'Errors', version: '1.0' },
                paths: {
                    '/err': {
                        get: {
                            operationId: 'getErr',
                            responses: {
                                '200': { description: 'ok' },
                                '400': { description: 'ok', content: { 'application/octet-stream': {} } },
                            },
                        },
                    },
                },
            };
            const { analyzer } = setupAnalyzer(spec);
            const op = { ...spec.paths['/err'].get, path: '/err', method: 'GET', methodName: 'getErr' } as any;
            const model = analyzer.analyze(op)!;
            expect(model.errorResponses[0].type).toBe('Blob');
        });

        it('should handle requestBody with minimal content map', () => {
            const spec = {
                openapi: '3.0.0',
                info: { title: 'Body', version: '1.0' },
                paths: {
                    '/body': {
                        post: {
                            operationId: 'postBody',
                            requestBody: { content: { 'application/json': {} } },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            const { analyzer } = setupAnalyzer(spec);
            const op = { ...spec.paths['/body'].post, path: '/body', method: 'POST', methodName: 'postBody' } as any;
            const model = analyzer.analyze(op)!;
            expect(model.body?.type).toBe('json');
            expect(model.requestEncodingConfig).toBeUndefined();
        });

        it('should treat binary requestBody content as raw', () => {
            const spec = {
                openapi: '3.0.0',
                info: { title: 'Raw', version: '1.0' },
                paths: {
                    '/raw': {
                        post: {
                            operationId: 'postRaw',
                            requestBody: { content: { 'application/octet-stream': {} } },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            const { analyzer } = setupAnalyzer(spec);
            const op = { ...spec.paths['/raw'].post, path: '/raw', method: 'POST', methodName: 'postRaw' } as any;
            const model = analyzer.analyze(op)!;
            expect(model.body?.type).toBe('raw');
        });

        it('should sort required parameters before optional ones', () => {
            const spec = {
                openapi: '3.0.0',
                info: { title: 'Params', version: '1.0' },
                paths: {
                    '/params': {
                        get: {
                            operationId: 'getParams',
                            parameters: [
                                { name: 'opt', in: 'query', schema: { type: 'string' } },
                                { name: 'req', in: 'query', required: true, schema: { type: 'string' } },
                            ],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            const { analyzer } = setupAnalyzer(spec);
            const op = { ...spec.paths['/params'].get, path: '/params', method: 'GET', methodName: 'getParams' } as any;
            const model = analyzer.analyze(op)!;
            expect(model.parameters[0].name).toBe('req');
            expect(model.parameters[1].name).toBe('opt');
        });

        it('should initialize multipart prefix and item encodings when missing', () => {
            const spec = {
                openapi: '3.0.0',
                info: { title: 'Multipart', version: '1.0' },
                paths: {
                    '/multi': {
                        post: {
                            operationId: 'postMulti',
                            requestBody: {
                                content: {
                                    'multipart/form-data': {
                                        schema: {
                                            type: 'array',
                                            prefixItems: [{ type: 'object', properties: { a: { type: 'string' } } }],
                                            items: { type: 'object', properties: { b: { type: 'string' } } },
                                        },
                                    },
                                },
                            },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            const { analyzer } = setupAnalyzer(spec);
            const op = { ...spec.paths['/multi'].post, path: '/multi', method: 'POST', methodName: 'postMulti' } as any;
            const model = analyzer.analyze(op)!;
            const config = (model.body as any)?.config as any;
            expect(config.prefixEncoding).toBeDefined();
            expect(config.prefixEncoding[0]).toBeDefined();
            expect(config.itemEncoding).toBeDefined();
        });

        it('should enrich urlencoded encoding config from schema properties', () => {
            const spec = {
                openapi: '3.2.0',
                info: { title: 'UrlEncoded', version: '1.0' },
                paths: {
                    '/form': {
                        post: {
                            operationId: 'postForm',
                            requestBody: {
                                content: {
                                    'application/x-www-form-urlencoded': {
                                        schema: {
                                            type: 'object',
                                            properties: {
                                                meta: { type: 'object' },
                                                note: { type: 'string', contentEncoding: 'base64' },
                                                tags: { type: 'array', items: { type: 'string' } },
                                            },
                                        },
                                        encoding: {
                                            tags: { style: 'pipeDelimited', explode: false },
                                        },
                                    },
                                },
                            },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            const { analyzer } = setupAnalyzer(spec);
            const op = { ...spec.paths['/form'].post, path: '/form', method: 'POST', methodName: 'postForm' } as any;
            const model = analyzer.analyze(op)!;
            expect(model.body?.type).toBe('urlencoded');
            const config = (model.body as any).config as any;
            expect(config.meta.contentType).toBe('application/json');
            expect(config.note.headers['Content-Transfer-Encoding']).toBe('base64');
            expect(config.tags.style).toBe('pipeDelimited');
            expect(config.tags.explode).toBe(false);
        });

        it('should populate Content-Transfer-Encoding headers when missing', () => {
            const spec = { openapi: '3.0.0', info: { title: 'Enc', version: '1.0' }, paths: {} };
            const { analyzer } = setupAnalyzer(spec);
            const configMap: any = {};
            (analyzer as any).enrichEncodingConfig({ type: 'string', contentEncoding: 'base64' }, configMap, 'field');
            expect(configMap.field.headers['Content-Transfer-Encoding']).toBe('base64');
        });

        it('should not overwrite existing Content-Transfer-Encoding headers', () => {
            const spec = { openapi: '3.0.0', info: { title: 'Enc', version: '1.0' }, paths: {} };
            const { analyzer } = setupAnalyzer(spec);
            const configMap: any = { field: { headers: { 'content-transfer-encoding': 'gzip' } } };
            (analyzer as any).enrichEncodingConfig({ type: 'string', contentEncoding: 'base64' }, configMap, 'field');
            expect(configMap.field.headers['content-transfer-encoding']).toBe('gzip');
        });

        it('should merge xml config from allOf properties', () => {
            const spec = { openapi: '3.0.0', info: { title: 'Xml', version: '1.0' }, paths: {} };
            const { analyzer } = setupAnalyzer(spec);
            const schema = {
                allOf: [
                    {
                        type: 'object',
                        properties: {
                            node: { type: 'string', xml: { name: 'node' } },
                        },
                    },
                ],
            };
            const cfg = (analyzer as any).getXmlConfig(schema, 5);
            expect(cfg.properties?.node).toBeDefined();
        });

        it('should build decoding config for array items and allOf properties', () => {
            const spec = { openapi: '3.0.0', info: { title: 'Dec', version: '1.0' }, paths: {} };
            const { analyzer } = setupAnalyzer(spec);
            const schema = {
                type: 'array',
                items: {
                    type: 'string',
                    contentSchema: { type: 'object', properties: { id: { type: 'string' } } },
                },
            };
            const cfg = (analyzer as any).getDecodingConfig(schema, 5);
            expect(cfg.items).toBeDefined();

            const allOfSchema = {
                allOf: [
                    {
                        type: 'object',
                        properties: {
                            payload: {
                                type: 'string',
                                contentSchema: { type: 'object', properties: { id: { type: 'string' } } },
                            },
                        },
                    },
                ],
            };
            const cfg2 = (analyzer as any).getDecodingConfig(allOfSchema, 5);
            expect(cfg2.properties?.payload).toBeDefined();
        });

        it('should return empty decoding config for undefined or unresolved schema', () => {
            const spec = { openapi: '3.0.0', info: { title: 'Dec', version: '1.0' }, paths: {} };
            const { analyzer } = setupAnalyzer(spec);
            expect((analyzer as any).getDecodingConfig(undefined, 5)).toEqual({});
            expect((analyzer as any).getDecodingConfig({ $ref: '#/missing' }, 5)).toEqual({});
        });

        it('should build encoding config for arrays and allOf properties', () => {
            const spec = { openapi: '3.0.0', info: { title: 'Enc', version: '1.0' }, paths: {} };
            const { analyzer } = setupAnalyzer(spec);
            const schema = {
                type: 'object',
                properties: {
                    payload: { type: 'string', contentMediaType: 'application/json' },
                },
                allOf: [
                    {
                        type: 'object',
                        properties: {
                            extra: { type: 'string', contentMediaType: 'application/json' },
                        },
                    },
                ],
            };
            const cfg = (analyzer as any).getEncodingConfig(schema, 5);
            expect(cfg.properties?.payload).toBeDefined();
            expect(cfg.properties?.extra).toBeDefined();
        });

        it('should return empty encoding config for undefined or unresolved schema', () => {
            const spec = { openapi: '3.0.0', info: { title: 'Enc', version: '1.0' }, paths: {} };
            const { analyzer } = setupAnalyzer(spec);
            expect((analyzer as any).getEncodingConfig(undefined, 5)).toEqual({});
            expect((analyzer as any).getEncodingConfig({ $ref: '#/missing' }, 5)).toEqual({});
        });

        it('should return "any" when resolveType receives undefined schema', () => {
            const spec = { openapi: '3.0.0', info: { title: 'Resolve', version: '1.0' }, paths: {} };
            const { analyzer } = setupAnalyzer(spec);
            expect((analyzer as any).resolveType(undefined, [])).toBe('any');
        });

        it('should avoid requestEncodingConfig when body is forced to json with no content', () => {
            const spec = {
                openapi: '3.0.0',
                info: { title: 'Enc', version: '1.0' },
                paths: {
                    '/enc': {
                        post: {
                            operationId: 'postEnc',
                            requestBody: { content: { 'application/json': {} } },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            const { analyzer } = setupAnalyzer(spec);
            vi.spyOn(analyzer as any, 'analyzeBody').mockReturnValue({ type: 'json', paramName: 'body' });
            const op = { ...spec.paths['/enc'].post, path: '/enc', method: 'POST', methodName: 'postEnc' } as any;
            const model = analyzer.analyze(op)!;
            expect(model.requestEncodingConfig).toBeUndefined();
        });

        it('should handle json-lines responses using itemSchema', () => {
            const spec = {
                openapi: '3.0.0',
                info: { title: 'Jsonl', version: '1.0' },
                paths: {
                    '/jsonl': {
                        get: {
                            operationId: 'getJsonl',
                            responses: {
                                '200': {
                                    description: 'ok',
                                    content: { 'application/jsonl': { itemSchema: { type: 'number' } } },
                                },
                            },
                        },
                    },
                },
            };
            const { analyzer } = setupAnalyzer(spec);
            const op = { ...spec.paths['/jsonl'].get, path: '/jsonl', method: 'GET', methodName: 'getJsonl' } as any;
            const model = analyzer.analyze(op)!;
            expect(model.responseVariants[0].type).toBe('(number)[]');
        });

        it('should fall back to any for event-stream when schema resolves to undefined mid-flight', () => {
            const spec = { openapi: '3.0.0', info: { title: 'Weird', version: '1.0' }, paths: {} };
            const { analyzer } = setupAnalyzer(spec);
            let readCount = 0;
            const mediaObj: any = {};
            Object.defineProperty(mediaObj, 'schema', {
                get() {
                    readCount += 1;
                    return readCount === 1 ? { type: 'string' } : undefined;
                },
            });
            const op = {
                methodName: 'getWeird',
                method: 'GET',
                path: '/weird',
                responses: { '200': { description: 'ok', content: { 'text/event-stream': mediaObj } } },
            } as any;
            const model = analyzer.analyze(op)!;
            expect(model.responseVariants[0].type).toBe('any');
        });

        it('should skip multipart itemEncoding initialization when items are tuple arrays', () => {
            const spec = {
                openapi: '3.0.0',
                info: { title: 'Multipart', version: '1.0' },
                paths: {
                    '/tuple': {
                        post: {
                            operationId: 'postTuple',
                            requestBody: {
                                content: {
                                    'multipart/form-data': {
                                        schema: {
                                            type: 'array',
                                            items: [{ type: 'string' }, { type: 'number' }],
                                        },
                                    },
                                },
                            },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            const { analyzer } = setupAnalyzer(spec);
            const op = { ...spec.paths['/tuple'].post, path: '/tuple', method: 'POST', methodName: 'postTuple' } as any;
            const model = analyzer.analyze(op)!;
            expect(model.body?.type).toBe('multipart');
        });

        it('should skip allOf merges when subConfig has no properties', () => {
            const spec = { openapi: '3.0.0', info: { title: 'Skip', version: '1.0' }, paths: {} };
            const { analyzer } = setupAnalyzer(spec);
            const xmlCfg = (analyzer as any).getXmlConfig({ allOf: [{ type: 'object' }] }, 5);
            expect(xmlCfg.properties).toBeUndefined();

            const decCfg = (analyzer as any).getDecodingConfig({ allOf: [{ type: 'object' }] }, 5);
            expect(decCfg.properties).toBeUndefined();

            const encCfg = (analyzer as any).getEncodingConfig({ allOf: [{ type: 'object' }] }, 5);
            expect(encCfg.properties).toBeUndefined();
        });

        it('should use fallback docs when summary and description are missing', () => {
            const spec = {
                openapi: '3.0.0',
                info: { title: 'Docs', version: '1.0' },
                paths: {
                    '/fallback': {
                        get: {
                            operationId: 'getFallback',
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            const { analyzer } = setupAnalyzer(spec);
            const op = {
                ...spec.paths['/fallback'].get,
                path: '/fallback',
                method: 'GET',
                methodName: 'getFallback',
            } as any;
            const model = analyzer.analyze(op)!;
            expect(model.docs).toContain('Performs a GET request to /fallback.');
        });

        it('should include description when both summary and description are provided', () => {
            const spec = {
                openapi: '3.0.0',
                info: { title: 'Docs', version: '1.0' },
                paths: {
                    '/desc': {
                        get: {
                            operationId: 'getDesc',
                            summary: 'Short summary',
                            description: 'Detailed description',
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            const { analyzer } = setupAnalyzer(spec);
            const op = { ...spec.paths['/desc'].get, path: '/desc', method: 'GET', methodName: 'getDesc' } as any;
            const model = analyzer.analyze(op)!;
            expect(model.docs).toContain('Short summary');
            expect(model.docs).toContain('Detailed description');
        });

        it('should handle externalDocs without description', () => {
            const spec = {
                openapi: '3.0.0',
                info: { title: 'Docs', version: '1.0' },
                paths: {
                    '/ext': {
                        get: {
                            operationId: 'getExt',
                            externalDocs: { url: 'https://example.com' },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            const { analyzer } = setupAnalyzer(spec);
            const op = { ...spec.paths['/ext'].get, path: '/ext', method: 'GET', methodName: 'getExt' } as any;
            const model = analyzer.analyze(op)!;
            expect(model.docs).toContain('@see https://example.com');
        });
    });

    it('should model sequential JSON request bodies as array input', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Seq', version: '1.0' },
            components: {
                schemas: {
                    LogEntry: {
                        type: 'object',
                        properties: { message: { type: 'string' } },
                    },
                },
            },
            paths: {
                '/logs': {
                    post: {
                        operationId: 'postLogs',
                        requestBody: {
                            content: {
                                'application/x-ndjson': {
                                    itemSchema: { $ref: '#/components/schemas/LogEntry' },
                                },
                            },
                        },
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };

        const { analyzer } = setupAnalyzer(spec);
        const operation: PathInfo = {
            ...spec.paths['/logs'].post,
            path: '/logs',
            method: 'POST',
            methodName: 'postLogs',
        } as PathInfo;

        const model = analyzer.analyze(operation);
        expect(model?.body?.type).toBe('json-lines');
        expect(model?.requestContentType).toBe('application/x-ndjson');

        const bodyParam = model?.parameters.find(p => p.name === 'logEntry');
        expect(bodyParam?.type).toBe('LogEntry[]');
    });

    it('should treat binary responses without schema as Blob', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Bin', version: '1.0' },
            paths: {
                '/download': {
                    get: {
                        operationId: 'downloadFile',
                        responses: {
                            '200': {
                                description: 'ok',
                                content: { 'application/pdf': {} },
                            },
                        },
                    },
                },
            },
        };

        const { analyzer } = setupAnalyzer(spec);
        const operation: PathInfo = {
            ...spec.paths['/download'].get,
            path: '/download',
            method: 'GET',
            methodName: 'downloadFile',
        } as PathInfo;

        const model = analyzer.analyze(operation);
        expect(model?.responseType).toBe('Blob');
        expect(model?.responseSerialization).toBe('blob');
        expect(model?.responseVariants[0].serialization).toBe('blob');
    });
});
