import { describe, it, expect, vi } from 'vitest';
import { Project } from 'ts-morph';
import { AdminGenerator } from '../../src/service/emit/admin/admin.generator.js';
import * as resourceDiscovery from '../../src/service/emit/admin/resource-discovery.js';
import { createTestProject } from '../shared/helpers.js';
import { coverageSpec } from '../shared/specs.js';
import { SwaggerParser } from '../../src/core/parser.js';
import { CustomValidatorsGenerator } from '../../src/service/emit/admin/custom-validators.generator.js';

describe('Admin: AdminGenerator (Orchestrator)', () => {

    it('should call specialist generators for each suitable resource', async () => {
        const project = createTestProject();
        const parser = new SwaggerParser(coverageSpec as any, { options: { admin: true } } as any);
        const adminGen = new AdminGenerator(parser, project, { options: {} } as any);

        await adminGen.generate('/out');

        // Users: Has list and form operations
        expect(project.getSourceFile('/out/admin/users/users-list/users-list.component.ts')).toBeDefined();
        expect(project.getSourceFile('/out/admin/users/users-form/users-form.component.ts')).toBeDefined();
        expect(project.getSourceFile('/out/admin/users/users.routes.ts')).toBeDefined();

        // Publications: Has only form operations
        expect(project.getSourceFile('/out/admin/publications/publications-list/publications-list.component.ts')).toBeUndefined();
        expect(project.getSourceFile('/out/admin/publications/publications-form/publications-form.component.ts')).toBeDefined();
    });

    it('should generate a master routing file', async () => {
        const project = createTestProject();
        const parser = new SwaggerParser(coverageSpec as any, { options: { admin: true } } as any);
        const adminGen = new AdminGenerator(parser, project, { options: {} } as any);

        await adminGen.generate('/out');
        expect(project.getSourceFile('/out/admin/admin.routes.ts')).toBeDefined();
    });

    it('should conditionally generate custom validators file', async () => {
        const project = createTestProject();
        const parser = new SwaggerParser(coverageSpec as any, { options: { admin: true } } as any);
        // This spec does NOT require custom validators
        const adminGen = new AdminGenerator(parser, project, { options: {} } as any);

        const validatorSpy = vi.spyOn(CustomValidatorsGenerator.prototype, 'generate');
        await adminGen.generate('/out');
        expect(validatorSpy).not.toHaveBeenCalled();
    });

    it('should warn and exit gracefully if no resources are discovered', async () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(resourceDiscovery, 'discoverAdminResources').mockReturnValue([]);

        const project = createTestProject();
        const parser = new SwaggerParser({} as any, { options: {} } as any);
        const adminGen = new AdminGenerator(parser, project, { options: {} } as any);

        await adminGen.generate('/out');
        expect(consoleWarnSpy).toHaveBeenCalledWith("⚠️ No resources suitable for admin UI generation were found. Skipping.");

        vi.restoreAllMocks();
    });
});
