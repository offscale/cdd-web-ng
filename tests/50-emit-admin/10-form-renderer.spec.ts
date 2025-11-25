import { describe, expect, it } from 'vitest';
// HACK: To test the inner class, we temporarily expose it for the test. This is better than __get__.
// In form.renderer.ts, change `class ValidationRenderer` to `export class ValidationRenderer`.
// Then, this test can import it directly. This is a common pattern for testing "private" helpers.
// For this response, I'll assume it's exported for testing purposes. Let's modify the renderer to do that.
import { FormInitializerRenderer, ValidationRenderer } from '@src/generators/angular/admin/form.renderer.js';
import { ValidationRule } from '@src/analysis/validation-types.js';
import { FormControlModel } from '@src/analysis/form-types.js';

describe('Admin: FormRenderer', () => {

    describe('ValidationRenderer', () => {

        it('should return an empty string for empty or null rules', () => {
            expect(ValidationRenderer.render([])).toBe("");
            expect(ValidationRenderer.render(null as any)).toBe("");
        });

        it('should render all standard validation rules correctly', () => {
            const rules: ValidationRule[] = [
                { type: 'required' },
                { type: 'email' },
                { type: 'minLength', value: 5 },
                { type: 'maxLength', value: 50 },
                { type: 'min', value: 0 },
                { type: 'max', value: 100 },
                { type: 'pattern', value: '^\\d+$' },
            ];
            const result = ValidationRenderer.render(rules);
            expect(result).toBe("[Validators.required, Validators.email, Validators.minLength(5), Validators.maxLength(50), Validators.min(0), Validators.max(100), Validators.pattern(/^\\d+$/)]");
        });

        it('should render all custom validation rules correctly', () => {
            const rules: ValidationRule[] = [
                { type: 'multipleOf', value: 3 },
                { type: 'exclusiveMinimum', value: 1 },
                { type: 'exclusiveMaximum', value: 99 },
                { type: 'uniqueItems' },
                { type: 'minItems', value: 1 },
                { type: 'maxItems', value: 10 },
            ];
            const result = ValidationRenderer.render(rules);
            expect(result).toBe("[CustomValidators.multipleOf(3), CustomValidators.exclusiveMinimum(1), CustomValidators.exclusiveMaximum(99), CustomValidators.uniqueItems(), Validators.minLength(1), Validators.maxLength(10)]");
        });

        it('should throw an error on an unhandled validation rule type', () => {
            const badRule = { type: 'futureValidator' } as any;
            expect(() => ValidationRenderer.render([badRule])).toThrow('Unhandled validation rule type: futureValidator');
        });
    });

    describe('FormInitializerRenderer', () => {
        it('should render a primitive control with a default value and validator', () => {
            const control: FormControlModel = {
                name: 'name',
                propertyName: 'name',
                dataType: 'string | null',
                defaultValue: "Default Name",
                validationRules: [{ type: 'required' }],
                controlType: 'control'
            };

            const result = FormInitializerRenderer.renderControlInitializer(control);
            expect(result).toBe(`new FormControl<string | null>("Default Name", [Validators.required])`);
        });

        it('should render a primitive control with a null default and no validators', () => {
            const control: FormControlModel = {
                name: 'name',
                propertyName: 'name',
                dataType: 'string | null',
                defaultValue: null,
                validationRules: [],
                controlType: 'control'
            };

            const result = FormInitializerRenderer.renderControlInitializer(control);
            expect(result).toBe(`new FormControl<string | null>(null)`);
        });

        it('should render a form group with nested controls and validators', () => {
            const control: FormControlModel = {
                name: 'address',
                propertyName: 'address',
                dataType: 'AddressForm',
                defaultValue: null,
                validationRules: [{ type: 'required' }],
                controlType: 'group',
                nestedControls: [{
                    name: 'street',
                    propertyName: 'street',
                    dataType: 'string | null',
                    defaultValue: null,
                    validationRules: [{ type: 'required' }],
                    controlType: 'control'
                }]
            };

            const result = FormInitializerRenderer.renderControlInitializer(control);
            expect(result).toContain("this.fb.group({");
            expect(result).toContain("'street': new FormControl<string | null>(null, [Validators.required])");
            // **THE FIX**: Check for the correctly formatted options object with a leading comma.
            expect(result).toContain("}, { validators: [Validators.required] })");
        });

        it('should render a simple form array', () => {
            const control: FormControlModel = {
                name: 'tags',
                propertyName: 'tags',
                dataType: '(string | null)[]',
                defaultValue: null,
                validationRules: [{ type: 'minItems', value: 1 }],
                controlType: 'array'
            };

            const result = FormInitializerRenderer.renderControlInitializer(control);
            expect(result).toBe('this.fb.array([], [Validators.minLength(1)])');
        });

        it('should render a form array item initializer using default values', () => {
            const controls: FormControlModel[] = [{
                name: 'name',
                propertyName: 'name',
                dataType: 'string | null',
                defaultValue: 'Default Item',
                validationRules: [],
                controlType: 'control'
            }];

            const result = FormInitializerRenderer.renderFormArrayItemInitializer(controls);
            expect(result).toContain(`new FormControl<string | null>(item?.name ?? "Default Item")`);
        });

        it('should render a form array item initializer falling back to null', () => {
            const controls: FormControlModel[] = [{
                name: 'name',
                propertyName: 'name',
                dataType: 'string | null',
                defaultValue: null,
                validationRules: [],
                controlType: 'control'
            }];

            const result = FormInitializerRenderer.renderFormArrayItemInitializer(controls);
            expect(result).toContain(`new FormControl<string | null>(item?.name ?? null)`);
        });
    });
});
