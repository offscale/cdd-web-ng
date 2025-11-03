import { describe, expect, it } from 'vitest';
import { mapSchemaToFormControl } from '../../src/service/emit/admin/form-control.mapper.js';
import { SwaggerDefinition } from '../../src/core/types.js';

describe('Admin: mapSchemaToFormControl', () => {

    it('should return null for readOnly properties', () => {
        expect(mapSchemaToFormControl({ readOnly: true } as any)).toBeNull();
    });

    it('should return null for a null or undefined schema', () => {
        expect(mapSchemaToFormControl(null as any)).toBeNull();
    });

    it('should map standard validation keywords to Angular Validators', () => {
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
            uniqueItems: true
        };
        const { validators } = mapSchemaToFormControl(schema)!;
        expect(validators).toEqual(expect.arrayContaining([
            'CustomValidators.exclusiveMinimum(10)',
            'CustomValidators.exclusiveMaximum(50)',
            'CustomValidators.multipleOf(5)',
            'CustomValidators.uniqueItems()'
        ]));
    });

    it('should handle required properties (heuristic)', () => {
        // This simulates a property that has been marked as required
        const schema: SwaggerDefinition = { type: 'string', required: true } as any;
        const { validators } = mapSchemaToFormControl(schema)!;
        expect(validators).toContain('Validators.required');
    });

    it('should return null for schemas that do not map to a control', () => {
        expect(mapSchemaToFormControl({ type: 'array', items: { type: 'number' } })).toBeNull();
        expect(mapSchemaToFormControl({ type: 'object' })).toBeNull();
        expect(mapSchemaToFormControl({ type: 'null' })).toBeNull();
    });

    it('should return info for schemas that DO map to a control', () => {
        expect(mapSchemaToFormControl({ type: 'array', items: {}, uniqueItems: true })).toBeDefined();
        expect(mapSchemaToFormControl({ type: 'object', properties: { a: { type: 'string' } } })).toBeDefined();
        expect(mapSchemaToFormControl({ type: 'string' })).toBeDefined();
    });
});
