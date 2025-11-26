import { ValidationRule } from "@src/analysis/validation-types.js";
import { FormControlModel } from "@src/analysis/form-types.js";

/**
 * Renders an abstract ValidationRule IR into an Angular-specific validator string.
 * This class is exported for testing purposes.
 * @internal
 */
export class ValidationRenderer {
    /**
     * Renders an array of ValidationRule objects into a single string representing
     * an array of Angular Validators.
     * @param rules The array of validation rules from the IR.
     * @returns A string like `"[Validators.required, Validators.minLength(5)]"` or `""`.
     */
    public static render(rules: ValidationRule[]): string {
        if (!rules || rules.length === 0) {
            return "";
        }
        const renderedRules = rules.map(rule => this.renderRule(rule));
        return `[${renderedRules.join(', ')}]`;
    }

    private static renderRule(rule: ValidationRule): string {
        switch (rule.type) {
            case 'required':
                return 'Validators.required';
            case 'email':
                return 'Validators.email';
            case 'minLength':
                return `Validators.minLength(${rule.value})`;
            case 'maxLength':
                return `Validators.maxLength(${rule.value})`;
            case 'min':
                return `Validators.min(${rule.value})`;
            case 'max':
                return `Validators.max(${rule.value})`;
            case 'pattern':
                return `Validators.pattern(/${rule.value}/)`;
            case 'multipleOf':
                return `CustomValidators.multipleOf(${rule.value})`;
            case 'exclusiveMinimum':
                return `CustomValidators.exclusiveMinimum(${rule.value})`;
            case 'exclusiveMaximum':
                return `CustomValidators.exclusiveMaximum(${rule.value})`;
            case 'uniqueItems':
                return `CustomValidators.uniqueItems()`;
            // minItems/maxItems on a FormArray are handled by minLength/maxLength validators in Angular
            case 'minItems':
                return `Validators.minLength(${rule.value})`;
            case 'maxItems':
                return `Validators.maxLength(${rule.value})`;
            case 'const':
                // If rule.value is a string, wrap in quotes. Otherwise stringify JSON.
                const val = typeof rule.value === 'string' ? `'${rule.value}'` : JSON.stringify(rule.value);
                return `CustomValidators.constValidator(${val})`;
            case 'not':
                // Recursively render inner rules.
                // render() returns "[Rule1, Rule2]", we need compose if multiple, or just pass if one.
                // However, ValidatorFn takes one fn. So we effectively MUST compose the inner rules array.
                // Angular's Validators.compose takes an array.
                const innerValidatorsArrayString = this.render(rule.rules);
                return `CustomValidators.notValidator(Validators.compose(${innerValidatorsArrayString})!)`;
            default:
                // This ensures that if a new rule is added, we don't fail silently.
                const exhaustiveCheck: never = rule;
                throw new Error(`Unhandled validation rule type: ${(exhaustiveCheck as any).type}`);
        }
    }
}

/**
 * Renders an abstract FormControlModel IR into an Angular-specific form initializer string.
 */
export class FormInitializerRenderer {
    /**
     * Renders a single FormControlModel into its corresponding initializer string.
     * @param control The form control model from the IR.
     * @returns A string like `"new FormControl<string | null>(null, [Validators.required])"`.
     */
    public static renderControlInitializer(control: FormControlModel, useFormBuilder: boolean = true): string {
        const validationString = ValidationRenderer.render(control.validationRules);
        const fbValidatorOptions = validationString ? `{ validators: ${validationString} }` : '';

        switch (control.controlType) {
            case 'control': {
                const dataType = control.dataType; // Use the raw data type directly
                const defaultValue = control.defaultValue !== null ? JSON.stringify(control.defaultValue) : 'null';
                // FormControl takes validators as the second argument directly, not in an options object.
                const fcValidationString = validationString ? `, ${validationString}` : '';
                return `new FormControl<${dataType}>(${defaultValue}${fcValidationString})`;
            }
            case 'group': {
                const nestedInits = (control.nestedControls || [])
                    .map(c => `'${c.name}': ${this.renderControlInitializer(c, useFormBuilder)}`)
                    .join(',\n      ');
                if (useFormBuilder) {
                    const finalValidatorString = fbValidatorOptions ? `, ${fbValidatorOptions}` : '';
                    return `this.fb.group({${nestedInits}}${finalValidatorString})`;
                }
                const finalValidatorString = fbValidatorOptions ? `, ${fbValidatorOptions}` : '';
                return `new FormGroup({${nestedInits}}${finalValidatorString})`;

            }
            case 'array': {
                const fbValidationString = validationString ? `, ${validationString}` : '';
                if (useFormBuilder) {
                    return `this.fb.array([]${fbValidationString})`;
                }
                return `new FormArray([]${fbValidationString})`;
            }
            case 'map': {
                const fbValidationString = validationString ? `, ${validationString}` : '';
                if (useFormBuilder) {
                    return `this.fb.array([]${fbValidationString})`;
                }
                return `new FormArray([]${fbValidationString})`;
            }
        }
    }

    /**
     * Renders the initializer for a single item within a FormArray of FormGroups.
     * @param controls The nested controls for the item.
     * @returns A string representing a new FormGroup initializer.
     */
    public static renderFormArrayItemInitializer(controls: FormControlModel[]): string {
        const formControls = (controls || [])
            .map(c => {
                const validationString = ValidationRenderer.render(c.validationRules);
                const finalValidationString = validationString ? `, ${validationString}` : '';

                const defaultValueString = c.defaultValue !== null ? JSON.stringify(c.defaultValue) : 'null';
                const itemAccess = `item?.${c.name} ?? ${defaultValueString}`;

                const dataType = c.dataType;

                return `'${c.name}': new FormControl<${dataType}>(${itemAccess}${finalValidationString})`;
            })
            .join(',\n      ');

        return `new FormGroup({\n      ${formControls}\n    })`;
    }

    public static renderMapItemInitializer(valueControl: FormControlModel, keyPattern?: string): string {
        // Create validators for the key control
        let keyValidators = ["Validators.required"];
        if (keyPattern) {
            // Escape keyPattern if necessary for regex literal
            keyValidators.push(`Validators.pattern(/${keyPattern}/)`);
        }
        const keyValidatorString = `[${keyValidators.join(', ')}]`;

        const keyInit = `new FormControl<string>(item?.key ?? '', ${keyValidatorString})`;

        const validationString = ValidationRenderer.render(valueControl.validationRules);
        const finalValidationString = validationString ? `, ${validationString}` : '';
        const dataType = valueControl.dataType;

        const valInit = `new FormControl<${dataType}>(item?.value ?? null${finalValidationString})`;
        return `new FormGroup({ 'key': ${keyInit}, 'value': ${valInit} })`;
    }
}
