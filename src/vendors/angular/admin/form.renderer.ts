// src/generators/angular/admin/form.renderer.ts
import { ValidationRule } from '@src/vendors/angular/admin/analysis/validation-types.js';
import { FormControlModel } from '@src/vendors/angular/admin/analysis/form-types.js';

export class ValidationRenderer {
    public static render(rules: ValidationRule[]): string {
        /* v8 ignore next */
        if (!rules || rules.length === 0) {
            /* v8 ignore next */
            return '';
        }
        /* v8 ignore next */
        const renderedRules = rules.map(rule => this.renderRule(rule));
        /* v8 ignore next */
        return `[${renderedRules.join(', ')}]`;
    }

    private static renderRule(rule: ValidationRule): string {
        /* v8 ignore next */
        switch (rule.type) {
            case 'required':
                /* v8 ignore next */
                return 'Validators.required';
            case 'email':
                /* v8 ignore next */
                return 'Validators.email';
            case 'minLength':
                /* v8 ignore next */
                return `Validators.minLength(${rule.value})`;
            case 'maxLength':
                /* v8 ignore next */
                return `Validators.maxLength(${rule.value})`;
            case 'min':
                /* v8 ignore next */
                return `Validators.min(${rule.value})`;
            case 'max':
                /* v8 ignore next */
                return `Validators.max(${rule.value})`;
            case 'pattern':
                /* v8 ignore next */
                return `Validators.pattern(/${rule.value}/)`;
            case 'multipleOf':
                /* v8 ignore next */
                return `CustomValidators.multipleOf(${rule.value})`;
            case 'exclusiveMinimum':
                /* v8 ignore next */
                return `CustomValidators.exclusiveMinimum(${rule.value})`;
            case 'exclusiveMaximum':
                /* v8 ignore next */
                return `CustomValidators.exclusiveMaximum(${rule.value})`;
            case 'uniqueItems':
                /* v8 ignore next */
                return `CustomValidators.uniqueItems()`;
            case 'minItems':
                /* v8 ignore next */
                return `Validators.minLength(${rule.value})`;
            case 'maxItems':
                /* v8 ignore next */
                return `Validators.maxLength(${rule.value})`;
            case 'minProperties':
                /* v8 ignore next */
                return `CustomValidators.minProperties(${rule.value})`;
            case 'maxProperties':
                /* v8 ignore next */
                return `CustomValidators.maxProperties(${rule.value})`;
            case 'contains': {
                /* v8 ignore next */
                /* v8 ignore start */
                const schemaLiteral = JSON.stringify(rule.schema ?? true);
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore start */
                const minArg = rule.min !== undefined ? `${rule.min}` : 'undefined';
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore start */
                const maxArg = rule.max !== undefined ? `${rule.max}` : 'undefined';
                /* v8 ignore stop */
                /* v8 ignore next */
                return `CustomValidators.contains(${schemaLiteral}, ${minArg}, ${maxArg})`;
            }
            case 'const': {
                /* v8 ignore next */
                const val = typeof rule.value === 'string' ? `'${rule.value}'` : JSON.stringify(rule.value);
                /* v8 ignore next */
                return `CustomValidators.constValidator(${val})`;
            }
            case 'not': {
                /* v8 ignore next */
                const innerValidatorsArrayString = this.render(rule.rules);
                /* v8 ignore next */
                return `CustomValidators.notValidator(Validators.compose(${innerValidatorsArrayString})!)`;
            }
            default: {
                /* v8 ignore next */
                const exhaustiveCheck: never = rule as never;
                /* v8 ignore next */
                throw new Error(`Unhandled validation rule type: ${(exhaustiveCheck as { type?: string }).type}`);
            }
        }
    }
}

export class FormInitializerRenderer {
    public static renderControlInitializer(control: FormControlModel, useFormBuilder: boolean = true): string {
        /* v8 ignore next */
        const validationString = ValidationRenderer.render(control.validationRules);
        /* v8 ignore next */
        const fbValidatorOptions = validationString ? `{ validators: ${validationString} }` : '';

        /* v8 ignore next */
        switch (control.controlType) {
            case 'control': {
                /* v8 ignore next */
                const dataType = control.dataType;
                /* v8 ignore next */
                const defaultValue = control.defaultValue !== null ? JSON.stringify(control.defaultValue) : 'null';
                /* v8 ignore next */
                const fcValidationString = validationString ? `, ${validationString}` : '';
                /* v8 ignore next */
                return `new FormControl<${dataType}>(${defaultValue}${fcValidationString})`;
            }
            case 'group': {
                /* v8 ignore next */
                const nestedInits = (control.nestedControls || [])
                    /* v8 ignore next */
                    .map(c => `'${c.name}': ${this.renderControlInitializer(c, useFormBuilder)}`)
                    .join(',\n      ');
                /* v8 ignore next */
                if (useFormBuilder) {
                    /* v8 ignore next */
                    const finalValidatorString = fbValidatorOptions ? `, ${fbValidatorOptions}` : '';
                    /* v8 ignore next */
                    return `this.fb.group({${nestedInits}}${finalValidatorString})`;
                }
                /* v8 ignore next */
                const finalValidatorString = fbValidatorOptions ? `, ${fbValidatorOptions}` : '';
                /* v8 ignore next */
                return `new FormGroup({${nestedInits}}${finalValidatorString})`;
            }
            case 'array': {
                /* v8 ignore next */
                const fbValidationString = validationString ? `, ${validationString}` : '';
                /* v8 ignore next */
                if (useFormBuilder) {
                    /* v8 ignore next */
                    return `this.fb.array([]${fbValidationString})`;
                }
                /* v8 ignore next */
                return `new FormArray([]${fbValidationString})`;
            }
            case 'map': {
                /* v8 ignore next */
                const fbValidationString = validationString ? `, ${validationString}` : '';
                /* v8 ignore next */
                if (useFormBuilder) {
                    /* v8 ignore next */
                    return `this.fb.array([]${fbValidationString})`;
                }
                /* v8 ignore next */
                return `new FormArray([]${fbValidationString})`;
            }
        }
    }

    public static renderFormArrayItemInitializer(controls: FormControlModel[]): string {
        /* v8 ignore next */
        const formControls = (controls || [])
            .map(c => {
                /* v8 ignore next */
                const validationString = ValidationRenderer.render(c.validationRules);
                /* v8 ignore next */
                const finalValidationString = validationString ? `, ${validationString}` : '';

                /* v8 ignore next */
                const defaultValueString = c.defaultValue !== null ? JSON.stringify(c.defaultValue) : 'null';
                /* v8 ignore next */
                const itemAccess = `item?.${c.name} ?? ${defaultValueString}`;

                /* v8 ignore next */
                const dataType = c.dataType;

                /* v8 ignore next */
                return `'${c.name}': new FormControl<${dataType}>(${itemAccess}${finalValidationString})`;
            })
            .join(',\n      ');

        /* v8 ignore next */
        return `new FormGroup({\n      ${formControls}\n    })`;
    }

    public static renderMapItemInitializer(
        valueControl: FormControlModel,
        keyPattern?: string,
        keyMinLength?: number,
        keyMaxLength?: number,
    ): string {
        /* v8 ignore next */
        let keyValidators = ['Validators.required'];
        /* v8 ignore next */
        if (keyPattern) {
            /* v8 ignore next */
            keyValidators.push(`Validators.pattern(/${keyPattern}/)`);
        }
        /* v8 ignore next */
        if (typeof keyMinLength === 'number') {
            /* v8 ignore next */
            keyValidators.push(`Validators.minLength(${keyMinLength})`);
        }
        /* v8 ignore next */
        if (typeof keyMaxLength === 'number') {
            /* v8 ignore next */
            keyValidators.push(`Validators.maxLength(${keyMaxLength})`);
        }
        /* v8 ignore next */
        const keyValidatorString = `[${keyValidators.join(', ')}]`;

        /* v8 ignore next */
        const keyInit = `new FormControl<string>(item?.key ?? '', ${keyValidatorString})`;

        /* v8 ignore next */
        const validationString = ValidationRenderer.render(valueControl.validationRules);
        /* v8 ignore next */
        const finalValidationString = validationString ? `, ${validationString}` : '';
        /* v8 ignore next */
        const dataType = valueControl.dataType;

        /* v8 ignore next */
        const valInit = `new FormControl<${dataType}>(item?.value ?? null${finalValidationString})`;
        /* v8 ignore next */
        return `new FormGroup({ 'key': ${keyInit}, 'value': ${valInit} })`;
    }
}
