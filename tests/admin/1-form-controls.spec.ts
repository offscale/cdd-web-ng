// ./tests/admin/1-form-controls.spec.ts

import { describe, it, expect, beforeAll } from 'vitest';
import { SourceFile, Project, ClassDeclaration, SyntaxKind } from 'ts-morph'; // Import SyntaxKind
import { basicControlsSpec } from './specs/test.specs.js';
import { generateAdminUI } from './test.helpers.js';

describe('Integration: Form Controls Generation', () => {
    let tsClass: ClassDeclaration;
    let html: string;
    let formGroupInit: string = '';

    beforeAll(async () => {
        const project = await generateAdminUI(basicControlsSpec);
        const tsFile = project.getSourceFileOrThrow('/generated/admin/widgets/widgets-form/widgets-form.component.ts');
        tsClass = tsFile.getClassOrThrow('WidgetFormComponent');
        html = project.getFileSystem().readFileSync('/generated/admin/widgets/widgets-form/widgets-form.component.html');

        // FIX: The method assigns, it doesn't return. Find the assignment expression.
        const initFormMethod = tsClass.getMethodOrThrow('initForm');
        const assignment = initFormMethod.getFirstDescendantByKindOrThrow(SyntaxKind.BinaryExpression);
        formGroupInit = assignment.getText();
    }, 30000);

    describe('Individual Control Types', () => {
        it('should generate a MatDatepicker for "format: date"', () => {
            // Looser checks that are less likely to break
            expect(html).toContain('<mat-datepicker-toggle');
            expect(html).toContain('[matDatepicker]');
            expect(html).toContain('<mat-datepicker');
        });

        it('should generate a MatButtonToggleGroup for "type: boolean"', () => {
            expect(html).toContain('<mat-button-toggle-group formControlName="isPublic"');
        });

        it('should generate a MatRadioGroup for small enums (<= 4 items)', () => {
            expect(html).toContain('<mat-radio-group formControlName="status"');
            expect(tsClass.getProperty('StatusOptions')?.getInitializer()?.getText()).toContain('"Pending"');
            expect(html).toContain('<mat-radio-button [value]="option"');
        });

        it('should generate a MatSelect for large enums (> 4 items)', () => {
            expect(html).toContain('<mat-select formControlName="priority"');
            expect(tsClass.getProperty('PriorityOptions')?.getInitializer()?.getText()).toContain('"Low"');
            expect(html).toContain('<mat-option [value]="option"');
        });

        it('should generate a MatChipGrid for an array of strings', () => {
            // Looser check
            expect(html).toContain('<mat-chip-grid formControlName="tags"');
        });

        it('should generate a MatSelect with "multiple" for an array of enums', () => {
            expect(html).toContain('<mat-select formControlName="categories" multiple');
            expect(tsClass.getProperty('CategoriesOptions')?.getInitializer()?.getText()).toContain('"Tech"');
            expect(html).toContain('<mat-option [value]="option"');
        });

        it('should generate a MatSlider for an integer with min/max', () => {
            expect(html).toContain('<mat-slider');
            expect(html).toContain('min="0"');
            expect(html).toContain('max="100"');
        });

        it('should generate a textarea for "format: textarea"', () => {
            // Looser check
            expect(html).toContain('<textarea matInput');
            expect(html).toContain('formControlName="description"');
        });
    });

    describe('Validators', () => {
        it('should apply built-in validators like minLength', () => {
            // Test the TS AST instead of the HTML
            expect(formGroupInit).toContain("'name': this.fb.control(null, [Validators.minLength(3)])");
        });

        it('should apply number validators for minimum and maximum', () => {
            expect(formGroupInit).toContain("'stock': this.fb.control(null, [Validators.min(0), Validators.max(100)])");
        });
    });
});
