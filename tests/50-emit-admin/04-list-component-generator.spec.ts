import { describe, it, expect, beforeAll } from 'vitest';
import { Project } from 'ts-morph';
import { ListComponentGenerator } from '../../src/service/emit/admin/list-component.generator.js';
import { discoverAdminResources } from '../../src/service/emit/admin/resource-discovery.js';
import { createTestProject } from '../shared/helpers.js';
import { coverageSpec } from '../shared/specs.js';
import { SwaggerParser } from '../../src/core/parser.js';

describe('Admin: ListComponentGenerator', () => {
    let project: Project;

    beforeAll(() => {
        project = createTestProject();
        const parser = new SwaggerParser(coverageSpec as any, { options: { admin: true } } as any);
        const resources = discoverAdminResources(parser);
        const listGen = new ListComponentGenerator(project);

        for (const resource of resources) {
            if (resource.operations.some(op => op.action === 'list')) {
                listGen.generate(resource, '/admin');
            }
        }
    });

    describe('Users List (Full CRUD)', () => {
        it('should generate TS, HTML, and SCSS files', () => {
            expect(project.getSourceFile('/admin/users/users-list/users-list.component.ts')).toBeDefined();
            // FIX: Use fileExistsSync instead of findFiles
            expect(project.getFileSystem().fileExistsSync('/admin/users/users-list/users-list.component.html')).toBe(true);
            expect(project.getFileSystem().fileExistsSync('/admin/users/users-list/users-list.component.scss')).toBe(true);
        });

        it('should generate a component class with required properties', () => {
            const listClass = project.getSourceFileOrThrow('/admin/users/users-list/users-list.component.ts').getClassOrThrow('UsersListComponent');
            expect(listClass.getProperty('paginator')).toBeDefined();
        });

        it('should generate data loading logic inside an effect', () => {
            const constructorBody = project.getSourceFileOrThrow('/admin/users/users-list/users-list.component.ts')
                .getClassOrThrow('UsersListComponent').getConstructors()[0].getBodyText() ?? '';
            expect(constructorBody).toContain('this.usersService.getUsers(');
        });

        it('should generate CRUD action methods and include actions column', () => {
            const listClass = project.getSourceFileOrThrow('/admin/users/users-list/users-list.component.ts').getClassOrThrow('UsersListComponent');
            expect(listClass.getMethod('onEdit')).toBeDefined();
            expect(listClass.getProperty('displayedColumns')?.getInitializer()?.getText()).toContain("'actions'");
        });

        it('should use the correct ID property for actions', () => {
            const html = project.getFileSystem().readFileSync('/admin/users/users-list/users-list.component.html');
            expect(html).toContain('onEdit(row.id)');
        });
    });

    describe('Logs List (Read-Only)', () => {
        it('should generate a read-only component without edit methods or actions column', () => {
            const listClass = project.getSourceFileOrThrow('/admin/logs/logs-list/logs-list.component.ts').getClassOrThrow('LogsListComponent');
            expect(listClass.getMethod('onEdit')).toBeUndefined();

            // FIX: The generator logic was updated to not add the 'actions' column if there are no actions.
            const displayedColumns = listClass.getProperty('displayedColumns')?.getInitializer()?.getText();
            expect(displayedColumns).not.toContain("'actions'");

            const html = project.getFileSystem().readFileSync('/admin/logs/logs-list/logs-list.component.html');
            expect(html).not.toContain('(click)="onCreate()"');
            expect(html).not.toContain('matColumnDef="actions"');
        });
    });
});
