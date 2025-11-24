import { SwaggerDefinition } from "../../../core/types.js";

export interface FormControlInfo {
    validators: string[];
}

export function mapSchemaToFormControl(schema: SwaggerDefinition): FormControlInfo | null {
    if (!schema) return null;
    if (schema.readOnly) return null;

    const validators: string[] = [];
    if (schema.required) validators.push('Validators.required');
    if (schema.minLength) validators.push(`Validators.minLength(${schema.minLength})`);
    if (schema.maxLength) validators.push(`Validators.maxLength(${schema.maxLength})`);
    if (schema.pattern) validators.push(`Validators.pattern(/${schema.pattern.replace(/\\\\/g, '\\')}/)`);
    if (schema.format === 'email') validators.push('Validators.email');

    if (schema.contentEncoding) {
        if (schema.contentEncoding === 'base64') {
            validators.push(`Validators.pattern(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)`);
        } else if (schema.contentEncoding === 'base64url') {
            validators.push(`Validators.pattern(/^[A-Za-z0-9\\-_]*$/)`);
        }
    }

    if (typeof schema.exclusiveMinimum === 'number') {
        validators.push(`CustomValidators.exclusiveMinimum(${schema.exclusiveMinimum})`);
    } else if (schema.minimum !== undefined) {
        if (schema.exclusiveMinimum === true) validators.push(`CustomValidators.exclusiveMinimum(${schema.minimum})`);
        else validators.push(`Validators.min(${schema.minimum})`);
    }

    if (typeof schema.exclusiveMaximum === 'number') {
        validators.push(`CustomValidators.exclusiveMaximum(${schema.exclusiveMaximum})`);
    } else if (schema.maximum !== undefined) {
        if (schema.exclusiveMaximum === true) validators.push(`CustomValidators.exclusiveMaximum(${schema.maximum})`);
        else validators.push(`Validators.max(${schema.maximum})`);
    }

    if (schema.multipleOf) validators.push(`CustomValidators.multipleOf(${schema.multipleOf})`);
    if (schema.uniqueItems) validators.push(`CustomValidators.uniqueItems()`);
    if (schema.minItems) validators.push(`Validators.minLength(${schema.minItems})`);

    if (schema.type === 'array' && !(schema.items as any)?.enum && !(schema.items as any)?.properties && !schema.minItems && !schema.uniqueItems) return null;
    if (schema.type === 'object' && !schema.properties) return null;
    if (!['string', 'number', 'integer', 'boolean', 'array', 'object'].includes(schema.type as string)) return null;

    return { validators };
}
