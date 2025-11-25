import { describe, expect, it } from 'vitest';
import { analyzeValidationRules } from '@src/analysis/validation.analyzer.js';
import { SwaggerDefinition } from "@src/core/types/index.js";

/**
 * @fileoverview
 * Tests for the `analyzeValidationRules` utility, which is responsible for converting
 * OpenAPI schema validation keywords into a framework-agnostic ValidationRule IR.
 */
describe('Analysis: validation.analyzer', () => {

    it('should return empty array for readOnly properties', () => {
        expect(analyzeValidationRules({ readOnly: true } as SwaggerDefinition)).toEqual([]);
    });

    it('should return empty array for a null or undefined schema', () => {
        expect(analyzeValidationRules(null as any)).toEqual([]);
        expect(analyzeValidationRules(undefined as any)).toEqual([]);
    });

    it('should map all standard validation keywords to ValidationRule objects', () => {
        const schema: SwaggerDefinition = {
            type: 'string',
            minLength: 3,
            maxLength: 10,
            minimum: 0, // inclusive
            maximum: 100, // inclusive
            pattern: '^\\d+$',
            format: 'email'
        };
        const rules = analyzeValidationRules(schema)!;

        expect(rules).toContainEqual({ type: 'minLength', value: 3 });
        expect(rules).toContainEqual({ type: 'maxLength', value: 10 });
        expect(rules).toContainEqual({ type: 'min', value: 0 });
        expect(rules).toContainEqual({ type: 'max', value: 100 });
        expect(rules).toContainEqual({ type: 'pattern', value: '^\\d+$' });
        expect(rules).toContainEqual({ type: 'email' });
    });

    it('should add pattern rule for contentEncoding: base64', () => {
        const schema: SwaggerDefinition = { type: 'string', contentEncoding: 'base64' };
        const rules = analyzeValidationRules(schema)!;
        expect(rules).toContainEqual({
            type: 'pattern',
            value: '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
        });
    });

    it('should add pattern rule for contentEncoding: base64url', () => {
        const schema: SwaggerDefinition = { type: 'string', contentEncoding: 'base64url' };
        const rules = analyzeValidationRules(schema)!;
        expect(rules).toContainEqual({ type: 'pattern', value: '^[A-Za-z0-9\\-_]*$' });
    });

    it('should map OAS 3.0 boolean exclusive constraints to abstract rules', () => {
        const schema: SwaggerDefinition = {
            type: 'number',
            minimum: 10,
            exclusiveMinimum: true,
            maximum: 50,
            exclusiveMaximum: true
        };
        const rules = analyzeValidationRules(schema)!;
        expect(rules).toContainEqual({ type: 'exclusiveMinimum', value: 10 });
        expect(rules).toContainEqual({ type: 'exclusiveMaximum', value: 50 });
        expect(rules).not.toContainEqual({ type: 'min', value: 10 });
        expect(rules).not.toContainEqual({ type: 'max', value: 50 });
    });

    it('should map OAS 3.1 numeric exclusive constraints to abstract rules', () => {
        const schema: SwaggerDefinition = {
            type: 'number',
            exclusiveMinimum: 10,
            exclusiveMaximum: 50
        };
        const rules = analyzeValidationRules(schema)!;
        expect(rules).toContainEqual({ type: 'exclusiveMinimum', value: 10 });
        expect(rules).toContainEqual({ type: 'exclusiveMaximum', value: 50 });
    });

    it('should map advanced validation keywords to abstract rules', () => {
        const schema: SwaggerDefinition = {
            type: 'number',
            multipleOf: 5,
            uniqueItems: true,
            minItems: 2,
            maxItems: 10
        };
        const rules = analyzeValidationRules(schema)!;
        expect(rules).toContainEqual({ type: 'multipleOf', value: 5 });
        expect(rules).toContainEqual({ type: 'uniqueItems' });
        expect(rules).toContainEqual({ type: 'minItems', value: 2 });
        expect(rules).toContainEqual({ type: 'maxItems', value: 10 });
    });

    it('should handle `required` properties', () => {
        // This is a denormalized property added during resource discovery
        const schema: SwaggerDefinition = { type: 'string', required: ['name'] } as any;
        const rules = analyzeValidationRules(schema)!;
        expect(rules).toContainEqual({ type: 'required' });
    });

    it('should return an empty array for schemas that do not have validation rules', () => {
        expect(analyzeValidationRules({ type: 'array', items: { type: 'number' } })).toEqual([]);
        expect(analyzeValidationRules({ type: 'object' })).toEqual([]);
        expect(analyzeValidationRules({ type: 'null' })).toEqual([]);
    });
});
