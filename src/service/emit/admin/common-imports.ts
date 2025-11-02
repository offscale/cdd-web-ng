// src/service/emit/admin/common-imports.ts

/**
 * A centralized list of Angular and Material modules commonly required by standalone
 * components in the generated admin UI. This avoids duplicating the import list
 * in every component generator.
 */
export const commonStandaloneImports = [
    'CommonModule',
    'RouterModule',
    'ReactiveFormsModule',
    'MatButtonModule',
    'MatIconModule',
    'MatFormFieldModule',
    'MatInputModule',
    'MatSelectModule',
    'MatRadioModule',
    'MatChipsModule',
    'MatDatepickerModule',
    'MatNativeDateModule',
    'MatSliderModule',
    'MatButtonToggleModule',
    'MatSnackBarModule',
];
