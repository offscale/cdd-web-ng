import { describe, expect, it } from 'vitest';
import { buildErrorMessages } from '@src/vendors/angular/admin/html/form-controls-html.builder.js';
import { FormControlModel } from '@src/vendors/angular/admin/analysis/form-types.js';
import { ValidationRule } from '@src/vendors/angular/admin/analysis/validation-types.js';

describe('Admin: buildErrorMessages (from IR)', () => {
    const run = (rules: ValidationRule[]) => {
        const model: FormControlModel = {
            name: 'testControl',
            validationRules: rules,
        } as any;
        return buildErrorMessages(model)
            .map(b => b.render())
            .join('\n');
    };

    it('should generate a "required" error message', () => {
        const output = run([{ type: 'required' }]);
        expect(output).toContain("@if (form.get('testControl')?.hasError('required'))");
        expect(output).toContain('This field is required.');
    });

    it('should generate "minLength" and "maxLength" error messages', () => {
        const output = run([
            { type: 'minLength', value: 5 },
            { type: 'maxLength', value: 50 },
        ]);
        expect(output).toContain("@if (form.get('testControl')?.hasError('minlength'))");
        expect(output).toContain('at least 5 characters long');
        expect(output).toContain("@if (form.get('testControl')?.hasError('maxlength'))");
        expect(output).toContain('Cannot exceed 50 characters');
    });

    it('should generate "min" and "max" error messages', () => {
        const output = run([
            { type: 'min', value: 0 },
            { type: 'max', value: 100 },
        ]);
        expect(output).toContain("@if (form.get('testControl')?.hasError('min'))");
        expect(output).toContain('at least 0');
        expect(output).toContain("@if (form.get('testControl')?.hasError('max'))");
        expect(output).toContain('cannot exceed 100');
    });

    it('should generate "exclusiveMinimum" and "exclusiveMaximum" error messages', () => {
        const output = run([
            { type: 'exclusiveMinimum', value: 1 },
            { type: 'exclusiveMaximum', value: 99 },
        ]);
        expect(output).toContain("@if (form.get('testControl')?.hasError('exclusiveMinimum'))");
        expect(output).toContain('greater than 1');
        expect(output).toContain("@if (form.get('testControl')?.hasError('exclusiveMaximum'))");
        expect(output).toContain('less than 99');
    });

    it('should generate generic "pattern" and specific "email" error messages', () => {
        const output = run([{ type: 'pattern', value: '^\\d+$' }, { type: 'email' }]);
        expect(output).toContain("@if (form.get('testControl')?.hasError('pattern'))");
        expect(output).toContain('Invalid format.');
        expect(output).toContain("@if (form.get('testControl')?.hasError('email'))");
        expect(output).toContain('valid email address');
    });

    it('should generate "multipleOf" and "uniqueItems" error messages', () => {
        const output = run([{ type: 'multipleOf', value: 5 }, { type: 'uniqueItems' }]);
        expect(output).toContain("@if (form.get('testControl')?.hasError('multipleOf'))");
        expect(output).toContain('multiple of 5');
        expect(output).toContain("@if (form.get('testControl')?.hasError('uniqueItems'))");
        expect(output).toContain('All items must be unique');
    });

    it('should generate "minItems" and "maxItems" error messages for arrays', () => {
        const output = run([
            { type: 'minItems', value: 2 },
            { type: 'maxItems', value: 10 },
        ]);
        expect(output).toContain("@if (form.get('testControl')?.hasError('minlength'))");
        expect(output).toContain('at least 2 items');
        expect(output).toContain("@if (form.get('testControl')?.hasError('maxlength'))");
        expect(output).toContain('Cannot contain more than 10 items');
    });

    it('should generate "const" error message', () => {
        const output = run([{ type: 'const', value: 'foo' }]);
        expect(output).toContain("@if (form.get('testControl')?.hasError('const'))");
        expect(output).toContain("Value must be {{ form.get('testControl')?.errors?.['const'].required }}");
    });

    it('should generate "not" error message', () => {
        const output = run([{ type: 'not', rules: [] }]);
        expect(output).toContain("@if (form.get('testControl')?.hasError('not'))");
        expect(output).toContain('Value matches a restricted format.');
    });

    it('should produce an empty array if no rules are provided', () => {
        const output = run([]);
        expect(output).toBe('');
    });
});
