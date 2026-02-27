// src/analysis/validation-types.ts
export type ValidationRule =
    | { type: 'required' }
    | { type: 'minLength'; value: number }
    | { type: 'maxLength'; value: number }
    | { type: 'min'; value: number }
    | { type: 'max'; value: number }
    | { type: 'email' }
    | { type: 'pattern'; value: string; flags?: string }
    | { type: 'exclusiveMinimum'; value: number }
    | { type: 'exclusiveMaximum'; value: number }
    | { type: 'multipleOf'; value: number }
    | { type: 'uniqueItems' }
    | { type: 'minItems'; value: number }
    | { type: 'maxItems'; value: number }
    | { type: 'minProperties'; value: number }
    | { type: 'maxProperties'; value: number }
    | { type: 'contains'; schema: unknown; min?: number; max?: number }
    | { type: 'const'; value: Exclude<unknown, undefined> }
    | { type: 'not'; rules: ValidationRule[] };
