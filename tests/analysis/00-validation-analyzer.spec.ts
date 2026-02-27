import { describe, expect, it } from 'vitest';
import { analyzeValidationRules } from '@src/vendors/angular/admin/analysis/validation.analyzer.js';
import { SwaggerDefinition } from '@src/core/types/index.js';

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
            minLength: 1,
            maxLength: 5,
            pattern: '^[a-z]$',
            format: 'email',
        };
        const rules = analyzeValidationRules(schema)!;
        expect(rules).toContainEqual({ type: 'minLength', value: 1 });
        expect(rules).toContainEqual({ type: 'maxLength', value: 5 });
        expect(rules).toContainEqual({ type: 'pattern', value: '^[a-z]$' });
        expect(rules).toContainEqual({ type: 'email' });
    });

    it('should handle contentEncoding patterns', () => {
        expect(analyzeValidationRules({ contentEncoding: 'base64' } as any)).toContainEqual(
            expect.objectContaining({ type: 'pattern' }),
        );
        expect(analyzeValidationRules({ contentEncoding: 'base64url' } as any)).toContainEqual(
            expect.objectContaining({ type: 'pattern' }),
        );
    });

    it('should ignore unsupported contentEncoding values', () => {
        const rules = analyzeValidationRules({ contentEncoding: 'quoted-printable' } as any);
        expect(rules).toEqual([]);
    });

    it('should map numeric constraints (exclusive vs standard)', () => {
        const standard = analyzeValidationRules({ minimum: 5, maximum: 10 } as any);
        expect(standard).toContainEqual({ type: 'min', value: 5 });
        expect(standard).toContainEqual({ type: 'max', value: 10 });

        const exclusive30 = analyzeValidationRules({
            minimum: 5,
            exclusiveMinimum: true,
            maximum: 10,
            exclusiveMaximum: true,
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
            maxItems: 5,
        };
        const rules = analyzeValidationRules(schema);
        expect(rules).toContainEqual({ type: 'multipleOf', value: 2 });
        expect(rules).toContainEqual({ type: 'uniqueItems' });
        expect(rules).toContainEqual({ type: 'minItems', value: 1 });
        expect(rules).toContainEqual({ type: 'maxItems', value: 5 });
    });

    it('should map contains/minContains/maxContains constraints', () => {
        const schema: SwaggerDefinition = {
            type: 'array',
            contains: { type: 'string' },
            minContains: 2,
            maxContains: 4,
        };
        const rules = analyzeValidationRules(schema);
        expect(rules).toContainEqual({ type: 'contains', schema: { type: 'string' }, min: 2, max: 4 });
    });

    it('should default minContains to 1 when contains is present', () => {
        const schema: SwaggerDefinition = {
            type: 'array',
            contains: { type: 'number' },
        };
        const rules = analyzeValidationRules(schema);
        expect(rules).toContainEqual({ type: 'contains', schema: { type: 'number' }, min: 1 });
    });

    it('should map object property count constraints', () => {
        const schema: SwaggerDefinition = {
            minProperties: 1,
            maxProperties: 3,
        };
        const rules = analyzeValidationRules(schema);
        expect(rules).toContainEqual({ type: 'minProperties', value: 1 });
        expect(rules).toContainEqual({ type: 'maxProperties', value: 3 });
    });

    it('should map required property (denormalized)', () => {
        // type-coverage:ignore-next-line
        const schema: any = { required: ['true'] }; // Logic checks if required exists/truthy
        expect(analyzeValidationRules(schema)).toContainEqual({ type: 'required' });
    });

    it('should escape backslashes in pattern', () => {
        const schema: SwaggerDefinition = { pattern: '\\d' };
        // Replaces \\ with \
        const rules = analyzeValidationRules(schema);
        expect(rules[0]).toEqual({ type: 'pattern', value: '\\d' });
    });

    it('should map const validator (OAS 3.1)', () => {
        const schema: SwaggerDefinition = {
            type: 'string',
            const: 'exact-value',
        };
        const rules = analyzeValidationRules(schema);
        expect(rules).toContainEqual({ type: 'const', value: 'exact-value' });
    });

    it('should recursively map not validator schema (OAS 3.x)', () => {
        const schema: SwaggerDefinition = {
            type: 'string',
            not: { pattern: '^foo' },
        };
        const rules = analyzeValidationRules(schema);
        // type-coverage:ignore-next-line
        const notRule = rules.find(r => r.type === 'not') as any;

        // type-coverage:ignore-next-line
        expect(notRule).toBeDefined();
        // type-coverage:ignore-next-line
        expect(notRule.rules).toBeDefined();
        // type-coverage:ignore-next-line
        expect(notRule.rules).toContainEqual({ type: 'pattern', value: '^foo' });
    });

    it('should skip not rules when inner schema yields no validations', () => {
        const schema: SwaggerDefinition = {
            type: 'string',
            not: { readOnly: true } as any,
        };
        const rules = analyzeValidationRules(schema);
        expect(rules.find(r => r.type === 'not')).toBeUndefined();
    });
});
