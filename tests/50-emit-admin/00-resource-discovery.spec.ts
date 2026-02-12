import { describe, expect, it } from 'vitest';

import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import * as resourceDiscovery from '@src/generators/angular/admin/resource-discovery.js';
import { discoverAdminResources } from '@src/generators/angular/admin/resource-discovery.js';

import { branchCoverageSpec, coverageSpec, finalCoveragePushSpec } from '../fixtures/coverage.fixture.js';

const config: GeneratorConfig = { input: '', output: '', options: {} };
const createParser = (spec: any) => new SwaggerParser(spec, config);
const validBase = { openapi: '3.0.0', info: { title: 'Test', version: '1.0' } };

describe('Admin: discoverAdminResources', () => {
    it('should discover basic CRUD resources', () => {
        const parser = createParser(coverageSpec);
        const resources = discoverAdminResources(parser);
        const usersResource = resources.find(r => r.name === 'users');

        expect(resources.length).toBe(12);
        expect(usersResource).toBeDefined();
        expect(usersResource?.modelName).toBe('User');
        expect(usersResource?.isEditable).toBe(true);
        expect(usersResource?.operations.length).toBe(5); // list, create, get, update, delete
    });

    it('should correctly identify non-editable resources (GET only)', () => {
        const parser = createParser(coverageSpec);
        const resources = discoverAdminResources(parser);
        const logsResource = resources.find(r => r.name === 'logs');

        expect(logsResource).toBeDefined();
        expect(logsResource?.isEditable).toBe(false);
    });

    it('should find resource properties for both list and form views', () => {
        const parser = createParser(coverageSpec);
        const resources = discoverAdminResources(parser);
        const usersResource = resources.find(r => r.name === 'users');

        // Form properties come from the model schema (all props)
        expect(usersResource?.formProperties.map(p => p.name)).toEqual(['id', 'name', 'email']);
        // List properties are filtered to primitives
        expect(usersResource?.listProperties.map(p => p.name)).toEqual(['name', 'email']);
    });

    it('should mark resources with only a delete operation as non-editable', () => {
        const parser = createParser(finalCoveragePushSpec);
        const resources = discoverAdminResources(parser);
        const deleteOnlyResource = resources.find(r => r.name === 'deleteOnly');

        expect(deleteOnlyResource).toBeDefined();
        expect(deleteOnlyResource?.isEditable).toBe(false);
    });

    it('should correctly handle collection actions with hyphens in the name', () => {
        const parser = createParser(coverageSpec);
        const resources = discoverAdminResources(parser);
        const serversResource = resources.find(r => r.name === 'servers');
        const customAction = serversResource?.operations.find(op => op.action === 'rebootAllServers');

        expect(customAction).toBeDefined();
        expect(customAction?.isCustomCollectionAction).toBe(true);
    });

    it('should correctly handle item actions that might be misclassified', () => {
        const parser = createParser(coverageSpec);
        const resources = discoverAdminResources(parser);
        const serversResource = resources.find(r => r.name === 'servers');
        const customAction = serversResource?.operations.find(op => op.action === 'rebootServerItem');

        expect(customAction).toBeDefined();
        expect(customAction?.isCustomItemAction).toBe(true);
    });

    it('should handle polymorphic schemas where discriminator prop is not in base', () => {
        const spec = {
            ...validBase,
            paths: {},
            components: {
                schemas: {
                    ...branchCoverageSpec.components.schemas,
                },
            },
        };
        const parser = createParser(spec);
        const polySchema = parser.getDefinition('PolyReadonly')!;
        // emulate finding properties for the form - usually getFormProperties takes operations
        // but we are testing the property aggregation logic via the helper if exported,
        // or via the public discover function.
        // Here we rely on `resourceDiscovery` exporting `getFormProperties` for testability based on previous prompts
        const props = resourceDiscovery.getFormProperties(
            [{ requestBody: { content: { 'application/json': { schema: polySchema } } } } as any],
            parser,
        );
        const propNames = props.map((p: any) => p.name);

        // Ideally 'petType' is found. 'name' is in the subclass (Cat) and is NOT merged into the top level
        // because oneOf implies mutually exclusive sets handled by the form generator's dynamic logic.
        expect(propNames).toContain('petType');
        expect(propNames).not.toContain('name');
    });

    it('should correctly identify model name for inline schemas', () => {
        const spec = {
            ...validBase,
            paths: {},
            components: {
                schemas: {
                    ...branchCoverageSpec.components.schemas,
                },
            },
        };
        const parser = createParser(spec);
        const schemaWithInline = parser.getDefinition('InlineSchemaProperty')!;

        const fakeOps = [
            {
                method: 'GET',
                responses: {
                    '200': {
                        content: {
                            'application/json': { schema: schemaWithInline.properties!.inline },
                        },
                    },
                },
            },
        ] as any;

        const modelName = resourceDiscovery.getModelName('inline', fakeOps);
        expect(modelName).toBe('Inline');
    });

    it('should classify QUERY method on collection as LIST action (OAS 3.2)', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Query Test', version: '1.0' },
            paths: {
                '/search': {
                    query: {
                        tags: ['Search'],
                        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };
        const parser = createParser(spec);
        const resources = discoverAdminResources(parser);
        const resource = resources.find(r => r.name === 'search');

        expect(resource).toBeDefined();
        const listOp = resource!.operations.find(op => op.action === 'list');
        expect(listOp).toBeDefined();
        expect(listOp!.method).toBe('QUERY');
    });

    it('should classify QUERY method with ID as GetById action', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Query Test', version: '1.0' },
            paths: {
                '/items/{id}': {
                    query: {
                        tags: ['Items'],
                        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };
        const parser = createParser(spec);
        const resources = discoverAdminResources(parser);
        const resource = resources.find(r => r.name === 'items');

        expect(resource).toBeDefined();
        // While semantic meaning of "get" by id via QUERY is ambiguous (fetch vs search by id),
        // our classification groups it with GET/{id}.
        const getOp = resource!.operations.find(op => op.action === 'getById');
        expect(getOp).toBeDefined();
        expect(getOp!.method).toBe('QUERY');
    });

    it('getModelName should fallback to QUERY if GET/POST missing', () => {
        // resourceDiscovery relies on an existing operation to determine the model name
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Query Model', version: '1.0' },
            paths: {
                '/pure-query': {
                    query: {
                        tags: ['PureQuery'],
                        responses: {
                            '200': {
                                content: {
                                    'application/json': { schema: { $ref: '#/components/schemas/QueryResult' } },
                                },
                            },
                        },
                    },
                },
            },
            components: {
                schemas: {
                    QueryResult: { type: 'object', properties: { id: { type: 'string' } } },
                },
            },
        };
        const parser = createParser(spec);
        const resources = discoverAdminResources(parser);
        const resource = resources.find(r => r.name === 'pureQuery');

        expect(resource).toBeDefined();
        expect(resource!.modelName).toBe('QueryResult');
    });
});
