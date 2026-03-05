import { describe, expect, it, vi, afterEach } from 'vitest';
import { generateFromConfig } from '@src/index.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { Project } from 'ts-morph';
import { ServiceMethodAnalyzer } from '@src/functions/parse_analyzer.js';

describe('Axios Implementation Edge Cases', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should assign root paths to Default controller and handle no generated tests', async () => {
        const config: GeneratorConfig = {
            input: 'dummy',
            output: '/tmp/test-output-edge',
            options: {
                implementation: 'axios',
                generateServices: true,
                generateServiceTests: false,
            },
        };

        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test API', version: '1.0' },
            paths: {
                '/': {
                    get: {
                        operationId: 'getRoot',
                        responses: {
                            '200': {
                                description: 'OK',
                                content: {
                                    'application/json': { schema: { type: 'string' } },
                                },
                            },
                        },
                    },
                },
                '/notags': {
                    get: {
                        operationId: 'getNoTags',
                        tags: [], // empty tags array
                        responses: {
                            '200': { description: 'OK' },
                        },
                    },
                },
            },
        };

        const project = new Project();
        await generateFromConfig(config, project, { spec });

        // Root path defaults to 'Default' controller
        const serviceFile = project.getSourceFile('/tmp/test-output-edge/services/default.service.ts');
        expect(serviceFile).toBeDefined();

        const notagsFile = project.getSourceFile('/tmp/test-output-edge/services/notags.service.ts');
        expect(notagsFile).toBeDefined();
    });

    it('should handle operation with invalid analyzer state (returns null) and no schema requestBody', async () => {
        const config: GeneratorConfig = {
            input: 'dummy',
            output: '/tmp/test-output-invalid',
            options: { implementation: 'axios' },
        };

        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test API', version: '1.0' },
            paths: {
                '/invalid': {
                    get: {
                        responses: {
                            '200': {
                                description: 'OK',
                                content: {
                                    'application/json': {}, // missing schema
                                },
                            },
                        },
                    },
                    put: {
                        operationId: 'putNoSchema',
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: { type: 'string' }, // type string evaluates isDataTypeInterface to false
                                },
                            },
                        },
                        responses: {
                            '204': { description: 'No content' },
                        },
                    },
                },
            },
        };

        const project = new Project();
        await generateFromConfig(config, project, { spec });
        const serviceFile = project.getSourceFile('/tmp/test-output-invalid/services/invalid.service.ts');
        expect(serviceFile).toBeDefined();
    });

    it('should handle unexported service classes and null class names in index generator', async () => {
        const config: GeneratorConfig = {
            input: 'dummy',
            output: '/tmp/test-output-unexported',
            options: { implementation: 'axios' },
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

        const serviceFile = project.getSourceFile('/tmp/test-output-unexported/services/test.service.ts');
        const serviceClass = serviceFile!.getClass('TestService');
        serviceClass!.setIsExported(false);

        const { AxiosServiceIndexGenerator } = await import('@src/vendors/axios/utils/index.generator.js');
        const indexGen = new AxiosServiceIndexGenerator(project);
        indexGen.generateIndex('/tmp/test-output-unexported');

        const indexFile = project.getSourceFile('/tmp/test-output-unexported/services/index.ts');
        expect(indexFile!.getText()).not.toContain('export { TestService }');
    });

    it('should handle arraybuffer response type', async () => {
        const config: GeneratorConfig = {
            input: 'dummy',
            output: '/tmp/test-output-arraybuffer',
            options: { implementation: 'axios' },
        };

        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test API', version: '1.0' },
            paths: {
                '/buffer': {
                    get: {
                        operationId: 'getBuffer',
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
            },
        };

        const originalAnalyze = ServiceMethodAnalyzer.prototype.analyze;
        vi.spyOn(ServiceMethodAnalyzer.prototype, 'analyze').mockImplementation(function (
            this: ServiceMethodAnalyzer,
            op: PathInfo,
        ) {
            const result = originalAnalyze.call(this, op);
            if (result && result.methodName === 'getBuffer') {
                result.responseSerialization = 'arraybuffer';
            }
            return result;
        });

        const project = new Project();
        await generateFromConfig(config, project, { spec });

        const serviceFile = project.getSourceFile('/tmp/test-output-arraybuffer/services/buffer.service.ts');
        const serviceClass = serviceFile!.getClass('BufferService');
        const getBufferMethod = serviceClass!.getMethod('getBuffer');

        expect(getBufferMethod!.getText()).toContain("responseType = 'arraybuffer'");
    });
});

it('should handle multiple distinct response types and raw body type', async () => {
    const config: GeneratorConfig = {
        input: 'dummy',
        output: '/tmp/test-output-distinct',
        options: { implementation: 'axios' },
    };

    const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0' },
        paths: {
            '/distinct': {
                post: {
                    operationId: 'postDistinct',
                    requestBody: {
                        content: {
                            'text/plain': { schema: { type: 'string' } },
                        },
                    },
                    responses: {
                        '200': {
                            description: 'OK',
                            content: {
                                'application/json': { schema: { type: 'string' } },
                            },
                        },
                        '201': {
                            description: 'Created',
                            content: {
                                'application/json': { schema: { type: 'number' } },
                            },
                        },
                    },
                },
            },
        },
    };

    const project = new Project();
    await generateFromConfig(config, project, { spec });

    const serviceFile = project.getSourceFile('/tmp/test-output-distinct/services/distinct.service.ts');
    const serviceClass = serviceFile!.getClass('DistinctService');
    const postDistinctMethod = serviceClass!.getMethod('postDistinct');

    expect(postDistinctMethod!.getReturnTypeNode()?.getText()).toContain('Promise<string | number>');

    const methodBody = postDistinctMethod!
        .getStatements()
        .map(s => s.getText())
        .join('\n');
    expect(methodBody).toContain("headers['Content-Type'] = 'application/json'");
});

it('should handle multipart body type', async () => {
    const config: GeneratorConfig = {
        input: 'dummy',
        output: '/tmp/test-output-multipart',
        options: { implementation: 'axios' },
    };

    const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0' },
        paths: {
            '/multipart': {
                post: {
                    operationId: 'postMultipart',
                    requestBody: {
                        content: {
                            'multipart/form-data': {
                                schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
                            },
                        },
                    },
                    responses: {
                        '200': { description: 'OK' },
                    },
                },
            },
        },
    };

    const project = new Project();
    await generateFromConfig(config, project, { spec });

    const serviceFile = project.getSourceFile('/tmp/test-output-multipart/services/multipart.service.ts');
    const serviceClass = serviceFile!.getClass('MultipartService');
    const postMultipartMethod = serviceClass!.getMethod('postMultipart');

    const methodBody = postMultipartMethod!
        .getStatements()
        .map(s => s.getText())
        .join('\n');
    expect(methodBody).toContain('axiosConfig.data = body'); // It falls through to the new handling logic
});

it('should handle explicit path style and multiple error responses', async () => {
    const config: GeneratorConfig = {
        input: 'dummy',
        output: '/tmp/test-output-style',
        options: { implementation: 'axios' },
    };

    const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0' },
        paths: {
            '/style/{id}': {
                get: {
                    operationId: 'getStyle',
                    parameters: [
                        { name: 'id', in: 'path', required: true, style: 'matrix', schema: { type: 'string' } },
                    ],
                    responses: {
                        '200': { description: 'OK' },
                        '400': {
                            description: 'Bad Request',
                            content: { 'application/json': { schema: { type: 'string' } } },
                        },
                        '404': {
                            description: 'Not Found',
                            content: { 'application/json': { schema: { type: 'string' } } },
                        },
                        '500': {
                            description: 'Internal',
                            content: { 'application/json': { schema: { type: 'number' } } },
                        },
                    },
                },
            },
        },
    };

    const project = new Project();
    await generateFromConfig(config, project, { spec });
    const serviceFile = project.getSourceFile('/tmp/test-output-style/services/style.service.ts');
    const serviceClass = serviceFile!.getClass('StyleService');
    const method = serviceClass!.getMethod('getStyle');

    const methodBody = method!
        .getStatements()
        .map(s => s.getText())
        .join('\n');
    expect(methodBody).toContain("'matrix'");
});

it('should handle operation with invalid analyzer state explicitly mocked (returns null)', async () => {
    const config: GeneratorConfig = {
        input: 'dummy',
        output: '/tmp/test-output-mocked-null',
        options: { implementation: 'axios' },
    };

    const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0' },
        paths: {
            '/mocked': {
                get: {
                    operationId: 'getMocked',
                    responses: { '200': { description: 'OK' } },
                },
            },
        },
    };

    const originalAnalyze = ServiceMethodAnalyzer.prototype.analyze;
    vi.spyOn(ServiceMethodAnalyzer.prototype, 'analyze').mockImplementation(function (
        this: ServiceMethodAnalyzer,
        op: PathInfo,
    ) {
        return null;
    });

    const project = new Project();
    await generateFromConfig(config, project, { spec });
    const serviceFile = project.getSourceFile('/tmp/test-output-mocked-null/services/mocked.service.ts');
    expect(serviceFile).toBeDefined();

    const serviceClass = serviceFile!.getClass('MockedService');
    // Because analyze returned null, no method should be added to the class!
    expect(serviceClass!.getMethods().length).toBe(0);
});
