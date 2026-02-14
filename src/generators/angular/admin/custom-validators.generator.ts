import { ClassDeclaration, MethodDeclarationStructure, OptionalKind, Project, Scope } from 'ts-morph';
import { posix as path } from 'node:path';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

/**
 * Generates the custom-validators.ts file using ts-morph for robust AST manipulation.
 * This file contains a static utility class with custom validator functions needed
 * for advanced OpenAPI schema validation keywords not covered by Angular's built-in validators.
 */
export class CustomValidatorsGenerator {
    constructor(private project: Project) {}

    public generate(adminDir: string): void {
        const sharedDir = path.join(adminDir, 'shared');
        const filePath = path.join(sharedDir, 'custom-validators.ts');

        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.addStatements(UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/forms',
            namedImports: ['AbstractControl', 'ValidationErrors', 'ValidatorFn'],
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
                statements: writer =>
                    writer
                        .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                        .indent(() => {
                            // Validation failure if value <= min
                            writer.writeLine(
                                'if (control.value === null || control.value === undefined || control.value <= min) {',
                            );
                            writer.indent(() =>
                                writer.writeLine('return { exclusiveMinimum: { min, actual: control.value } };'),
                            );
                            writer.writeLine('}');
                            writer.writeLine('return null;');
                        })
                        .writeLine('};'),
            },
            {
                name: 'exclusiveMaximum',
                isStatic: true,
                scope: Scope.Public,
                parameters: [{ name: 'max', type: 'number' }],
                returnType: 'ValidatorFn',
                docs: ['Validator determining if value is strictly less than max.'],
                statements: writer =>
                    writer
                        .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                        .indent(() => {
                            // Validation failure if value >= max
                            writer.writeLine(
                                'if (control.value === null || control.value === undefined || control.value >= max) {',
                            );
                            writer.indent(() =>
                                writer.writeLine('return { exclusiveMaximum: { max, actual: control.value } };'),
                            );
                            writer.writeLine('}');
                            writer.writeLine('return null;');
                        })
                        .writeLine('};'),
            },
            {
                name: 'multipleOf',
                isStatic: true,
                scope: Scope.Public,
                parameters: [{ name: 'factor', type: 'number' }],
                returnType: 'ValidatorFn',
                statements: writer =>
                    writer
                        .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                        .indent(() => {
                            writer.writeLine(
                                'if (control.value === null || control.value === undefined || control.value % factor !== 0) {',
                            );
                            writer.indent(() =>
                                writer.writeLine('return { multipleOf: { factor, actual: control.value } };'),
                            );
                            writer.writeLine('}');
                            writer.writeLine('return null;');
                        })
                        .writeLine('};'),
            },
            {
                name: 'uniqueItems',
                isStatic: true,
                scope: Scope.Public,
                returnType: 'ValidatorFn',
                statements: writer =>
                    writer
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
                        .writeLine('};'),
            },
            {
                name: 'minProperties',
                isStatic: true,
                scope: Scope.Public,
                parameters: [{ name: 'min', type: 'number' }],
                returnType: 'ValidatorFn',
                docs: ['Validator ensuring objects/maps have at least the required number of properties.'],
                statements: writer =>
                    writer
                        .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                        .indent(() => {
                            writer.writeLine('const value = control.value;');
                            writer.writeLine('if (value === null || value === undefined) {');
                            writer.indent(() =>
                                writer.writeLine('return min <= 0 ? null : { minProperties: { min, actual: 0 } };'),
                            );
                            writer.writeLine('}');
                            writer.writeLine('let count = 0;');
                            writer.writeLine('if (Array.isArray(value)) {');
                            writer.indent(() => {
                                writer.writeLine(
                                    "count = value.filter((entry: any) => { if (entry && typeof entry === 'object' && 'key' in entry) { return String(entry.key ?? '').length > 0; } return entry !== null && entry !== undefined && entry !== ''; }).length;",
                                );
                            });
                            writer.writeLine("} else if (typeof value === 'object') {");
                            writer.indent(() => {
                                writer.writeLine(
                                    "count = Object.values(value).filter(v => v !== null && v !== undefined && v !== '').length;",
                                );
                            });
                            writer.writeLine('}');
                            writer.writeLine('if (count < min) {');
                            writer.indent(() => writer.writeLine('return { minProperties: { min, actual: count } };'));
                            writer.writeLine('}');
                            writer.writeLine('return null;');
                        })
                        .writeLine('};'),
            },
            {
                name: 'maxProperties',
                isStatic: true,
                scope: Scope.Public,
                parameters: [{ name: 'max', type: 'number' }],
                returnType: 'ValidatorFn',
                docs: ['Validator ensuring objects/maps do not exceed the maximum number of properties.'],
                statements: writer =>
                    writer
                        .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                        .indent(() => {
                            writer.writeLine('const value = control.value;');
                            writer.writeLine('if (value === null || value === undefined) return null;');
                            writer.writeLine('let count = 0;');
                            writer.writeLine('if (Array.isArray(value)) {');
                            writer.indent(() => {
                                writer.writeLine(
                                    "count = value.filter((entry: any) => { if (entry && typeof entry === 'object' && 'key' in entry) { return String(entry.key ?? '').length > 0; } return entry !== null && entry !== undefined && entry !== ''; }).length;",
                                );
                            });
                            writer.writeLine("} else if (typeof value === 'object') {");
                            writer.indent(() => {
                                writer.writeLine(
                                    "count = Object.values(value).filter(v => v !== null && v !== undefined && v !== '').length;",
                                );
                            });
                            writer.writeLine('}');
                            writer.writeLine('if (count > max) {');
                            writer.indent(() => writer.writeLine('return { maxProperties: { max, actual: count } };'));
                            writer.writeLine('}');
                            writer.writeLine('return null;');
                        })
                        .writeLine('};'),
            },
            {
                name: 'contains',
                isStatic: true,
                scope: Scope.Public,
                parameters: [
                    { name: 'schema', type: 'unknown' },
                    { name: 'min', type: 'number | undefined' },
                    { name: 'max', type: 'number | undefined' },
                ],
                returnType: 'ValidatorFn',
                docs: ['Validator ensuring arrays contain items matching a schema (contains/minContains/maxContains).'],
                statements: writer =>
                    writer
                        .writeLine('const isRecord = (value: unknown): value is Record<string, unknown> => {')
                        .indent(() => {
                            writer.writeLine(
                                "return typeof value === 'object' && value !== null && !Array.isArray(value);",
                            );
                        })
                        .writeLine('};')
                        .writeLine('const isNumber = (value: unknown): value is number => {')
                        .indent(() => {
                            writer.writeLine("return typeof value === 'number' && Number.isFinite(value);");
                        })
                        .writeLine('};')
                        .writeLine("const isString = (value: unknown): value is string => typeof value === 'string';")
                        .writeLine('const deepEqual = (left: unknown, right: unknown): boolean => {')
                        .indent(() => {
                            writer.writeLine('if (Object.is(left, right)) return true;');
                            writer.writeLine('if (Array.isArray(left) && Array.isArray(right)) {');
                            writer.indent(() => {
                                writer.writeLine('if (left.length !== right.length) return false;');
                                writer.writeLine('for (let i = 0; i < left.length; i += 1) {');
                                writer.indent(() => {
                                    writer.writeLine('if (!deepEqual(left[i], right[i])) return false;');
                                });
                                writer.writeLine('}');
                                writer.writeLine('return true;');
                            });
                            writer.writeLine('}');
                            writer.writeLine('if (isRecord(left) && isRecord(right)) {');
                            writer.indent(() => {
                                writer.writeLine('const leftKeys = Object.keys(left).sort();');
                                writer.writeLine('const rightKeys = Object.keys(right).sort();');
                                writer.writeLine('if (leftKeys.length !== rightKeys.length) return false;');
                                writer.writeLine('for (let i = 0; i < leftKeys.length; i += 1) {');
                                writer.indent(() => {
                                    writer.writeLine('const key = leftKeys[i];');
                                    writer.writeLine('if (key !== rightKeys[i]) return false;');
                                    writer.writeLine('if (!deepEqual(left[key], right[key])) return false;');
                                });
                                writer.writeLine('}');
                                writer.writeLine('return true;');
                            });
                            writer.writeLine('}');
                            writer.writeLine('return false;');
                        })
                        .writeLine('};')
                        .writeLine('const matchesType = (value: unknown, type: string): boolean => {')
                        .indent(() => {
                            writer.writeLine('switch (type) {');
                            writer.indent(() => {
                                writer.writeLine("case 'null':");
                                writer.indent(() => writer.writeLine('return value === null;'));
                                writer.writeLine("case 'array':");
                                writer.indent(() => writer.writeLine('return Array.isArray(value);'));
                                writer.writeLine("case 'object':");
                                writer.indent(() => writer.writeLine('return isRecord(value);'));
                                writer.writeLine("case 'string':");
                                writer.indent(() => writer.writeLine("return typeof value === 'string';"));
                                writer.writeLine("case 'boolean':");
                                writer.indent(() => writer.writeLine("return typeof value === 'boolean';"));
                                writer.writeLine("case 'integer':");
                                writer.indent(() =>
                                    writer.writeLine('return isNumber(value) && Number.isInteger(value);'),
                                );
                                writer.writeLine("case 'number':");
                                writer.indent(() => writer.writeLine('return isNumber(value);'));
                                writer.writeLine('default:');
                                writer.indent(() => writer.writeLine('return true;'));
                            });
                            writer.writeLine('}');
                        })
                        .writeLine('};')
                        .writeLine('const matchesSchema = (value: unknown, schemaValue: unknown): boolean => {')
                        .indent(() => {
                            writer.writeLine('if (schemaValue === true) return true;');
                            writer.writeLine('if (schemaValue === false) return false;');
                            writer.writeLine(
                                "if (typeof schemaValue !== 'object' || schemaValue === null) return true;",
                            );
                            writer.writeLine('const schemaObj = schemaValue as {');
                            writer.indent(() => {
                                writer.writeLine('type?: string | string[];');
                                writer.writeLine('const?: unknown;');
                                writer.writeLine('enum?: unknown[];');
                                writer.writeLine('pattern?: string;');
                                writer.writeLine('minLength?: number;');
                                writer.writeLine('maxLength?: number;');
                                writer.writeLine('minimum?: number;');
                                writer.writeLine('maximum?: number;');
                                writer.writeLine('exclusiveMinimum?: number | boolean;');
                                writer.writeLine('exclusiveMaximum?: number | boolean;');
                            });
                            writer.writeLine('};');
                            writer.writeLine(
                                'if (schemaObj.const !== undefined && !deepEqual(value, schemaObj.const)) {',
                            );
                            writer.indent(() => writer.writeLine('return false;'));
                            writer.writeLine('}');
                            writer.writeLine('if (Array.isArray(schemaObj.enum)) {');
                            writer.indent(() => {
                                writer.writeLine(
                                    'if (!schemaObj.enum.some(entry => deepEqual(value, entry))) return false;',
                                );
                            });
                            writer.writeLine('}');
                            writer.writeLine('if (schemaObj.type) {');
                            writer.indent(() => {
                                writer.writeLine(
                                    'const types = Array.isArray(schemaObj.type) ? schemaObj.type : [schemaObj.type];',
                                );
                                writer.writeLine(
                                    "if (!types.some(type => typeof type === 'string' && matchesType(value, type))) {",
                                );
                                writer.indent(() => writer.writeLine('return false;'));
                                writer.writeLine('}');
                            });
                            writer.writeLine('}');
                            writer.writeLine("if (typeof schemaObj.pattern === 'string') {");
                            writer.indent(() => {
                                writer.writeLine('if (!isString(value)) return false;');
                                writer.writeLine('try {');
                                writer.indent(() => {
                                    writer.writeLine('const regex = new RegExp(schemaObj.pattern);');
                                    writer.writeLine('if (!regex.test(value)) return false;');
                                });
                                writer.writeLine('} catch {');
                                writer.indent(() => writer.writeLine('return false;'));
                                writer.writeLine('}');
                            });
                            writer.writeLine('}');
                            writer.writeLine("if (typeof schemaObj.minLength === 'number') {");
                            writer.indent(() => {
                                writer.writeLine(
                                    'if (!isString(value) || value.length < schemaObj.minLength) return false;',
                                );
                            });
                            writer.writeLine('}');
                            writer.writeLine("if (typeof schemaObj.maxLength === 'number') {");
                            writer.indent(() => {
                                writer.writeLine(
                                    'if (!isString(value) || value.length > schemaObj.maxLength) return false;',
                                );
                            });
                            writer.writeLine('}');
                            writer.writeLine('const numericValue = isNumber(value) ? value : undefined;');
                            writer.writeLine("if (typeof schemaObj.minimum === 'number') {");
                            writer.indent(() => {
                                writer.writeLine(
                                    'if (numericValue === undefined || numericValue < schemaObj.minimum) return false;',
                                );
                            });
                            writer.writeLine('}');
                            writer.writeLine("if (typeof schemaObj.maximum === 'number') {");
                            writer.indent(() => {
                                writer.writeLine(
                                    'if (numericValue === undefined || numericValue > schemaObj.maximum) return false;',
                                );
                            });
                            writer.writeLine('}');
                            writer.writeLine("if (typeof schemaObj.exclusiveMinimum === 'number') {");
                            writer.indent(() => {
                                writer.writeLine(
                                    'if (numericValue === undefined || numericValue <= schemaObj.exclusiveMinimum) return false;',
                                );
                            });
                            writer.writeLine('}');
                            writer.writeLine("if (typeof schemaObj.exclusiveMaximum === 'number') {");
                            writer.indent(() => {
                                writer.writeLine(
                                    'if (numericValue === undefined || numericValue >= schemaObj.exclusiveMaximum) return false;',
                                );
                            });
                            writer.writeLine('}');
                            writer.writeLine(
                                "if (schemaObj.exclusiveMinimum === true && typeof schemaObj.minimum === 'number') {",
                            );
                            writer.indent(() => {
                                writer.writeLine(
                                    'if (numericValue === undefined || numericValue <= schemaObj.minimum) return false;',
                                );
                            });
                            writer.writeLine('}');
                            writer.writeLine(
                                "if (schemaObj.exclusiveMaximum === true && typeof schemaObj.maximum === 'number') {",
                            );
                            writer.indent(() => {
                                writer.writeLine(
                                    'if (numericValue === undefined || numericValue >= schemaObj.maximum) return false;',
                                );
                            });
                            writer.writeLine('}');
                            writer.writeLine('return true;');
                        })
                        .writeLine('};')
                        .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                        .indent(() => {
                            writer.writeLine('if (!Array.isArray(control.value)) return null;');
                            writer.writeLine(
                                'const matchCount = control.value.filter(item => matchesSchema(item, schema)).length;',
                            );
                            writer.writeLine('const minRequired = min !== undefined ? min : 1;');
                            writer.writeLine("if (typeof minRequired === 'number' && matchCount < minRequired) {");
                            writer.indent(() =>
                                writer.writeLine('return { contains: { min: minRequired, actual: matchCount } };'),
                            );
                            writer.writeLine('}');
                            writer.writeLine("if (typeof max === 'number' && matchCount > max) {");
                            writer.indent(() => writer.writeLine('return { contains: { max, actual: matchCount } };'));
                            writer.writeLine('}');
                            writer.writeLine('return null;');
                        })
                        .writeLine('};'),
            },
            {
                name: 'constValidator',
                isStatic: true,
                scope: Scope.Public,
                parameters: [{ name: 'constant', type: 'any' }],
                returnType: 'ValidatorFn',
                docs: ['Validator ensuring the value matches a constant (OAS 3.1 const keyword).'],
                statements: writer =>
                    writer
                        .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                        .indent(() => {
                            writer.writeLine('if (control.value === null || control.value === undefined) {');
                            writer.indent(() => writer.writeLine('return null;'));
                            writer.writeLine('}');
                            writer.writeLine('if (control.value !== constant) {');
                            writer.indent(() =>
                                writer.writeLine('return { const: { required: constant, actual: control.value } };'),
                            );
                            writer.writeLine('}');
                            writer.writeLine('return null;');
                        })
                        .writeLine('};'),
            },
            {
                name: 'notValidator',
                isStatic: true,
                scope: Scope.Public,
                parameters: [{ name: 'validator', type: 'ValidatorFn' }],
                returnType: 'ValidatorFn',
                docs: ['Inverse validator: Returns error if the inner validator passes (returns null).'],
                statements: writer =>
                    writer
                        .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                        .indent(() => {
                            writer.writeLine('if (control.value === null || control.value === undefined) return null;');
                            writer.writeLine('const errors = validator(control);');
                            writer.writeLine(
                                '// If errors exist (inner invalid), we are valid because we want NOT matching',
                            );
                            writer.writeLine('if (errors !== null) return null;');
                            writer.writeLine('// If null (inner matches), we return error');
                            writer.writeLine('return { not: true };');
                        })
                        .writeLine('};'),
            },
        ];

        validatorsClass.addMethods(methods);
    }
}
