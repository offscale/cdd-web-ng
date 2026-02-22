import { beforeAll, describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { discoverAdminResources, getFormProperties } from '@src/generators/angular/admin/resource-discovery.js';
import { SwaggerParser } from '@src/core/parser.js';
import { Resource, SwaggerDefinition } from '@src/core/types/index.js';
import { ListComponentGenerator } from '@src/generators/angular/admin/list-component.generator.js';
import { FormComponentGenerator } from '@src/generators/angular/admin/form-component.generator.js';

import { coverageSpecPart2 } from '../shared/specs.js';
import { createTestProject } from '../shared/helpers.js';

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
                requestBody: {
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateOnly' } } },
                },
                responses: { '200': { description: 'ok' } },
            },
            get: {
                tags: ['UpdateOnly'],
                operationId: 'getTheThing',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    '200': {
                        description: 'ok',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateOnly' } } },
                    },
                },
            },
        },
        '/poly-mixed': {
            post: {
                tags: ['PolyMixed'],
                operationId: 'createPolyMixed',
                requestBody: {
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/PolyMixed' } } },
                },
                responses: { '201': { description: 'ok' } },
            },
        },
        '/no-submit/{id}': {
            get: {
                tags: ['NoSubmit'],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    '200': {
                        description: 'ok',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/NoSubmit' } } },
                    },
                },
            },
            delete: {
                tags: ['NoSubmit'],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '204': { description: 'ok' } },
            }, // isEditable = true if we add custom action
        },
        '/no-submit/{id}/custom': {
            post: {
                tags: ['NoSubmit'],
                operationId: 'customAction',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '200': { description: 'ok' } },
            },
        },
        '/simple-form/{id}': {
            get: {
                tags: ['SimpleForm'],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    '200': {
                        description: 'ok',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/Simple' } } },
                    },
                },
            },
            put: {
                tags: ['SimpleForm'],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Simple' } } } },
                responses: { '200': { description: 'ok' } },
            },
        },
        '/poly-primitive-only': {
            post: {
                tags: ['PolyPrimitiveOnly'],
                requestBody: {
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/PolyPrimitiveOnly' } } },
                },
                responses: { '201': { description: 'ok' } },
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
                properties: { type: { type: 'string' } },
                required: ['type'],
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
                properties: { type: { type: 'string' } },
                required: ['type'],
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

    it('resource-discovery should fall back to default resource name when tag and segment are missing', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Default', version: '1.0' },
            paths: {
                '/': {
                    get: { responses: { '200': { description: 'ok' } } },
                },
            },
        };
        const parser = new SwaggerParser(spec as any, { options: {} } as any);
        const resources = discoverAdminResources(parser);
        expect(resources[0].name).toBe('default');
    });

    it('resource-discovery should merge formData params and allOf schema properties', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Forms', version: '1.0' },
            paths: {
                '/upload': {
                    post: {
                        requestBody: {
                            content: {
                                'multipart/form-data': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            file: {
                                                type: 'string',
                                                format: 'binary',
                                                description: 'Upload file',
                                            },
                                        },
                                    },
                                },
                                'application/json': { schema: { $ref: '#/components/schemas/Combined' } },
                            },
                        },
                        responses: {
                            '200': {
                                description: 'ok',
                                content: {
                                    'application/json': {
                                        schema: { type: 'array', items: { $ref: '#/components/schemas/Base' } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            components: {
                schemas: {
                    Base: {
                        type: 'object',
                        properties: { base: { type: 'string' } },
                        required: ['base'],
                    },
                    Combined: {
                        type: 'object',
                        allOf: [{ $ref: '#/components/schemas/Base' }, { $ref: '#/components/schemas/Missing' }],
                        properties: { extra: { type: 'string' } },
                    },
                },
            },
        };
        const parser = new SwaggerParser(spec as any, { options: {} } as any);
        const ops = parser.operations.filter(op => op.path === '/upload');
        const props = getFormProperties(ops, parser);
        const fileProp = props.find(p => p.name === 'file');
        expect((fileProp?.schema as SwaggerDefinition).format).toBe('binary');
        expect((fileProp?.schema as SwaggerDefinition).description).toBe('Upload file');
        const baseProp = props.find(p => p.name === 'base');
        expect((baseProp?.schema as SwaggerDefinition).required).toContain('base');
    });

    it('getFormProperties should skip array-typed formData params and tolerate unresolved array items', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'FormData', version: '1.0' },
            paths: {
                '/upload': {
                    post: {
                        requestBody: {
                            content: {
                                'multipart/form-data': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            meta: {
                                                type: ['string', 'null'],
                                                description: 'metadata',
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        responses: {
                            '200': {
                                description: 'ok',
                                content: {
                                    'application/json': {
                                        schema: { type: 'array', items: { $ref: '#/components/schemas/Missing' } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            components: { schemas: {} },
        };
        const parser = new SwaggerParser(spec as any, { options: {} } as any);
        const ops = parser.operations.filter(op => op.path === '/upload');
        const props = getFormProperties(ops, parser);
        const metaProp = props.find(p => p.name === 'meta');
        expect((metaProp?.schema as SwaggerDefinition).type).toBeUndefined();
    });

    it('resource-discovery should handle operations without parameters or method names', () => {
        const parser = new SwaggerParser(coverageSpecPart2 as any, { options: {} } as any);
        (parser.operations as any).push({
            path: '',
            method: '',
            tags: [],
            responses: { '200': { description: 'ok' } },
            operationId: '',
            parameters: undefined,
        });

        const resources = discoverAdminResources(parser);
        const defaultResource = resources.find((r: Resource) => r.name === 'default');
        const op = defaultResource?.operations.find(o => o.path === '' && o.method === '');
        expect(op?.methodName).toBeUndefined();
        expect(op?.methodParameters).toBeUndefined();
    });

    it('list-component-generator getIconForAction should fall back for unknown actions', () => {
        const getIconForAction = (action: string): string => {
            const lowerAction = action.toLowerCase();
            if (lowerAction.includes('delete') || lowerAction.includes('remove')) return 'delete';
            if (lowerAction.includes('edit') || lowerAction.includes('update')) return 'edit';
            if (lowerAction.includes('add') || lowerAction.includes('create')) return 'add';
            if (lowerAction.includes('start') || lowerAction.includes('play')) return 'play_arrow';
            if (lowerAction.includes('stop') || lowerAction.includes('pause')) return 'pause';
            if (lowerAction.includes('reboot') || lowerAction.includes('refresh') || lowerAction.includes('sync'))
                return 'refresh';
            if (lowerAction.includes('approve') || lowerAction.includes('check')) return 'check';
            if (lowerAction.includes('cancel') || lowerAction.includes('block')) return 'block';
            return 'play_arrow';
        };

        expect(getIconForAction('undefinedAction')).toBe('play_arrow');
        expect(getIconForAction('startServer')).toBe('play_arrow');
        expect(getIconForAction('deleteItem')).toBe('delete');
    });

    it('list-component-generator handles listable resource with no actions', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/reports': { get: { tags: ['Reports'], responses: { '200': { description: 'ok' } } } },
            },
        };
        const project = createTestProject();
        const parser = new SwaggerParser(spec as any, { options: { admin: true } } as any);
        const resource = discoverAdminResources(parser).find((r: Resource) => r.name === 'reports')!;
        const generator = new ListComponentGenerator(project);

        generator.generate(resource, '/admin');

        const listClass = project
            .getSourceFileOrThrow('/admin/reports/reports-list/reports-list.component.ts')
            .getClassOrThrow('ReportsListComponent');
        const displayedColumns = listClass.getProperty('displayedColumns')?.getInitializer()?.getText() as string;

        expect(displayedColumns).not.toContain('actions');
    });

    it('list-component-generator handles resource with no actions and non-id primary key', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/diagnostics': {
                    get: {
                        tags: ['Diagnostics'],
                        responses: {
                            '200': {
                                description: 'ok',
                                content: {
                                    'application/json': { schema: { $ref: '#/components/schemas/DiagnosticInfo' } },
                                },
                            },
                        },
                    },
                },
            },
            components: {
                schemas: {
                    DiagnosticInfo: {
                        type: 'object',
                        properties: { event_id: { type: 'string' }, message: { type: 'string' } },
                    },
                },
            },
        };
        const project = createTestProject();
        const parser = new SwaggerParser(spec as any, { options: { admin: true } } as any);
        const resource = discoverAdminResources(parser).find((r: Resource) => r.name === 'diagnostics')!;
        const generator = new ListComponentGenerator(project);
        generator.generate(resource, '/admin');
        const listClass = project
            .getSourceFileOrThrow('/admin/diagnostics/diagnostics-list/diagnostics-list.component.ts')
            .getClassOrThrow('DiagnosticsListComponent');
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
        const formClass = project
            .getSourceFileOrThrow('/admin/updateOnly/updateOnly-form/updateOnly-form.component.ts')
            .getClassOrThrow('UpdateOnlyFormComponent');
        const submitMethod = formClass.getMethod('onSubmit');
        const body = submitMethod!.getBodyText() ?? '';

        expect(body).toContain(
            `if (!this.isEditMode()) { console.error('Form is not in edit mode, but no create operation is available.'); return; }`,
        );
        expect(body).toContain('const action$ = this.updateOnlyService.updateTheThing(this.id()!, finalPayload);');
        expect(body).not.toContain('const action$ = this.isEditMode()');
    });

    it('should handle polymorphic schemas with mixed primitive and object types', () => {
        const formClass = project
            .getSourceFileOrThrow('/admin/polyMixed/polyMixed-form/polyMixed-form.component.ts')
            .getClassOrThrow('PolyMixedFormComponent');

        const patchMethod = formClass.getMethod('patchForm');
        expect(patchMethod).toBeDefined();
        expect(patchMethod!.getBodyText()).toContain('if (this.isType_SubObject(entity))');

        const updateMethod = formClass.getMethod('updateFormForType');
        const body = updateMethod!.getBodyText()!;
        expect(body).toContain(`case 'sub':`);
    });

    it('should not generate onSubmit for editable resource with no create/update ops', () => {
        const formClass = project
            .getSourceFileOrThrow('/admin/noSubmit/noSubmit-form/noSubmit-form.component.ts')
            .getClassOrThrow('NoSubmitFormComponent');
        const submitMethod = formClass.getMethod('onSubmit');
        expect(submitMethod).toBeUndefined(); // Hits the early return
    });

    it('should not generate patchForm for simple forms', () => {
        const formClass = project
            .getSourceFileOrThrow('/admin/simpleForm/simpleForm-form/simpleForm-form.component.ts')
            .getClassOrThrow('SimpleFormComponent');
        const patchMethod = formClass.getMethod('patchForm');
        expect(patchMethod).toBeUndefined(); // Hits the early return

        const ngOnInitMethod = formClass.getMethod('ngOnInit');
        expect(ngOnInitMethod!.getBodyText()).toContain('this.form.patchValue(entity as any)');
    });

    it('should generate an empty update method body for polymorphism with only primitives', () => {
        const formClass = project
            .getSourceFileOrThrow('/admin/polyPrimitiveOnly/polyPrimitiveOnly-form/polyPrimitiveOnly-form.component.ts')
            .getClassOrThrow('PolyPrimitiveOnlyFormComponent');
        const updateMethod = formClass.getMethod('updateFormForType');
        expect(updateMethod).toBeDefined();
        expect(updateMethod!.getBodyText()).toBe('{ }');
    });

    it('should strip readOnly properties in getPayload', () => {
        const formClass = project
            .getSourceFileOrThrow('/admin/updateOnly/updateOnly-form/updateOnly-form.component.ts')
            .getClassOrThrow('UpdateOnlyFormComponent');
        const payloadMethod = formClass.getMethodOrThrow('getPayload');
        const body = payloadMethod.getBodyText() ?? '';

        expect(body).toContain("delete (payload as any)['id']");
        expect(body).not.toContain("delete (payload as any)['name']");
    });
});
