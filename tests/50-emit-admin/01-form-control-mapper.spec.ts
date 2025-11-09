import { describe, expect, it } from 'vitest';
import { mapSchemaToFormControl } from '../../src/service/emit/admin/form-control.mapper.js';
import { SwaggerDefinition } from '../../src/core/types.js';

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
            minimum: 0,
            maximum: 100,
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

    it('should map advanced validation keywords to CustomValidators', () => {
        const schema: SwaggerDefinition = {
            type: 'number',
            exclusiveMinimum: true, minimum: 10,
            exclusiveMaximum: true, maximum: 50,
            multipleOf: 5,
            uniqueItems: true, // This applies to arrays but should be handled
            minItems: 2 // This applies to arrays and should map to minLength
        };
        const { validators } = mapSchemaToFormControl(schema)!;
        expect(validators).toEqual(expect.arrayContaining([
            'CustomValidators.exclusiveMinimum(10)',
            'CustomValidators.exclusiveMaximum(50)',
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
