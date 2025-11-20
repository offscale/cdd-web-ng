import { describe, it, expect, vi } from 'vitest';
import { Project, Scope } from 'ts-morph';
import { ServiceMethodGenerator } from '@src/service/emit/service/service-method.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, PathInfo } from '@src/core/types.js';
import { finalCoverageSpec } from '../shared/specs.js';
import { TypeGenerator } from '@src/service/emit/type/type.generator.js';
import { HttpParamsBuilderGenerator } from '@src/service/emit/utility/http-params-builder.js';

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
        }
    },
    components: {
        securitySchemes: { Basic: { type: 'http', scheme: 'basic' } },
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

    const createTestEnvironment = (spec: object = serviceMethodGenSpec) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = { input: '', output: '/out', options: { dateType: 'Date', enumStyle: 'enum' } };
        const parser = new SwaggerParser(spec as any, config);
        new TypeGenerator(parser, project, config).generate('/out');
        new HttpParamsBuilderGenerator(project).generate('/out');

        const methodGen = new ServiceMethodGenerator(config, parser);
        const sourceFile = project.createSourceFile('/out/tmp.service.ts');
        const serviceClass = sourceFile.addClass({ name: 'TmpService' });
        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/common/http', namedImports: ['HttpHeaders', 'HttpContext', 'HttpParams'] });
        serviceClass.addProperty({ name: 'basePath', isReadonly: true, scope: Scope.Private, type: 'string', initializer: "''" });
        serviceClass.addProperty({ name: 'http', isReadonly: true, scope: Scope.Private, type: 'any', initializer: "{}" });
        serviceClass.addMethod({ name: 'createContextWithClientId', scope: Scope.Private, returnType: 'any', statements: 'return {};' });
        return { methodGen, serviceClass, parser };
    };

    it('should generate blob wrapping for encoded multipart fields', () => {
        const { methodGen, serviceClass } = createTestEnvironment();
        const op: PathInfo = {
            ...serviceMethodGenSpec.paths['/multipart-encoding'].post,
            method: 'POST',
            path: '/multipart-encoding',
            methodName: 'postEncoded',
        } as any;

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('postEncoded').getBodyText()!;
        // Check that the JSON strategy is used for application/json
        expect(body).toContain(`content = encoding.contentType.includes('application/json') ? JSON.stringify(value) : String(value)`);
        expect(body).toContain(`new Blob([content], { type: encoding.contentType })`);
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
        // FIX: Updated expectation to match generated output from ServiceMethodGenerator
        // Note the JSON serialization of the encoding config object
        expect(body).toContain('const formBody = HttpParamsBuilder.serializeUrlEncodedBody(body, {"tags":{"style":"spaceDelimited","explode":false}});');
        expect(body).toContain('return this.http.post(url, formBody, requestOptions as any);');
    });

    it('should warn and skip generation if operation has no methodName', () => {
        const { methodGen, serviceClass } = createTestEnvironment({});
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
            // FIX: Use parser.operations directly to get the correct object reference that contains 'methodName' logic if needed,
            // but here we must manually define the methodName because extractPaths logic isn't running fully on the ad-hoc object.
            // Alternatively, just construct the object with methodName.
            const op: PathInfo = {
                method: 'GET', path: '/search/{filter}',
                methodName: 'search', // Explicitly set this
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
            // FIX: Explicitly set methodName
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

    it('should apply SKIP_AUTH_CONTEXT_TOKEN to requests with security: []', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment();
        // Find the operation and ensure it has a methodName attached (parser logic usually does this, but let's be safe)
        const op = parser.operations.find((o: any) => o.operationId === 'getPublic')!;
        op.methodName = 'getPublic';
        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getPublic').getBodyText()!;
        expect(body).toContain('.set(SKIP_AUTH_CONTEXT_TOKEN, true)');
    });
});
