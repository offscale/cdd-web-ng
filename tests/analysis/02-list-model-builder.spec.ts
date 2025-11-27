import { describe, expect, it } from 'vitest';
import { ListModelBuilder } from '@src/analysis/list-model.builder.js';
import { Resource, SwaggerDefinition } from '@src/core/types/index.js';

describe('Analysis: ListModelBuilder', () => {
    /**
     * Helper function to create a mock Resource object with sensible defaults.
     * @param overrides - Partial properties to override the defaults.
     * @returns A complete mock Resource object.
     */
    const createResource = (overrides: Partial<Resource>): Resource => {
        const defaultResource: Resource = {
            name: 'items',
            modelName: 'Item',
            isEditable: true,
            operations: [{ action: 'list', methodName: 'listItems' } as any],
            formProperties: [
                { name: 'id', schema: { type: 'string' } as SwaggerDefinition },
                { name: 'name', schema: { type: 'string' } as SwaggerDefinition },
            ],
            listProperties: [{ name: 'name', schema: { type: 'string' } as SwaggerDefinition }],
        };
        return { ...defaultResource, ...overrides };
    };

    it('should not duplicate the ID property in columns if it is also in listProperties', () => {
        const builder = new ListModelBuilder();
        const resource = createResource({
            // Explicitly include 'id' in listProperties to test the duplicate check
            listProperties: [
                { name: 'id', schema: { type: 'string' } as SwaggerDefinition },
                { name: 'name', schema: { type: 'string' } as SwaggerDefinition },
            ],
        });

        const viewModel = builder.build(resource);

        // 'id' should be the first column, followed by 'name'.
        expect(viewModel.columns.length).toBe(2);
        expect(viewModel.columns[0].key).toBe('id');
        expect(viewModel.columns[1].key).toBe('name');
        // Verify there is only one 'id' column, proving the deduplication logic works.
        expect(viewModel.columns.filter(c => c.key === 'id').length).toBe(1);
    });

    it('should throw an error if the resource has no "list" operation', () => {
        const builder = new ListModelBuilder();
        const resource = createResource({
            operations: [{ action: 'create', methodName: 'createItem' } as any], // No 'list' operation
        });

        // This covers the error handling path when a list view cannot be generated.
        expect(() => builder.build(resource)).toThrow(
            `Cannot generate list view for resource '${resource.name}': No 'list' action found.`,
        );
    });

    it('should assign a "default" action kind for neutral custom action names', () => {
        const builder = new ListModelBuilder();
        const resource = createResource({
            operations: [
                { action: 'list', methodName: 'listItems' } as any,
                { action: 'getInfo', methodName: 'getInfo', isCustomCollectionAction: true } as any,
                { action: 'processItem', methodName: 'processItem', isCustomItemAction: true } as any,
            ],
        });

        const viewModel = builder.build(resource);

        const getInfoAction = viewModel.customActions.find(a => a.name === 'getInfo');
        const processItemAction = viewModel.customActions.find(a => a.name === 'processItem');

        expect(getInfoAction).toBeDefined();
        // This covers the fallback 'default' case in the getActionKind switch statement.
        expect(getInfoAction?.kind).toBe('default');

        expect(processItemAction).toBeDefined();
        expect(processItemAction?.kind).toBe('default');
    });
});
