import { describe, expect, it } from 'vitest';
import { mapSchemaToFormControl } from '@src/service/emit/admin/form-control.mapper.js';
import { SwaggerDefinition } from '@src/core/types.js';

/**
 * @fileoverview
 * Tests for the `mapSchemaToFormControl` utility, which is responsible for converting
 * OpenAPI schema validation keywords into Angular `Validators` and `CustomValidators`.
 */
describe('Admin: mapSchemaToFormControl', () => {

    it('should return null for readOnly properties', () => {
        expect(mapSchemaToFormControl({ readOnly: true } as SwaggerDefinition)).toBeNull();
    });

    it('should return null for a null or undefined schema', () => {
        expect(mapSchemaToFormControl(null as any)).toBeNull();
        expect(mapSchemaToFormControl(undefined as any)).toBeNull();
    });

    it('should map all standard validation keywords to Angular Validators', () => {
        const schema: SwaggerDefinition = {
            type: 'string',
            minLength: 3,
            maxLength: 10,
            minimum: 0, // inclusive
            maximum: 100, // inclusive
            pattern: '^\\d+$',
            format: 'email'
        };
        const { validators } = mapSchemaToFormControl(schema)!;
        expect(validators).toEqual(expect.arrayContaining([
            'Validators.minLength(3)',
            'Validators.maxLength(10)',
            'Validators.min(0)',
            'Validators.max(100)',
            'Validators.pattern(/^\\d+$/)',
            'Validators.email'
        ]));
    });

    it('should add regex pattern validator for contentEncoding: base64', () => {
        const schema: SwaggerDefinition = {
            type: 'string',
            contentEncoding: 'base64'
        };
        const { validators } = mapSchemaToFormControl(schema)!;
        // Verify it generates a string containing the pattern regex for base64
        expect(validators.some(v => v.includes('Validators.pattern') && v.includes('A-Za-z0-9+/'))).toBe(true);
    });

    it('should add regex pattern validator for contentEncoding: base64url', () => {
        const schema: SwaggerDefinition = {
            type: 'string',
            contentEncoding: 'base64url'
        };
        const { validators } = mapSchemaToFormControl(schema)!;
        // Verify it generates a string containing the pattern regex for base64url (with hyphen and underscore, no plus/slash)
        expect(validators.some(v => v.includes('Validators.pattern') && v.includes('A-Za-z0-9\\-_'))).toBe(true);
    });

    it('should map OAS 3.0 boolean exclusive constraints to CustomValidators', () => {
        const schema: SwaggerDefinition = {
            type: 'number',
            minimum: 10,
            exclusiveMinimum: true,
            maximum: 50,
            exclusiveMaximum: true
        };
        const { validators } = mapSchemaToFormControl(schema)!;
        expect(validators).toContain('CustomValidators.exclusiveMinimum(10)');
        expect(validators).toContain('CustomValidators.exclusiveMaximum(50)');
        // Should NOT contain inclusive validators
        expect(validators).not.toContain('Validators.min(10)');
        expect(validators).not.toContain('Validators.max(50)');
    });

    it('should map OAS 3.1 numeric exclusive constraints to CustomValidators', () => {
        const schema: SwaggerDefinition = {
            type: 'number',
            exclusiveMinimum: 10,
            exclusiveMaximum: 50
        };
        const { validators } = mapSchemaToFormControl(schema)!;
        expect(validators).toContain('CustomValidators.exclusiveMinimum(10)');
        expect(validators).toContain('CustomValidators.exclusiveMaximum(50)');
    });

    it('should handle mixed inclusive and exclusive constraints', () => {
        const schema: SwaggerDefinition = {
            type: 'number',
            minimum: 5, // Inclusive min
            exclusiveMaximum: 10 // Exclusive max (OAS 3.1 style)
        };
        const { validators } = mapSchemaToFormControl(schema)!;
        expect(validators).toContain('Validators.min(5)');
        expect(validators).toContain('CustomValidators.exclusiveMaximum(10)');
    });

    it('should map advanced validation keywords to CustomValidators', () => {
        const schema: SwaggerDefinition = {
            type: 'number',
            multipleOf: 5,
            uniqueItems: true, // This applies to arrays but should be handled
            minItems: 2 // This applies to arrays and should map to minLength
        };
        const { validators } = mapSchemaToFormControl(schema)!;
        expect(validators).toEqual(expect.arrayContaining([
            'CustomValidators.multipleOf(5)',
            'CustomValidators.uniqueItems()',
            'Validators.minLength(2)' // For FormArray
        ]));
    });

    it('should handle `required` properties', () => {
        // Technically, `required` is on the parent object, but our property aggregator adds it to the schema.
        const schema: SwaggerDefinition = { type: 'string', required: ['name'] } as any;
        const { validators } = mapSchemaToFormControl(schema)!;
        expect(validators).toContain('Validators.required');
    });

    it('should return null for schemas that do not map to a control', () => {
        // Simple array of primitives without other validators
        expect(mapSchemaToFormControl({ type: 'array', items: { type: 'number' } })).toBeNull();
        // Object without properties
        expect(mapSchemaToFormControl({ type: 'object' })).toBeNull();
        // Null type
        expect(mapSchemaToFormControl({ type: 'null' })).toBeNull();
    });

    it('should return info for schemas that DO map to a control', () => {
        // Array with uniqueItems validator
        expect(mapSchemaToFormControl({ type: 'array', items: {}, uniqueItems: true })).toBeDefined();
        // Object with properties (maps to a FormGroup)
        expect(mapSchemaToFormControl({ type: 'object', properties: { a: { type: 'string' } } })).toBeDefined();
        // Simple string (maps to an input)
        expect(mapSchemaToFormControl({ type: 'string' })).toBeDefined();
    });
});
