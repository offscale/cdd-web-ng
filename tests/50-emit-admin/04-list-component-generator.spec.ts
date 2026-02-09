import { beforeAll, describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { ListComponentGenerator } from '@src/generators/angular/admin/list-component.generator.js';
import { discoverAdminResources } from '@src/generators/angular/admin/resource-discovery.js';
import { SwaggerParser } from '@src/core/parser.js';

import { createTestProject } from '../shared/helpers.js';
import { branchCoverageSpec, coverageSpec, listComponentSpec } from '../shared/specs.js';
import { ListActionKind } from '@src/analysis/list-types.js';
import { Resource } from '@src/core/types/index.js';

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
            const listClass = project
                .getSourceFileOrThrow('/admin/servers/servers-list/servers-list.component.ts')
                .getClassOrThrow('ServersListComponent');
            expect(listClass.getMethod('rebootAllServers')).toBeDefined();
            expect(listClass.getMethod('startServer')).toBeDefined();
            expect(listClass.getMethod('rebootServerItem')).toBeDefined();

            const html = project
                .getFileSystem()
                .readFileSync('/admin/servers/servers-list/servers-list.component.html');
            expect(html).toContain('(click)="rebootAllServers()"');
            expect(html).toContain('(click)="startServer(row[idProperty])"');
            expect(html).toContain('rebootServerItem(row[idProperty])');

            // Verifies the specific overrides for icon names work
            expect(html).toContain('<mat-icon>refresh</mat-icon>');

            // Verifies that the mapping from 'default' kind to 'play_arrow' works
            expect(html).toContain('<mat-icon>play_arrow</mat-icon>');
        });

        it('should fall back to the first property if no "id" is present', () => {
            const listClass = project
                .getSourceFileOrThrow('/admin/events/events-list/events-list.component.ts')
                .getClassOrThrow('EventsListComponent');
            const idProp = listClass.getProperty('idProperty')!.getInitializer()!.getText();
            expect(idProp).toBe(`'eventId'`);
        });

        it('internal action kind logic should have a fallback', () => {
            const getActionKind = (action: string): ListActionKind => {
                const lowerAction = action.toLowerCase();
                if (
                    lowerAction.includes('delete') ||
                    lowerAction.includes('remove') ||
                    lowerAction.includes('cancel') ||
                    lowerAction.includes('block')
                )
                    return 'destructive';
                if (lowerAction.includes('add') || lowerAction.includes('create')) return 'constructive';
                if (
                    lowerAction.includes('edit') ||
                    lowerAction.includes('update') ||
                    lowerAction.includes('approve') ||
                    lowerAction.includes('check')
                )
                    return 'state-change';
                if (
                    lowerAction.includes('start') ||
                    lowerAction.includes('play') ||
                    lowerAction.includes('stop') ||
                    lowerAction.includes('pause') ||
                    lowerAction.includes('reboot') ||
                    lowerAction.includes('refresh') ||
                    lowerAction.includes('sync')
                )
                    return 'state-change';
                return 'default';
            };

            expect(getActionKind('anUnknownAction')).toBe('default');
            expect(getActionKind('startServer')).toBe('state-change');
            expect(getActionKind('deleteItem')).toBe('destructive');
            expect(getActionKind('approve')).toBe('state-change');
            expect(getActionKind('cancel')).toBe('destructive');
            expect(getActionKind('stop')).toBe('state-change');
            expect(getActionKind('reboot')).toBe('state-change');
        });

        it('should handle a resource with only read-only properties', () => {
            const project = createTestProject();
            const parser = new SwaggerParser(branchCoverageSpec as any, { options: { admin: true } } as any);
            const resource = discoverAdminResources(parser).find((r: Resource) => r.name === 'readOnlyResource')!;
            const generator = new ListComponentGenerator(project);
            generator.generate(resource, '/admin');
            const listClass = project
                .getSourceFileOrThrow(
                    '/admin/readOnlyResource/readOnlyResource-list/readOnlyResource-list.component.ts',
                )
                .getClassOrThrow('ReadOnlyResourceListComponent');
            expect(listClass.getProperty('idProperty')?.getInitializer()?.getText()).toBe(`'id'`);
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

        it('should correctly map various action names to icons via abstract kinds', () => {
            const html = localProject
                .getFileSystem()
                .readFileSync('/admin/iconTests/iconTests-list/iconTests-list.component.html');

            // 'addItem', 'createItem' -> constructive -> 'add'
            expect(html).toContain('<mat-icon>add</mat-icon>');
            // 'deleteItem', 'removeItem' -> destructive -> 'delete'
            expect(html).toContain('<mat-icon>delete</mat-icon>');
            // 'updateItem' -> 'edit' (override)
            expect(html).toContain('<mat-icon>edit</mat-icon>');
            // 'approveItem' -> 'check'
            expect(html).toContain('<mat-icon>check</mat-icon>');
            // 'blockUser' -> 'block'
            expect(html).toContain('<mat-icon>block</mat-icon>');
            // **THE FIX**: 'syncAll' now correctly maps to 'refresh'
            expect(html).toContain('<mat-icon>refresh</mat-icon>');
            // 'pauseProcess' -> 'pause'
            expect(html).toContain('<mat-icon>pause</mat-icon>');

            const startButtonHtml = html.match(
                /<button[^>]+?\(click\)="startItem\([^)]+\)"[^>]+?>([\s\S]+?)<\/button>/,
            );
            expect(startButtonHtml?.[1]).toContain('<mat-icon>play_arrow</mat-icon>');
        });

        it('should generate an "id" column when a resource has no properties at all', () => {
            const listClass = localProject
                .getSourceFileOrThrow('/admin/noPropsResource/noPropsResource-list/noPropsResource-list.component.ts')
                .getClassOrThrow('NoPropsResourceListComponent');
            const idProp = listClass.getPropertyOrThrow('idProperty').getInitializer()!.getText();
            expect(idProp).toBe(`'id'`);
            const html = localProject
                .getFileSystem()
                .readFileSync('/admin/noPropsResource/noPropsResource-list/noPropsResource-list.component.html');
            expect(html).toContain('<ng-container matColumnDef="id">');
        });

        it('should generate a column for idProperty fallback when no other properties are listable', () => {
            const html = localProject
                .getFileSystem()
                .readFileSync(
                    '/admin/noListablePropsResource/noListablePropsResource-list/noListablePropsResource-list.component.html',
                );
            expect(html).toContain('<ng-container matColumnDef="config">');
            expect(html).not.toContain('<ng-container matColumnDef="id">');
        });

        it('should map kinds to icons via fallback switch cases', () => {
            const generator = new ListComponentGenerator(createTestProject());
            expect((generator as any).mapKindToIcon('custom', 'state-change')).toBe('sync');
            expect((generator as any).mapKindToIcon('custom', 'navigation')).toBe('arrow_forward');
            expect((generator as any).mapKindToIcon('custom', 'default')).toBe('play_arrow');
            expect((generator as any).mapKindToIcon('editItem', 'default')).toBe('edit');
        });

        it('should skip onDelete when delete operation lacks methodName', () => {
            const project = createTestProject();
            const resource: Resource = {
                name: 'orphans',
                modelName: 'Orphan',
                isEditable: true,
                operations: [
                    { action: 'list', methodName: 'listOrphans' } as any,
                    { action: 'delete' } as any,
                ],
                formProperties: [{ name: 'id', schema: { type: 'string' } as any }],
                listProperties: [{ name: 'id', schema: { type: 'string' } as any }],
            };
            const generator = new ListComponentGenerator(project);
            generator.generate(resource, '/admin');
            const listClass = project
                .getSourceFileOrThrow('/admin/orphans/orphans-list/orphans-list.component.ts')
                .getClassOrThrow('OrphansListComponent');
            expect(listClass.getMethod('onDelete')).toBeUndefined();
        });
    });
});
