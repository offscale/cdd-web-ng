// tests/admin/7-advanced-validation.spec.ts

import { describe, it, expect, beforeAll } from 'vitest';
import { Project, SourceFile, ClassDeclaration, SyntaxKind } from 'ts-morph';
import { advancedValidationSpec } from './specs/test.specs.js';
import { generateAdminUI } from './test.helpers.js';

/**
 * Main test suite for verifying the generation of advanced, custom validation logic.
 * This suite ensures that OpenAPI validation keywords not natively supported by Angular's
 * `Validators` are correctly mapped to a generated `CustomValidators` class and applied
 * to the appropriate `FormControl` or `FormArray`.
 */
describe('Integration: Advanced Validation Generation', () => {
    let tsFile: SourceFile;
    let html: string;
    let customValidatorsFile: SourceFile;
    let formClass: ClassDeclaration;
    let initFormBody: string;

    /**
     * Runs the code generator once before all tests in this suite. It then extracts the
     * generated TypeScript class, HTML content, and the body of the `initForm` method
     * for inspection in the individual test cases.
     */
    beforeAll(async () => {
        const project = await generateAdminUI(advancedValidationSpec);
        tsFile = project.getSourceFileOrThrow('/generated/admin/validations/validations-form/validations-form.component.ts');
        html = project.getFileSystem().readFileSync('/generated/admin/validations/validations-form/validations-form.component.html');
        customValidatorsFile = project.getSourceFileOrThrow('/generated/admin/shared/custom-validators.ts');
        formClass = tsFile.getClassOrThrow('ValidationTestFormComponent');

        // Robustly get the assignment expression from the initForm method.
        const initFormMethod = formClass.getMethodOrThrow('initForm');
        const assignment = initFormMethod.getFirstDescendantByKindOrThrow(SyntaxKind.BinaryExpression);
        initFormBody = assignment.getText();
    }, 30000);

    /**
     * Verifies that the `custom-validators.ts` file is generated and contains the expected class structure.
     */
    it('should generate a CustomValidators class file', () => {
        expect(customValidatorsFile).toBeDefined();
        const customValidatorsClass = customValidatorsFile.getClass('CustomValidators');
        expect(customValidatorsClass).toBeDefined();
    });

    /**
     * Test suite for specific validator implementations, checking both the generated `CustomValidators`
     * class and their application within the form component.
     */
    describe('Specific Validator Implementations', () => {

        /**
         * Verifies the generation of validators for `exclusiveMinimum` and `exclusiveMaximum`.
         * It checks for the static methods in `CustomValidators.ts`, their application in the
         * `FormGroup` initialization, and the presence of corresponding error messages in the HTML.
         */
        it('should generate and apply validators for exclusiveMinimum and exclusiveMaximum', () => {
            const validatorsClassText = customValidatorsFile.getFullText();
            expect(validatorsClassText).toContain('static exclusiveMinimum(min: number): ValidatorFn');
            expect(validatorsClassText).toContain('static exclusiveMaximum(max: number): ValidatorFn');

            // Robust checks that are not dependent on exact formatting.
            expect(initFormBody).toContain('exclusiveMinNumber');
            expect(initFormBody).toContain('CustomValidators.exclusiveMinimum(10)');
            expect(initFormBody).toContain('exclusiveMaxNumber');
            expect(initFormBody).toContain('CustomValidators.exclusiveMaximum(100)');

            expect(html).toContain(`@if (form.get('exclusiveMinNumber')?.hasError('exclusiveMinimum'))`);
            expect(html).toContain(`@if (form.get('exclusiveMaxNumber')?.hasError('exclusiveMaximum'))`);
        });

        /**
         * Verifies the generation of a validator for `multipleOf`.
         */
        it('should generate and apply a validator for multipleOf', () => {
            expect(customValidatorsFile.getFullText()).toContain('static multipleOf(factor: number): ValidatorFn');

            expect(initFormBody).toContain('multipleOfNumber');
            expect(initFormBody).toContain('CustomValidators.multipleOf(5)');

            expect(html).toContain(`@if (form.get('multipleOfNumber')?.hasError('multipleOf'))`);
        });

        /**
         * Verifies the generation of a validator for `uniqueItems` on a FormArray.
         */
        it('should generate and apply a validator for uniqueItems on a FormArray', () => {
            expect(customValidatorsFile.getFullText()).toContain('static uniqueItems(): ValidatorFn');

            expect(initFormBody).toContain('uniqueItemsArray');
            expect(initFormBody).toContain('CustomValidators.uniqueItems()');

            expect(html).toContain(`@if (form.get('uniqueItemsArray')?.hasError('uniqueItems'))`);
        });

        /**
         * Verifies that the generator correctly maps standard OpenAPI keywords to Angular's
         * built-in validators where possible, such as `pattern` and `minItems`.
         */
        it('should map standard keywords to built-in Angular validators where applicable', () => {
            // 'pattern' should map to Validators.pattern
            expect(initFormBody).toContain('patternString');
            expect(initFormBody).toContain('Validators.pattern(/^\\d{3}$/)');
            expect(html).toContain(`@if (form.get('patternString')?.hasError('pattern'))`);

            // 'minItems' on an array should map to Validators.minLength
            expect(initFormBody).toContain('minItemsArray');
            expect(initFormBody).toContain('Validators.minLength(2)');
            expect(html).toContain(`@if (form.get('minItemsArray')?.hasError('minlength'))`);
        });
    });
});
