export function generateFormComponentScss(): string {
    return `
.admin-form-container { padding: 24px; }
.admin-form-fields { display: flex; flex-direction: column; }
.admin-form-actions { margin-top: 24px; display: flex; justify-content: flex-end; gap: 8px; }
.admin-toggle-group, .admin-radio-group { display: flex; flex-direction: column; margin-bottom: 16px; mat-radio-group { display: flex; gap: 16px; margin-top: 8px; } }
`;
}
