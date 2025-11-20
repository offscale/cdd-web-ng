import { beforeAll, describe, expect, it } from 'vitest';
import { discoverAdminResources } from '@src/service/emit/admin/resource-discovery.js';
import { SwaggerParser } from '@src/core/parser.js';
import { coverageSpecPart2 } from '../shared/specs.js';
import { ListComponentGenerator } from '@src/service/emit/admin/list-component.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { Project } from 'ts-morph';
import { FormComponentGenerator } from '@src/service/emit/admin/form-component.generator.js';
import { Resource } from '@src/core/types.js';

/**
 * @fileoverview
 * This file contains targeted tests for the admin UI generators to cover specific
 * edge cases in resource discovery, component generation logic, and HTML building
 * that are not covered by other tests.
 */
const formGenCoverageSpec = {
    openapi: '3.0.0',
    info: { title: 'Form Gen Coverage', version: '1.0' },
    paths: {
        '/update-only/{id}': {
            put: {
                tags: ['UpdateOnly'],
                operationId: 'updateTheThing',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateOnly' } } } },
                responses: { '200': {} },
            },
            get: {
                tags: ['UpdateOnly'],
                operationId: 'getTheThing',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateOnly' } } } } },
            },
        },
        '/poly-mixed': {
            post: {
                tags: ['PolyMixed'],
                operationId: 'createPolyMixed',
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/PolyMixed' } } } },
                responses: { '201': {} },
            },
        },
        '/no-submit/{id}': {
            get: {
                tags: ['NoSubmit'],
                responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/NoSubmit' } } } } }
            },
            delete: { tags: ['NoSubmit'], parameters: [{ name: 'id', in: 'path' }], responses: { '204': {} } }, // isEditable = true
        },
        '/simple-form/{id}': {
            get: {
                tags: ['SimpleForm'],
                responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Simple' } } } } }
            },
            put: {
                tags: ['SimpleForm'],
                parameters: [{ name: 'id', in: 'path' }],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Simple' } } } },
                responses: { '200': {} }
            },
        },
        '/poly-primitive-only': {
            post: {
                tags: ['PolyPrimitiveOnly'],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/PolyPrimitiveOnly' } } } },
                responses: { '201': {} },
            },
        },
    },
    components: {
        schemas: {
            UpdateOnly: {
                type: 'object',
                properties: { id: { type: 'string', readOnly: true }, name: { type: 'string' } },
            },
            PolyMixed: {
                type: 'object',
                discriminator: { propertyName: 'type' },
                oneOf: [
                    { type: 'string' }, // Will be skipped in patchForm and updateFormForPetType
                    { $ref: '#/components/schemas/SubObject' },
                ],
            },
            SubObject: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['sub'] },
                    prop: { type: 'string' },
                },
            },
            NoSubmit: { type: 'object', properties: { name: { type: 'string' } } },
            Simple: { type: 'object', properties: { name: { type: 'string' } } },
            PolyPrimitiveOnly: {
                type: 'object',
                discriminator: { propertyName: 'type' },
                oneOf: [{ type: 'string' }, { type: 'number' }],
            },
        },
    },
};

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

describe('Admin: FormComponentGenerator (Coverage)', () => {
    let project: Project;
    let parser: SwaggerParser;

    beforeAll(() => {
        project = createTestProject();
        parser = new SwaggerParser(formGenCoverageSpec as any, { options: { admin: true } } as any);
        const resources = discoverAdminResources(parser);
        const formGen = new FormComponentGenerator(project, parser);

        for (const resource of resources) {
            if (resource.isEditable) {
                formGen.generate(resource, '/admin');
            }
        }
    });

    it('should generate update-only logic in onSubmit when no create op exists', () => {
        const formClass = project.getSourceFileOrThrow('/admin/updateOnly/updateOnly-form/updateOnly-form.component.ts').getClassOrThrow('UpdateOnlyFormComponent');
        const submitMethod = formClass.getMethod('onSubmit');
        const body = submitMethod!.getBodyText() ?? '';

        expect(body).toContain(`if (!this.isEditMode()) { console.error('Form is not in edit mode, but no create operation is available.'); return; }`);
        expect(body).toContain('const action$ = this.updateOnlyService.updateTheThing(this.id()!, finalPayload);');
        expect(body).not.toContain('const action$ = this.isEditMode()');
    });

    it('should handle polymorphic schemas with mixed primitive and object types', () => {
        const formClass = project.getSourceFileOrThrow('/admin/polyMixed/polyMixed-form/polyMixed-form.component.ts').getClassOrThrow('PolyMixedFormComponent');

        const patchMethod = formClass.getMethod('patchForm');
        expect(patchMethod).toBeDefined();
        // This assertion is now CORRECT. It checks for the *output* of the generator's loop,
        // which is a type guard check. This confirms the `$ref` was processed, and implicitly
        // confirms that the primitive `oneOf` entry was correctly skipped with `continue`.
        expect(patchMethod!.getBodyText()).toContain('if (this.isSubObject(entity))');

        const updateMethod = formClass.getMethod('updateFormForPetType');
        const body = updateMethod!.getBodyText()!;
        expect(body).toContain(`case 'sub':`);
        // We are implicitly testing the `continue` here for the 'string' type, because if it didn't continue,
        // it would have errored out trying to access `subSchema.properties`.
    });

    it('should not generate onSubmit for editable resource with no create/update ops', () => {
        const formClass = project.getSourceFileOrThrow('/admin/noSubmit/noSubmit-form/noSubmit-form.component.ts').getClassOrThrow('NoSubmitFormComponent');
        const submitMethod = formClass.getMethod('onSubmit');
        expect(submitMethod).toBeUndefined(); // Hits the early return
    });

    it('should not generate patchForm for simple forms', () => {
        const formClass = project.getSourceFileOrThrow('/admin/simpleForm/simpleForm-form/simpleForm-form.component.ts').getClassOrThrow('SimpleFormComponent');
        const patchMethod = formClass.getMethod('patchForm');
        expect(patchMethod).toBeUndefined(); // Hits the early return

        // Also check that ngOnInit uses the simpler patchValue
        const ngOnInitMethod = formClass.getMethod('ngOnInit');
        expect(ngOnInitMethod!.getBodyText()).toContain('this.form.patchValue(entity as any)');
    });

    it('should generate an empty update method body for polymorphism with only primitives', () => {
        const formClass = project.getSourceFileOrThrow('/admin/polyPrimitiveOnly/polyPrimitiveOnly-form/polyPrimitiveOnly-form.component.ts').getClassOrThrow('PolyPrimitiveOnlyFormComponent');
        const updateMethod = formClass.getMethod('updateFormForPetType');
        expect(updateMethod).toBeDefined();
        // The method body is an empty block statement `{}`, which getBodyText() returns with spaces.
        expect(updateMethod!.getBodyText()).toBe('{ }');
    });
});
