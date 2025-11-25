import { describe, expect, it } from 'vitest';

import { CustomValidatorsGenerator } from '@src/generators/angular/admin/custom-validators.generator.js'; // Corrected Path
import { createTestProject } from '../shared/helpers.js';

describe('Admin: CustomValidatorsGenerator', () => {
    it('should generate a custom validators file with all expected methods', () => {
        const project = createTestProject();
        const generator = new CustomValidatorsGenerator(project);
        generator.generate('/admin');

        const sourceFile = project.getSourceFileOrThrow('/admin/shared/custom-validators.ts');
        const fileContent = sourceFile.getFullText();

        expect(fileContent).toContain('export class CustomValidators');
        const validatorClass = sourceFile.getClassOrThrow('CustomValidators');

        const methods = validatorClass.getStaticMethods().map(m => m.getName());
        expect(methods).toEqual(expect.arrayContaining([
            'exclusiveMinimum',
            'exclusiveMaximum',
            'multipleOf',
            'uniqueItems'
        ]));

        // Check a method body for correctness
        const exclusiveMinimumMethod = validatorClass.getStaticMethodOrThrow('exclusiveMinimum');
        const body = exclusiveMinimumMethod.getBodyText();
        expect(body).toContain('return { exclusiveMinimum: { min, actual: control.value } };');
    });
});
