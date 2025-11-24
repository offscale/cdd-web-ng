import { beforeAll, describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { ListComponentGenerator } from '@src/generators/angular/admin/list-component.generator.js';
import { discoverAdminResources } from '@src/service/emit/admin/resource-discovery.js';
import { createTestProject } from '../shared/helpers.js';
import { coverageSpec, listComponentSpec } from '../shared/specs.js';
import { SwaggerParser } from '@src/core/parser.js';

describe('Generators (Angular): ListComponentGenerator', () => {
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

    describe('General Generation', () => {
        it('should handle API errors gracefully in generated code', () => {
            const listClass = project.getSourceFileOrThrow('/admin/users/users-list/users-list.component.ts');
            const ctor = listClass.getClassOrThrow('UsersListComponent').getConstructors()[0];
            const effectBody = ctor.getBodyText()!;
            expect(effectBody).toContain(`catchError(() => of(null))`);
            expect(effectBody).toContain(`if (response === null)`);
        });

        it('should handle responses without X-Total-Count header', () => {
            const listClass = project.getSourceFileOrThrow('/admin/users/users-list/users-list.component.ts');
            const ctor = listClass.getClassOrThrow('UsersListComponent').getConstructors()[0];
            const effectBody = ctor.getBodyText()!;
            expect(effectBody).toContain(`this.totalItems.set(totalCount ? +totalCount : response.body?.length ?? 0);`);
        });

        it('should generate methods and html for custom actions', () => {
            const listClass = project.getSourceFileOrThrow('/admin/servers/servers-list/servers-list.component.ts').getClassOrThrow('ServersListComponent');
            expect(listClass.getMethod('rebootAllServers')).toBeDefined();
            expect(listClass.getMethod('startServer')).toBeDefined();
            expect(listClass.getMethod('rebootServerItem')).toBeDefined();

            const html = project.getFileSystem().readFileSync('/admin/servers/servers-list/servers-list.component.html');
            expect(html).toContain('(click)="rebootAllServers()"');
            expect(html).toContain('(click)="startServer(row[idProperty])"');
            expect(html).toContain('rebootServerItem(row[idProperty])');
            expect(html).toContain('<mat-icon>refresh</mat-icon>');
            expect(html).toContain('<mat-icon>play_arrow</mat-icon>');
        });

        it('should fall back to the first property if no "id" is present', () => {
            const listClass = project.getSourceFileOrThrow('/admin/events/events-list/events-list.component.ts').getClassOrThrow('EventsListComponent');
            const idProp = listClass.getProperty('idProperty')!.getInitializer()!.getText();
            expect(idProp).toBe(`'eventId'`);
        });
    });

    describe('Targeted Coverage Cases', () => {
        let localProject: Project;

        beforeAll(() => {
            localProject = createTestProject();
            const parser = new SwaggerParser(listComponentSpec as any, { options: { admin: true } } as any);
            const resources = discoverAdminResources(parser);
            const listGen = new ListComponentGenerator(localProject);

            for (const resource of resources) {
                if (resource.operations.some(op => op.action === 'list')) {
                    listGen.generate(resource, '/admin');
                }
            }
        });

        it('should correctly map various action names to icons', () => {
            const html = localProject.getFileSystem().readFileSync('/admin/iconTests/iconTests-list/iconTests-list.component.html');

            expect(html).toContain('<mat-icon>add</mat-icon>');
            expect(html).toContain('<mat-icon>delete</mat-icon>');
            expect(html).toContain('<mat-icon>edit</mat-icon>');
            expect(html).toContain('<mat-icon>play_arrow</mat-icon>');
            expect(html).toContain('<mat-icon>pause</mat-icon>');
            expect(html).toContain('<mat-icon>refresh</mat-icon>');
            expect(html).toContain('<mat-icon>check</mat-icon>');
            expect(html).toContain('<mat-icon>block</mat-icon>');
        });

        it('should generate an "id" column when a resource has no properties at all', () => {
            const listClass = localProject.getSourceFileOrThrow('/admin/noPropsResource/noPropsResource-list/noPropsResource-list.component.ts').getClassOrThrow('NoPropsResourceListComponent');
            const idProp = listClass.getPropertyOrThrow('idProperty').getInitializer()!.getText();
            expect(idProp).toBe(`'id'`);
            const html = localProject.getFileSystem().readFileSync('/admin/noPropsResource/noPropsResource-list/noPropsResource-list.component.html');
            expect(html).toContain('<ng-container matColumnDef="id">');
        });

        it('should generate a column for idProperty fallback when no other properties are listable', () => {
            const html = localProject.getFileSystem().readFileSync('/admin/noListablePropsResource/noListablePropsResource-list/noListablePropsResource-list.component.html');
            expect(html).toContain('<ng-container matColumnDef="config">');
            expect(html).not.toContain('<ng-container matColumnDef="id">');
        });
    });
});
