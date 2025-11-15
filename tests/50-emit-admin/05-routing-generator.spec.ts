import { describe, it, expect, beforeAll } from 'vitest';
import { Project } from 'ts-morph';
import { RoutingGenerator } from '../../src/service/emit/admin/routing.generator.js';
import { discoverAdminResources } from '../../src/service/emit/admin/resource-discovery.js';
import { createTestProject } from '../shared/helpers.js';
import { coverageSpec } from '../shared/specs.js';
import { SwaggerParser } from '../../src/core/parser.js';

describe('Admin: RoutingGenerator', () => {
    let project: Project;
    let resources: ReturnType<typeof discoverAdminResources>;

    beforeAll(() => {
        project = createTestProject();
        const parser = new SwaggerParser(coverageSpec as any, { options: { admin: true } } as any);
        resources = discoverAdminResources(parser);
        const routingGen = new RoutingGenerator(project);

        for (const resource of resources) {
            routingGen.generate(resource, '/admin');
        }
        routingGen.generateMaster(resources, '/admin');
    });

    it('should generate a master routes file with a default redirect', () => {
        const fileContent = project.getSourceFileOrThrow('/admin/admin.routes.ts').getText();
        expect(fileContent).toContain("export const adminRoutes: Routes = [");
        expect(fileContent).toContain("{ path: '', pathMatch: 'full', redirectTo: 'users' }");
    });

    it('should generate routes for a full CRUD resource (Users)', () => {
        const fileContent = project.getSourceFileOrThrow('/admin/users/users.routes.ts').getText();
        expect(fileContent).toContain(`path: ''`);
        expect(fileContent).toContain(`path: 'new'`);
        expect(fileContent).toContain(`path: ':id/edit'`);
    });

    it('should generate routes for a create-only resource (Publications)', () => {
        const fileContent = project.getSourceFileOrThrow('/admin/publications/publications.routes.ts').getText();
        expect(fileContent).not.toContain(`path: ''`);
        expect(fileContent).toContain(`path: 'new'`);
        expect(fileContent).not.toContain(`':id/edit'`);
    });

    it('should generate routes for an update-only resource (Configs)', () => {
        const fileContent = project.getSourceFileOrThrow('/admin/configs/configs.routes.ts').getText();
        expect(fileContent).not.toContain(`path: ''`);
        expect(fileContent).not.toContain(`path: 'new'`);
        expect(fileContent).toContain(`path: ':id/edit'`);
    });

    it('should generate an empty master routes file if no resources are provided', () => {
        const localProject = createTestProject();
        new RoutingGenerator(localProject).generateMaster([], '/admin');
        const varDecl = localProject.getSourceFileOrThrow('/admin/admin.routes.ts').getVariableDeclarationOrThrow('adminRoutes');
        // FIX: Check the initializer text is just an empty array
        expect(varDecl.getInitializer()?.getText()).toMatch(/\[\s*\]/);
    });
});
