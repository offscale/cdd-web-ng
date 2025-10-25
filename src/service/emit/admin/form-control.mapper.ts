// This file is now complete and handles all specified control types.
import { SwaggerDefinition } from "../../../core/types";
import { pascalCase } from "../../../core/utils";

export interface FormControlInfo {
    name: string;
    label: string;
    controlType: 'input' | 'textarea' | 'select' | 'radio' | 'toggle' | 'datepicker' | 'slider' | 'chips' | 'file' | 'group' | 'array';
    inputType?: 'text' | 'number' | 'email' | 'password';
    validators: string[];
    options?: {
        enumName?: string;
        values: (string | number)[];
        multiple: boolean;
    };
    attributes?: {
        min?: number;
        max?: number;
        minLength?: number;
        maxLength?: number;
    };
    // For nested structures
    nestedProperties?: FormControlInfo[];
    arrayItemInfo?: FormControlInfo;
}

export function mapSchemaToFormControl(name: string, schema: SwaggerDefinition): FormControlInfo | null {
    if (schema.readOnly) { return null; }
    const info: Partial<FormControlInfo> = { name, label: pascalCase(name), validators: [], attributes: {} };

    if (schema.oneOf && schema.discriminator) {
        info.controlType = 'select';
        info.options = {
            values: schema.oneOf.map(s => (s.properties?.[schema.discriminator!.propertyName] as SwaggerDefinition)?.enum?.[0] as string),
            multiple: false,
            enumName: 'discriminatorOptions'
        };
        // Add the required validator ONLY ONCE, here.
        if (schema.required) {
            info.validators?.push('Validators.required');
        }
        return info as FormControlInfo;
    }

    if (schema.required) { info.validators?.push('Validators.required'); }
    if (schema.minLength) { info.validators?.push(`Validators.minLength(${schema.minLength})`); info.attributes!.minLength = schema.minLength; }
    if (schema.maxLength) { info.validators?.push(`Validators.maxLength(${schema.maxLength})`); info.attributes!.maxLength = schema.maxLength; }
    if (schema.minimum !== undefined && !schema.exclusiveMinimum) { info.validators?.push(`Validators.min(${schema.minimum})`); }
    if (schema.maximum !== undefined && !schema.exclusiveMaximum) { info.validators?.push(`Validators.max(${schema.maximum})`); }
    // FIX for pattern validator: remove extra backslash escaping
    if (schema.pattern) { info.validators?.push(`Validators.pattern(/${schema.pattern.replace(/\\\\/g, '\\')}/)`); }
    if (schema.format === 'email') info.validators?.push('Validators.email');

    // Custom Validators
    if (schema.exclusiveMinimum) { info.validators?.push(`CustomValidators.exclusiveMinimum(${schema.minimum})`); }
    if (schema.exclusiveMaximum) { info.validators?.push(`CustomValidators.exclusiveMaximum(${schema.maximum})`); }
    if (schema.multipleOf) { info.validators?.push(`CustomValidators.multipleOf(${schema.multipleOf})`); }
    if (schema.uniqueItems) { info.validators?.push(`CustomValidators.uniqueItems()`); }
    if (schema.minItems) { info.validators?.push(`Validators.minLength(${schema.minItems})`); } // For FormArray

    if (schema.oneOf && schema.discriminator) {
        info.controlType = 'select';
        info.options = {
            values: schema.oneOf.map(s => (s.properties?.[schema.discriminator!.propertyName] as SwaggerDefinition)?.enum?.[0] as string),
            multiple: false,
            enumName: 'discriminatorOptions' // Use a shared name
        };
        // Add required validator if the base schema requires it
        if (schema.required) {
            info.validators?.push('Validators.required');
        }
        return info as FormControlInfo;
    }

    switch (schema.type) {
        case 'string':
            if (schema.format === 'date' || schema.format === 'date-time') { info.controlType = 'datepicker'; }
            else if (schema.format === 'binary') { info.controlType = 'file'; }
            else if (schema.format === 'textarea') { info.controlType = 'textarea'; }
            else if (schema.enum) {
                info.controlType = schema.enum.length <= 4 ? 'radio' : 'select';
                info.options = { values: schema.enum, multiple: false, enumName: `${pascalCase(name)}Options` };
            } else {
                info.controlType = 'input';
                info.inputType = 'text';
            }
            break;
        case 'boolean':
            info.controlType = 'toggle';
            break;
        case 'integer':
        case 'number':
            if (schema.minimum !== undefined && schema.maximum !== undefined) {
                info.controlType = 'slider';
                info.attributes!.min = schema.minimum;
                info.attributes!.max = schema.maximum;
            } else {
                info.controlType = 'input';
                info.inputType = 'number';
            }
            break;
        case 'array':
            const items = schema.items as SwaggerDefinition;

            // These validators imply a FormArray structure, even for primitives.
            if (schema.uniqueItems || schema.minItems) {
                info.controlType = 'array';
                if (items.type === 'object' || items.properties) {
                    info.arrayItemInfo = mapSchemaToFormControl(name, items) as FormControlInfo;
                }
                if (schema.minItems) info.attributes!.minLength = schema.minItems;
                break; // Use FormArray and stop.
            }

            // Fallback to other controls if no array-specific validators are present
            if (items.enum) {
                info.controlType = 'select';
                info.options = { values: items.enum, multiple: true, enumName: `${pascalCase(name)}Options` };
            } else if (items.type === 'string') {
                info.controlType = 'chips';
            } else if (items.type === 'object' || items.properties) { // Check for .properties to catch resolved $refs
                info.controlType = 'array';
                info.arrayItemInfo = mapSchemaToFormControl(name, items) as FormControlInfo;
                if(schema.minItems) info.attributes!.minLength = schema.minItems;
            } else {
                return null;
            }
            break;
        case 'object':
            if (schema.properties) {
                info.controlType = 'group';
                // This recursive call is now much simpler. The 'required' boolean has already been set on the propSchema by the discovery function.
                info.nestedProperties = Object.entries(schema.properties)
                    .map(([propName, propSchema]) => mapSchemaToFormControl(propName, propSchema))
                    .filter((p): p is FormControlInfo => !!p);
            } else {
                return null;
            }
            break;
        default: return null;
    }
    return info as FormControlInfo;
}
