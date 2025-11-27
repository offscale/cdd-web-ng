import { describe, expect, it } from 'vitest';
import { Project, Scope } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { TypeGenerator } from '@src/generators/shared/type.generator.js';
import { ServiceMethodGenerator } from '@src/generators/angular/service/service-method.generator.js';

describe('Emitter: ServiceMethodGenerator (Multipart Defaults)', () => {
    const createTestEnv = () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Multipart Test', version: '1.0' },
            paths: {
                '/upload': {
                    post: {
                        operationId: 'uploadComplex',
                        requestBody: {
                            content: {
                                'multipart/form-data': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            id: { type: 'string' },
                                            metadata: { type: 'object', properties: { key: { type: 'string' } } },
                                            tags: { type: 'array', items: { type: 'string' } },
                                        },
                                    },
                                },
                            },
                        },
                        responses: { '200': {} },
                    },
                },
            },
            components: {},
        };
        const config: GeneratorConfig = { input: '', output: '/out', options: { dateType: 'Date', enumStyle: 'enum' } };

        const project = new Project({ useInMemoryFileSystem: true });
        const parser = new SwaggerParser(spec as any, config);

        // Pre-generate types
        new TypeGenerator(parser, project, config).generate('/out');

        const methodGen = new ServiceMethodGenerator(config, parser);
        const sourceFile = project.createSourceFile('/out/service.ts');
        const serviceClass = sourceFile.addClass({ name: 'TestService' });
        // Mock the http property
        serviceClass.addProperty({ name: 'http', scope: Scope.Private, isReadonly: true, type: 'any' });

        return { methodGen, serviceClass, parser };
    };

    it('should serialize object properties in multipart using MultipartBuilder defaults', () => {
        const { methodGen, serviceClass, parser } = createTestEnv();
        const op = parser.operations.find(o => o.operationId === 'uploadComplex')!;

        // Ensure methodName is set as the parser usually does this in groupPathsByController
        op.methodName = 'uploadComplex';

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('uploadComplex').getBodyText()!;

        // Since metadata is an object and tags is an array, the analyzer should inject `contentType: 'application/json'`.
        // The config object in the generated code should reflect this.
        expect(body).toContain('"metadata":{"contentType":"application/json"}');
        expect(body).toContain('"tags":{"contentType":"application/json"}');

        expect(body).toContain('const multipartResult = MultipartBuilder.serialize(body, multipartConfig);');
        expect(body).toContain('return this.http.post<any>(url, multipartResult.content, requestOptions as any);');
    });

    it('should inject Content-Transfer-Encoding header from schema contentEncoding', () => {
        const { methodGen, serviceClass } = createTestEnv();

        // Inject a new operation into the parser/spec that uses contentEncoding
        const op: any = {
            method: 'POST',
            path: '/upload-encoding',
            methodName: 'uploadWithEncoding',
            requestBody: {
                content: {
                    'multipart/form-data': {
                        schema: {
                            type: 'object',
                            properties: {
                                file: { type: 'string', format: 'binary' }, // raw binary
                                secret: { type: 'string', contentEncoding: 'base64' }, // encoded text part
                            },
                        },
                    },
                },
            },
            responses: { '200': {} },
        };

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('uploadWithEncoding').getBodyText()!;

        // Check that the config object passed to MultipartBuilder contains the header for 'secret'
        expect(body).toContain('"secret":{');
        expect(body).toContain('"headers":{"Content-Transfer-Encoding":"base64"}');
    });

    it('should handle multipart/byteranges with correct media type config', () => {
        const { methodGen, serviceClass } = createTestEnv();

        const op: any = {
            method: 'POST',
            path: '/ranges',
            methodName: 'postRanges',
            requestBody: {
                content: {
                    'multipart/byteranges': {
                        schema: {
                            type: 'array',
                            items: { type: 'object' },
                        },
                    },
                },
            },
            responses: { '200': {} },
        };

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('postRanges').getBodyText()!;

        // Verify that the configuration object includes the mediaType override
        expect(body).toContain('"mediaType":"multipart/byteranges"');
        // Verify it calls the builder
        expect(body).toContain('const multipartResult = MultipartBuilder.serialize(body, multipartConfig);');
    });
});
