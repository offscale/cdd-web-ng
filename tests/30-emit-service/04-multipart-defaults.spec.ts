import { describe, it, expect } from 'vitest';
import { Project, Scope } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from "@src/core/types/index.js";
import { TypeGenerator } from "@src/generators/shared/type.generator.js";
import { ServiceMethodGenerator } from "@src/generators/angular/service/service-method.generator.js";

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
                                            tags: { type: 'array', items: { type: 'string' } }
                                        }
                                    }
                                    // Note: No 'encoding' map provided. OAS says default for object/array is application/json.
                                }
                            }
                        },
                        responses: { '200': {} }
                    }
                }
            },
            components: {}
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

        // Updated Expectation: Logic delegated to MultipartBuilder
        expect(body).toContain('const multipartConfig = {};');
        expect(body).toContain('const multipartResult = MultipartBuilder.serialize(body, multipartConfig);');
        expect(body).toContain('return this.http.post(url, multipartResult.content, requestOptions as any);');
    });
});
