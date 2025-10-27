import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { Project } from 'ts-morph';
import { camelCase } from '../src/core/utils.js';
import { GeneratorConfig } from '../src/core/types.js';
import { SwaggerParser } from '../src/core/parser.js';
import { AdminGenerator } from '../src/service/emit/admin/admin.generator.js';
import * as resourceDiscovery from '../src/service/emit/admin/resource-discovery.js';
import { ServiceGenerator } from '../src/service/emit/service/service.generator.js';
import { ServiceIndexGenerator } from '../src/service/emit/utility/index.generator.js';
import { ProviderGenerator } from '../src/service/emit/utility/provider.generator.js';
import { TypeGenerator } from '../src/service/emit/type/type.generator.js';
import { FormComponentGenerator } from '../src/service/emit/admin/form-component.generator.ts';
import { basicControlsSpec } from './admin/specs/test.specs.js';

// The fs mock is no longer needed because templates are now imported.

describe('Coverage Enhancement Tests', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // This test covers the case where the admin generator isn't given any custom validators to generate.
    it('should not generate CustomValidators if not needed', async () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config = { options: { admin: true } } as GeneratorConfig;
        const parser = new SwaggerParser(JSON.parse(basicControlsSpec), config);
        const adminGen = new AdminGenerator(parser, project, config);
        await adminGen.generate('/output');

        const validatorFile = project.getSourceFile('/output/admin/shared/custom-validators.ts');
        expect(validatorFile).toBeUndefined();
    });

    // --- core/utils.ts ---
    it('should handle empty strings in case conversions', () => {
        expect(camelCase('')).toBe('');
    });

    // --- service/emit/admin/admin.generator.ts ---
    it('should warn and exit if no resources are discovered', async () => {
        vi.spyOn(resourceDiscovery, 'discoverAdminResources').mockReturnValue([]);
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const project = new Project({ useInMemoryFileSystem: true });
        const parser = new SwaggerParser({} as any, {} as any);
        const config = { options: {} } as GeneratorConfig;
        const adminGen = new AdminGenerator(parser, project, config);
        await adminGen.generate('/output');
        expect(consoleWarnSpy).toHaveBeenCalledWith("⚠️ No resources suitable for admin UI generation were found. Skipping.");
    });

    // --- service/emit/service/service.generator.ts ---
    it('should throw an error for duplicate function names', () => {
        const operations = [
            { method: 'GET', operationId: 'getStuff', path: '/a', tags: ['Test'] },
            { method: 'GET', operationId: 'getStuff', path: '/b', tags: ['Test'] }
        ];
        const project = new Project({ useInMemoryFileSystem: true });
        const parser = new SwaggerParser({} as any, { options: {} } as any);
        const serviceGen = new ServiceGenerator(parser, project, { options: {} } as any);
        expect(() => serviceGen.generateServiceFile('Test', operations as any, '/out'))
            .toThrow('Duplicate method names found in service class TestService. Please ensure operationIds are unique.');
    });

    // --- service/emit/type/type.generator.ts ---
    it('should generate a native enum when enumStyle is "enum"', () => {
        const spec = { components: { schemas: { Status: { type: 'string', enum: ['Active', 'In-active'] } } } };
        const project = new Project({ useInMemoryFileSystem: true });
        const config = { options: { enumStyle: 'enum' } } as GeneratorConfig
        const parser = new SwaggerParser(spec as any, config);
        const typeGen = new TypeGenerator(parser, project, config);
        typeGen.generate('/out');
        const fileContent = project.getSourceFile('/out/models/index.ts')?.getFullText();
        expect(fileContent).toContain('export enum Status {');
        expect(fileContent).toContain('Active = "Active"');
        expect(fileContent).toContain('InActive = "In-active"');
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

    it('should correctly index existing service files', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const servicesDir = project.createDirectory('/out/services');
        servicesDir.createSourceFile('users.service.ts', 'export class UsersService {}');

        const indexGen = new ServiceIndexGenerator(project);
        indexGen.generateIndex('/out');

        const indexFile = project.getSourceFile('/out/services/index.ts');
        expect(indexFile).toBeDefined();
        expect(indexFile?.getFullText()).toContain(`export { UsersService } from "./users.service";`);
    });

    // --- service/emit/utility/provider.generator.ts ---
    it('should not generate if generateServices is false', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config = { options: { generateServices: false } } as GeneratorConfig;
        const parser = new SwaggerParser({} as any, config);
        const providerGen = new ProviderGenerator(parser, project);
        providerGen.generate('/out');
        const file = project.getSourceFile('/out/providers.ts');
        expect(file).toBeUndefined();
    });
});
