import { Resource } from '@src/core/types/index.js';
import { pascalCase, singular } from '@src/functions/utils.js';
import { HtmlElementBuilder as _ } from '@src/vendors/angular/admin/html-element.builder.js';

//import { HtmlElementBuilder as _ } from '../../html-element.builder.js';

export function generateListComponentHtml(
    resource: Resource,
    idProperty: string,
    iconMap: Map<string, string>,
): string {
    /* v8 ignore next */
    const modelName = resource.modelName;
    /* v8 ignore next */
    const resourceName = resource.name;
    /* v8 ignore next */
    const hasCreate = resource.operations.some(op => op.action === 'create');
    /* v8 ignore next */
    const hasEdit = resource.operations.some(op => op.action === 'update');
    /* v8 ignore next */
    const hasDelete = resource.operations.some(op => op.action === 'delete');
    /* v8 ignore next */
    const customCollectionActions = resource.operations.filter(op => op.isCustomCollectionAction);
    /* v8 ignore next */
    const customItemActions = resource.operations.filter(op => op.isCustomItemAction);
    /* v8 ignore next */
    const hasActionsColumn = hasEdit || hasDelete || customItemActions.length > 0;

    /* v8 ignore next */
    const root = _.create('div').addClass('admin-list-container');
    /* v8 ignore next */
    const toolbar = _.create('mat-toolbar').addClass('admin-list-toolbar');
    /* v8 ignore next */
    toolbar.appendChild(_.create('span').setTextContent(pascalCase(resourceName)));
    /* v8 ignore next */
    toolbar.appendChild(_.create('span').addClass('toolbar-spacer'));

    /* v8 ignore next */
    for (const action of customCollectionActions) {
        /* v8 ignore next */
        toolbar.appendChild(
            _.create('button')
                .setAttribute('mat-stroked-button', '')
                .setAttribute('(click)', `${action.action}()`)
                .appendChild(_.create('mat-icon').setTextContent(iconMap.get(action.action)!))
                .appendChild(` ${pascalCase(action.action)}`),
        );
    }
    /* v8 ignore next */
    if (hasCreate) {
        /* v8 ignore next */
        toolbar.appendChild(
            _.create('button')
                .setAttribute('mat-flat-button', '')
                .setAttribute('color', 'primary')
                .setAttribute('(click)', 'onCreate()')
                .setTextContent(`Create ${singular(modelName)}`),
        );
    }
    /* v8 ignore next */
    root.appendChild(toolbar);

    /* v8 ignore next */
    const tableContainer = _.create('div').addClass('mat-elevation-z8 table-container');
    /* v8 ignore next */
    const table = _.create('table').setAttribute('mat-table', '').setAttribute('[dataSource]', 'dataSource');

    /* v8 ignore next */
    const listableProps = resource.listProperties;
    /* v8 ignore next */
    const columnNames = [...new Set([idProperty, ...listableProps.map(p => p.name)])].filter(Boolean);

    /* v8 ignore next */
    for (const colName of columnNames) {
        /* v8 ignore next */
        table.appendChild(
            _.create('ng-container')
                .setAttribute('matColumnDef', colName)
                .appendChild(`<!-- ${pascalCase(colName)} Column -->`)
                .appendChild(
                    _.create('th')
                        .setAttribute('mat-header-cell', '')
                        .setAttribute('*matHeaderCellDef', '')
                        .setTextContent(pascalCase(colName)),
                )
                .appendChild(
                    _.create('td')
                        .setAttribute('mat-cell', '')
                        .setAttribute('*matCellDef', 'let row')
                        .setTextContent(`{{row.${colName}}}`),
                ),
        );
    }

    /* v8 ignore next */
    if (hasActionsColumn) {
        /* v8 ignore next */
        const actionsCell = _.create('td').setAttribute('mat-cell', '').setAttribute('*matCellDef', 'let row');
        /* v8 ignore next */
        if (hasEdit)
            /* v8 ignore next */
            actionsCell.appendChild(
                _.create('button')
                    .setAttribute('mat-icon-button', '')
                    .setAttribute('color', 'primary')
                    .setAttribute('(click)', `onEdit(row[idProperty])`)
                    .setAttribute('matTooltip', `Edit ${singular(modelName)}`)
                    .appendChild(_.create('mat-icon').setTextContent('edit')),
            );
        /* v8 ignore next */
        if (hasDelete)
            /* v8 ignore next */
            actionsCell.appendChild(
                _.create('button')
                    .setAttribute('mat-icon-button', '')
                    .setAttribute('color', 'warn')
                    .setAttribute('(click)', `onDelete(row[idProperty])`)
                    .setAttribute('matTooltip', `Delete ${singular(modelName)}`)
                    .appendChild(_.create('mat-icon').setTextContent('delete')),
            );
        /* v8 ignore next */
        /* v8 ignore next */
        for (const action of customItemActions)
            actionsCell.appendChild(
                _.create('button')
                    .setAttribute('mat-icon-button', '')
                    .setAttribute('(click)', `${action.action}(row[idProperty])`)
                    .setAttribute('matTooltip', pascalCase(action.action))
                    .appendChild(_.create('mat-icon').setTextContent(iconMap.get(action.action)!)),
            );
        /* v8 ignore next */
        table.appendChild(
            _.create('ng-container')
                .setAttribute('matColumnDef', 'actions')
                .appendChild(
                    _.create('th')
                        .setAttribute('mat-header-cell', '')
                        .setAttribute('*matHeaderCellDef', '')
                        .setTextContent('Actions'),
                )
                .appendChild(actionsCell),
        );
    }

    /* v8 ignore next */
    table.appendChild(
        _.create('tr').setAttribute('mat-header-row', '').setAttribute('*matHeaderRowDef', 'displayedColumns'),
    );
    /* v8 ignore next */
    table.appendChild(
        _.create('tr').setAttribute('mat-row', '').setAttribute('*matRowDef', 'let row; columns: displayedColumns;'),
    );
    /* v8 ignore next */
    table.appendChild(
        _.create('tr')
            .addClass('mat-row')
            .setAttribute('*matNoDataRow', '')
            .appendChild(
                _.create('td')
                    .addClass('mat-cell')
                    .setAttribute('[attr.colspan]', 'displayedColumns.length')
                    .setTextContent('No data matching the filter'),
            ),
    );

    /* v8 ignore next */
    tableContainer.appendChild(table);
    /* v8 ignore next */
    tableContainer.appendChild(
        _.create('mat-paginator')
            .setAttribute('[length]', 'totalItems()')
            .setAttribute('[pageSizeOptions]', '[5, 10, 25, 100]')
            .setAttribute('aria-label', 'Select page'),
    );
    /* v8 ignore next */
    root.appendChild(tableContainer);

    /* v8 ignore next */
    return root.render();
}
