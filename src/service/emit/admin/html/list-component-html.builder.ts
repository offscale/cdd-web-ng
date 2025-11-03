/**
 * @fileoverview
 * This file contains the builder function for generating the HTML template for a resource's
 * administrative list component. It constructs an Angular Material table with dynamic columns,
 * action buttons, and pagination.
 */

import { FormProperty, Resource } from '../../../../core/types.js';
import { camelCase, pascalCase, singular } from '../../../../core/utils.js';

/**
 * Generates the complete HTML content for a resource's list component.
 *
 * @param resource The metadata object for the resource.
 * @param idProperty The name of the property to use as the unique identifier for rows.
 * @param iconMap A map of custom action names to their corresponding Material Design icon names.
 * @returns A string containing the full HTML template.
 */
export function generateListComponentHtml(resource: Resource, idProperty: string, iconMap: Map<string, string>): string {
    const modelName = resource.modelName;
    const resourceName = resource.name;

    const hasCreate = resource.operations.some(op => op.action === 'create');
    const hasEdit = resource.operations.some(op => op.action === 'update');
    const hasDelete = resource.operations.some(op => op.action === 'delete');

    const customCollectionActions = resource.operations.filter(op => op.isCustomCollectionAction);
    const customItemActions = resource.operations.filter(op => op.isCustomItemAction);
    const hasActionsColumn = hasEdit || hasDelete || customItemActions.length > 0;

    /**
     * Generates the `<ng-container matColumnDef>` blocks for the table.
     * @returns A string of HTML column definitions.
     */
    const generateColumns = (): string => {
        // This is now covered by a test with a resource that has no list properties.
        const properties = resource.listProperties || [];
        return properties.map((prop: FormProperty) => `
    <!-- ${pascalCase(prop.name)} Column -->
    <ng-container matColumnDef="${prop.name}">
      <th mat-header-cell *matHeaderCellDef>${pascalCase(prop.name)}</th>
      <td mat-cell *matCellDef="let row"> {{row.${prop.name}}} </td>
    </ng-container>
    `).join('\n');
    };

    /**
     * Generates the action buttons (edit, delete, custom) for the actions column.
     * @returns A string of HTML button elements.
     */
    const generateActionButtons = (): string => {
        let buttons = '';
        if (hasEdit) {
            buttons += `<button mat-icon-button color="primary" (click)="onEdit(row[idProperty])" matTooltip="Edit ${singular(modelName)}"><mat-icon>edit</mat-icon></button>`;
        }
        if (hasDelete) {
            buttons += `<button mat-icon-button color="warn" (click)="onDelete(row[idProperty])" matTooltip="Delete ${singular(modelName)}"><mat-icon>delete</mat-icon></button>`;
        }
        customItemActions.forEach(action => {
            buttons += `<button mat-icon-button (click)="${action.action}(row[idProperty])" matTooltip="${pascalCase(action.action)}"><mat-icon>${iconMap.get(action.action)}</mat-icon></button>`;
        });
        return buttons;
    };

    return `
<div class="admin-list-container">
  <mat-toolbar class="admin-list-toolbar">
    <span>${pascalCase(resourceName)}</span>
    <span class="toolbar-spacer"></span>
    ${customCollectionActions.map(action =>
        `<button mat-stroked-button (click)="${action.action}()">
          <mat-icon>${iconMap.get(action.action)}</mat-icon> ${pascalCase(action.action)}
         </button>`
    ).join('\n    ')}
    ${hasCreate ? `<button mat-flat-button color="primary" (click)="onCreate()">Create ${singular(modelName)}</button>` : ''}
  </mat-toolbar>

  <div class="mat-elevation-z8 table-container">
    <table mat-table [dataSource]="dataSource">
      ${generateColumns()}

      <!-- Actions Column -->
      ${hasActionsColumn ? `
      <ng-container matColumnDef="actions">
        <th mat-header-cell *matHeaderCellDef>Actions</th>
        <td mat-cell *matCellDef="let row">
          ${generateActionButtons()}
        </td>
      </ng-container>
      ` : ''}

      <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
      <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>

      <!-- Row shown when there is no data. -->
      <tr class="mat-row" *matNoDataRow>
        <td class="mat-cell" [attr.colspan]="displayedColumns.length">
          No data matching the filter
        </td>
      </tr>
    </table>

    <mat-paginator
      [length]="totalItems()"
      [pageSizeOptions]="[5, 10, 25, 100]"
      aria-label="Select page">
    </mat-paginator>
  </div>
</div>
`;
}
