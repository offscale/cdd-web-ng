import { SwaggerDefinition } from '@src/core/types/index.js';
import { ValidationRule } from './validation-types.js';

/**
 * Analyzes a SwaggerDefinition to extract a framework-agnostic list of validation rules.
 * @param schema The Swagger/OpenAPI schema object for a property.
 * @returns An array of ValidationRule objects.
 */
export function analyzeValidationRules(schema: SwaggerDefinition | boolean): ValidationRule[] {
    if (!schema || typeof schema !== 'object' || schema.readOnly) {
        return [];
    }

    const rules: ValidationRule[] = [];

    // The 'required' keyword is on the parent object's `required` array,
    // but the resource discovery logic denormalizes this for convenience.
    if ((schema as any).required) rules.push({ type: 'required' });

    // OAS 3.1 const keyword
    if (schema.const !== undefined) {
        rules.push({ type: 'const', value: schema.const });
    }

    if (schema.minLength) rules.push({ type: 'minLength', value: schema.minLength });
    if (schema.maxLength) rules.push({ type: 'maxLength', value: schema.maxLength });
    if (schema.pattern) rules.push({ type: 'pattern', value: schema.pattern.replace(/\\\\/g, '\\') });
    if (schema.format === 'email') rules.push({ type: 'email' });

    if (schema.contentEncoding) {
        if (schema.contentEncoding === 'base64') {
            rules.push({ type: 'pattern', value: '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$' });
        } else if (schema.contentEncoding === 'base64url') {
            rules.push({ type: 'pattern', value: '^[A-Za-z0-9\\-_]*$' });
        }
    }

    if (typeof schema.exclusiveMinimum === 'number') {
        rules.push({ type: 'exclusiveMinimum', value: schema.exclusiveMinimum });
    } else if (schema.minimum !== undefined) {
        if (schema.exclusiveMinimum === true) {
            rules.push({ type: 'exclusiveMinimum', value: schema.minimum });
        } else {
            rules.push({ type: 'min', value: schema.minimum });
        }
    }

    if (typeof schema.exclusiveMaximum === 'number') {
        rules.push({ type: 'exclusiveMaximum', value: schema.exclusiveMaximum });
    } else if (schema.maximum !== undefined) {
        if (schema.exclusiveMaximum === true) {
            rules.push({ type: 'exclusiveMaximum', value: schema.maximum });
        } else {
            rules.push({ type: 'max', value: schema.maximum });
        }
    }

    if (schema.multipleOf) rules.push({ type: 'multipleOf', value: schema.multipleOf });
    if (schema.uniqueItems) rules.push({ type: 'uniqueItems' });
    if (schema.minItems) rules.push({ type: 'minItems', value: schema.minItems });
    if (schema.maxItems) rules.push({ type: 'maxItems', value: schema.maxItems });
    if (schema.minProperties !== undefined) rules.push({ type: 'minProperties', value: schema.minProperties });
    if (schema.maxProperties !== undefined) rules.push({ type: 'maxProperties', value: schema.maxProperties });

    const hasContains = schema.contains !== undefined;
    if (hasContains) {
        const min = typeof schema.minContains === 'number' ? schema.minContains : 1;
        const max = typeof schema.maxContains === 'number' ? schema.maxContains : undefined;
        const containsSchema = schema.contains;
        rules.push({
            type: 'contains',
            schema: containsSchema,
            ...(min !== undefined ? { min } : {}),
            ...(max !== undefined ? { max } : {}),
        });
    }

    // JSON Schema 'not' keyword (Inverse validation)
    if (schema.not) {
        const innerRules = analyzeValidationRules(schema.not);
        if (innerRules.length > 0) {
            rules.push({ type: 'not', rules: innerRules });
        }
    }

    return rules;
}
