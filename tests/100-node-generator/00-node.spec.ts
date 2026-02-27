import { describe, expect, it } from 'vitest';
import { generateFromConfig, TestGeneratorConfig } from '@src/index.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/openapi/parse.js';
import { NodeClientGenerator } from '@src/vendors/node/node-client.generator.js';

describe('Node Implementation', () => {
    describe('Config Validation', () => {
        it('should throw if admin UI is requested with node implementation', async () => {
            const config: GeneratorConfig = {
                input: 'dummy',
                output: 'dummy',
                options: {
                    implementation: 'node',
                    admin: true,
                },
            };

            await expect(generateFromConfig(config, new Project(), { spec: {} })).rejects.toThrow(
                'Not implemented: Admin UI is not supported when the implementation/transport is node.',
            );
        });

        it('should execute NodeClientGenerator successfully when admin is false', async () => {
            const config: GeneratorConfig = {
                input: 'dummy',
                output: '/tmp/test-output',
                options: {
                    implementation: 'node',
                    admin: false,
                    generateServices: true,
                },
            };

            const spec = {
                openapi: '3.0.0',
                info: { title: 'Test API', version: '1.0' },
                paths: {
                    '/test': {
                        get: {
                            operationId: 'getTest',
                            responses: {
                                '200': {
                                    description: 'OK',
                                    content: {
                                        'application/json': {
                                            schema: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };

            const project = new Project();
            await generateFromConfig(config, project, { spec });

            const sourceFiles = project.getSourceFiles();
            expect(sourceFiles.length).toBeGreaterThan(0);

            const serviceFile = sourceFiles.find(f => f.getFilePath().endsWith('test.service.ts'));
            expect(serviceFile).toBeDefined();

            const serviceClass = serviceFile!.getClass('TestService');
            expect(serviceClass).toBeDefined();

            const getTestMethod = serviceClass!.getMethod('getTest');
            expect(getTestMethod).toBeDefined();

            expect(getTestMethod!.getReturnTypeNode()?.getText()).toBe('Promise<string>');
            const statements = getTestMethod!.getStatements().map(s => s.getText());
            const methodBody = statements.join(String.fromCharCode(10));
            expect(methodBody).toContain('requestOptions');
        });
    });

    describe('NodeClientGenerator and Index generation', () => {
        it('should export services properly from index', async () => {
            const config: GeneratorConfig = {
                input: 'dummy',
                output: '/tmp/test-output',
                options: {
                    implementation: 'node',
                    generateServices: true,
                },
            };

            const spec = {
                openapi: '3.0.0',
                info: { title: 'Test API', version: '1.0' },
                paths: {
                    '/test': {
                        get: {
                            operationId: 'getTest',
                            responses: { '200': { description: 'OK' } },
                        },
                    },
                },
            };

            const project = new Project();
            await generateFromConfig(config, project, { spec });
            const mainIndex = project.getSourceFile('/tmp/test-output/index.ts');
            expect(mainIndex).toBeDefined();
            expect(mainIndex!.getText()).toContain('./services');

            const servicesIndex = project.getSourceFile('/tmp/test-output/services/index.ts');
            expect(servicesIndex).toBeDefined();
            expect(servicesIndex!.getText()).toContain('export { TestService } from "./test.service";');
        });
    });

    describe('NodeServiceMethodGenerator', () => {
        it('should handle URL params, query params, headers, and body correctly', async () => {
            const config: GeneratorConfig = {
                input: 'dummy',
                output: '/tmp/test-output',
                options: { implementation: 'node' },
            };

            const spec = {
                openapi: '3.0.0',
                info: { title: 'Test API', version: '1.0' },
                paths: {
                    '/complex/{id}': {
                        post: {
                            tags: ['Complex'],
                            operationId: 'createComplex',
                            parameters: [
                                { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                                {
                                    name: 'queryParam',
                                    in: 'query',
                                    schema: { $ref: '#/components/schemas/QueryModel' },
                                },
                                { name: 'X-Custom-Header', in: 'header', schema: { type: 'string' } },
                            ],
                            requestBody: {
                                content: {
                                    'application/json': { schema: { $ref: '#/components/schemas/BodyModel' } },
                                },
                            },
                            responses: {
                                '200': {
                                    description: 'OK',
                                    content: {
                                        'application/json': { schema: { $ref: '#/components/schemas/ResponseModel' } },
                                    },
                                },
                                '400': {
                                    description: 'Bad Request',
                                    content: {
                                        'application/json': { schema: { $ref: '#/components/schemas/ErrorModel' } },
                                    },
                                },
                            },
                        },
                        put: {
                            tags: ['Complex'],
                            operationId: 'updateUrlEncoded',
                            servers: [{ url: 'https://custom.server.com' }],
                            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                            requestBody: {
                                content: {
                                    'application/x-www-form-urlencoded': { schema: { type: 'object' } },
                                },
                            },
                            responses: { '200': { description: 'OK' } },
                        },
                    },
                },
                components: {
                    schemas: {
                        QueryModel: { type: 'object', properties: { p: { type: 'string' } } },
                        BodyModel: { type: 'object', properties: { p: { type: 'string' } } },
                        ResponseModel: { type: 'object', properties: { p: { type: 'string' } } },
                        ErrorModel: { type: 'object', properties: { msg: { type: 'string' } } },
                    },
                },
            };

            const project = new Project();
            await generateFromConfig(config, project, { spec });

            const serviceFile = project.getSourceFile('/tmp/test-output/services/complex.service.ts');
            const serviceClass = serviceFile!.getClass('ComplexService');

            const postMethod = serviceClass!.getMethod('createComplex');
            const postBody = postMethod!
                .getStatements()
                .map(s => s.getText())
                .join(String.fromCharCode(10));

            expect(postBody).toContain('serializePathParam');
            expect(postBody).toContain('serializeQueryParam');
            expect(postBody).toContain('serializeHeaderParam');
            expect(postBody).toContain('application/json');
            expect(postBody).toContain('JSON.stringify');
            expect(postBody).toContain('requestOptions');

            const putMethod = serviceClass!.getMethod('updateUrlEncoded');
            const putBody = putMethod!
                .getStatements()
                .map(s => s.getText())
                .join(String.fromCharCode(10));
            expect(putBody).toContain('serializeUrlEncodedBody');
            expect(putBody).toContain('application/x-www-form-urlencoded');
        });
        it('should handle blob, arraybuffer, and text response types', async () => {
            const config: GeneratorConfig = {
                input: 'dummy',
                output: '/tmp/test-output-types',
                options: { implementation: 'node' },
            };

            const spec = {
                openapi: '3.0.0',
                info: { title: 'Test API', version: '1.0' },
                paths: {
                    '/api/blob': {
                        get: {
                            operationId: 'getBlob',
                            responses: {
                                '200': {
                                    description: 'OK',
                                    content: {
                                        'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
                                    },
                                },
                            },
                        },
                    },
                    '/api/buffer': {
                        get: {
                            operationId: 'getBuffer',
                            responses: {
                                '200': {
                                    description: 'OK',
                                    content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
                                },
                            },
                        },
                    },
                    '/api/text': {
                        get: {
                            operationId: 'getText',
                            responses: {
                                '200': { description: 'OK', content: { 'text/plain': { schema: { type: 'string' } } } },
                            },
                        },
                    },
                    '/api/empty': {
                        get: {
                            responses: { '200': { description: 'OK' } },
                        },
                    },
                },
            };

            const project = new Project();
            await generateFromConfig(config, project, { spec });

            const serviceFile = project.getSourceFile('/tmp/test-output-types/services/api.service.ts');
            const serviceClass = serviceFile!.getClass('ApiService');

            expect(
                serviceClass!
                    .getMethod('getBlob')!
                    .getStatements()
                    .map(s => s.getText())
                    .join('\\n'),
            ).toContain('resolve(buffer as any)');
            expect(
                serviceClass!
                    .getMethod('getBuffer')!
                    .getStatements()
                    .map(s => s.getText())
                    .join('\\n'),
            ).toContain('resolve(buffer as any)');
            expect(
                serviceClass!
                    .getMethod('getText')!
                    .getStatements()
                    .map(s => s.getText())
                    .join('\\n'),
            ).toContain("resolve(buffer.toString('utf-8') as any)");
        });

        it('should generate properly without services when generateServices is false', async () => {
            const config: GeneratorConfig = {
                input: 'dummy',
                output: '/tmp/test-output-noservices',
                options: { implementation: 'node', generateServices: false },
            };

            const spec = { openapi: '3.0.0', info: { title: 'API', version: '1' }, paths: {} };
            const project = new Project();
            await generateFromConfig(config, project, { spec });

            expect(project.getSourceFile('/tmp/test-output-noservices/services/index.ts')).toBeUndefined();
        });

        it('should generate properly with empty services index when no operations exist', async () => {
            const config: GeneratorConfig = {
                input: 'dummy',
                output: '/tmp/test-output-emptyops',
                options: { implementation: 'node' },
            };

            const spec = { openapi: '3.0.0', info: { title: 'API', version: '1' }, paths: {} };
            const project = new Project();
            await generateFromConfig(config, project, { spec });

            expect(project.getSourceFile('/tmp/test-output-emptyops/services/index.ts')).toBeUndefined();
        });
    });
});
