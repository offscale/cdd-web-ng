// src/analysis/form-types.ts
import { SwaggerDefinition } from '@src/core/types/index.js';
import { ValidationRule } from './validation-types.js';

export type ControlType = 'control' | 'group' | 'array' | 'map';

export interface FormControlModel {
    name: string;
    propertyName: string;
    dataType: string;
    controlType: ControlType;
    defaultValue: unknown;
    validationRules: ValidationRule[];

    nestedFormInterface?: string;
    nestedControls?: FormControlModel[];

    mapValueControl?: FormControlModel;
    keyPattern?: string;
    keyMinLength?: number;
    keyMaxLength?: number;

    schema?: SwaggerDefinition;
}

export interface PolymorphicOptionModel {
    discriminatorValue: string;
    subFormName: string;
    controls: FormControlModel[];
    modelName: string;
}

export interface PolymorphicPropertyConfig {
    propertyName: string;
    discriminatorOptions: string[];
    options: PolymorphicOptionModel[];
    defaultOption?: string;
}

export interface DependencyRule {
    triggerField: string;
    targetField: string;
    type: 'required';
}

export interface FormAnalysisResult {
    interfaces: {
        name: string;
        properties: { name: string }[];
        isTopLevel: boolean;
    }[];
    topLevelControls: FormControlModel[];
    usesCustomValidators: boolean;
    hasFormArrays: boolean;
    hasFileUploads: boolean;
    hasMaps?: boolean;
    isPolymorphic: boolean;
    polymorphicProperties: PolymorphicPropertyConfig[];
    dependencyRules: DependencyRule[];
}
