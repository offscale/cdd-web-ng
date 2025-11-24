import { ResourceOperation } from "@src/core/types/index.js";

export interface ListColumn {
    key: string; // Property name (e.g. 'email')
    header: string; // PascalCase (e.g. 'Email')
    isId: boolean;
}

export interface ListAction {
    name: string; // Method name (e.g. 'rebootServer')
    label: string; // PascalCase label (e.g. 'RebootServer')
    icon: string; // Material icon name
    isCollectionAction: boolean; // Toolbar vs Row
    requiresId: boolean; // Row action
    operation: ResourceOperation; // Reference to original op
}

export interface ListViewModel {
    resourceName: string;
    modelName: string;
    serviceName: string;

    columns: ListColumn[];
    displayedColumns: string[]; // Array of strings for mat-table (includes 'actions')
    idProperty: string;

    // Actions
    hasCreate: boolean;
    hasEdit: boolean;
    hasDelete: boolean;
    customActions: ListAction[];
    hasActionsColumn: boolean;

    // Data Loading
    listOperationName: string;
}
