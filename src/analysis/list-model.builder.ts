import { Resource } from "@src/core/types/index.js";
import { pascalCase } from "@src/core/utils/index.js";

import { ListAction, ListColumn, ListViewModel } from "./list-types.js";

export class ListModelBuilder {

    public build(resource: Resource): ListViewModel {
        const idProperty = this.getIdProperty(resource);
        const customActions = this.getCustomActions(resource);
        const hasCreate = resource.operations.some(op => op.action === 'create');
        const hasEdit = resource.operations.some(op => op.action === 'update');
        const hasDelete = resource.operations.some(op => op.action === 'delete');
        const hasActionsColumn = hasEdit || hasDelete || customActions.some(a => !a.isCollectionAction);

        const columns: ListColumn[] = [];

        // Ensure ID is always first if it exists, but don't duplicate it if it's in listProperties
        if (idProperty) {
            columns.push({ key: idProperty, header: pascalCase(idProperty), isId: true });
        }

        (resource.listProperties || []).forEach(p => {
            if (p.name !== idProperty) {
                columns.push({ key: p.name, header: pascalCase(p.name), isId: false });
            }
        });

        // If no properties exist at all (rare but possible in empty schemas), ensure ID column
        if (columns.length === 0) {
            columns.push({ key: 'id', header: 'Id', isId: true });
        }

        const displayedColumns = columns.map(c => c.key);
        if (hasActionsColumn) {
            displayedColumns.push('actions');
        }

        const listOp = resource.operations.find(op => op.action === 'list');
        if (!listOp) {
            throw new Error(`Cannot generate list view for resource '${resource.name}': No 'list' action found.`);
        }

        return {
            resourceName: resource.name,
            modelName: resource.modelName,
            serviceName: `${pascalCase(resource.name)}Service`,
            columns,
            displayedColumns,
            idProperty,
            hasCreate,
            hasEdit,
            hasDelete,
            customActions,
            hasActionsColumn,
            listOperationName: listOp.methodName!
        };
    }

    private getIdProperty(resource: Resource): string {
        const allProps = resource.formProperties;
        if (allProps.some(p => p.name === 'id')) {
            return 'id';
        }
        // Fallback to first property if ID not found
        return allProps.length > 0 ? allProps[0].name : 'id';
    }

    private getCustomActions(resource: Resource): ListAction[] {
        const ops = resource.operations.filter(op => op.isCustomCollectionAction || op.isCustomItemAction);
        return ops.map(op => ({
            name: op.action,
            label: pascalCase(op.action),
            icon: this.getIconForAction(op.action),
            isCollectionAction: !!op.isCustomCollectionAction,
            requiresId: !!op.isCustomItemAction,
            operation: op
        }));
    }

    private getIconForAction(action: string): string {
        const lowerAction = action.toLowerCase();
        if (lowerAction.includes('delete') || lowerAction.includes('remove')) return 'delete';
        if (lowerAction.includes('edit') || lowerAction.includes('update')) return 'edit';
        if (lowerAction.includes('add') || lowerAction.includes('create')) return 'add';
        if (lowerAction.includes('start') || lowerAction.includes('play')) return 'play_arrow';
        if (lowerAction.includes('stop') || lowerAction.includes('pause')) return 'pause';
        if (lowerAction.includes('reboot') || lowerAction.includes('refresh') || lowerAction.includes('sync')) return 'refresh';
        if (lowerAction.includes('approve') || lowerAction.includes('check')) return 'check';
        if (lowerAction.includes('cancel') || lowerAction.includes('block')) return 'block';
        return 'play_arrow'; // Default fallback icon
    }
}
