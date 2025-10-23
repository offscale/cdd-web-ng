/**
 * @fileoverview
 * This test suite validates the `discoverAdminResources` function, which is the foundational
 * step for the admin UI generation. Its responsibility is to parse an OpenAPI specification
 * and correctly identify logical RESTful resources (like "Users" or "Products"), along with their
 * associated CRUD operations (list, create, getById, update, delete) and custom actions.
 */

import { describe, it, expect } from 'vitest';
import { GeneratorConfig } from '../../src/core/types.js';
import { SwaggerParser } from '../../src/core/parser.js';
import { discoverAdminResources } from '../../src/service/emit/admin/resource-discovery.js';
import { fullE2ESpec, bookStoreSpec } from './specs/test.specs.js';

/**
 * Main test suite for the `discoverAdminResources` function.
 */
describe('Unit: discoverAdminResources', () => {

    /**
     * A helper function to create a SwaggerParser instance from a JSON string spec.
     * This avoids boilerplate in each test case.
     * @param specString The OpenAPI specification as a JSON string.
     * @returns An instance of SwaggerParser.
     */
    const createParser = (specString: string) => {
        const config: GeneratorConfig = {
            input: '/spec.json',
            output: './out',
            options: {
                dateType: 'string',
                enumStyle: 'enum',
                generateServices: true,
                admin: true // Ensure admin generation is enabled
            }
        };
        const spec = JSON.parse(specString);
        return new SwaggerParser(spec, config);
    };

    /**
     * Tests if the discovery logic correctly identifies a resource as read-only
     * when it only contains GET operations. In the test spec, 'Logs' is a read-only resource.
     */
    it('should identify a resource as read-only if it only has GET operations', () => {
        const parser = createParser(fullE2ESpec);
        const resources = discoverAdminResources(parser);
        const logResource = resources.find(r => r.name === 'log');

        expect(logResource).toBeDefined();
        expect(logResource!.isEditable).toBe(false);
        expect(logResource!.operations.length).toBe(1);
        expect(logResource!.operations[0].action).toBe('list');
    });

    /**
     * Tests if the discovery logic correctly identifies a resource as editable
     * when it contains write operations like POST, PUT, or DELETE. The 'Users' resource is editable.
     */
    it('should identify a resource as editable if it has a POST/PUT operation', () => {
        const parser = createParser(fullE2ESpec);
        const resources = discoverAdminResources(parser);
        const userResource = resources.find(r => r.name === 'users');

        expect(userResource).toBeDefined();
        expect(userResource!.isEditable).toBe(true);
    });

    /**
     * Tests if the discovery logic correctly maps HTTP verbs and path structures to
     * standardized CRUD actions (`list`, `create`, `getById`, `update`, `delete`).
     */
    it('should correctly categorize collection-level and item-level actions', () => {
        const parser = createParser(fullE2ESpec);
        const resources = discoverAdminResources(parser);
        const userResource = resources.find(r => r.name === 'users');

        expect(userResource).toBeDefined();

        const actions = userResource!.operations.map(op => op.action);
        expect(actions).toContain('list');      // GET /users
        expect(actions).toContain('create');    // POST /users
        expect(actions).toContain('getById');   // GET /users/{id}
        expect(actions).toContain('update');    // PUT /users/{id}
        expect(actions).toContain('delete');    // DELETE /users/{id}
    });

    /**
     * Tests a specific edge case where a resource might only have a create operation
     * (e.g., a POST to `/publishers`) without any corresponding GET endpoints.
     * The generator should still create a resource shell for this.
     */
    it('should create a resource shell for create-only resources', () => {
        const parser = createParser(bookStoreSpec);
        const resources = discoverAdminResources(parser);
        const publisherResource = resources.find(r => r.name === 'publishers');

        expect(publisherResource).toBeDefined();
        expect(publisherResource!.isEditable).toBe(true);
        expect(publisherResource!.operations.length).toBe(1);
        expect(publisherResource!.operations[0].action).toBe('create');
        expect(publisherResource!.modelName).toBe('Publisher');
    });
});
