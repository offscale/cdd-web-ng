// src/generators/angular/admin/form.renderer.ts
import { ValidationRule } from '@src/analysis/validation-types.js';
import { FormControlModel } from '@src/analysis/form-types.js';

export class ValidationRenderer {
    public static render(rules: ValidationRule[]): string {
        if (!rules || rules.length === 0) {
            return '';
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
            case 'minItems':
                return `Validators.minLength(${rule.value})`;
            case 'maxItems':
                return `Validators.maxLength(${rule.value})`;
            case 'minProperties':
                return `CustomValidators.minProperties(${rule.value})`;
            case 'maxProperties':
                return `CustomValidators.maxProperties(${rule.value})`;
            case 'contains': {
                const schemaLiteral = JSON.stringify(rule.schema ?? true);
                const minArg = rule.min !== undefined ? `${rule.min}` : 'undefined';
                const maxArg = rule.max !== undefined ? `${rule.max}` : 'undefined';
                return `CustomValidators.contains(${schemaLiteral}, ${minArg}, ${maxArg})`;
            }
            case 'const': {
                const val = typeof rule.value === 'string' ? `'${rule.value}'` : JSON.stringify(rule.value);
                return `CustomValidators.constValidator(${val})`;
            }
            case 'not': {
                const innerValidatorsArrayString = this.render(rule.rules);
                return `CustomValidators.notValidator(Validators.compose(${innerValidatorsArrayString})!)`;
            }
            default: {
                const exhaustiveCheck: never = rule as never;
                throw new Error(`Unhandled validation rule type: ${(exhaustiveCheck as any).type}`);
            }
        }
    }
}

export class FormInitializerRenderer {
    public static renderControlInitializer(control: FormControlModel, useFormBuilder: boolean = true): string {
        const validationString = ValidationRenderer.render(control.validationRules);
        const fbValidatorOptions = validationString ? `{ validators: ${validationString} }` : '';

        switch (control.controlType) {
            case 'control': {
                const dataType = control.dataType;
                const defaultValue = control.defaultValue !== null ? JSON.stringify(control.defaultValue) : 'null';
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

    public static renderMapItemInitializer(
        valueControl: FormControlModel,
        keyPattern?: string,
        keyMinLength?: number,
        keyMaxLength?: number,
    ): string {
        let keyValidators = ['Validators.required'];
        if (keyPattern) {
            keyValidators.push(`Validators.pattern(/${keyPattern}/)`);
        }
        if (typeof keyMinLength === 'number') {
            keyValidators.push(`Validators.minLength(${keyMinLength})`);
        }
        if (typeof keyMaxLength === 'number') {
            keyValidators.push(`Validators.maxLength(${keyMaxLength})`);
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
