import { describe, it, expect } from 'vitest';
import { discoverAdminResources } from '@src/service/emit/admin/resource-discovery.js';
import { SwaggerParser } from '@src/core/parser.js';
import { coverageSpecPart2 } from '../shared/specs.js';
import { ListComponentGenerator } from '@src/service/emit/admin/list-component.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { Resource } from '@src/core/types.js';

/**
 * @fileoverview
 * This file contains targeted tests for the admin UI generators to cover specific
 * edge cases in resource discovery, component generation logic, and HTML building
 * that are not covered by other tests.
 */
describe('Admin Generators (Coverage)', () => {

    it('resource-discovery should use fallback action name when no operationId is present', () => {
        const parser = new SwaggerParser(coverageSpecPart2 as any, { options: {} } as any);
        const resources = discoverAdminResources(parser);
        const resource = resources.find((r: Resource) => r.name === 'noIdOpId');
        expect(resource).toBeDefined();
        // The final fallback computes the name from the method 'head' and path 'no-id-opid', which becomes 'headNoIdOpid'.
        expect(resource!.operations[0].action).toBe('headNoIdOpid');
    });

    it('resource-discovery should handle resources with no defined schemas', () => {
        const parser = new SwaggerParser(coverageSpecPart2 as any, { options: {} } as any);
        const resources = discoverAdminResources(parser);
        const resource = resources.find((r: Resource) => r.name === 'noSchemaResource');
        expect(resource).toBeDefined();
        // It should fall back to a default 'id' property.
        expect(resource!.formProperties).toEqual([{ name: 'id', schema: { type: 'string' } }]);
    });

    it('list-component-generator getIconForAction should fall back for unknown actions', () => {
        const generator = new ListComponentGenerator(createTestProject());
        // Accessing the private method for targeted testing.
        const getIcon = (action: string): string => (generator as any).getIconForAction(action);
        expect(getIcon('undefinedAction')).toBe('play_arrow'); // Default fallback
    });

    it('list-component-generator handles listable resource with no actions', () => {
        // This spec defines a resource that can be listed but has no edit/delete/custom actions.
        const spec = {
            paths: {
                '/reports': { get: { tags: ['Reports'], responses: { '200': { description: 'ok' } } } }
            }
        };
        const project = createTestProject();
        const parser = new SwaggerParser(spec as any, { options: { admin: true } } as any);
        const resource = discoverAdminResources(parser).find((r: Resource) => r.name === 'reports')!;
        const generator = new ListComponentGenerator(project);

        generator.generate(resource, '/admin');

        const listClass = project.getSourceFileOrThrow('/admin/reports/reports-list/reports-list.component.ts').getClassOrThrow('ReportsListComponent');
        const displayedColumns = listClass.getProperty('displayedColumns')?.getInitializer()?.getText() as string;

        // This ensures the `if (hasActions)` branch is correctly NOT taken.
        expect(displayedColumns).not.toContain('actions');
    });

    it('list-component-generator handles listable resource with no actions', () => {
        // This spec defines a resource that can be listed but has no edit/delete/custom actions.
        const spec = {
            paths: {
                '/reports': { get: { tags: ['Reports'], responses: { '200': { description: 'ok' } } } }
            }
        };
        const project = createTestProject();
        const parser = new SwaggerParser(spec as any, { options: { admin: true } } as any);
        const resource = discoverAdminResources(parser).find((r: Resource) => r.name === 'reports')!;
        const generator = new ListComponentGenerator(project);

        generator.generate(resource, '/admin');

        const listClass = project.getSourceFileOrThrow('/admin/reports/reports-list/reports-list.component.ts').getClassOrThrow('ReportsListComponent');
        const displayedColumns = listClass.getProperty('displayedColumns')?.getInitializer()?.getText() as string;

        // This ensures the `if (hasActions)` branch is correctly NOT taken.
        expect(displayedColumns).not.toContain('actions');
    });

    it('list-component-generator handles resource with no actions and non-id primary key', () => {
        const spec = {
            paths: {
                '/diagnostics': {
                    get: {
                        tags: ['Diagnostics'],
                        responses: {
                            '200': {
                                content: {
                                    'application/json': { schema: { $ref: '#/components/schemas/DiagnosticInfo' } }
                                }
                            }
                        }
                    }
                }
            },
            components: {
                schemas: {
                    DiagnosticInfo: {
                        type: 'object',
                        properties: { event_id: { type: 'string' }, message: { type: 'string' } }
                    }
                }
            }
        };
        const project = createTestProject();
        const parser = new SwaggerParser(spec as any, { options: { admin: true } } as any);
        const resource = discoverAdminResources(parser).find((r: Resource) => r.name === 'diagnostics')!;
        const generator = new ListComponentGenerator(project);
        generator.generate(resource, '/admin');
        const listClass = project.getSourceFileOrThrow('/admin/diagnostics/diagnostics-list/diagnostics-list.component.ts').getClassOrThrow('DiagnosticsListComponent');
        const displayedColumns = listClass.getProperty('displayedColumns')?.getInitializer()?.getText() as string;
        expect(displayedColumns).not.toContain('actions');
        const idProperty = listClass.getProperty('idProperty')?.getInitializer()?.getText() as string;
        expect(idProperty).toBe(`'event_id'`);
    });
});
