import { ClassDeclaration, MethodDeclarationStructure, OptionalKind, Project, Scope } from 'ts-morph';
import { posix as path } from 'node:path';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

/**
 * Generates the custom-validators.ts file using ts-morph for robust AST manipulation.
 * This file contains a static utility class with custom validator functions needed
 * for advanced OpenAPI schema validation keywords not covered by Angular's built-in validators.
 */
export class CustomValidatorsGenerator {
    constructor(private project: Project) {
    }

    public generate(adminDir: string): void {
        const sharedDir = path.join(adminDir, 'shared');
        const filePath = path.join(sharedDir, 'custom-validators.ts');

        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.addStatements(UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/forms',
            namedImports: ['AbstractControl', 'ValidationErrors', 'ValidatorFn']
        });

        const validatorsClass = sourceFile.addClass({
            name: 'CustomValidators',
            isExported: true,
        });

        this.addValidationMethods(validatorsClass);

        sourceFile.formatText();
    }

    private addValidationMethods(validatorsClass: ClassDeclaration): void {
        const methods: OptionalKind<MethodDeclarationStructure>[] = [
            {
                name: 'exclusiveMinimum',
                isStatic: true,
                scope: Scope.Public,
                parameters: [{ name: 'min', type: 'number' }],
                returnType: 'ValidatorFn',
                docs: ['Validator determining if value is strictly greater than min.'],
                statements: writer => writer
                    .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                    .indent(() => {
                        // Validation failure if value <= min
                        writer.writeLine('if (control.value === null || control.value === undefined || control.value <= min) {');
                        writer.indent(() => writer.writeLine('return { exclusiveMinimum: { min, actual: control.value } };'));
                        writer.writeLine('}');
                        writer.writeLine('return null;');
                    })
                    .writeLine('};')
            },
            {
                name: 'exclusiveMaximum',
                isStatic: true,
                scope: Scope.Public,
                parameters: [{ name: 'max', type: 'number' }],
                returnType: 'ValidatorFn',
                docs: ['Validator determining if value is strictly less than max.'],
                statements: writer => writer
                    .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                    .indent(() => {
                        // Validation failure if value >= max
                        writer.writeLine('if (control.value === null || control.value === undefined || control.value >= max) {');
                        writer.indent(() => writer.writeLine('return { exclusiveMaximum: { max, actual: control.value } };'));
                        writer.writeLine('}');
                        writer.writeLine('return null;');
                    })
                    .writeLine('};')
            },
            {
                name: 'multipleOf',
                isStatic: true,
                scope: Scope.Public,
                parameters: [{ name: 'factor', type: 'number' }],
                returnType: 'ValidatorFn',
                statements: writer => writer
                    .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                    .indent(() => {
                        writer.writeLine('if (control.value === null || control.value === undefined || control.value % factor !== 0) {');
                        writer.indent(() => writer.writeLine('return { multipleOf: { factor, actual: control.value } };'));
                        writer.writeLine('}');
                        writer.writeLine('return null;');
                    })
                    .writeLine('};')
            },
            {
                name: 'uniqueItems',
                isStatic: true,
                scope: Scope.Public,
                returnType: 'ValidatorFn',
                statements: writer => writer
                    .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                    .indent(() => {
                        writer.writeLine('if (!Array.isArray(control.value)) {');
                        writer.indent(() => writer.writeLine('return null;'));
                        writer.writeLine('}');
                        writer.writeLine('const unique = new Set(control.value);');
                        writer.writeLine('if (unique.size !== control.value.length) {');
                        writer.indent(() => writer.writeLine('return { uniqueItems: true };'));
                        writer.writeLine('}');
                        writer.writeLine('return null;');
                    })
                    .writeLine('};')
            },
            {
                name: 'constValidator',
                isStatic: true,
                scope: Scope.Public,
                parameters: [{ name: 'constant', type: 'any' }],
                returnType: 'ValidatorFn',
                docs: ['Validator ensuring the value matches a constant (OAS 3.1 const keyword).'],
                statements: writer => writer
                    .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                    .indent(() => {
                        writer.writeLine('if (control.value === null || control.value === undefined) {');
                        writer.indent(() => writer.writeLine('return null;'));
                        writer.writeLine('}');
                        writer.writeLine('if (control.value !== constant) {');
                        writer.indent(() => writer.writeLine('return { const: { required: constant, actual: control.value } };'));
                        writer.writeLine('}');
                        writer.writeLine('return null;');
                    })
                    .writeLine('};')
            }
        ];

        validatorsClass.addMethods(methods);
    }
}
