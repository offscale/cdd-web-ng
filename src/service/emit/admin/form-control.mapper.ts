// src/service/emit/admin/form-control.mapper.ts

import { SwaggerDefinition } from "../../../core/types.js";

export interface FormControlInfo {
    validators: string[];
}

export function mapSchemaToFormControl(schema: SwaggerDefinition): FormControlInfo | null {
    // FIX: Add a null check at the very beginning to prevent crashes.
    if (!schema) { return null; }

    if (schema.readOnly) { return null; }

    const validators: string[] = [];
    if (schema.required) { validators.push('Validators.required'); }
    if (schema.minLength) { validators.push(`Validators.minLength(${schema.minLength})`); }
    if (schema.maxLength) { validators.push(`Validators.maxLength(${schema.maxLength})`); }
    if (schema.minimum !== undefined && !schema.exclusiveMinimum) { validators.push(`Validators.min(${schema.minimum})`); }
    if (schema.maximum !== undefined && !schema.exclusiveMaximum) { validators.push(`Validators.max(${schema.maximum})`); }
    if (schema.pattern) { validators.push(`Validators.pattern(/${schema.pattern.replace(/\\\\/g, '\\')}/)`); }
    if (schema.format === 'email') { validators.push('Validators.email'); }
    if (schema.exclusiveMinimum) { validators.push(`CustomValidators.exclusiveMinimum(${schema.minimum})`); }
    if (schema.exclusiveMaximum) { validators.push(`CustomValidators.exclusiveMaximum(${schema.maximum})`); }
    if (schema.multipleOf) { validators.push(`CustomValidators.multipleOf(${schema.multipleOf})`); }
    if (schema.uniqueItems) { validators.push(`CustomValidators.uniqueItems()`); }
    if (schema.minItems) { validators.push(`Validators.minLength(${schema.minItems})`); } // For FormArray

    if (schema.type === 'array' && !(schema.items as any)?.enum && !(schema.items as any)?.properties && !schema.minItems && !schema.uniqueItems) return null;
    if (schema.type === 'object' && !schema.properties) return null;
    if (!['string', 'number', 'integer', 'boolean', 'array', 'object'].includes(schema.type as string)) return null;

    return { validators };
}
