import { describe, expect, it } from 'vitest';
import { analyzeValidationRules } from '@src/analysis/validation.analyzer.js';
import { SwaggerDefinition } from "@src/core/types/index.js";

describe('Analysis: validation.analyzer', () => {

    it('should return empty array for readOnly properties', () => {
        expect(analyzeValidationRules({ readOnly: true } as SwaggerDefinition)).toEqual([]);
    });

    it('should return empty array for a null or undefined schema', () => {
        expect(analyzeValidationRules(null as any)).toEqual([]);
        expect(analyzeValidationRules(undefined as any)).toEqual([]);
    });

    it('should map all standard validation keywords', () => {
        const schema: SwaggerDefinition = {
            type: 'string',
            minLength: 1, maxLength: 5,
            pattern: '^[a-z]$',
            format: 'email'
        };
        const rules = analyzeValidationRules(schema)!;
        expect(rules).toContainEqual({ type: 'minLength', value: 1 });
        expect(rules).toContainEqual({ type: 'maxLength', value: 5 });
        expect(rules).toContainEqual({ type: 'pattern', value: '^[a-z]$' });
        expect(rules).toContainEqual({ type: 'email' });
    });

    it('should handle contentEncoding patterns', () => {
        expect(analyzeValidationRules({ contentEncoding: 'base64' } as any)).toContainEqual(expect.objectContaining({ type: 'pattern' }));
        expect(analyzeValidationRules({ contentEncoding: 'base64url' } as any)).toContainEqual(expect.objectContaining({ type: 'pattern' }));
    });

    it('should map numeric constraints (exclusive vs standard)', () => {
        const standard = analyzeValidationRules({ minimum: 5, maximum: 10 } as any);
        expect(standard).toContainEqual({ type: 'min', value: 5 });
        expect(standard).toContainEqual({ type: 'max', value: 10 });

        const exclusive30 = analyzeValidationRules({
            minimum: 5,
            exclusiveMinimum: true,
            maximum: 10,
            exclusiveMaximum: true
        } as any);
        expect(exclusive30).toContainEqual({ type: 'exclusiveMinimum', value: 5 });
        expect(exclusive30).toContainEqual({ type: 'exclusiveMaximum', value: 10 });

        const exclusive31 = analyzeValidationRules({ exclusiveMinimum: 5, exclusiveMaximum: 10 } as any);
        expect(exclusive31).toContainEqual({ type: 'exclusiveMinimum', value: 5 });
        expect(exclusive31).toContainEqual({ type: 'exclusiveMaximum', value: 10 });
    });

    it('should map array and general constraints', () => {
        const schema: SwaggerDefinition = {
            multipleOf: 2,
            uniqueItems: true,
            minItems: 1,
            maxItems: 5
        };
        const rules = analyzeValidationRules(schema);
        expect(rules).toContainEqual({ type: 'multipleOf', value: 2 });
        expect(rules).toContainEqual({ type: 'uniqueItems' });
        expect(rules).toContainEqual({ type: 'minItems', value: 1 });
        expect(rules).toContainEqual({ type: 'maxItems', value: 5 });
    });

    it('should map required property (denormalized)', () => {
        const schema: any = { required: ['true'] }; // Logic checks if required exists/truthy
        expect(analyzeValidationRules(schema)).toContainEqual({ type: 'required' });
    });

    it('should escape backslashes in pattern', () => {
        const schema: SwaggerDefinition = { pattern: '\\d' };
        // Replaces \\ with \
        const rules = analyzeValidationRules(schema);
        expect(rules[0]).toEqual({ type: 'pattern', value: '\\d' });
    });
});
