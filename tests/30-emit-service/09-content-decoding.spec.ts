import { describe, expect, it } from 'vitest';
import { Project, Scope } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, PathInfo } from '@src/core/types/index.js';
import { ServiceMethodGenerator } from '@src/generators/angular/service/service-method.generator.js';
import { TypeGenerator } from '@src/generators/shared/type.generator.js';
import { ParameterSerializerGenerator } from '@src/generators/shared/parameter-serializer.generator.js';

const encodedContentSpec = {
    openapi: '3.1.0',
    // ... (Keep spec as is)
    info: { title: 'Encoded Content Test', version: '1.0' },
    components: {
        schemas: {
            InnerObject: {
                type: 'object',
                properties: {
                    id: { type: 'number' },
                },
            },
            InnerXml: {
                type: 'object',
                xml: { name: 'Inner' },
                properties: { value: { type: 'string' } },
            },
        },
    },
    paths: {
        '/blob-data': {
            get: {
                operationId: 'getBlobData',
                responses: {
                    '200': {
                        description: 'ok',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'integer' },
                                        // This string property actually contains JSON data defined by InnerObject
                                        meta: {
                                            type: 'string',
                                            contentMediaType: 'application/json',
                                            contentSchema: { $ref: '#/components/schemas/InnerObject' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/xml-embedded': {
            get: {
                operationId: 'getXmlEmbedded',
                responses: {
                    '200': {
                        description: 'ok',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        xmlContainer: {
                                            type: 'string',
                                            contentMediaType: 'application/xml',
                                            contentSchema: { $ref: '#/components/schemas/InnerXml' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/json-param': {
            get: {
                operationId: 'getWithJsonParam',
                parameters: [
                    {
                        name: 'filter',
                        in: 'query',
                        schema: {
                            type: 'string',
                            // Implicitly triggers JSON serialization for this string parameter
                            contentMediaType: 'application/json',
                        },
                    },
                ],
                responses: { '200': { description: 'ok' } },
            },
        },
        '/base64-response': {
            get: {
                operationId: 'getBase64Response',
                responses: {
                    '200': {
                        description: 'ok',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        blob: { type: 'string', contentEncoding: 'base64' },
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

describe('Emitter: ServiceMethodGenerator (Auto Decoding & Encoding)', () => {
    const createTestEnv = () => {
        const config: GeneratorConfig = {
            input: '',
            output: '/out',
            options: { enumStyle: 'enum', framework: 'angular' },
        };
        const project = new Project({ useInMemoryFileSystem: true });
        const parser = new SwaggerParser(encodedContentSpec as any, config);

        new TypeGenerator(parser, project, config).generate('/out');
        new ParameterSerializerGenerator(project).generate('/out');

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

        return { methodGen, serviceClass, project };
    };

    it('should generate ContentDecoder.decode call for contentSchema fields', () => {
        const { methodGen, serviceClass } = createTestEnv();
        const op: any = {
            method: 'GET',
            path: '/blob-data',
            methodName: 'getBlobData',
            responses: encodedContentSpec.paths['/blob-data'].get.responses,
        };

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getBlobData').getBodyText()!;

        // Expect pipe and map chain
        expect(body).toContain('.pipe(');
        expect(body).toContain('map(response => {');

        // Expect decoder call with correct config
        expect(body).toContain('return ContentDecoder.decode(response,');
        // The config should target the 'meta' property and set decode: true
        expect(body).toContain('"properties":{"meta":{"decode":true}}');
    });

    it('should generate correct return type signature for contentSchema', () => {
        const { methodGen, serviceClass } = createTestEnv();
        const op: any = {
            method: 'GET',
            path: '/blob-data',
            methodName: 'getBlobData',
            responses: encodedContentSpec.paths['/blob-data'].get.responses,
        };

        methodGen.addServiceMethod(serviceClass, op);

        const method = serviceClass.getMethodOrThrow('getBlobData');
        const returnType = method.getReturnType().getText();

        // It should be an Observable of an inline object type where meta is InnerObject
        expect(returnType).toContain('Observable');
        // The property 'meta' should be of type 'InnerObject' (or equivalent reference)
        // TypeConverter should have replaced `string` with `InnerObject`
        expect(returnType).toContain('meta?: InnerObject');
    });

    it('should generate XML decoding config for contentMediaType="application/xml"', () => {
        const { methodGen, serviceClass } = createTestEnv();
        const op: any = {
            method: 'GET',
            path: '/xml-embedded',
            methodName: 'getXmlEmbedded',
            responses: encodedContentSpec.paths['/xml-embedded'].get.responses,
        };

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getXmlEmbedded').getBodyText()!;

        // Expect decoder call
        expect(body).toContain('ContentDecoder.decode(response,');
        // Check for xml flag and config
        expect(body).toContain('"xmlContainer":{"decode":"xml"');
        expect(body).toContain('"xmlConfig":{');
        expect(body).toContain('"name":"Inner"');
    });

    it('should serialize query parameters with contentMediaType="application/json" as JSON string', () => {
        const { methodGen, serviceClass } = createTestEnv();
        const op: PathInfo = {
            method: 'GET',
            path: '/json-param',
            // Force method name, although parser does this usually
            methodName: 'getWithJsonParam',
            parameters: encodedContentSpec.paths['/json-param'].get.parameters as any,
            responses: encodedContentSpec.paths['/json-param'].get.responses,
        };

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getWithJsonParam').getBodyText()!;

        // Verify custom serialization hint "json" is passed to the builder call.
        // We check subsets of string to avoid failures on optional property ordering/presence like 'style' vs exploded defaults.
        expect(body).toContain('"serialization":"json"');
        expect(body).toContain('ParameterSerializer.serializeQueryParam('); // New generic call
        expect(body).toContain('"name":"filter"');
    });

    it('should include contentEncoding in response decoding config', () => {
        const { methodGen, serviceClass } = createTestEnv();
        const op: any = {
            method: 'GET',
            path: '/base64-response',
            methodName: 'getBase64Response',
            responses: encodedContentSpec.paths['/base64-response'].get.responses,
        };

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getBase64Response').getBodyText()!;
        expect(body).toContain('ContentDecoder.decode(response,');
        expect(body).toContain('"properties":{"blob":{"contentEncoding":"base64"}}');
    });
});
