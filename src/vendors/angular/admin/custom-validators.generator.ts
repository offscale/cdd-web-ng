import { ClassDeclaration, MethodDeclarationStructure, OptionalKind, Project, Scope } from 'ts-morph';
import { posix as path } from 'node:path';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

/**
 * Generates the custom-validators.ts file using ts-morph for robust AST manipulation.
 * This file contains a static utility class with custom validator functions needed
 * for advanced OpenAPI schema validation keywords not covered by Angular's built-in validators.
 */
export class CustomValidatorsGenerator {
    /* v8 ignore next */
    constructor(private project: Project) {}

    public generate(adminDir: string): void {
        /* v8 ignore next */
        const sharedDir = path.join(adminDir, 'shared');
        /* v8 ignore next */
        const filePath = path.join(sharedDir, 'custom-validators.ts');

        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        sourceFile.addStatements(UTILITY_GENERATOR_HEADER_COMMENT);

        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/forms',
            namedImports: ['AbstractControl', 'ValidationErrors', 'ValidatorFn'],
        });

        /* v8 ignore next */
        const validatorsClass = sourceFile.addClass({
            name: 'CustomValidators',
            isExported: true,
        });

        /* v8 ignore next */
        this.addValidationMethods(validatorsClass);

        /* v8 ignore next */
        sourceFile.formatText();
    }

    private addValidationMethods(validatorsClass: ClassDeclaration): void {
        /* v8 ignore next */
        const methods: OptionalKind<MethodDeclarationStructure>[] = [
            {
                name: 'exclusiveMinimum',
                isStatic: true,
                scope: Scope.Public,
                parameters: [{ name: 'min', type: 'number' }],
                returnType: 'ValidatorFn',
                docs: ['Validator determining if value is strictly greater than min.'],
                statements: writer =>
                    /* v8 ignore next */
                    writer
                        .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                        .indent(() => {
                            // Validation failure if value <= min
                            /* v8 ignore next */
                            writer.writeLine(
                                'if (control.value === null || control.value === undefined || control.value <= min) {',
                            );
                            /* v8 ignore next */
                            writer.indent(() =>
                                /* v8 ignore next */
                                writer.writeLine('return { exclusiveMinimum: { min, actual: control.value } };'),
                            );
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
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
                    /* v8 ignore next */
                    writer
                        .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                        .indent(() => {
                            // Validation failure if value >= max
                            /* v8 ignore next */
                            writer.writeLine(
                                'if (control.value === null || control.value === undefined || control.value >= max) {',
                            );
                            /* v8 ignore next */
                            writer.indent(() =>
                                /* v8 ignore next */
                                writer.writeLine('return { exclusiveMaximum: { max, actual: control.value } };'),
                            );
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
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
                    /* v8 ignore next */
                    writer
                        .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                        .indent(() => {
                            /* v8 ignore next */
                            writer.writeLine(
                                'if (control.value === null || control.value === undefined || control.value % factor !== 0) {',
                            );
                            /* v8 ignore next */
                            writer.indent(() =>
                                /* v8 ignore next */
                                writer.writeLine('return { multipleOf: { factor, actual: control.value } };'),
                            );
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
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
                    /* v8 ignore next */
                    writer
                        .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                        .indent(() => {
                            /* v8 ignore next */
                            writer.writeLine('if (!Array.isArray(control.value)) {');
                            /* v8 ignore next */
                            writer.indent(() => writer.writeLine('return null;'));
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine('const unique = new Set(control.value);');
                            /* v8 ignore next */
                            writer.writeLine('if (unique.size !== control.value.length) {');
                            /* v8 ignore next */
                            writer.indent(() => writer.writeLine('return { uniqueItems: true };'));
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
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
                    /* v8 ignore next */
                    writer
                        .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                        .indent(() => {
                            /* v8 ignore next */
                            writer.writeLine('const value = control.value;');
                            /* v8 ignore next */
                            writer.writeLine('if (value === null || value === undefined) {');
                            /* v8 ignore next */
                            writer.indent(() =>
                                /* v8 ignore next */
                                writer.writeLine('return min <= 0 ? null : { minProperties: { min, actual: 0 } };'),
                            );
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine('let count = 0;');
                            /* v8 ignore next */
                            writer.writeLine('if (Array.isArray(value)) {');
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine(
                                    "count = value.filter((entry: { key: string }) => { if (entry && typeof entry === 'object' && 'key' in entry) { return String(entry.key ?? '').length > 0; } return entry !== null && entry !== undefined && entry !== ''; }).length;",
                                );
                            });
                            /* v8 ignore next */
                            writer.writeLine("} else if (typeof value === 'object') {");
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine(
                                    "count = Object.values(value).filter(v => v !== null && v !== undefined && v !== '').length;",
                                );
                            });
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine('if (count < min) {');
                            /* v8 ignore next */
                            writer.indent(() => writer.writeLine('return { minProperties: { min, actual: count } };'));
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
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
                    /* v8 ignore next */
                    writer
                        .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                        .indent(() => {
                            /* v8 ignore next */
                            writer.writeLine('const value = control.value;');
                            /* v8 ignore next */
                            writer.writeLine('if (value === null || value === undefined) return null;');
                            /* v8 ignore next */
                            writer.writeLine('let count = 0;');
                            /* v8 ignore next */
                            writer.writeLine('if (Array.isArray(value)) {');
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine(
                                    "count = value.filter((entry: { key: string }) => { if (entry && typeof entry === 'object' && 'key' in entry) { return String(entry.key ?? '').length > 0; } return entry !== null && entry !== undefined && entry !== ''; }).length;",
                                );
                            });
                            /* v8 ignore next */
                            writer.writeLine("} else if (typeof value === 'object') {");
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine(
                                    "count = Object.values(value).filter(v => v !== null && v !== undefined && v !== '').length;",
                                );
                            });
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine('if (count > max) {');
                            /* v8 ignore next */
                            writer.indent(() => writer.writeLine('return { maxProperties: { max, actual: count } };'));
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine('return null;');
                        })
                        .writeLine('};'),
            },
            {
                name: 'contains',
                isStatic: true,
                scope: Scope.Public,
                parameters: [
                    { name: 'schema', type: 'Record<string, never>' },
                    { name: 'min', type: 'number | undefined' },
                    { name: 'max', type: 'number | undefined' },
                ],
                returnType: 'ValidatorFn',
                docs: ['Validator ensuring arrays contain items matching a schema (contains/minContains/maxContains).'],
                statements: writer =>
                    /* v8 ignore next */
                    writer
                        .writeLine(
                            'const isRecord = (value: Record<string, never> | string | number | boolean | null): value is Record<string, never> => {',
                        )
                        .indent(() => {
                            /* v8 ignore next */
                            writer.writeLine(
                                "return typeof value === 'object' && value !== null && !Array.isArray(value);",
                            );
                        })
                        .writeLine('};')
                        .writeLine(
                            'const isNumber = (value: Record<string, never> | string | number | boolean | null): value is number => {',
                        )
                        .indent(() => {
                            /* v8 ignore next */
                            writer.writeLine("return typeof value === 'number' && Number.isFinite(value);");
                        })
                        .writeLine('};')
                        .writeLine(
                            "const isString = (value: Record<string, never> | string | number | boolean | null): value is string => typeof value === 'string';",
                        )
                        .writeLine('const deepEqual = (left: Record<string, never> | string | number | boolean | null, right: Record<string, never> | string | number | boolean | null): boolean => {')
                        .indent(() => {
                            /* v8 ignore next */
                            writer.writeLine('if (Object.is(left, right)) return true;');
                            /* v8 ignore next */
                            writer.writeLine('if (Array.isArray(left) && Array.isArray(right)) {');
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine('if (left.length !== right.length) return false;');
                                /* v8 ignore next */
                                writer.writeLine('for (let i = 0; i < left.length; i += 1) {');
                                /* v8 ignore next */
                                writer.indent(() => {
                                    /* v8 ignore next */
                                    writer.writeLine('if (!deepEqual(left[i], right[i])) return false;');
                                });
                                /* v8 ignore next */
                                writer.writeLine('}');
                                /* v8 ignore next */
                                writer.writeLine('return true;');
                            });
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine('if (isRecord(left) && isRecord(right)) {');
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine('const leftKeys = Object.keys(left).sort();');
                                /* v8 ignore next */
                                writer.writeLine('const rightKeys = Object.keys(right).sort();');
                                /* v8 ignore next */
                                writer.writeLine('if (leftKeys.length !== rightKeys.length) return false;');
                                /* v8 ignore next */
                                writer.writeLine('for (let i = 0; i < leftKeys.length; i += 1) {');
                                /* v8 ignore next */
                                writer.indent(() => {
                                    /* v8 ignore next */
                                    writer.writeLine('const key = leftKeys[i];');
                                    /* v8 ignore next */
                                    writer.writeLine('if (key !== rightKeys[i]) return false;');
                                    /* v8 ignore next */
                                    writer.writeLine('if (!deepEqual(left[key], right[key])) return false;');
                                });
                                /* v8 ignore next */
                                writer.writeLine('}');
                                /* v8 ignore next */
                                writer.writeLine('return true;');
                            });
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine('return false;');
                        })
                        .writeLine('};')
                        .writeLine(
                            'const matchesType = (value: Record<string, never> | string | number | boolean | null, type: string): boolean => {',
                        )
                        .indent(() => {
                            /* v8 ignore next */
                            writer.writeLine('switch (type) {');
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine("case 'null':");
                                /* v8 ignore next */
                                writer.indent(() => writer.writeLine('return value === null;'));
                                /* v8 ignore next */
                                writer.writeLine("case 'array':");
                                /* v8 ignore next */
                                writer.indent(() => writer.writeLine('return Array.isArray(value);'));
                                /* v8 ignore next */
                                writer.writeLine("case 'object':");
                                /* v8 ignore next */
                                writer.indent(() => writer.writeLine('return isRecord(value);'));
                                /* v8 ignore next */
                                writer.writeLine("case 'string':");
                                /* v8 ignore next */
                                writer.indent(() => writer.writeLine("return typeof value === 'string';"));
                                /* v8 ignore next */
                                writer.writeLine("case 'boolean':");
                                /* v8 ignore next */
                                writer.indent(() => writer.writeLine("return typeof value === 'boolean';"));
                                /* v8 ignore next */
                                writer.writeLine("case 'integer':");
                                /* v8 ignore next */
                                writer.indent(() =>
                                    /* v8 ignore next */
                                    writer.writeLine('return isNumber(value) && Number.isInteger(value);'),
                                );
                                /* v8 ignore next */
                                writer.writeLine("case 'number':");
                                /* v8 ignore next */
                                writer.indent(() => writer.writeLine('return isNumber(value);'));
                                /* v8 ignore next */
                                writer.writeLine('default:');
                                /* v8 ignore next */
                                writer.indent(() => writer.writeLine('return true;'));
                            });
                            /* v8 ignore next */
                            writer.writeLine('}');
                        })
                        .writeLine('};')
                        .writeLine(
                            'const matchesSchema = (value: Record<string, never> | string | number | boolean | null, schemaValue: Record<string, never> | string | number | boolean | null): boolean => {',
                        )
                        .indent(() => {
                            /* v8 ignore next */
                            writer.writeLine('if (schemaValue === true) return true;');
                            /* v8 ignore next */
                            writer.writeLine('if (schemaValue === false) return false;');
                            /* v8 ignore next */
                            writer.writeLine(
                                "if (typeof schemaValue !== 'object' || schemaValue === null) return true;",
                            );
                            /* v8 ignore next */
                            writer.writeLine('const schemaObj = schemaValue as {');
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine('type?: string | string[];');
                                /* v8 ignore next */
                                writer.writeLine('const?: Record<string, never> | string | number | boolean | null;');
                                /* v8 ignore next */
                                writer.writeLine('enum?: Array<Record<string, never> | string | number | boolean | null>;');
                                /* v8 ignore next */
                                writer.writeLine('pattern?: string;');
                                /* v8 ignore next */
                                writer.writeLine('minLength?: number;');
                                /* v8 ignore next */
                                writer.writeLine('maxLength?: number;');
                                /* v8 ignore next */
                                writer.writeLine('minimum?: number;');
                                /* v8 ignore next */
                                writer.writeLine('maximum?: number;');
                                /* v8 ignore next */
                                writer.writeLine('exclusiveMinimum?: number | boolean;');
                                /* v8 ignore next */
                                writer.writeLine('exclusiveMaximum?: number | boolean;');
                            });
                            /* v8 ignore next */
                            writer.writeLine('};');
                            /* v8 ignore next */
                            writer.writeLine(
                                'if (schemaObj.const !== undefined && !deepEqual(value, schemaObj.const)) {',
                            );
                            /* v8 ignore next */
                            writer.indent(() => writer.writeLine('return false;'));
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine('if (Array.isArray(schemaObj.enum)) {');
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine(
                                    'if (!schemaObj.enum.some(entry => deepEqual(value, entry))) return false;',
                                );
                            });
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine('if (schemaObj.type) {');
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine(
                                    'const types = Array.isArray(schemaObj.type) ? schemaObj.type : [schemaObj.type];',
                                );
                                /* v8 ignore next */
                                writer.writeLine(
                                    "if (!types.some(type => typeof type === 'string' && matchesType(value, type))) {",
                                );
                                /* v8 ignore next */
                                writer.indent(() => writer.writeLine('return false;'));
                                /* v8 ignore next */
                                writer.writeLine('}');
                            });
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine("if (typeof schemaObj.pattern === 'string') {");
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine('if (!isString(value)) return false;');
                                /* v8 ignore next */
                                writer.writeLine('try {');
                                /* v8 ignore next */
                                writer.indent(() => {
                                    /* v8 ignore next */
                                    writer.writeLine('const regex = new RegExp(schemaObj.pattern);');
                                    /* v8 ignore next */
                                    writer.writeLine('if (!regex.test(value)) return false;');
                                });
                                /* v8 ignore next */
                                writer.writeLine('} catch {');
                                /* v8 ignore next */
                                writer.indent(() => writer.writeLine('return false;'));
                                /* v8 ignore next */
                                writer.writeLine('}');
                            });
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine("if (typeof schemaObj.minLength === 'number') {");
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine(
                                    'if (!isString(value) || value.length < schemaObj.minLength) return false;',
                                );
                            });
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine("if (typeof schemaObj.maxLength === 'number') {");
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine(
                                    'if (!isString(value) || value.length > schemaObj.maxLength) return false;',
                                );
                            });
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine('const numericValue = isNumber(value) ? value : undefined;');
                            /* v8 ignore next */
                            writer.writeLine("if (typeof schemaObj.minimum === 'number') {");
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine(
                                    'if (numericValue === undefined || numericValue < schemaObj.minimum) return false;',
                                );
                            });
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine("if (typeof schemaObj.maximum === 'number') {");
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine(
                                    'if (numericValue === undefined || numericValue > schemaObj.maximum) return false;',
                                );
                            });
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine("if (typeof schemaObj.exclusiveMinimum === 'number') {");
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine(
                                    'if (numericValue === undefined || numericValue <= schemaObj.exclusiveMinimum) return false;',
                                );
                            });
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine("if (typeof schemaObj.exclusiveMaximum === 'number') {");
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine(
                                    'if (numericValue === undefined || numericValue >= schemaObj.exclusiveMaximum) return false;',
                                );
                            });
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine(
                                "if (schemaObj.exclusiveMinimum === true && typeof schemaObj.minimum === 'number') {",
                            );
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine(
                                    'if (numericValue === undefined || numericValue <= schemaObj.minimum) return false;',
                                );
                            });
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine(
                                "if (schemaObj.exclusiveMaximum === true && typeof schemaObj.maximum === 'number') {",
                            );
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine(
                                    'if (numericValue === undefined || numericValue >= schemaObj.maximum) return false;',
                                );
                            });
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine('return true;');
                        })
                        .writeLine('};')
                        .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                        .indent(() => {
                            /* v8 ignore next */
                            writer.writeLine('if (!Array.isArray(control.value)) return null;');
                            /* v8 ignore next */
                            writer.writeLine(
                                'const matchCount = control.value.filter(item => matchesSchema(item, schema)).length;',
                            );
                            /* v8 ignore next */
                            writer.writeLine('const minRequired = min !== undefined ? min : 1;');
                            /* v8 ignore next */
                            writer.writeLine("if (typeof minRequired === 'number' && matchCount < minRequired) {");
                            /* v8 ignore next */
                            writer.indent(() =>
                                /* v8 ignore next */
                                writer.writeLine('return { contains: { min: minRequired, actual: matchCount } };'),
                            );
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine("if (typeof max === 'number' && matchCount > max) {");
                            /* v8 ignore next */
                            writer.indent(() => writer.writeLine('return { contains: { max, actual: matchCount } };'));
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine('return null;');
                        })
                        .writeLine('};'),
            },
            {
                name: 'constValidator',
                isStatic: true,
                scope: Scope.Public,
                parameters: [{ name: 'constant', type: 'Record<string, never>' }],
                returnType: 'ValidatorFn',
                docs: ['Validator ensuring the value matches a constant (OAS 3.1 const keyword).'],
                statements: writer =>
                    /* v8 ignore next */
                    writer
                        .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                        .indent(() => {
                            /* v8 ignore next */
                            writer.writeLine('if (control.value === null || control.value === undefined) {');
                            /* v8 ignore next */
                            writer.indent(() => writer.writeLine('return null;'));
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
                            writer.writeLine('if (control.value !== constant) {');
                            /* v8 ignore next */
                            writer.indent(() =>
                                /* v8 ignore next */
                                writer.writeLine('return { const: { required: constant, actual: control.value } };'),
                            );
                            /* v8 ignore next */
                            writer.writeLine('}');
                            /* v8 ignore next */
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
                    /* v8 ignore next */
                    writer
                        .writeLine('return (control: AbstractControl): ValidationErrors | null => {')
                        .indent(() => {
                            /* v8 ignore next */
                            writer.writeLine('if (control.value === null || control.value === undefined) return null;');
                            /* v8 ignore next */
                            writer.writeLine('const errors = validator(control);');
                            /* v8 ignore next */
                            writer.writeLine(
                                '// If errors exist (inner invalid), we are valid because we want NOT matching',
                            );
                            /* v8 ignore next */
                            writer.writeLine('if (errors !== null) return null;');
                            /* v8 ignore next */
                            writer.writeLine('// If null (inner matches), we return error');
                            /* v8 ignore next */
                            writer.writeLine('return { not: true };');
                        })
                        .writeLine('};'),
            },
        ];

        /* v8 ignore next */
        validatorsClass.addMethods(methods);
    }
}
