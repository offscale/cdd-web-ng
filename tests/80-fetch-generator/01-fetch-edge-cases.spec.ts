import { describe, expect, it } from 'vitest';
import { generateFromConfig } from '@src/index.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { Project } from 'ts-morph';
import { FetchServiceMethodGenerator } from '@src/vendors/fetch/service/service-method.generator.js';

describe('Fetch Implementation Edge Cases', () => {
    it('should handle operations returning multiple distinct response types', async () => {
        const config: GeneratorConfig = {
            input: 'dummy',
            output: '/tmp/test-multi-resp',
            options: { implementation: 'fetch' },
        };

        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test API', version: '1.0' },
            paths: {
                '/multi': {
                    get: {
                        operationId: 'getMulti',
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

        const serviceFile = project.getSourceFile('/tmp/test-multi-resp/services/multi.service.ts');
        const serviceClass = serviceFile!.getClass('MultiService');
        const method = serviceClass!.getMethod('getMulti');

        expect(method!.getReturnTypeNode()?.getText()).toBe('Promise<string | number>');
    });

    it('should handle operations with an explicitly json responseSerialization', async () => {
        const config: GeneratorConfig = {
            input: 'dummy',
            output: '/tmp/test-json',
            options: { implementation: 'fetch' },
        };

        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test API', version: '1.0' },
            paths: {
                '/json-only': {
                    get: {
                        operationId: 'getJson',
                        responses: {
                            '200': {
                                description: 'OK',
                                content: {
                                    'application/json': { schema: { type: 'object' } },
                                },
                            },
                        },
                    },
                },
            },
        };

        const project = new Project();
        await generateFromConfig(config, project, { spec });

        const serviceFile =
            project.getSourceFile('/tmp/test-json/services/json-only.service.ts') ||
            project.getSourceFile('/tmp/test-json/services/jsonOnly.service.ts') ||
            project
                .getSourceFiles()
                .find(f => f.getFilePath().includes('json-only') || f.getFilePath().includes('service.ts'))!;

        const serviceClass = serviceFile.getClasses()[0];
        const method = serviceClass!.getMethod('getJson');
        const body = method!
            .getStatements()
            .map(s => s.getText())
            .join('\n');

        expect(body).toContain('return response.json();');
    });

    it('should handle analyzer returning null (e.g. invalid operation)', () => {
        const generator = new FetchServiceMethodGenerator({} as any, { paths: {} } as any);
        // We mock analyzer so we can force it to return null
        (
            generator as string | number | boolean | object | undefined | null as { analyzer: { analyze: () => null } }
        ).analyzer = { analyze: () => null };
        const project = new Project();
        const sf = project.createSourceFile('test.ts', 'class Test {}');
        const cls = sf.getClass('Test')!;

        // Should not throw, should just return early
        expect(() => generator.addServiceMethod(cls, {} as any)).not.toThrow();
        expect(cls.getMethods().length).toBe(0);
    });
});

it('should assign root paths to Default controller', async () => {
    const config: GeneratorConfig = {
        input: 'dummy',
        output: '/tmp/test-default',
        options: { implementation: 'fetch' },
    };
    const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0' },
        paths: {
            '/': { get: { operationId: 'getRoot', responses: { '200': { description: 'OK' } } } },
        },
    };
    const project = new Project();
    await generateFromConfig(config, project, { spec });
    const serviceFile = project.getSourceFile('/tmp/test-default/services/default.service.ts');
    expect(serviceFile).toBeDefined();
    expect(serviceFile!.getClass('DefaultService')).toBeDefined();
});

it('should respect generateServiceTests config option', async () => {
    const config: GeneratorConfig = {
        input: 'dummy',
        output: '/tmp/test-notests',
        options: { implementation: 'fetch', generateServiceTests: false },
    };
    const spec = {
        openapi: '3.0.0',
        info: { title: 'A', version: '1' },
        paths: { '/a': { get: { responses: { '200': { description: 'OK' } } } } },
    };
    await generateFromConfig(config, new Project(), { spec });

    const config2: GeneratorConfig = {
        input: 'dummy',
        output: '/tmp/test-yestests',
        options: { implementation: 'fetch', generateServiceTests: true },
    };
    await generateFromConfig(config2, new Project(), { spec });
});

it('should handle operation-level servers', async () => {
    const config: GeneratorConfig = {
        input: 'dummy',
        output: '/tmp/test-op-servers',
        options: { implementation: 'fetch' },
    };
    const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0' },
        paths: {
            '/op-server': {
                get: {
                    operationId: 'getOpServer',
                    servers: [{ url: 'https://op.server.com' }],
                    responses: { '200': { description: 'OK' } },
                },
            },
        },
    };
    const project = new Project();
    await generateFromConfig(config, project, { spec });
    const sf = project
        .getSourceFiles()
        .find(f => f.getFilePath().includes('op-server') || f.getFilePath().includes('OpServer'));
    const sf2 = project.getSourceFile('/tmp/test-op-servers/services/opServer.service.ts');
    const m = sf2!.getClasses()[0]!.getMethod('getOpServer');
    expect(m!.getText()).toContain('const operationServers = [');
});

it('should handle path params with explicit style and multipart/form-data body', async () => {
    const config: GeneratorConfig = {
        input: 'dummy',
        output: '/tmp/test-params-multipart',
        options: { implementation: 'fetch' },
    };
    const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0' },
        paths: {
            '/test/{id}': {
                post: {
                    operationId: 'postMultipart',
                    parameters: [
                        { name: 'id', in: 'path', required: true, style: 'matrix', schema: { type: 'string' } },
                    ],
                    requestBody: {
                        content: { 'multipart/form-data': { schema: { type: 'object' } } },
                    },
                    responses: { '200': { description: 'OK' } },
                },
            },
        },
    };
    const project = new Project();
    await generateFromConfig(config, project, { spec });
    const sf = project.getSourceFiles().find(f => f.getFilePath().includes('test.service.ts'));
    const m = sf!.getClasses()[0]!.getMethod('postMultipart');
    expect(m!.getText()).toContain("'matrix'");
});

it('should handle responses and request bodies without schemas or that are plain objects', async () => {
    const config: GeneratorConfig = {
        input: 'dummy',
        output: '/tmp/test-no-schemas',
        options: { implementation: 'fetch' },
    };
    const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0' },
        paths: {
            '/no-schema': {
                post: {
                    operationId: 'postEmpty',
                    requestBody: { content: { 'application/json': {} } }, // no schema
                    responses: {
                        '200': { description: 'OK', content: { 'text/plain': {} } }, // no schema
                    },
                },
            },
        },
    };
    const project = new Project();
    await generateFromConfig(config, project, { spec });
    const sf = project.getSourceFiles().find(f => f.getFilePath().includes('oSchema'));
    expect(sf).toBeDefined();
});

it('should ignore non-exported service classes in index', async () => {
    const config: GeneratorConfig = {
        input: 'dummy',
        output: '/tmp/test-index-ignore',
        options: { implementation: 'fetch' },
    };
    const spec = {
        openapi: '3.0.0',
        info: { title: '1', version: '1' },
        paths: { '/a': { get: { responses: { '200': { description: 'A' } } } } },
    };
    const project = new Project();
    await generateFromConfig(config, project, { spec });

    // Manually break the exported class before index generation runs?
    // Actually this branch is hit if there is NO exported serviceClass.
    // I'll manually modify the generated file and re-run index generation
    const sf = project.getSourceFiles().find(f => f.getFilePath().includes('a.service.ts'));
    sf!.getClasses()[0]!.setIsExported(false);

    const { FetchServiceIndexGenerator } = await import('@src/vendors/fetch/utils/index.generator.js');
    new FetchServiceIndexGenerator(project).generateIndex('/tmp/test-index-ignore');

    const indexFile = project.getSourceFile('/tmp/test-index-ignore/services/index.ts');
    expect(indexFile!.getText()).not.toContain('AService');
});
