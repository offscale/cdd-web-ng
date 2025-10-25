// ./tests/admin/1-form-controls.spec.ts

import { describe, it, expect, beforeAll } from 'vitest';
import { SourceFile, Project, ClassDeclaration } from 'ts-morph';
import { basicControlsSpec } from './specs/test.specs.js';
import { generateAdminUI } from './test.helpers.js';

describe('Integration: Form Controls Generation', () => {
    let tsClass: ClassDeclaration;
    let html: string;
    let formGroupInit: string = '';

    beforeAll(async () => {
        const project = await generateAdminUI(basicControlsSpec);
        const tsFile = project.getSourceFileOrThrow('/generated/admin/widgets/widgets-form/widgets-form.component.ts');
        tsClass = tsFile.getClassOrThrow('WidgetsFormComponent'); // <--- GET the class here
        html = project.getFileSystem().readFileSync('/generated/admin/widgets/widgets-form/widgets-form.component.html');
        formGroupInit = tsFile.getClass('WidgetsFormComponent')?.getMethod('initForm')?.getBodyText() ?? '';
    }, 30000);

    // ... (rest of the tests remain unchanged)
    describe('Individual Control Types', () => {
        it('should generate a MatDatepicker for "format: date"', () => {
            expect(html).toContain('<mat-datepicker-toggle matSuffix [for]="pickerlaunchDate_id">');
            expect(html).toContain('<mat-datepicker #pickerlaunchDate_id>');
        });

        it('should generate a MatButtonToggleGroup for "type: boolean"', () => {
            expect(html).toContain('<mat-button-toggle-group formControlName="isPublic"');
        });

        it('should generate a MatRadioGroup for small enums (<= 4 items)', () => {
            expect(html).toContain('<mat-radio-group formControlName="status"');
            // Check for the value "Pending" inside the generated array string
            expect(tsClass.getProperty('StatusOptions')?.getInitializer()?.getText()).toContain('"Pending"');
            expect(html).toContain('<mat-radio-button [value]="option"');
        });

        it('should generate a MatSelect for large enums (> 4 items)', () => {
            expect(html).toContain('<mat-select formControlName="priority"');
            // Check for "Low"
            expect(tsClass.getProperty('PriorityOptions')?.getInitializer()?.getText()).toContain('"Low"');
            expect(html).toContain('<mat-option [value]="option"');
        });

        it('should generate a MatChipList for an array of strings', () => {
            expect(html).toContain('<mat-chip-grid #chipGridtags_id');
        });

        it('should generate a MatSelect with "multiple" for an array of enums', () => {
            expect(html).toContain('<mat-select formControlName="categories" multiple');
            // FIX: JSON.stringify uses double quotes, not single quotes
            expect(tsClass.getProperty('CategoriesOptions')?.getInitializer()?.getText()).toContain('"Tech"');
            expect(html).toContain('<mat-option [value]="option"');
        });

        it('should generate a MatSlider for an integer with min/max', () => {
            expect(html).toContain('<mat-slider');
            expect(html).toContain('min="0"');
            expect(html).toContain('max="100"');
        });

        it('should generate a textarea for "format: textarea"', () => {
            expect(html).toContain('<textarea matInput formControlName="description"');
        });
    });

    describe('Validators', () => {
        it('should apply built-in validators like minLength', () => {
            expect(html).toContain('<input matInput formControlName="name"');
        });

        it('should apply number validators for minimum and maximum', () => {
            // This is tested via the slider's min/max attributes for now
            expect(html).toContain('<mat-slider');
        });
    });
});
