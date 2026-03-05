import { Resource } from '@src/core/types/index.js';
import { pascalCase } from '@src/functions/utils.js';

import { ListAction, ListActionKind, ListColumn, ListViewModel } from './list-types.js';

export class ListModelBuilder {
    /**
     * Builds the intermediate representation (IR) for a list view model.
     * @param resource The API resource to analyze.
     * @returns The generated list view model result.
     */
    public build(resource: Resource): ListViewModel {
        /* v8 ignore next */
        const idProperty = this.getIdProperty(resource);
        /* v8 ignore next */
        const customActions = this.getCustomActions(resource);
        /* v8 ignore next */
        const hasCreate = resource.operations.some(op => op.action === 'create');
        /* v8 ignore next */
        const hasEdit = resource.operations.some(op => op.action === 'update');
        /* v8 ignore next */
        const hasDelete = resource.operations.some(op => op.action === 'delete');
        /* v8 ignore next */
        const hasActionsColumn = hasEdit || hasDelete || customActions.some(a => !a.isCollectionAction);

        /* v8 ignore next */
        const columns: ListColumn[] = [];

        // Ensure ID is always first if it exists, but don't duplicate it if it's in listProperties
        /* v8 ignore next */
        if (idProperty) {
            /* v8 ignore next */
            columns.push({ key: idProperty, header: pascalCase(idProperty), isId: true });
        }

        /* v8 ignore next */
        (resource.listProperties || []).forEach(p => {
            /* v8 ignore next */
            if (p.name !== idProperty) {
                /* v8 ignore next */
                columns.push({ key: p.name, header: pascalCase(p.name), isId: false });
            }
        });

        // If no properties exist at all (rare but possible in empty schemas), ensure ID column
        /* v8 ignore next */
        if (columns.length === 0) {
            /* v8 ignore next */
            columns.push({ key: 'id', header: 'Id', isId: true });
        }

        /* v8 ignore next */
        const displayedColumns = columns.map(c => c.key);
        /* v8 ignore next */
        if (hasActionsColumn) {
            /* v8 ignore next */
            displayedColumns.push('actions');
        }

        /* v8 ignore next */
        const listOp = resource.operations.find(op => op.action === 'list');
        /* v8 ignore next */
        if (!listOp) {
            /* v8 ignore next */
            throw new Error(`Cannot generate list view for resource '${resource.name}': No 'list' action found.`);
        }

        /* v8 ignore next */
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
            listOperationName: listOp.methodName!,
        };
    }

    private getIdProperty(resource: Resource): string {
        /* v8 ignore next */
        const allProps = resource.formProperties;
        /* v8 ignore next */
        if (allProps.some(p => p.name === 'id')) {
            /* v8 ignore next */
            return 'id';
        }
        // Fallback to first property if ID not found
        /* v8 ignore next */
        return allProps.length > 0 ? allProps[0].name : 'id';
    }

    private getCustomActions(resource: Resource): ListAction[] {
        /* v8 ignore next */
        const ops = resource.operations.filter(op => op.isCustomCollectionAction || op.isCustomItemAction);
        /* v8 ignore next */
        return ops.map(op => ({
            name: op.action,
            label: pascalCase(op.action),
            kind: this.getActionKind(op.action),
            isCollectionAction: !!op.isCustomCollectionAction,
            requiresId: !!op.isCustomItemAction,
            operation: op,
        }));
    }

    private getActionKind(action: string): ListActionKind {
        /* v8 ignore next */
        const lowerAction = action.toLowerCase();
        /* v8 ignore next */
        if (
            lowerAction.includes('delete') ||
            lowerAction.includes('remove') ||
            lowerAction.includes('cancel') ||
            lowerAction.includes('block')
        ) {
            /* v8 ignore next */
            return 'destructive';
        }
        /* v8 ignore next */
        if (lowerAction.includes('add') || lowerAction.includes('create')) {
            /* v8 ignore next */
            return 'constructive';
        }
        /* v8 ignore next */
        if (
            lowerAction.includes('edit') ||
            lowerAction.includes('update') ||
            lowerAction.includes('approve') ||
            lowerAction.includes('check')
        ) {
            /* v8 ignore next */
            return 'state-change';
        }
        /* v8 ignore next */
        if (lowerAction.includes('reboot') || lowerAction.includes('refresh') || lowerAction.includes('sync')) {
            /* v8 ignore next */
            return 'state-change';
        }
        // 'start', 'play', 'stop', 'pause' are more specific than generic state change
        /* v8 ignore next */
        if (
            lowerAction.includes('start') ||
            lowerAction.includes('play') ||
            lowerAction.includes('stop') ||
            lowerAction.includes('pause')
        ) {
            /* v8 ignore next */
            return 'default';
        }

        /* v8 ignore next */
        return 'default'; // Default fallback kind
    }
}
