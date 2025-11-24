import { describe, it, expect, vi } from 'vitest';
import { Project, Scope } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, PathInfo } from '@src/core/types.js';
import { finalCoverageSpec } from '../shared/specs.js';
import { TypeGenerator } from '@src/service/emit/type/type.generator.js';
import { ServiceMethodGenerator } from "@src/generators/angular/service/service-method.generator.js";
import { HttpParamsBuilderGenerator } from "@src/generators/angular/utils/http-params-builder.generator.js";
import { XmlBuilderGenerator } from "@src/generators/shared/xml-builder.generator.js";

const serviceMethodGenSpec = {
    openapi: '3.0.0',
    info: { title: 'Test', version: '1.0' },
    paths: {
        '/multipart-encoding': {
            post: {
                operationId: 'postMultipartEncoded',
                requestBody: {
                    required: true,
                    content: {
                        'multipart/form-data': {
                            schema: {
                                type: 'object',
                                properties: {
                                    profile: { type: 'object' },
                                    avatar: { type: 'string', format: 'binary' }
                                }
                            },
                            encoding: {
                                profile: { contentType: 'application/json' },
                                avatar: { contentType: 'image/png' }
                            }
                        }
                    }
                },
                responses: { '200': {} }
            }
        },
        '/urlencoded-encoding': {
            post: {
                operationId: 'postUrlEncoded',
                requestBody: {
                    content: {
                        'application/x-www-form-urlencoded': {
                            schema: {
                                type: 'object',
                                properties: {
                                    tags: { type: 'array', items: { type: 'string' } }
                                }
                            },
                            encoding: {
                                tags: { style: 'spaceDelimited', explode: false }
                            }
                        }
                    }
                },
                responses: {'200': {}}
            }
        },
        '/xml-endpoint': {
            post: {
                operationId: 'postXml',
                requestBody: {
                    content: {
                        'application/xml': {
                            schema: {
                                type: 'object',
                                xml: { name: 'RequestRoot' },
                                properties: {
                                    id: { type: 'integer', xml: { attribute: true } },
                                    name: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: { '200': {} }
            }
        },
        '/xml-params/{xmlId}': {
            get: {
                operationId: 'getXmlParams',
                parameters: [
                    {
                        name: 'filter',
                        in: 'query',
                        content: {
                            'application/xml': {
                                schema: {
                                    type: 'object',
                                    properties: { active: { type: 'boolean', xml: { attribute: true } } }
                                }
                            }
                        }
                    },
                    {
                        name: 'xmlId',
                        in: 'path',
                        content: {
                            'application/xml': { schema: { type: 'string' } }
                        }
                    }
                ],
                responses: { '200': {} }
            }
        },
        '/readonly-test': {
            post: {
                operationId: 'postReadOnly',
                requestBody: {
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ReadOnlyModel' }
                        }
                    }
                },
                responses: { '200': {} }
            }
        },
        '/deprecated-endpoint': {
            get: {
                operationId: 'getDeprecated',
                deprecated: true,
                responses: { '200': {} }
            }
        },
        '/deprecated-param': {
            get: {
                operationId: 'getDeprecatedParam',
                parameters: [
                    { name: 'id', in: 'query', deprecated: true, schema: { type: 'string' } }
                ],
                responses: { '200': {} }
            }
        },
        '/docs/summary': { get: { tags: ['Docs'], operationId: 'getSummary', summary: 'This is a summary.' } },
        '/docs/description': { get: { tags: ['Docs'], operationId: 'getDescription', description: 'This is a description.' } },
        '/docs/both': { get: { tags: ['Docs'], operationId: 'getBoth', summary: 'Summary.', description: 'Description.' } },
        '/docs/neither': { get: { tags: ['Docs'], operationId: 'getNeither' } },
        '/docs/external': {
            get: {
                tags: ['Docs'],
                operationId: 'getExternalDocs',
                externalDocs: { url: 'https://example.com/docs', description: 'External Info' }
            }
        },
        '/all-required/{id}': {
            post: {
                tags: ['RequiredParams'],
                operationId: 'postAllRequired',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'string' } } }
                }
            }
        },
        '/multipart': {
            post: {
                operationId: 'postMultipart',
                tags: ['FormData'],
                consumes: ['multipart/form-data'],
                parameters: [{ name: 'file-upload', in: 'formData', type: 'file' }]
            }
        },
        '/urlencoded': {
            post: {
                operationId: 'postUrlencoded',
                tags: ['FormData'],
                consumes: ['application/x-www-form-urlencoded'],
                parameters: [{ name: 'grantType', in: 'formData', type: 'string' }]
            }
        },
        '/swagger2-param': {
            get: {
                operationId: 'getWithSwagger2Param',
                tags: ['OAS2'],
                parameters: [{ name: 'limit', in: 'query', type: 'integer' }] // No 'schema' key
            }
        },
        '/post-infer-return': {
            post: {
                tags: ['ResponseType'],
                operationId: 'postInferReturn',
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/BodyModel' } } } },
                responses: { '400': { description: 'Bad Request' } } // No 2xx response
            }
        },
        '/body-no-schema': {
            post: {
                tags: ['ResponseType'],
                operationId: 'postBodyNoSchema',
                requestBody: { content: { 'application/json': {} } }, // Body exists, but no schema
                responses: { '204': {} }
            }
        },
        '/multipart-no-params': {
            post: {
                tags: ['FormData'],
                operationId: 'postMultipartNoParams',
                consumes: ['multipart/form-data'],
                // No `parameters` array with `in: 'formData'`
                responses: { '200': {} }
            }
        },
        '/form-data-no-consumes': {
            post: {
                tags: ['FormData'],
                operationId: 'postFormDataNoConsumes',
                // No 'consumes' array here
                parameters: [{ name: 'file', in: 'formData', type: 'file' }]
            }
        },
        '/with-header': {
            get: {
                tags: ['WithHeader'],
                operationId: 'withHeader',
                parameters: [
                    { name: 'X-Custom-Header', in: 'header', schema: { type: 'string' } }
                ],
                responses: {}
            }
        },
        '/cookie-test': {
            get: {
                operationId: 'getWithCookies',
                parameters: [
                    { name: 'session_id', in: 'cookie', schema: { type: 'string' } }
                ],
                responses: { '200': {} }
            }
        },
        '/query-search': {
            query: {
                operationId: 'querySearch',
                requestBody: {
                    content: {
                        'application/json': {
                            schema: { type: 'object', properties: { query: { type: 'string' } } }
                        }
                    }
                },
                responses: { '200': {} }
            }
        },
        '/query-string': {
            get: {
                operationId: 'getWithQuerystring',
                parameters: [
                    {
                        name: 'filter',
                        in: 'querystring',
                        content: {
                            'application/json': { schema: { type: 'object' } }
                        }
                    }
                ],
                responses: { '200': {} }
            }
        },
        '/public-endpoint': {
            get: {
                operationId: 'getPublic',
                tags: ['Public'],
                security: [],
                responses: { '200': {} }
            }
        },
        '/secure-endpoint': {
            get: {
                operationId: 'getSecure',
                tags: ['Secure'],
                // Implicitly secure
                responses: { '200': {} }
            }
        },
        '/search/{filter}': {
            get: {
                operationId: 'search',
                parameters: [{
                    name: 'filter', in: 'path', required: true,
                    content: { 'application/json': { schema: { type: 'object' } } }
                }],
                responses: {}
            }
        },
        '/info': {
            get: {
                operationId: 'getInfo',
                parameters: [{
                    name: 'X-Meta', in: 'header',
                    content: { 'application/json': { schema: { type: 'object' } } }
                }],
                responses: {}
            }
        },
        '/server-override': {
            get: {
                tags: ['ServerOverride'],
                operationId: 'getWithServerOverride',
                servers: [{ url: 'https://custom.api.com', description: 'Custom Server' }],
                responses: { '200': {} }
            }
        },
        '/copy-resource': {
            additionalOperations: {
                COPY: {
                    operationId: 'copyResource',
                    responses: { '200': { description: 'Copied' } }
                }
            }
        },
        // NEW: Test path for security scopes
        '/oauth-protected': {
            get: {
                operationId: 'getOauthProtected',
                security: [
                    { 'OAuth2': ['read:admin', 'write:admin'] }
                ],
                responses: { '200': {} }
            }
        }
    },
    components: {
        securitySchemes: {
            Basic: { type: 'http', scheme: 'bearer' },
            OAuth2: { type: 'oauth2', flows: {} }
        },
        schemas: {
            ...finalCoverageSpec.components?.schemas,
            ReadOnlyModel: {
                type: 'object',
                properties: {
                    id: { type: 'string', readOnly: true },
                    data: { type: 'string' }
                }
            }
        }
    },
};

describe('Emitter: ServiceMethodGenerator', () => {

    const createTestEnvironment = (spec: object = serviceMethodGenSpec, configOverrides: Partial<GeneratorConfig['options']> = {}) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = {
            input: '',
            output: '/out',
            options: { dateType: 'Date', enumStyle: 'enum', ...configOverrides }
        };
        const parser = new SwaggerParser(spec as any, config);
        new TypeGenerator(parser, project, config).generate('/out');
        new HttpParamsBuilderGenerator(project).generate('/out');
        new XmlBuilderGenerator(project).generate('/out');

        const methodGen = new ServiceMethodGenerator(config, parser);
        const sourceFile = project.createSourceFile('/out/tmp.service.ts');
        const serviceClass = sourceFile.addClass({ name: 'TmpService' });
        // Mock the http property
        serviceClass.addProperty({ name: 'http', scope: Scope.Private, isReadonly: true, type: 'any' });
        serviceClass.addProperty({ name: 'basePath', isReadonly: true, scope: Scope.Private, type: 'string', initializer: "''" });
        serviceClass.addMethod({ name: 'createContextWithClientId', scope: Scope.Private, returnType: 'any', statements: 'return {};' });
        return { methodGen, serviceClass, parser };
    };

    it('should detect application/xml request body and generate xml serialization logic', () => {
        const { methodGen, serviceClass } = createTestEnvironment();
        const op: PathInfo = {
            ...serviceMethodGenSpec.paths['/xml-endpoint'].post,
            method: 'POST', path: '/xml-endpoint', methodName: 'postXml'
        } as any;

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('postXml').getBodyText()!;
        expect(body).toContain(`const xmlBody = XmlBuilder.serialize(body, 'RequestRoot',`);
        expect(body).toContain(`"id":{"attribute":true}`);
        expect(body).toContain(`return this.http.post(url, xmlBody`);
    });

    it('should detect application/xml parameters and generate xml serialization logic', () => {
        const { methodGen, serviceClass } = createTestEnvironment();
        const opKey = '/xml-params/{xmlId}';
        const op: PathInfo = {
            ...serviceMethodGenSpec.paths[opKey].get,
            method: 'GET', path: opKey, methodName: 'getXmlParams'
        } as any;

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getXmlParams').getBodyText()!;

        expect(body).toContain(`let filterSerialized: any = filter;`);
        expect(body).toContain(`filterSerialized = XmlBuilder.serialize(filter, 'filter',`);
        expect(body).toContain(`"active":{"attribute":true}`);
        expect(body).toContain(`HttpParamsBuilder.serializeQueryParam(params, {"name":"filter","in":"query",`);
        expect(body).toContain(`, filterSerialized);`);
        expect(body).toContain(`let xmlIdSerialized: any = xmlId;`);
        expect(body).toContain(`xmlIdSerialized = XmlBuilder.serialize(xmlId, 'xmlId',`);
        expect(body).toContain(`serializePathParam('xmlId', xmlIdSerialized,`);
    });

    it('should generate blob wrapping for encoded multipart fields using accurate OAS 3.2 default logic', () => {
        const { methodGen, serviceClass } = createTestEnvironment();
        const op: PathInfo = {
            ...serviceMethodGenSpec.paths['/multipart-encoding'].post,
            method: 'POST',
            path: '/multipart-encoding',
            methodName: 'postEncoded',
        } as any;

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('postEncoded').getBodyText()!;

        expect(body).toContain('const multipartConfig = {"profile":{"contentType":"application/json"},"avatar":{"contentType":"image/png"}};');
        expect(body).toContain('const multipartResult = MultipartBuilder.serialize(body, multipartConfig);');
        expect(body).toContain('if (multipartResult.headers) {');
        expect(body).toContain('requestOptions = { ...requestOptions, headers: newHeaders };');
    });

    it('should generate HttpParams builder calls for encoded url-encoded bodies', () => {
        const { methodGen, serviceClass } = createTestEnvironment();
        const op: PathInfo = {
            ...serviceMethodGenSpec.paths['/urlencoded-encoding'].post,
            method: 'POST',
            path: '/urlencoded-encoding',
            methodName: 'postUrlEncoded',
        } as any;

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('postUrlEncoded').getBodyText()!;
        expect(body).toContain('const formBody = HttpParamsBuilder.serializeUrlEncodedBody(body, {"tags":{"style":"spaceDelimited","explode":false}});');
        expect(body).toContain('return this.http.post(url, formBody, requestOptions as any);');
    });

    it('should warn and skip generation if operation has no methodName', () => {
        const minimalSpec = { openapi: '3.0.0', info: { title: 'Void', version: '0' }, paths: {} };
        const { methodGen, serviceClass } = createTestEnvironment(minimalSpec);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const operationWithoutName: PathInfo = { path: '/test', method: 'GET', operationId: 'testOp' };

        methodGen.addServiceMethod(serviceClass, operationWithoutName);

        expect(serviceClass.getMethods().filter(m => m.getName() === 'testOp').length).toBe(0);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping method generation for operation without a methodName'));
        warnSpy.mockRestore();
    });

    it('should use *Request type for body parameter if model has readonly/writeonly properties', () => {
        const { methodGen, serviceClass } = createTestEnvironment();
        // Manually re-constructing requestBody to simulate parsed state
        const op: PathInfo = {
            method: 'POST', path: '/test', methodName: 'postWithReadOnly',
            requestBody: {
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/ReadOnlyModel' }
                    }
                }
            },
            responses: { '200': {} }
        };

        methodGen.addServiceMethod(serviceClass, op);
        const method = serviceClass.getMethodOrThrow('postWithReadOnly');
        const bodyParam = method.getParameters().find(p => p.getName() === 'readOnlyModel');

        expect(bodyParam).toBeDefined();
        expect(bodyParam!.getType().getText()).toBe('ReadOnlyModelRequest');
    });

    it('should return standard type in Observable response even if request used *Request', () => {
        const { methodGen, serviceClass } = createTestEnvironment();
        const op: PathInfo = {
            method: 'POST', path: '/test', methodName: 'postWithReadOnly',
            requestBody: {
                content: { 'application/json': { schema: { $ref: '#/components/schemas/ReadOnlyModel' } } }
            },
            responses: {
                '200': {
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/ReadOnlyModel' } } }
                }
            }
        };

        methodGen.addServiceMethod(serviceClass, op);
        const overload = serviceClass.getMethodOrThrow('postWithReadOnly').getOverloads()[0];
        expect(overload.getReturnType().getText()).toBe('Observable<ReadOnlyModel>');
    });

    describe('Strict Content Serialization Generation', () => {
        it('should generate correct builder call with "json" hint for path params with content', () => {
            const { methodGen, serviceClass } = createTestEnvironment();
            const op: PathInfo = {
                method: 'GET', path: '/search/{filter}',
                methodName: 'search',
                parameters: [{
                    name: 'filter', in: 'path', required: true,
                    content: { 'application/json': { schema: { type: 'object' } } }
                }]
            };
            methodGen.addServiceMethod(serviceClass, op);
            const body = serviceClass.getMethodOrThrow('search').getBodyText()!;
            expect(body).toContain("HttpParamsBuilder.serializePathParam('filter', filter, 'simple', false, false, 'json')");
        });

        it('should generate correct builder call with "json" hint for header params with content', () => {
            const { methodGen, serviceClass } = createTestEnvironment();
            const op: PathInfo = {
                method: 'GET', path: '/info',
                methodName: 'getInfo',
                parameters: [{
                    name: 'X-Meta', in: 'header',
                    content: { 'application/json': { schema: { type: 'object' } } }
                }]
            };
            methodGen.addServiceMethod(serviceClass, op);
            const body = serviceClass.getMethodOrThrow('getInfo').getBodyText()!;
            expect(body).toContain("HttpParamsBuilder.serializeHeaderParam('X-Meta', xMeta, false, 'json')");
        });
    });

    it('should NOT apply SECURITY_CONTEXT_TOKEN for explicit skip (default behavior)', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment();
        const op = parser.operations.find((o: any) => o.operationId === 'getPublic')!;
        op.methodName = 'getPublic';
        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getPublic').getBodyText()!;
        // Expect NO context setting because effective security is [], which means we don't inject the token.
        // The absence of the token in the context is interpreted by the interceptor as "skip/anonymous".
        expect(body).not.toContain('SECURITY_CONTEXT_TOKEN');
    });

    it('should generate context with SECURITY_CONTEXT_TOKEN when security scopes are present', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment();
        const op = parser.operations.find((o: any) => o.operationId === 'getOauthProtected')!;
        op.methodName = 'getOauthProtected';
        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getOauthProtected').getBodyText()!;
        expect(body).toContain('.set(SECURITY_CONTEXT_TOKEN, [{"OAuth2":["read:admin","write:admin"]}])');
    });

    it('should generate @deprecated JSDoc for deprecated operations', () => {
        const { methodGen, serviceClass } = createTestEnvironment();
        const op: PathInfo = {
            ...serviceMethodGenSpec.paths['/deprecated-endpoint'].get,
            path: '/deprecated-endpoint', method: 'GET', methodName: 'getDeprecated'
        } as any;

        methodGen.addServiceMethod(serviceClass, op);

        const method = serviceClass.getMethodOrThrow('getDeprecated');
        const docs = method.getJsDocs().map(doc => doc.getInnerText());
        expect(docs[0]).toContain('@deprecated');
    });

    it('should generate @deprecated JSDoc override for deprecated parameters', () => {
        const { methodGen, serviceClass } = createTestEnvironment();
        const op: PathInfo = {
            ...serviceMethodGenSpec.paths['/deprecated-param'].get,
            path: '/deprecated-param', method: 'GET', methodName: 'getDeprecatedParam'
        } as any;

        methodGen.addServiceMethod(serviceClass, op);

        const method = serviceClass.getMethodOrThrow('getDeprecatedParam');
        const overload = method.getOverloads()[0];
        const param = overload.getParameters()[0];
        expect(param.getFullText()).toContain('@deprecated');
    });

    it('should override basePath when operation servers are present', () => {
        const { methodGen, serviceClass } = createTestEnvironment();
        const op: PathInfo = {
            method: 'GET', path: '/server-override', methodName: 'getWithServerOverride',
            servers: [{ url: 'https://custom.api.com' }]
        };
        methodGen.addServiceMethod(serviceClass, op);
        const body = serviceClass.getMethodOrThrow('getWithServerOverride').getBodyText()!;
        expect(body).toContain("const basePath = 'https://custom.api.com';");
        expect(body).not.toContain('const basePath = this.basePath;');
    });

    it('should generate generic request call for custom HTTP methods from additionalOperations', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment();
        // Find the OP via parser, which uses the updated `extractPaths` logic
        const copyOp = parser.operations.find(op => op.method === 'COPY')!;
        copyOp.methodName = 'copyResource';

        methodGen.addServiceMethod(serviceClass, copyOp);

        const body = serviceClass.getMethodOrThrow('copyResource').getBodyText()!;

        expect(body).toContain("return this.http.request('COPY', url, requestOptions as any);");
    });

    it('should warn about forbidden Cookie headers during generation and in runtime code (Browser Default)', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const op = parser.operations.find(o => o.operationId === 'getWithCookies')!;
        op.methodName = 'getWithCookies';
        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getWithCookies').getBodyText()!;
        expect(body).toContain("if (typeof window !== 'undefined') { console.warn");
        expect(body).toContain("headers = headers.set('Cookie'");

        warnSpy.mockRestore();
    });

    it('should NOT emit runtime warning logic for cookies if platform is "node"', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment(serviceMethodGenSpec, { platform: 'node' });
        const op = parser.operations.find(o => o.operationId === 'getWithCookies')!;
        op.methodName = 'getWithCookiesNode';

        methodGen.addServiceMethod(serviceClass, op);
        const body = serviceClass.getMethodOrThrow('getWithCookiesNode').getBodyText()!;

        expect(body).not.toContain('console.warn');
        expect(body).not.toContain('typeof window');
        expect(body).toContain("headers = headers.set('Cookie'");
    });

    it('should generate logic for in: "querystring" parameters', () => {
        const { methodGen, serviceClass } = createTestEnvironment();
        const op: PathInfo = {
            method: 'GET', path: '/query-string', methodName: 'getWithQuerystring',
            parameters: serviceMethodGenSpec.paths['/query-string'].get.parameters
        } as any;

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getWithQuerystring').getBodyText()!;
        expect(body).toContain("const queryString = HttpParamsBuilder.serializeRawQuerystring(filter, 'json');");
        expect(body).toContain("const url = `${basePath}/query-string${queryString ? '?' + queryString : ''}`;");
    });

    it('should handle HTTP QUERY method with request body using generic request override', () => {
        const { methodGen, serviceClass } = createTestEnvironment();

        const op: PathInfo = {
            method: 'QUERY',
            path: '/query-search',
            methodName: 'querySearch',
            requestBody: {
                content: {
                    'application/json': {
                        schema: { type: 'object', properties: { query: { type: 'string' } } }
                    }
                }
            },
            responses: { '200': {} }
        };

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('querySearch').getBodyText()!;

        expect(body).toContain("let requestOptions: HttpRequestOptions = {");
        expect(body).toContain("return this.http.request('QUERY', url, { ...requestOptions, body: body } as any);");
    });
});
