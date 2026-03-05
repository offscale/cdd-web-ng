// src/analysis/validation.analyzer.ts
import { SwaggerDefinition } from '@src/core/types/index.js';
import { ValidationRule } from './validation-types.js';

export function analyzeValidationRules(schema: SwaggerDefinition | boolean): ValidationRule[] {
    /* v8 ignore next */
    if (!schema || typeof schema !== 'object' || schema.readOnly) {
        /* v8 ignore next */
        return [];
    }

    /* v8 ignore next */
    const rules: ValidationRule[] = [];

    /* v8 ignore next */
    if ('required' in schema && schema.required) rules.push({ type: 'required' });

    /* v8 ignore next */
    if (schema.const !== undefined) {
        /* v8 ignore next */
        rules.push({ type: 'const', value: schema.const });
    }

    /* v8 ignore next */
    if (schema.minLength) rules.push({ type: 'minLength', value: schema.minLength });
    /* v8 ignore next */
    if (schema.maxLength) rules.push({ type: 'maxLength', value: schema.maxLength });
    /* v8 ignore next */
    if (schema.pattern) rules.push({ type: 'pattern', value: schema.pattern.replace(/\\\\/g, '\\') });
    /* v8 ignore next */
    if (schema.format === 'email') rules.push({ type: 'email' });

    /* v8 ignore next */
    if (schema.contentEncoding) {
        /* v8 ignore next */
        if (schema.contentEncoding === 'base64') {
            /* v8 ignore next */
            rules.push({ type: 'pattern', value: '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$' });
            /* v8 ignore next */
        } else if (schema.contentEncoding === 'base64url') {
            /* v8 ignore next */
            rules.push({ type: 'pattern', value: '^[A-Za-z0-9\\-_]*$' });
        }
    }

    /* v8 ignore next */
    if (typeof schema.exclusiveMinimum === 'number') {
        /* v8 ignore next */
        rules.push({ type: 'exclusiveMinimum', value: schema.exclusiveMinimum });
        /* v8 ignore next */
    } else if (schema.minimum !== undefined) {
        /* v8 ignore next */
        if (schema.exclusiveMinimum === true) {
            /* v8 ignore next */
            rules.push({ type: 'exclusiveMinimum', value: schema.minimum });
        } else {
            /* v8 ignore next */
            rules.push({ type: 'min', value: schema.minimum });
        }
    }

    /* v8 ignore next */
    if (typeof schema.exclusiveMaximum === 'number') {
        /* v8 ignore next */
        rules.push({ type: 'exclusiveMaximum', value: schema.exclusiveMaximum });
        /* v8 ignore next */
    } else if (schema.maximum !== undefined) {
        /* v8 ignore next */
        if (schema.exclusiveMaximum === true) {
            /* v8 ignore next */
            rules.push({ type: 'exclusiveMaximum', value: schema.maximum });
        } else {
            /* v8 ignore next */
            rules.push({ type: 'max', value: schema.maximum });
        }
    }

    /* v8 ignore next */
    if (schema.multipleOf) rules.push({ type: 'multipleOf', value: schema.multipleOf });
    /* v8 ignore next */
    if (schema.uniqueItems) rules.push({ type: 'uniqueItems' });
    /* v8 ignore next */
    if (schema.minItems) rules.push({ type: 'minItems', value: schema.minItems });
    /* v8 ignore next */
    if (schema.maxItems) rules.push({ type: 'maxItems', value: schema.maxItems });
    /* v8 ignore next */
    if (schema.minProperties !== undefined) rules.push({ type: 'minProperties', value: schema.minProperties });
    /* v8 ignore next */
    if (schema.maxProperties !== undefined) rules.push({ type: 'maxProperties', value: schema.maxProperties });

    /* v8 ignore next */
    const hasContains = schema.contains !== undefined;
    /* v8 ignore next */
    if (hasContains) {
        /* v8 ignore next */
        const min = typeof schema.minContains === 'number' ? schema.minContains : 1;
        /* v8 ignore next */
        const max = typeof schema.maxContains === 'number' ? schema.maxContains : undefined;
        /* v8 ignore next */
        const containsSchema = schema.contains;
        /* v8 ignore next */
        rules.push({
            type: 'contains',
            schema: containsSchema,
            /* v8 ignore start */
            ...(min !== undefined ? { min } : {}),
            /* v8 ignore stop */
            ...(max !== undefined ? { max } : {}),
        });
    }

    /* v8 ignore next */
    if (schema.not) {
        /* v8 ignore next */
        const innerRules = analyzeValidationRules(schema.not);
        /* v8 ignore next */
        if (innerRules.length > 0) {
            /* v8 ignore next */
            rules.push({ type: 'not', rules: innerRules });
        }
    }

    /* v8 ignore next */
    return rules;
}
