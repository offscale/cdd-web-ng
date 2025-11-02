import { describe, it, expect } from 'vitest';
import { SwaggerParser } from '../../src/core/parser.js';
import { discoverAdminResources } from '../../src/service/emit/admin/resource-discovery.js';
import { coverageSpec, polymorphismSpec } from '../shared/specs.js';

describe('Admin: discoverAdminResources', () => {
    const createParser = (spec: object) => new SwaggerParser(spec as any, { options: { admin: true } } as any);

    it('should identify a resource as read-only (Logs)', () => {
        const resources = discoverAdminResources(createParser(coverageSpec));
        const resource = resources.find(r => r.name === 'logs');
        expect(resource).toBeDefined();
        expect(resource!.isEditable).toBe(false);
    });

    it('should identify a resource as editable (Users)', () => {
        const resources = discoverAdminResources(createParser(coverageSpec));
        const resource = resources.find(r => r.name === 'users');
        expect(resource!.isEditable).toBe(true);
    });

    it('should correctly classify standard CRUD actions', () => {
        const resources = discoverAdminResources(createParser(coverageSpec));
        const actions = resources.find(r => r.name === 'users')!.operations.map(op => op.action);
        expect(actions).toEqual(expect.arrayContaining(['list', 'create', 'getById', 'update', 'delete']));
    });

    it('should correctly classify custom item and collection actions', () => {
        const resources = discoverAdminResources(createParser(coverageSpec));
        const actions = resources.find(r => r.name === 'servers')!.operations.map(op => op.action);
        expect(actions).toEqual(expect.arrayContaining(['rebootAllServers', 'startServer']));
    });

    it('should generate correct method names for all operations', () => {
        const resources = discoverAdminResources(createParser(coverageSpec));
        const userOps = resources.find(r => r.name === 'users')!.operations;
        expect(userOps.find(op => op.action === 'list')?.methodName).toBe('getUsers');

        // FIX: The test should check the operationId-derived name, which the action classifier doesn't use for method naming.
        const configOps = resources.find(r => r.name === 'configs')!.operations;
        expect(configOps[0].methodName).toBe('updateConfig'); // This is the operationId
        expect(configOps[0].action).toBe('update'); // The action is correctly classified
    });

    it('should correctly aggregate form properties from multiple operations', () => {
        const resources = discoverAdminResources(createParser(coverageSpec));
        const userProps = resources.find(r => r.name === 'users')!.formProperties.map(p => p.name);
        expect(userProps).toEqual(expect.arrayContaining(['id', 'name', 'email']));
        const idProp = resources.find(r => r.name === 'users')!.formProperties.find(p => p.name === 'id');
        expect(idProp?.schema.readOnly).toBe(true);
    });

    it('should handle resources with no defined schema', () => {
        const resources = discoverAdminResources(createParser(coverageSpec));
        const resource = resources.find(r => r.name === 'noProp');
        expect(resource?.formProperties.map(p => p.name)).toEqual(['id']);
    });

    it('should handle polymorphic schemas and add a discriminator property', () => {
        const resources = discoverAdminResources(createParser(polymorphismSpec));
        const resource = resources.find(r => r.name === 'pets');
        const discriminatorProp = resource!.formProperties.find(p => p.name === 'petType');

        expect(discriminatorProp).toBeDefined();
        expect(discriminatorProp?.schema.oneOf).toBeDefined();
        expect(discriminatorProp?.schema.discriminator?.propertyName).toBe('petType');
    });
});
