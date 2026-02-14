import { describe, expect, it } from 'vitest';

import { Project, Scope } from 'ts-morph';

import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, PathInfo } from '@src/core/types/index.js';
import { TypeGenerator } from '@src/generators/shared/type.generator.js';
import { ServiceMethodGenerator } from '@src/generators/angular/service/service-method.generator.js';
import { ParameterSerializerGenerator } from '@src/generators/shared/parameter-serializer.generator.js';
import { XmlBuilderGenerator } from '@src/generators/shared/xml-builder.generator.js';

import { finalCoveragePushSpec, finalCoverageSpec } from '../fixtures/coverage.fixture.js';

const specBodyTests = {
    openapi: '3.0.0',
    // ... (Keep spec definitions same as original)
    info: { title: 'Body Tests', version: '1.0' },
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
                                    avatar: { type: 'string', format: 'binary' },
                                },
                            },
                            encoding: {
                                profile: { contentType: 'application/json' },
                                avatar: { contentType: 'image/png' },
                            },
                        },
                    },
                },
                responses: { '200': { description: 'ok' } },
            },
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
                                    tags: { type: 'array', items: { type: 'string' } },
                                },
                            },
                            encoding: {
                                tags: { style: 'spaceDelimited', explode: false },
                            },
                        },
                    },
                },
                responses: { '200': { description: 'ok' } },
            },
        },
        '/urlencoded-content-encoding': {
            post: {
                operationId: 'postUrlEncodedEncoded',
                requestBody: {
                    content: {
                        'application/x-www-form-urlencoded': {
                            schema: {
                                type: 'object',
                                properties: {
                                    payload: { type: 'string', contentEncoding: 'base64' },
                                },
                            },
                        },
                    },
                },
                responses: { '200': { description: 'ok' } },
            },
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
                                    name: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: { '200': { description: 'ok' } },
            },
        },
        '/readonly-test': {
            post: {
                operationId: 'postReadOnly',
                requestBody: {
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ReadOnlyModel' },
                        },
                    },
                },
                responses: { '200': { description: 'ok' } },
            },
        },
        '/multipart': {
            post: {
                operationId: 'postMultipart',
                tags: ['FormData'],
                requestBody: {
                    required: true,
                    content: {
                        'multipart/form-data': {
                            schema: {
                                type: 'object',
                                required: ['file-upload'],
                                properties: {
                                    'file-upload': { type: 'string', format: 'binary' },
                                },
                            },
                        },
                    },
                },
                responses: { '200': { description: 'ok' } },
            },
        },
        '/urlencoded': {
            post: {
                operationId: 'postUrlencoded',
                tags: ['FormData'],
                requestBody: {
                    content: {
                        'application/x-www-form-urlencoded': {
                            schema: {
                                type: 'object',
                                properties: {
                                    grantType: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: { '200': { description: 'ok' } },
            },
        },
        '/body-no-schema': {
            post: {
                tags: ['ResponseType'],
                operationId: 'postBodyNoSchema',
                requestBody: { content: { 'application/json': {} } },
                responses: { '204': { description: 'ok' } },
            },
        },
        '/jsonl-endpoint': {
            post: {
                tags: ['Seq'],
                operationId: 'postJsonLines',
                requestBody: {
                    content: {
                        'application/x-ndjson': {
                            itemSchema: { $ref: '#/components/schemas/ReadOnlyModel' },
                        },
                    },
                },
                responses: { '200': { description: 'ok' } },
            },
        },
        '/custom-jsonl-endpoint': {
            post: {
                tags: ['Seq'],
                operationId: 'postCustomJsonLines',
                requestBody: {
                    content: {
                        'application/vnd.acme+json': {
                            itemSchema: { $ref: '#/components/schemas/ReadOnlyModel' },
                        },
                    },
                },
                responses: { '200': { description: 'ok' } },
            },
        },
    },
    components: {
        schemas: {
            ReadOnlyModel: {
                type: 'object',
                properties: {
                    id: { type: 'string', readOnly: true },
                    data: { type: 'string' },
                },
            },
        },
    },
};

describe('Emitter: ServiceMethodGenerator (Body Handling)', () => {
    const createTestEnvironment = (spec: object) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = {
            input: '',
            output: '/out',
            options: { dateType: 'Date', enumStyle: 'enum' },
        };

        const baseComponents = (spec as any).components || {};
        const extComponents = finalCoverageSpec.components || {};

        const fullSpec = {
            ...spec,
            components: {
                ...baseComponents,
                ...extComponents,
                schemas: {
                    ...(baseComponents.schemas || {}),
                    ...(extComponents.schemas || {}),
                },
            },
        };

        const parser = new SwaggerParser(fullSpec as any, config);
        new TypeGenerator(parser, project, config).generate('/out');
        new ParameterSerializerGenerator(project).generate('/out');
        new XmlBuilderGenerator(project).generate('/out');

        const methodGen = new ServiceMethodGenerator(config, parser);
        const sourceFile = project.createSourceFile('/out/tmp.service.ts');
        const serviceClass = sourceFile.addClass({ name: 'TmpService' });
        serviceClass.addProperty({ name: 'http', scope: Scope.Private, isReadonly: true, type: 'any' });
        serviceClass.addProperty({
            name: 'basePath',
            isReadonly: true,
            scope: Scope.Private,
            type: 'string',
            initializer: "''",
        });
        serviceClass.addMethod({
            name: 'createContextWithClientId',
            scope: Scope.Private,
            returnType: 'any',
            statements: 'return {};',
        });

        return { methodGen, serviceClass, parser };
    };

    it('should detect application/xml request body and generate xml serialization logic', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specBodyTests);
        const op: PathInfo = {
            ...specBodyTests.paths['/xml-endpoint'].post,
            method: 'POST',
            path: '/xml-endpoint',
            methodName: 'postXml',
        } as any;

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('postXml').getBodyText()!;
        expect(body).toContain(`const xmlBody = XmlBuilder.serialize(body, 'RequestRoot',`);

        expect(body).toContain(`"id":`);
        expect(body).toContain(`"attribute":true`);
        expect(body).toContain(`return this.http.post<any>(url, xmlBody`);
    });

    it('should generate blob wrapping for encoded multipart fields using accurate OAS 3.2 default logic', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specBodyTests);
        const op: PathInfo = {
            ...specBodyTests.paths['/multipart-encoding'].post,
            method: 'POST',
            path: '/multipart-encoding',
            methodName: 'postEncoded',
        } as any;

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('postEncoded').getBodyText()!;

        expect(body).toContain(
            'const multipartConfig = {"profile":{"contentType":"application/json"},"avatar":{"contentType":"image/png"}};',
        );
        expect(body).toContain('const multipartResult = MultipartBuilder.serialize(body, multipartConfig);');
        expect(body).toContain('if (multipartResult.headers) {');
        expect(body).toContain('requestOptions = { ...requestOptions, headers: newHeaders };');
    });

    it('should generate HttpParams builder calls for encoded url-encoded bodies', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specBodyTests);
        const op: PathInfo = {
            ...specBodyTests.paths['/urlencoded-encoding'].post,
            method: 'POST',
            path: '/urlencoded-encoding',
            methodName: 'postUrlEncoded',
        } as any;

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('postUrlEncoded').getBodyText()!;

        // Update: ParameterSerializer calls and iteration
        expect(body).toContain(
            'const urlParamEntries = ParameterSerializer.serializeUrlEncodedBody(body, {"tags":{"style":"spaceDelimited","explode":false}});',
        );
        expect(body).toContain('let formBody = new HttpParams({ encoder: new ApiParameterCodec() });');
        expect(body).toContain('urlParamEntries.forEach(entry => formBody = formBody.append(entry.key, entry.value));');

        // Expect generic call
        expect(body).toContain('return this.http.post<any>(url, formBody, requestOptions as any);');
    });

    it('should apply ContentEncoder for urlencoded bodies with contentEncoding', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specBodyTests);
        const op: PathInfo = {
            ...specBodyTests.paths['/urlencoded-content-encoding'].post,
            method: 'POST',
            path: '/urlencoded-content-encoding',
            methodName: 'postUrlEncodedEncoded',
        } as any;

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('postUrlEncodedEncoded').getBodyText()!;

        expect(body).toContain('let encodedBody = body;');
        expect(body).toContain('encodedBody = ContentEncoder.encode(encodedBody');
        expect(body).toContain('ParameterSerializer.serializeUrlEncodedBody(encodedBody');
    });

    it('should serialize ndjson request bodies using newline delimiters', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specBodyTests);
        const op: PathInfo = {
            ...specBodyTests.paths['/jsonl-endpoint'].post,
            method: 'POST',
            path: '/jsonl-endpoint',
            methodName: 'postJsonLines',
        } as any;

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('postJsonLines').getBodyText()!;
        expect(body).toContain('let jsonLinesBody = readOnlyModel;');
        expect(body).toContain('jsonLinesBody = jsonLinesBody.map(item => JSON.stringify(item))');
        expect(body).toContain("headers = headers.set('Content-Type', 'application/x-ndjson')");
    });

    it('should serialize custom JSON sequential request bodies using newline delimiters', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specBodyTests);
        const op: PathInfo = {
            ...specBodyTests.paths['/custom-jsonl-endpoint'].post,
            method: 'POST',
            path: '/custom-jsonl-endpoint',
            methodName: 'postCustomJsonLines',
        } as any;

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('postCustomJsonLines').getBodyText()!;
        expect(body).toContain('let jsonLinesBody = readOnlyModel;');
        expect(body).toContain('jsonLinesBody = jsonLinesBody.map(item => JSON.stringify(item))');
        expect(body).toContain("headers = headers.set('Content-Type', 'application/vnd.acme+json')");
    });

    it('should use *Request type for body parameter if model has readonly/writeonly properties', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specBodyTests);
        const op: PathInfo = {
            method: 'POST',
            path: '/readonly-test',
            methodName: 'postWithReadOnly',
            requestBody: {
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/ReadOnlyModel' },
                    },
                },
            },
            responses: { '200': { description: 'ok' } },
        };

        methodGen.addServiceMethod(serviceClass, op);
        const method = serviceClass.getMethodOrThrow('postWithReadOnly');
        const bodyParam = method.getParameters().find(p => p.getName() === 'readOnlyModel');

        expect(bodyParam).toBeDefined();
        expect(bodyParam!.getType().getText()).toBe('ReadOnlyModelRequest');
    });

    it('should return standard type in Observable response even if request used *Request', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specBodyTests);
        const op: PathInfo = {
            method: 'POST',
            path: '/readonly-test',
            methodName: 'postWithReadOnly',
            requestBody: {
                content: { 'application/json': { schema: { $ref: '#/components/schemas/ReadOnlyModel' } } },
            },
            responses: {
                '200': {
                    description: 'ok',
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/ReadOnlyModel' } } },
                },
            },
        };

        methodGen.addServiceMethod(serviceClass, op);
        const overload = serviceClass.getMethodOrThrow('postWithReadOnly').getOverloads()[0];
        expect(overload.getReturnType().getText()).toBe('Observable<ReadOnlyModel>');
    });

    it('should handle urlencoded body with no parameters', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment(finalCoveragePushSpec);
        const op = parser.operations.find(o => o.operationId === 'postUrlencodedNoParams');
        if (!op) throw new Error("Operation 'postUrlencodedNoParams' not found in fixture");

        op.methodName = 'postUrlencodedNoParams';

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('postUrlencodedNoParams').getBodyText()!;
        expect(body).toContain('const urlParamEntries = ParameterSerializer.serializeUrlEncodedBody(body, {});');
        expect(body).toContain('let formBody = new HttpParams({ encoder: new ApiParameterCodec() });');
        // Expect generic call
        expect(body).toContain('return this.http.post<any>(url, formBody, requestOptions as any);');
    });

    it('should generate HttpParams for legacy formData', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specBodyTests);
        const op: PathInfo = {
            method: 'POST',
            path: '/urlencoded',
            methodName: 'postLegacy',
            consumes: ['application/x-www-form-urlencoded'],
            parameters: [{ name: 'grantType', in: 'formData', type: 'string' }] as any,
            responses: { '200': { description: 'ok' } } as any,
        } as any;

        methodGen.addServiceMethod(serviceClass, op);
        const body = serviceClass.getMethodOrThrow('postLegacy').getBodyText()!;
        expect(body).toContain('let formBody = new HttpParams();');
        expect(body).toContain("if (grantType != null) { formBody = formBody.append('grantType', grantType); }");
    });
});
