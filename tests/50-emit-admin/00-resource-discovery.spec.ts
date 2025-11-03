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

    it('should prioritize operationId for custom actions over CRUD heuristics', () => {
        const resources = discoverAdminResources(createParser(coverageSpec));
        const customAction = resources.find(r => r.name === 'usersSearch')!.operations[0];
        expect(customAction.action).toBe('searchUsers'); // This should not be 'create'
    });

    it('should fall back to a generic action name if needed', () => {
        const resources = discoverAdminResources(createParser(coverageSpec));
        const resource = resources.find(r => r.name === 'actionTest');
        expect(resource).toBeDefined();
        const action = resource!.operations[0].action;
        expect(action).toBe('headActionTestById');
    });

    it('should handle polymorphic schemas with discriminator correctly', () => {
        const resources = discoverAdminResources(createParser(polymorphismSpec));
        const resource = resources.find(r => r.name === 'pets')!;
        const discriminatorProp = resource.formProperties.find(p => p.name === 'petType');
        expect(discriminatorProp).toBeDefined();
        expect(discriminatorProp?.schema.oneOf).toBeDefined();
        expect(discriminatorProp?.schema.discriminator).toBeDefined();
    });

    it('should fall back to model from GET operation if POST is not present', () => {
        const resources = discoverAdminResources(createParser(coverageSpec));
        const resource = resources.find(r => r.name === 'users')!;
        expect(resource.modelName).toBe('User');
    });
});
