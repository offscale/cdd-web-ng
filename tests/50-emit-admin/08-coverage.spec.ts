// tests/50-emit-admin/08-coverage.spec.ts
import { describe, it, expect } from 'vitest';
import { discoverAdminResources } from '@src/service/emit/admin/resource-discovery.js';
import * as html from '@src/service/emit/admin/html/form-component-html.builder.js';
import { SwaggerParser } from '@src/core/parser.js';
import { coverageSpecPart2 } from '../shared/specs.js';
import { listComponentSpec } from '../shared/specs.js';
import { getIconForAction } from '@src/service/emit/admin/list-component.generator.js';

// The getIconForAction is not exported, so we need to test it a bit indirectly or expose it.
// For simplicity in this context, let's assume it's been refactored to be exportable or we test it via its effects.
// Since the original file is a class, we can instantiate and test the private method.
import { ListComponentGenerator } from '@src/service/emit/admin/list-component.generator.js';
import { createTestProject } from '../shared/helpers.js';

describe('Admin Generators (Coverage)', () => {
    it('resource-discovery should use fallback action name when no operationId is present', () => {
        const parser = new SwaggerParser(coverageSpecPart2 as any, { options: {} } as any);
        const resources = discoverAdminResources(parser);
        const resource = resources.find(r => r.name === 'noIdOpId');
        expect(resource).toBeDefined();
        // The final fallback computes the name from the path 'no-id-opid', which becomes 'headNoIdOpid'.
        expect(resource!.operations[0].action).toBe('headNoIdOpid');
    });

    it('resource-discovery should handle resources with no schemas', () => {
        const parser = new SwaggerParser(coverageSpecPart2 as any, { options: {} } as any);
        const resources = discoverAdminResources(parser);
        const resource = resources.find(r => r.name === 'noSchemaResource');
        expect(resource).toBeDefined();
        // It should fall back to a default 'id' property
        expect(resource!.formProperties).toEqual([{ name: 'id', schema: { type: 'string' } }]);
    });

    it('list-component-generator getIconForAction should cover more cases', () => {
        const generator = new ListComponentGenerator(createTestProject());
        // Accessing private method for test purposes
        const getIcon = (action: string) => (generator as any).getIconForAction(action);

        expect(getIcon('deleteItem')).toBe('delete');
        expect(getIcon('removeItem')).toBe('delete');
        expect(getIcon('updateUser')).toBe('edit');
        expect(getIcon('stopProcess')).toBe('pause');
        expect(getIcon('rebootServer')).toBe('refresh');
        expect(getIcon('undefinedAction')).toBe('play_arrow'); // Default fallback
    });

    it('form-component-html-builder should handle cases where buildFormControl returns null for sub-properties', () => {
        const parser = new SwaggerParser(listComponentSpec as any, { options: {} } as any);
        const resource = {
            name: 'test',
            modelName: 'Test',
            formProperties: [{
                name: 'poly',
                schema: {
                    oneOf: [], // empty oneOf
                    discriminator: { propertyName: 'type' }
                }
            }]
        } as any;
        // This test ensures that if buildFormControl returns null (which it will for an empty oneOf), the generator doesn't crash.
        const output = html.generateFormComponentHtml(resource, parser);
        // FIX: Update the assertion. A discriminator property always creates a mat-select. The sub-forms will be empty.
        expect(output).toContain('<div class="admin-form-fields">');
        expect(output).toContain('<mat-select formControlName="poly">');
        // Check that it does NOT contain any conditional groups, since oneOf is empty.
        expect(output).not.toContain("@if (isPetType(");
    });
});
