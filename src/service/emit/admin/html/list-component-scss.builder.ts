/**
 * @fileoverview
 * This file contains the builder function for generating the SCSS content for a resource's
 * administrative list component.
 */

/**
 * Generates a standard set of SCSS styles for a list component.
 * @returns A string containing the SCSS styles.
 */
export function generateListComponentScss(): string {
    return `
.admin-list-container {
  padding: 24px;
}

.admin-list-toolbar {
  border-radius: 4px 4px 0 0;
}

.toolbar-spacer {
  flex: 1 1 auto;
}

.table-container {
  position: relative;
  overflow: auto;
}

table {
  width: 100%;
}

.mat-mdc-paginator {
  border-radius: 0 0 4px 4px;
}

// Add spacing between toolbar buttons
.admin-list-toolbar button {
    margin-left: 8px;
}
`;
}
