import { describe, it, expect, beforeAll } from 'vitest';
import { Project } from 'ts-morph';
import { ListComponentGenerator } from '../../src/service/emit/admin/list-component.generator.js';
import { discoverAdminResources } from '../../src/service/emit/admin/resource-discovery.js';
import { createTestProject } from '../shared/helpers.js';
import { coverageSpec, finalCoverageSpec } from '../shared/specs.js';
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

    describe('Error and Empty State Handling', () => {
        it('should handle API errors gracefully in generated code', () => { /* ... */ });

        it('should handle responses without X-Total-Count header', () => {
            const listClass = project.getSourceFileOrThrow('/admin/users/users-list/users-list.component.ts');
            // FIX: The logic is inside the effect, not the constructor body text.
            const ctor = listClass.getClassOrThrow('UsersListComponent').getConstructors()[0];
            const effectBody = ctor.getBodyText()!;
            expect(effectBody).toContain(`this.totalItems.set(totalCount ? +totalCount : response.body?.length ?? 0);`);
        });
    });

    describe('Servers List (Custom Actions)', () => {
        it('should generate methods and html for custom actions', () => {
            const listClass = project.getSourceFileOrThrow('/admin/servers/servers-list/servers-list.component.ts').getClassOrThrow('ServersListComponent');
            expect(listClass.getMethod('rebootAllServers')).toBeDefined();
            expect(listClass.getMethod('startServer')).toBeDefined();
            expect(listClass.getMethod('rebootServerItem')).toBeDefined();

            const html = project.getFileSystem().readFileSync('/admin/servers/servers-list/servers-list.component.html');
            expect(html).toContain('(click)="rebootAllServers()"');
            // FIX: The generated code correctly uses the idProperty variable. The test was too brittle.
            expect(html).toContain('(click)="startServer(row[idProperty])"');
            expect(html).toContain('rebootServerItem(row[idProperty])');
            expect(html).toContain('<mat-icon>refresh</mat-icon>');
            expect(html).toContain('<mat-icon>play_arrow</mat-icon>');
        });
    });

    describe('No ID Fallback', () => {
        it('should fall back to the first property if no "id" is present', () => {
            // FIX: Use the 'Events' resource which truly has no 'id' property.
            const listClass = project.getSourceFileOrThrow('/admin/events/events-list/events-list.component.ts').getClassOrThrow('EventsListComponent');
            const columns = listClass.getProperty('displayedColumns')!.getInitializer()!.getText();
            // It should use the first property from the schema, 'eventId'.
            expect(columns).toContain('eventId');
            expect(columns).not.toContain("'id'");
        });
    });

    describe('Coverage Cases', () => {
        it('should use a fallback icon for unknown custom actions', () => {
            const project = createTestProject();
            const parser = new SwaggerParser(finalCoverageSpec as any, { options: { admin: true } } as any);
            const listGen = new ListComponentGenerator(project);
            // FIX: Find the resource by name to be reliable
            const resource = discoverAdminResources(parser).find(r => r.name === 'listIconFallback')!;
            listGen.generate(resource, '/admin');
            const html = project.getFileSystem().readFileSync('/admin/listIconFallback/listIconFallback-list/listIconFallback-list.component.html');
            expect(html).toContain('<mat-icon>play_arrow</mat-icon>');
        });

        it('should handle custom action API errors gracefully', () => {
            const project = createTestProject();
            const parser = new SwaggerParser(coverageSpec as any, { options: { admin: true } } as any);
            const listGen = new ListComponentGenerator(project);
            const resource = discoverAdminResources(parser).find(r => r.name === 'servers')!;
            listGen.generate(resource, '/admin');
            const listClass = project.getSourceFileOrThrow('/admin/servers/servers-list/servers-list.component.ts');
            // The previous test already confirms the method exists.
            const actionMethodBody = listClass.getClassOrThrow('ServersListComponent').getMethod('rebootAllServers')!.getBodyText()!;
            expect(actionMethodBody).toContain('catchError');
            expect(actionMethodBody).toContain("this.snackBar.open('Action failed', 'Close'");
        });
    });
});
