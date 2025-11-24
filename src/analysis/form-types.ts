import { SwaggerDefinition } from "@src/core/types/index.js";

export type ControlType = 'control' | 'group' | 'array';

export interface FormControlModel {
    name: string;
    propertyName: string; // The actual property name in the model
    tsType: string; // e.g. "string | null" or "FormGroup<SubForm>"
    initialValue: string; // Code string for initialization
    validators: string[]; // List of validator function calls
    controlType: ControlType;

    // For Recursion/Nesting
    nestedFormInterface?: string; // Name of the interface for the group/array item
    nestedControls?: FormControlModel[]; // If this is a group
    arrayItemControl?: FormControlModel; // If this is an array

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
        properties: { name: string; type: string }[];
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
