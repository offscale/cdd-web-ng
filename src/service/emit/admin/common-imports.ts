// src/service/emit/admin/common-imports.ts

/**
 * A centralized list of Angular and Material modules commonly required by standalone
 * components in the generated admin UI. This avoids duplicating the import list
 * in every component generator.
 */
export const commonStandaloneImports = [
    ["CommonModule", "@angular/common"],
    ["RouterModule", "@angular/router"],
    ["ReactiveFormsModule", "@angular/forms"],
    ["MatButtonModule", "@angular/material/button"],
    ["MatIconModule", "@angular/material/icon"],
    ["MatFormFieldModule", "@angular/material/form-field"],
    ["MatInputModule", "@angular/material/input"],
    ["MatSelectModule", "@angular/material/select"],
    ["MatRadioModule", "@angular/material/radio"],
    ["MatChipsModule", "@angular/material/chips"],
    ["MatDatepickerModule", "@angular/material/datepicker"],
    ["MatNativeDateModule", "@angular/material/core"],
    ["MatSliderModule", "@angular/material/slider"],
    ["MatButtonToggleModule", "@angular/material/button-toggle"],
    ["MatSnackBarModule", "@angular/material/snack-bar"],
    ["MatTableModule", "@angular/material/table"],
    ["MatPaginatorModule", "@angular/material/paginator"],
    ["MatSortModule", "@angular/material/sort"],
    ["MatProgressBarModule", "@angular/material/progress-bar"],
    ["MatTooltipModule", "@angular/material/tooltip"],
    ["MatToolbarModule", "@angular/material/toolbar"]
];
