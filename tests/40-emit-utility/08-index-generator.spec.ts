import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/openapi/parse.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { MainIndexGenerator, ServiceIndexGenerator } from '@src/vendors/angular/utils/index.generator.js';
import { emptySpec, securitySpec } from '../shared/specs.js';
import { createTestProject } from '../shared/helpers.js';
import path from 'node:path';

describe('Emitter: IndexGenerators', () => {
    describe('MainIndexGenerator', () => {
        const runGenerator = (spec: object, options: Partial<GeneratorConfig['options']>) => {
            const project = new Project({ useInMemoryFileSystem: true });
            const config: GeneratorConfig = {
                input: '',
                output: '/out',
                options: { dateType: 'string', enumStyle: 'enum', framework: 'angular', ...options },
            };
            const parser = new SwaggerParser(spec as any, config);
            new MainIndexGenerator(project, config, parser).generateMainIndex('/out');
            return project.getSourceFileOrThrow('/out/index.ts').getText();
        };

        it('should only export models when generateServices is false', () => {
            const content = runGenerator(emptySpec, { generateServices: false });
            expect(content).toContain(`export * from "./models";`);
            expect(content).not.toContain(`export * from "./services";`);
        });

        it('should export all relevant modules when generateServices is true', () => {
            const content = runGenerator(emptySpec, { generateServices: true });
            expect(content).toContain(`export * from "./models";`);
            expect(content).toContain(`export * from "./services";`);
            expect(content).toContain(`export * from "./tokens";`);
            expect(content).toContain(`export * from "./providers";`);
            expect(content).toContain(`export * from "./utils/file-download";`);
        });

        it('should conditionally export date-transformer', () => {
            const withDate = runGenerator(emptySpec, { generateServices: true, dateType: 'Date' });
            expect(withDate).toContain(`export * from "./utils/date-transformer";`);

            const withoutDate = runGenerator(emptySpec, { generateServices: true, dateType: 'string' });
            expect(withoutDate).not.toContain(`export * from "./utils/date-transformer";`);
        });

        it('should conditionally export auth tokens', () => {
            const withAuth = runGenerator(securitySpec, { generateServices: true });
            expect(withAuth).toContain(`export * from "./auth/auth.tokens";`);

            const withoutAuth = runGenerator(emptySpec, { generateServices: true });
            expect(withoutAuth).not.toContain(`export * from "./auth/auth.tokens";`);
        });

        it('should export response-headers if specification has response headers', () => {
            const specWithHeaders = {
                ...emptySpec,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': { description: 'ok', headers: { 'X-Test': { schema: { type: 'string' } } } },
                            },
                        },
                    },
                },
            };
            const content = runGenerator(specWithHeaders, { generateServices: true });
            expect(content).toContain(`export * from "./response-headers";`);
        });

        it('should export links and link.service if specification has links or op links', () => {
            const specWithLinks = {
                ...emptySpec,
                components: { links: { MyLink: { operationId: 'getNext' } } },
            };
            const content = runGenerator(specWithLinks, { generateServices: true });
            expect(content).toContain(`export * from "./links";`);
            expect(content).toContain(`export * from "./utils/link.service";`);
        });

        it('should export links when operation responses include links', () => {
            const specWithOpLinks = {
                ...emptySpec,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    description: 'ok',
                                    links: {
                                        Next: { operationId: 'getNext' },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            const content = runGenerator(specWithOpLinks, { generateServices: true });
            expect(content).toContain(`export * from "./links";`);
            expect(content).toContain(`export * from "./utils/link.service";`);
        });

        it('should export callbacks when operations define callbacks', () => {
            const specWithCallbacks = {
                ...emptySpec,
                paths: {
                    '/test': {
                        post: {
                            callbacks: {
                                onEvent: {
                                    '{$request.body#/url}': {
                                        post: {
                                            responses: { '200': { description: 'ok' } },
                                        },
                                    },
                                },
                            },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            const content = runGenerator(specWithCallbacks, { generateServices: true });
            expect(content).toContain(`export * from "./callbacks";`);
        });

        it('should export callbacks when only component callbacks are defined', () => {
            const specWithComponentCallbacks = {
                ...emptySpec,
                components: {
                    callbacks: {
                        onEvent: {
                            '{$request.body#/url}': {
                                post: {
                                    responses: { '200': { description: 'ok' } },
                                },
                            },
                        },
                    },
                },
            };
            const content = runGenerator(specWithComponentCallbacks, { generateServices: true });
            expect(content).toContain(`export * from "./callbacks";`);
        });

        it('should export webhooks and webhook.service when webhooks are defined', () => {
            const specWithWebhooks = {
                ...emptySpec,
                webhooks: {
                    onEvent: {
                        post: {
                            requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            const content = runGenerator(specWithWebhooks, { generateServices: true });
            expect(content).toContain(`export * from "./webhooks";`);
            expect(content).toContain(`export * from "./utils/webhook.service";`);
        });

        it('should export webhooks when only component webhooks are defined', () => {
            const specWithComponentWebhooks = {
                ...emptySpec,
                components: {
                    webhooks: {
                        onEvent: {
                            post: {
                                requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
                                responses: { '200': { description: 'ok' } },
                            },
                        },
                    },
                },
            };
            const content = runGenerator(specWithComponentWebhooks, { generateServices: true });
            expect(content).toContain(`export * from "./webhooks";`);
            expect(content).toContain(`export * from "./utils/webhook.service";`);
        });

        it('should export server-url if specification has servers', () => {
            const specWithServers = { ...emptySpec, servers: [{ url: 'http://api.com' }] };
            const content = runGenerator(specWithServers, { generateServices: true });
            expect(content).toContain(`export * from "./utils/server-url";`);
        });

        it('should export component registries when examples/mediaTypes/pathItems exist', () => {
            const specWithComponents = {
                ...emptySpec,
                components: {
                    examples: { Sample: { summary: 'Example', dataValue: { id: 1 } } },
                    mediaTypes: { EventStream: { schema: { type: 'string' } } },
                    pathItems: { Ping: { get: { responses: { '200': { description: 'pong' } } } } },
                    headers: { TraceId: { schema: { type: 'string' } } },
                    parameters: { Limit: { name: 'limit', in: 'query', schema: { type: 'integer' } } },
                    requestBodies: { CreateUser: { content: { 'application/json': { schema: { type: 'object' } } } } },
                    responses: { NotFound: { description: 'Not found' } },
                },
            };
            const content = runGenerator(specWithComponents, { generateServices: true });
            expect(content).toContain(`export * from "./examples";`);
            expect(content).toContain(`export * from "./media-types";`);
            expect(content).toContain(`export * from "./path-items";`);
            expect(content).toContain(`export * from "./headers";`);
            expect(content).toContain(`export * from "./parameters";`);
            expect(content).toContain(`export * from "./request-bodies";`);
            expect(content).toContain(`export * from "./responses";`);
        });

        it('should export paths metadata when path-level details exist', () => {
            const specWithPathMeta = {
                ...emptySpec,
                paths: {
                    '/pets': {
                        summary: 'Pets',
                        get: { responses: { '200': { description: 'ok' } } },
                    },
                },
            };
            const content = runGenerator(specWithPathMeta, { generateServices: true });
            expect(content).toContain(`export * from "./paths";`);
        });

        it('should not export server-url for Swagger specs without servers', () => {
            const swaggerSpec = {
                swagger: '2.0',
                info: { title: 'Swagger', version: '1.0' },
                paths: { '/': { get: { responses: { '200': { description: 'ok' } } } } },
            };
            const content = runGenerator(swaggerSpec, { generateServices: true });
            expect(content).not.toContain(`export * from "./utils/server-url";`);
        });

        it('should handle missing services dir when generateServices is false', () => {
            const project = createTestProject();
            const config: GeneratorConfig = {
                output: '/',
                options: { framework: 'angular', generateServices: false },
            } as any;
            const parser = new SwaggerParser(emptySpec as any, config);
            new MainIndexGenerator(project, parser.config, parser).generateMainIndex('/');
            const content = project.getSourceFileOrThrow('/index.ts').getText();
            expect(content).not.toContain('export * from "./services"');
        });
    });

    describe('ServiceIndexGenerator', () => {
        it('should NOT create an index if no service files exist', () => {
            const project = new Project({ useInMemoryFileSystem: true });
            // Create the directory but no files
            project.createDirectory('/out/services');

            // In virtual FS, resolve works against cwd, need to ensure paths align for test consistency
            // but generateIndex logic uses resolve.
            new ServiceIndexGenerator(project).generateIndex('/out');

            const file = project.getSourceFile('/out/services/index.ts');
            expect(file).toBeUndefined();
        });

        it('should export all found services and ignore others', () => {
            const project = new Project({ useInMemoryFileSystem: true });
            // Create files
            // When using inMemoryFS, we need to ensure path resolution logic holds.
            // project.createSourceFile adds to root usually unless specified.
            // But verify absolute paths match what generateIndex expects.

            // NOTE: We rely on resolve. In a virtual environment, we must use absolute paths
            // to ensure resolve behaves deterministically relative to project root.
            const outPath = path.resolve('/out');

            project.createSourceFile(path.join(outPath, 'services/users.service.ts'), 'export class UsersService {}');
            project.createSourceFile(
                path.join(outPath, 'services/products.service.ts'),
                'export class ProductsService {}',
            );
            project.createSourceFile(path.join(outPath, 'services/helpers.ts'), 'export const helper = 1;');
            project.createSourceFile(path.join(outPath, 'services/internal.service.ts'), 'class InternalService {}');
            project.createSourceFile(path.join(outPath, 'services/empty.service.ts'), '');

            new ServiceIndexGenerator(project).generateIndex('/out');

            const file = project.getSourceFile(path.join(outPath, 'services/index.ts'));
            expect(file).toBeDefined();

            const content = file!.getText();
            expect(content).toContain(`export { UsersService } from "./users.service";`);
            expect(content).toContain(`export { ProductsService } from "./products.service";`);
            expect(content).not.toContain(`helpers`);
            expect(content).not.toContain(`InternalService`);
            expect(content).not.toContain(`empty.service`);
        });
    });
});
