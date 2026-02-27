import { Resource } from '@src/core/types/index.js';
import { pascalCase, singular } from '@src/functions/utils.js';
import { HtmlElementBuilder as _ } from '@src/vendors/angular/admin/html-element.builder.js';

//import { HtmlElementBuilder as _ } from '../../html-element.builder.js';

export function generateListComponentHtml(
    resource: Resource,
    idProperty: string,
    iconMap: Map<string, string>,
): string {
    const modelName = resource.modelName;
    const resourceName = resource.name;
    const hasCreate = resource.operations.some(op => op.action === 'create');
    const hasEdit = resource.operations.some(op => op.action === 'update');
    const hasDelete = resource.operations.some(op => op.action === 'delete');
    const customCollectionActions = resource.operations.filter(op => op.isCustomCollectionAction);
    const customItemActions = resource.operations.filter(op => op.isCustomItemAction);
    const hasActionsColumn = hasEdit || hasDelete || customItemActions.length > 0;

    const root = _.create('div').addClass('admin-list-container');
    const toolbar = _.create('mat-toolbar').addClass('admin-list-toolbar');
    toolbar.appendChild(_.create('span').setTextContent(pascalCase(resourceName)));
    toolbar.appendChild(_.create('span').addClass('toolbar-spacer'));

    for (const action of customCollectionActions) {
        toolbar.appendChild(
            _.create('button')
                .setAttribute('mat-stroked-button', '')
                .setAttribute('(click)', `${action.action}()`)
                .appendChild(_.create('mat-icon').setTextContent(iconMap.get(action.action)!))
                .appendChild(` ${pascalCase(action.action)}`),
        );
    }
    if (hasCreate) {
        toolbar.appendChild(
            _.create('button')
                .setAttribute('mat-flat-button', '')
                .setAttribute('color', 'primary')
                .setAttribute('(click)', 'onCreate()')
                .setTextContent(`Create ${singular(modelName)}`),
        );
    }
    root.appendChild(toolbar);

    const tableContainer = _.create('div').addClass('mat-elevation-z8 table-container');
    const table = _.create('table').setAttribute('mat-table', '').setAttribute('[dataSource]', 'dataSource');

    const listableProps = resource.listProperties;
    const columnNames = [...new Set([idProperty, ...listableProps.map(p => p.name)])].filter(Boolean);

    for (const colName of columnNames) {
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

    if (hasActionsColumn) {
        const actionsCell = _.create('td').setAttribute('mat-cell', '').setAttribute('*matCellDef', 'let row');
        if (hasEdit)
            actionsCell.appendChild(
                _.create('button')
                    .setAttribute('mat-icon-button', '')
                    .setAttribute('color', 'primary')
                    .setAttribute('(click)', `onEdit(row[idProperty])`)
                    .setAttribute('matTooltip', `Edit ${singular(modelName)}`)
                    .appendChild(_.create('mat-icon').setTextContent('edit')),
            );
        if (hasDelete)
            actionsCell.appendChild(
                _.create('button')
                    .setAttribute('mat-icon-button', '')
                    .setAttribute('color', 'warn')
                    .setAttribute('(click)', `onDelete(row[idProperty])`)
                    .setAttribute('matTooltip', `Delete ${singular(modelName)}`)
                    .appendChild(_.create('mat-icon').setTextContent('delete')),
            );
        for (const action of customItemActions)
            actionsCell.appendChild(
                _.create('button')
                    .setAttribute('mat-icon-button', '')
                    .setAttribute('(click)', `${action.action}(row[idProperty])`)
                    .setAttribute('matTooltip', pascalCase(action.action))
                    .appendChild(_.create('mat-icon').setTextContent(iconMap.get(action.action)!)),
            );
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

    table.appendChild(
        _.create('tr').setAttribute('mat-header-row', '').setAttribute('*matHeaderRowDef', 'displayedColumns'),
    );
    table.appendChild(
        _.create('tr').setAttribute('mat-row', '').setAttribute('*matRowDef', 'let row; columns: displayedColumns;'),
    );
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

    tableContainer.appendChild(table);
    tableContainer.appendChild(
        _.create('mat-paginator')
            .setAttribute('[length]', 'totalItems()')
            .setAttribute('[pageSizeOptions]', '[5, 10, 25, 100]')
            .setAttribute('aria-label', 'Select page'),
    );
    root.appendChild(tableContainer);

    return root.render();
}
