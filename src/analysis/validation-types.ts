/**
 * @fileoverview
 * Defines a framework-agnostic Intermediate Representation (IR) for validation rules
 * derived from an OpenAPI/JSON Schema. This allows the analysis layer to remain pure
 * and decoupled from any specific client-side framework (e.g., Angular, React).
 */

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
    | { type: 'maxItems'; value: number };
