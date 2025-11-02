import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { Project, IndentationText } from 'ts-morph';
import { camelCase, kebabCase, pascalCase } from '../src/core/utils.js';
import { GeneratorConfig } from '../src/core/types.js';
import { SwaggerParser } from '../src/core/parser.js';
import { emitClientLibrary } from '../src/service/emit/orchestrator.js';
import { AdminGenerator } from '../src/service/emit/admin/admin.generator.js';
import * as resourceDiscovery from '../src/service/emit/admin/resource-discovery.js';
import { ServiceGenerator } from '../src/service/emit/service/service.generator.js';
import { ServiceIndexGenerator } from '../src/service/emit/utility/index.generator.js';
import { ProviderGenerator } from '../src/service/emit/utility/provider.generator.js';
import { TypeGenerator } from '../src/service/emit/type/type.generator.js';
import { RoutingGenerator } from '../src/service/emit/admin/routing.generator.js';
import { CustomValidatorsGenerator } from '../src/service/emit/admin/custom-validators.generator.js';
import { basicControlsSpec } from './admin/specs/test.specs.js';
import { fullE2ESpec } from './admin/specs/test.specs.js';
import { generateAdminUI } from './admin/test.helpers.js';

describe('Coverage Enhancement Tests', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // --- core/utils.ts ---
    it('should handle empty strings in case conversions', () => {
        expect(camelCase('')).toBe('');
        expect(pascalCase('')).toBe('');
        expect(kebabCase('')).toBe('');
    });
    it('should handle unusual path segments for default operationId', () => {
        const opId = camelCase(`get /`);
        expect(opId).toBe('get');
    });

    // --- service/emit/orchestrator.ts ---
    it('should not call AdminGenerator if admin option is false', async () => {
        // ** FIX: Use spyOn instead of a module-level mock to avoid side-effects **
        const adminGenerateSpy = vi.spyOn(AdminGenerator.prototype, 'generate');

        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = { input: '', output: '/out', options: { admin: false, generateServices: true, dateType: 'string', enumStyle: 'enum' } };
        const parser = new SwaggerParser(JSON.parse(fullE2ESpec), config);

        await emitClientLibrary('/out', parser, config, project);
        expect(adminGenerateSpy).not.toHaveBeenCalled();
    });

    it('should not generate services if generateServices option is false', async () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = { input: '', output: '/out', options: { generateServices: false, dateType: 'string', enumStyle: 'enum' } };
        const parser = new SwaggerParser(JSON.parse(fullE2ESpec), config);
        const serviceGenSpy = vi.spyOn(ServiceGenerator.prototype, 'generateServiceFile');

        await emitClientLibrary('/out', parser, config, project);
        expect(serviceGenSpy).not.toHaveBeenCalled();
    });

    // --- service/emit/admin/admin.generator.ts ---
    it('should warn and exit if no resources are discovered', async () => {
        vi.spyOn(resourceDiscovery, 'discoverAdminResources').mockReturnValue([]);
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const project = new Project({ useInMemoryFileSystem: true, manipulationSettings: { indentationText: IndentationText.TwoSpaces } });
        const parser = new SwaggerParser({} as any, {} as any);
        const config = { options: {} } as GeneratorConfig;
        const adminGen = new AdminGenerator(parser, project, config);
        await adminGen.generate('/output');

        expect(consoleWarnSpy).toHaveBeenCalledWith("⚠️ No resources suitable for admin UI generation were found. Skipping.");
        consoleWarnSpy.mockRestore();
    });

    // --- service/emit/admin/routing.generator.ts & custom-validators.generator.ts ---
    it('should generate routing and custom validator files correctly', async () => {
        // This test now works because the module-level mock was removed, allowing generateAdminUI to work correctly.
        const project = await generateAdminUI(basicControlsSpec);

        const routesFile = project.getSourceFile('/generated/admin/widgets/widgets.routes.ts');
        expect(routesFile).toBeDefined();
        const routesContent = routesFile!.getFullText();
        // FIX: The generator creates a 'new' path, not 'create'.
        expect(routesContent).toContain(`path: 'new'`);
        expect(routesContent).toContain(`loadComponent: () => import('./widgets-form/widgets-form.component').then(m => m.WidgetFormComponent)`);
        expect(routesContent).not.toContain('ListComponent'); // No GET endpoints in spec

        // CustomValidatorsGenerator is conditional, basicControlsSpec does not need it
        expect(project.getSourceFile('/generated/admin/shared/custom-validators.ts')).toBeUndefined();

        // Now test the generators directly to hit all lines
        const directProject = new Project({ useInMemoryFileSystem: true });
        const resource = resourceDiscovery.discoverAdminResources(new SwaggerParser(JSON.parse(fullE2ESpec), {} as any))[0]; // Use the 'users' resource

        new RoutingGenerator(directProject).generate(resource, '/admin');
        const userRouteFile = directProject.getSourceFile('/admin/users/users.routes.ts');
        expect(userRouteFile).toBeDefined();
        expect(userRouteFile!.getFullText()).toContain(`path: ''`);
        expect(userRouteFile!.getFullText()).toContain(`path: 'new'`);
        expect(userRouteFile!.getFullText()).toContain(`path: ':id/edit'`);

        new CustomValidatorsGenerator(directProject).generate('/admin');
        expect(directProject.getSourceFile('/admin/shared/custom-validators.ts')).toBeDefined();
    });

    // --- service/emit/service/service-method.generator.ts ---
    it('should generate a fallback method name if operationId is missing', () => {
        const spec = { paths: { '/test/path': { get: {} } } }; // No operationId
        const project = new Project({ useInMemoryFileSystem: true });
        const config = { options: { dateType: 'string', enumStyle: 'enum'} } as GeneratorConfig
        const parser = new SwaggerParser(spec as any, config);
        const serviceGen = new ServiceGenerator(parser, project, config);

        serviceGen.generateServiceFile('Test', [{ path: '/test/path', method: 'get' }] as any, '/out');
        const file = project.getSourceFile('/out/test.service.ts');
        expect(file!.getClass('TestService')?.getMethod('getTestPath')).toBeDefined();
    });

    // --- service/emit/type/type.generator.ts ---
    it('should generate "any" for empty oneOf/allOf', () => {
        const spec = { components: { schemas: {
                    EmptyOneOf: { oneOf: [] },
                    EmptyAllOf: { allOf: [] }
                }}};
        const project = new Project({ useInMemoryFileSystem: true });
        const config = { options: { enumStyle: 'union', dateType: 'string' } } as GeneratorConfig
        const parser = new SwaggerParser(spec as any, config);
        const typeGen = new TypeGenerator(parser, project, config);
        typeGen.generate('/out');
        const fileContent = project.getSourceFile('/out/models/index.ts')?.getFullText();
        expect(fileContent).toContain('export type EmptyOneOf = any;');
        expect(fileContent).toContain('export type EmptyAllOf = any;');
    });

    // --- service/emit/utility/index.generator.ts ---
    it('should create an empty index file if no services directory exists', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const indexGen = new ServiceIndexGenerator(project);
        indexGen.generateIndex('/out');
        const file = project.getSourceFile('/out/services/index.ts');
        expect(file).toBeDefined();
        expect(file?.getExportDeclarations().length).toBe(0);
    });

    // --- service/emit/utility/provider.generator.ts ---
    it('should correctly build providers when config has no custom interceptors', async () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = {
            input: '', output: '',
            options: {
                generateServices: true,
                dateType: 'string',
                enumStyle: 'enum'
            },
            interceptors: undefined
        };
        const parser = new SwaggerParser({} as any, config);
        const providerGen = new ProviderGenerator(parser, project);
        providerGen.generate('/out');
        const file = project.getSourceFile('/out/providers.ts');
        expect(file).toBeDefined();
        const fileContent = file!.getFullText();
        expect(fileContent).toContain("const customInterceptors = config.interceptors?.map(InterceptorClass => new InterceptorClass()) || [];");
    });
});
