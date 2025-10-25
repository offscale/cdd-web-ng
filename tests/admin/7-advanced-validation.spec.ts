import { describe, it, expect, beforeAll } from 'vitest';
import { Project, SourceFile, ClassDeclaration } from 'ts-morph';
import { advancedValidationSpec } from './specs/test.specs.js';
import { generateAdminUI } from './test.helpers.js';

/**
 * Main test suite for verifying the generation of advanced, custom validation logic.
 */
describe('Integration: Advanced Validation Generation', () => {
    let tsFile: SourceFile;
    let html: string;
    let customValidatorsFile: SourceFile;
    let formClass: ClassDeclaration;
    let initFormBody: string;

    /**
     * Runs the code generator once before all tests.
     */
    beforeAll(async () => {
        const project = await generateAdminUI(advancedValidationSpec);
        tsFile = project.getSourceFileOrThrow('/generated/admin/validations/validations-form/validations-form.component.ts');
        html = project.getFileSystem().readFileSync('/generated/admin/validations/validations-form/validations-form.component.html');
        customValidatorsFile = project.getSourceFileOrThrow('/generated/admin/shared/custom-validators.ts');
        formClass = tsFile.getClassOrThrow('ValidationsFormComponent');
        initFormBody = formClass.getMethodOrThrow('initForm').getBodyText() ?? '';
    });

    /**
     * Verifies that the `custom-validators.ts` file is generated and contains the expected class structure.
     */
    it('should generate a CustomValidators class file', () => {
        expect(customValidatorsFile).toBeDefined();
        const customValidatorsClass = customValidatorsFile.getClass('CustomValidators');
        expect(customValidatorsClass).toBeDefined();
    });

    /**
     * Test suite for specific validator implementations.
     */
    describe('Specific Validator Implementations', () => {

        /**
         * Verifies the generation of validators for `exclusiveMinimum` and `exclusiveMaximum`.
         */
        it('should generate and apply validators for exclusiveMinimum and exclusiveMaximum', () => {
            const validatorsClassText = customValidatorsFile.getFullText();
            expect(validatorsClassText).toContain('static exclusiveMinimum(min: number): ValidatorFn');
            expect(validatorsClassText).toContain('static exclusiveMaximum(max: number): ValidatorFn');

            expect(initFormBody).toContain('exclusiveMinNumber: new FormControl(null, [CustomValidators.exclusiveMinimum(10)])');
            expect(initFormBody).toContain('exclusiveMaxNumber: new FormControl(null, [CustomValidators.exclusiveMaximum(100)])');

            expect(html).toContain(`@if (form.get('exclusiveMinNumber')?.hasError('exclusiveMinimum'))`);
            expect(html).toContain(`@if (form.get('exclusiveMaxNumber')?.hasError('exclusiveMaximum'))`);
        });

        /**
         * Verifies the generation of a validator for `multipleOf`.
         */
        it('should generate and apply a validator for multipleOf', () => {
            expect(customValidatorsFile.getFullText()).toContain('static multipleOf(factor: number): ValidatorFn');
            expect(initFormBody).toContain('multipleOfNumber: new FormControl(null, [CustomValidators.multipleOf(5)])');
            expect(html).toContain(`@if (form.get('multipleOfNumber')?.hasError('multipleOf'))`);
        });

        /**
         * Verifies the generation of a validator for `uniqueItems` on a FormArray.
         */
        it('should generate and apply a validator for uniqueItems on a FormArray', () => {
            expect(customValidatorsFile.getFullText()).toContain('static uniqueItems(): ValidatorFn');
            expect(initFormBody).toContain('uniqueItemsArray: new FormArray([], [CustomValidators.uniqueItems()])');
            expect(html).toContain(`@if (form.get('uniqueItemsArray')?.hasError('uniqueItems'))`);
        });

        /**
         * Verifies that the generator correctly maps standard OpenAPI keywords to Angular's built-in validators where possible.
         */
        it('should map standard keywords to built-in Angular validators where applicable', () => {
            // 'pattern' should map to Validators.pattern
            expect(initFormBody).toContain('patternString: new FormControl(null, [Validators.pattern(/^\\d{3}$/)])');
            expect(html).toContain(`@if (form.get('patternString')?.hasError('pattern'))`);

            // 'minItems' on an array should map to Validators.minLength
            expect(initFormBody).toContain('minItemsArray: new FormArray([], [Validators.minLength(2)])');
            expect(html).toContain(`@if (form.get('minItemsArray')?.hasError('minlength'))`);
        });
    });
});
