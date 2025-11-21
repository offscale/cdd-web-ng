import { describe, it, expect } from 'vitest';
import { Project, Scope } from 'ts-morph';
import { ServiceMethodGenerator } from '@src/service/emit/service/service-method.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types.js';
import { TypeGenerator } from '@src/service/emit/type/type.generator.js';

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

    it('should serialize object properties in multipart as application/json Blob by default', () => {
        const { methodGen, serviceClass, parser } = createTestEnv();
        const op = parser.operations.find(o => o.operationId === 'uploadComplex')!;

        // Ensure methodName is set as the parser usually does this in groupPathsByController
        op.methodName = 'uploadComplex';

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('uploadComplex').getBodyText()!;

        // It should detect 'metadata' is an object and treat it as complex
        // We expect it to NOT trust simple string conversion, but use Blob + JSON
        expect(body).toContain(`const propertyTypes = {"id":"string","metadata":"object","tags":"array"}`);

        // The generated logic loop
        expect(body).toContain(`const isComplex = propType === 'object' || propType === 'array';`);
        expect(body).toContain(`if (encoding?.contentType || isComplex) {`);

        // Default content type assignment
        expect(body).toContain(`const contentType = encoding?.contentType || 'application/json';`);

        // Serialization checks
        expect(body).toContain(`JSON.stringify(value)`);
        expect(body).toContain(`new Blob([content], { type: contentType })`);
    });
});
