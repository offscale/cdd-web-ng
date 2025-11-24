import { SwaggerDefinition } from "@src/core/types/index.js";
import { ValidationRule } from './validation-types.js';

export type ControlType = 'control' | 'group' | 'array';

/**
 * A framework-agnostic Intermediate Representation (IR) of a single form control.
 * It describes the control's structure, type, and validation rules without
 * containing any framework-specific code.
 */
export interface FormControlModel {
    name: string;
    propertyName: string; // The actual property name in the model
    /** The raw TypeScript data type, e.g., "string | null", "MyModel", or "MyModel[]". */
    dataType: string;
    controlType: ControlType;
    defaultValue: any; // The raw default value from the schema (e.g., null, "default", 5)
    validationRules: ValidationRule[]; // An abstract list of validation rules

    // For Recursion/Nesting
    nestedFormInterface?: string; // Name of the interface for the group/array item
    nestedControls?: FormControlModel[]; // If this is a group/array of objects

    // Schema reference for UI generation hints (retained for HTML builder compatibility)
    schema?: SwaggerDefinition;
}

export interface PolymorphicOptionModel {
    discriminatorValue: string;
    subFormName: string; // e.g., "cat"
    controls: FormControlModel[];
    // Used for type guard generation
    modelName: string;
}

export interface FormAnalysisResult {
    // Interface Generation Data
    interfaces: {
        name: string;
        /** The properties belonging to this interface. The generator is responsible for determining the final framework-specific type. */
        properties: { name: string }[];
        isTopLevel: boolean;
    }[];

    // Main Form Structure
    topLevelControls: FormControlModel[];

    // Feature Flags
    usesCustomValidators: boolean;
    hasFormArrays: boolean;
    hasFileUploads: boolean;

    // Polymorphism / OneOf logic
    isPolymorphic: boolean;
    discriminatorPropName?: string;
    discriminatorOptions?: string[]; // List of raw values (['cat', 'dog'])
    polymorphicOptions?: PolymorphicOptionModel[]; // Logic for switching
}
