import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '../../src/core/parser.js';
import { GeneratorConfig } from '../../src/core/types.js';
import { MainIndexGenerator, ServiceIndexGenerator } from '../../src/service/emit/utility/index.generator.js';
import { emptySpec, securitySpec } from '../shared/specs.js';

describe('Emitter: IndexGenerators', () => {

    describe('MainIndexGenerator', () => {
        const runGenerator = (spec: object, options: Partial<GeneratorConfig['options']>) => {
            const project = new Project({ useInMemoryFileSystem: true });
            const config: GeneratorConfig = { input: '', output: '/out', options: { dateType: 'string', enumStyle: 'enum', ...options } };
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
    });

    describe('ServiceIndexGenerator', () => {
        it('should create an empty index if no services directory exists', () => {
            const project = new Project({ useInMemoryFileSystem: true });
            // Do not create the '/out/services' directory
            new ServiceIndexGenerator(project).generateIndex('/out');
            const file = project.getSourceFile('/out/services/index.ts');
            expect(file).toBeDefined();
            // The guard clause `if (!servicesDirectory) { return; }` should be hit.
            expect(file?.getExportDeclarations().length).toBe(0);
        });

        it('should export all found services', () => {
            const project = new Project({ useInMemoryFileSystem: true });
            const serviceDir = project.createDirectory('/out/services');
            serviceDir.createSourceFile('users.service.ts', 'export class UsersService {}');
            serviceDir.createSourceFile('products.service.ts', 'export class ProductsService {}');

            new ServiceIndexGenerator(project).generateIndex('/out');
            const content = project.getSourceFileOrThrow('/out/services/index.ts').getText();
            expect(content).toContain(`export { UsersService } from "./users.service";`);
            expect(content).toContain(`export { ProductsService } from "./products.service";`);
        });

        it('should ignore files that do not contain an exported class', () => {
            const project = new Project({ useInMemoryFileSystem: true });
            const serviceDir = project.createDirectory('/out/services');
            serviceDir.createSourceFile('users.service.ts', 'export class UsersService {}');
            serviceDir.createSourceFile('helpers.ts', 'export const helper = 1;'); // Not a service file

            new ServiceIndexGenerator(project).generateIndex('/out');
            const content = project.getSourceFileOrThrow('/out/services/index.ts').getText();
            expect(content).toContain(`export { UsersService } from "./users.service";`);
            expect(content).not.toContain(`helpers`);
        });
    });
});
