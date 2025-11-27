import { describe, expect, it } from 'vitest';
import { Project, Scope } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { ServiceMethodGenerator } from '@src/generators/angular/service/service-method.generator.js';
import { TypeGenerator } from '@src/generators/shared/type.generator.js';

const encodingSpec = {
    openapi: '3.1.0',
    info: { title: 'Content Encoding Test', version: '1.0' },
    components: {
        schemas: {
            Metadata: {
                type: 'object',
                properties: {
                    version: { type: 'number' },
                },
            },
        },
    },
    paths: {
        '/encode-request': {
            post: {
                operationId: 'postEncodedData',
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string' },
                                    // Implicit intent: User sends object, client stringifies it
                                    config: {
                                        type: 'string',
                                        contentMediaType: 'application/json',
                                    },
                                },
                            },
                        },
                    },
                },
                responses: { '200': {} },
            },
        },
        '/nested-encoding': {
            post: {
                operationId: 'postNested',
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    items: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                raw: { type: 'string', contentMediaType: 'application/json' },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                responses: { '200': {} },
            },
        },
    },
};

describe('Emitter: ServiceMethodGenerator (Request Encoding)', () => {
    const createTestEnv = () => {
        const config: GeneratorConfig = {
            input: '',
            output: '/out',
            options: { enumStyle: 'enum', framework: 'angular' },
        };
        const project = new Project({ useInMemoryFileSystem: true });
        const parser = new SwaggerParser(encodingSpec as any, config);

        new TypeGenerator(parser, project, config).generate('/out');

        const methodGen = new ServiceMethodGenerator(config, parser);
        const sourceFile = project.createSourceFile('/out/service.ts');
        const serviceClass = sourceFile.addClass({ name: 'TestService' });
        serviceClass.addProperty({ name: 'http', scope: Scope.Private, isReadonly: true, type: 'any' });
        serviceClass.addProperty({
            name: 'basePath',
            scope: Scope.Private,
            isReadonly: true,
            type: 'string',
            initializer: "''",
        });
        serviceClass.addMethod({
            name: 'createContextWithClientId',
            scope: Scope.Private,
            returnType: 'any',
            statements: 'return {};',
        });

        return { methodGen, serviceClass };
    };

    it('should apply ContentEncoder.encode to request body with encoded properties', () => {
        const { methodGen, serviceClass } = createTestEnv();
        const op: any = {
            method: 'POST',
            path: '/encode-request',
            methodName: 'postEncodedData',
            requestBody: encodingSpec.paths['/encode-request'].post.requestBody,
            responses: encodingSpec.paths['/encode-request'].post.responses,
        };

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('postEncodedData').getBodyText()!;

        // Verify call to ContentEncoder
        expect(body).toContain('body = ContentEncoder.encode(body,');
        // Verify config structure
        expect(body).toContain('"properties":{"config":{"encode":true}}');
    });

    it('should apply ContentEncoder.encode recursively for nested arrays', () => {
        const { methodGen, serviceClass } = createTestEnv();
        const op: any = {
            method: 'POST',
            path: '/nested-encoding',
            methodName: 'postNested',
            requestBody: encodingSpec.paths['/nested-encoding'].post.requestBody,
            responses: encodingSpec.paths['/nested-encoding'].post.responses,
        };

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('postNested').getBodyText()!;

        // Check nested structure
        expect(body).toContain('ContentEncoder.encode(body,');
        expect(body).toContain('"properties":{"items":{"items":{"properties":{"raw":{"encode":true}}}}}');
    });
});
