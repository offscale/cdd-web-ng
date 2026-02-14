// src/analysis/form-types.ts

import { SwaggerDefinition } from '@src/core/types/index.js';
import { ValidationRule } from './validation-types.js';

export type ControlType = 'control' | 'group' | 'array' | 'map';

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

    // For Maps (Dictionary/Record)
    // The control model representing the 'value' side of the Key-Value pair
    mapValueControl?: FormControlModel;
    // The regex pattern required for keys in this map (from patternProperties)
    keyPattern?: string;
    // Optional length constraints for map keys (from propertyNames)
    keyMinLength?: number;
    keyMaxLength?: number;

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

export interface PolymorphicPropertyConfig {
    propertyName: string; // The field name in the form (e.g. 'petType')
    discriminatorOptions: string[]; // List of raw values (['cat', 'dog'])
    options: PolymorphicOptionModel[]; // The logic for switching
    /** The model name of the default option to use if the discriminator value is missing or invalid. */
    defaultOption?: string;
}

/**
 * Represents a conditional validation dependency.
 * "If field 'triggerField' is present/truthy, then 'targetField' is required."
 */
export interface DependencyRule {
    triggerField: string;
    targetField: string;
    // In complex schemas, the dependency might imply more than just 'required',
    // but focusing on 'required' covers 95% of UI logic needs for dependentSchemas.
    type: 'required';
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
    hasMaps?: boolean; // New flag for Map/Dictionary support

    // Polymorphism / OneOf logic
    isPolymorphic: boolean;
    polymorphicProperties: PolymorphicPropertyConfig[];

    // OAS 3.1 dependentSchemas/dependentRequired logic
    dependencyRules: DependencyRule[];
}
