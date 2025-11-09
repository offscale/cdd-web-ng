import { describe, it, expect } from 'vitest';
import { discoverAdminResources } from '@src/service/emit/admin/resource-discovery.js';
import { SwaggerParser } from '@src/core/parser.js';
import { coverageSpecPart2 } from '../shared/specs.js';
import { ListComponentGenerator } from '@src/service/emit/admin/list-component.generator.js';
import { createTestProject } from '../shared/helpers.js';

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
        const resource = resources.find(r => r.name === 'noIdOpId');
        expect(resource).toBeDefined();
        // The final fallback computes the name from the method 'head' and path 'no-id-opid', which becomes 'headNoIdOpid'.
        // FIX: Corrected typo in the expected string.
        expect(resource!.operations[0].action).toBe('headNoIdOpid');
    });

    it('resource-discovery should handle resources with no defined schemas', () => {
        const parser = new SwaggerParser(coverageSpecPart2 as any, { options: {} } as any);
        const resources = discoverAdminResources(parser);
        const resource = resources.find(r => r.name === 'noSchemaResource');
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
});
