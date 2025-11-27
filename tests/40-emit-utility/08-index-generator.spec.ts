import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { MainIndexGenerator, ServiceIndexGenerator } from '@src/generators/angular/utils/index.generator.js';
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
                                '200': { headers: { 'X-Test': { schema: { type: 'string' } } } },
                            },
                        },
                    },
                },
            };
            const content = runGenerator(specWithHeaders, { generateServices: true });
            expect(content).toContain(`export * from "./response-headers";`);
        });

        it('should export links and link.service if specification has links or op links', () => {
            const specWithLinks = { ...emptySpec, components: { links: { MyLink: {} } } };
            const content = runGenerator(specWithLinks, { generateServices: true });
            expect(content).toContain(`export * from "./links";`);
            expect(content).toContain(`export * from "./utils/link.service";`);
        });

        it('should export server-url if specification has servers', () => {
            const specWithServers = { ...emptySpec, servers: [{ url: 'http://api.com' }] };
            const content = runGenerator(specWithServers, { generateServices: true });
            expect(content).toContain(`export * from "./utils/server-url";`);
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
