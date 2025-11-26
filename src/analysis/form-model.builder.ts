import { FormProperty, Resource, SwaggerDefinition } from "@src/core/types/index.js";
import { SwaggerParser } from '@src/core/parser.js';
import { camelCase, getTypeScriptType, pascalCase, singular } from "@src/core/utils/index.js";
import { analyzeValidationRules } from "./validation.analyzer.js";

import { FormAnalysisResult, FormControlModel, PolymorphicPropertyConfig } from "./form-types.js";

export class FormModelBuilder {
    private parser: SwaggerParser;
    private result: FormAnalysisResult = {
        interfaces: [],
        topLevelControls: [],
        usesCustomValidators: false,
        hasFormArrays: false,
        hasFileUploads: false,
        hasMaps: false,
        isPolymorphic: false,
        polymorphicProperties: [],
        dependencyRules: []
    };

    constructor(parser: SwaggerParser) {
        this.parser = parser;
    }

    public build(resource: Resource): FormAnalysisResult {
        const formInterfaceName = `${pascalCase(resource.modelName)}Form`;
        const definitions = this.parser.schemas;

        // 1. Detect Polymorphism
        const polymorphicProps = resource.formProperties.filter(p => p.schema.oneOf && p.schema.discriminator);

        if (polymorphicProps.length > 0) {
            this.result.isPolymorphic = true;

            for (const prop of polymorphicProps) {
                const config = this.analyzePolymorphism(prop);
                if (config) {
                    this.result.polymorphicProperties.push(config);
                }
            }
        }

        // 2. Detect Dependent Schemas (Optimization: check generic schema lookup for this model)
        const modelDef = definitions.find(d => d.name === resource.modelName)?.definition;
        if (modelDef && modelDef.dependentSchemas) {
            this.analyzeDependentSchemas(modelDef);
        }
        // Also check if the resource properties themselves originated from a schema with dependentSchemas
        // (Handling cases where the Resource object was built from flattened paths)
        /*for (const prop of resource.formProperties) {
            // We can't easily climb back up to the parent form schema from a property alone here without context,
            // but the previous check covers the main model definition which is the primary source for forms.
        }*/

        // 3. Build Top Level Controls & Interfaces
        this.result.topLevelControls = this.analyzeControls(
            resource.formProperties,
            formInterfaceName,
            true
        );

        // 4. Global Flags
        this.result.hasFileUploads = resource.formProperties.some(p => p.schema.format === 'binary');

        return this.result;
    }

    private analyzeDependentSchemas(modelSchema: SwaggerDefinition) {
        if (!modelSchema.dependentSchemas) return;

        Object.entries(modelSchema.dependentSchemas).forEach(([triggerProp, schemaOrRef]) => {
            const dependentSchema = this.parser.resolve(schemaOrRef);
            if (!dependentSchema) return;

            // Start with 'required' array
            if (dependentSchema.required) {
                dependentSchema.required.forEach(reqProp => {
                    this.result.dependencyRules.push({
                        triggerField: triggerProp,
                        targetField: reqProp,
                        type: 'required'
                    });
                });
            }

            // Also check for nested properties that implicitly become required
            if (dependentSchema.properties) {
                // For simply defining the property structure, we don't necessarily force 'required'
                // unless it's in the 'required' array. However, if the property only exists via dependent schema,
                // UI might want to toggle visibility.
                // For now, we strictly follow JSON Schema 'required' semantics for validation logic.
            }
        });
    }

    /**
     * Recursively analyzes properties to build Control Models and Interface Definitions.
     */
    private analyzeControls(
        properties: FormProperty[],
        interfaceName: string,
        isTopLevel: boolean
    ): FormControlModel[] {
        const controls: FormControlModel[] = [];
        const interfaceProps: { name: string }[] = [];

        for (const prop of properties) {
            const schema = prop.schema;
            const validationRules = analyzeValidationRules(schema);

            if (validationRules.some(r => ['exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'uniqueItems', 'not'].includes(r.type))) {
                this.result.usesCustomValidators = true;
            }

            let controlModel: FormControlModel;
            const defaultValue = schema.default !== undefined ? schema.default : null;
            interfaceProps.push({ name: prop.name });

            // 2a. Nested Group
            if (schema.type === 'object' && schema.properties) {
                const nestedInterfaceName = `${pascalCase(prop.name)}Form`;
                // Recurse
                const nestedControls = this.analyzeControls(
                    Object.entries(schema.properties).map(([k, v]) => ({ name: k, schema: v })),
                    nestedInterfaceName,
                    false
                );

                controlModel = {
                    name: prop.name,
                    propertyName: prop.name,
                    dataType: nestedInterfaceName,
                    defaultValue,
                    validationRules,
                    controlType: 'group',
                    nestedFormInterface: nestedInterfaceName,
                    nestedControls,
                    schema
                };
            }
            // 2b. Map / Dictionary (additionalProperties OR patternProperties)
            else if (schema.type === 'object' && !schema.properties && (schema.additionalProperties || schema.unevaluatedProperties || schema.patternProperties)) {
                this.result.hasMaps = true;

                // extract the schema for map values
                let rawValueSchema: any = {};
                let keyPattern: string | undefined;

                if (schema.patternProperties) {
                    const patterns = Object.keys(schema.patternProperties);
                    if (patterns.length > 0) {
                        keyPattern = patterns[0]; // Using first pattern as constraint for the KEY
                        rawValueSchema = schema.patternProperties[keyPattern];
                    }
                }

                if (Object.keys(rawValueSchema).length === 0) {
                    rawValueSchema = (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : undefined)
                        || (typeof schema.unevaluatedProperties === 'object' ? schema.unevaluatedProperties : undefined)
                        || {};
                }

                const valuePropName = 'value';
                const valueInterfacePrefix = `${pascalCase(prop.name)}Value`;

                const valueControls = this.analyzeControls(
                    [{ name: valuePropName, schema: rawValueSchema as SwaggerDefinition }],
                    `${valueInterfacePrefix}Form`,
                    false
                );

                const valueControl = valueControls[0]!;
                const valueTsType = valueControl.dataType;

                controlModel = {
                    name: prop.name,
                    propertyName: prop.name,
                    dataType: isValidTsType(valueTsType) ? `Record<string, ${valueTsType}>` : `Record<string, any>`,
                    defaultValue: defaultValue || {},
                    validationRules,
                    controlType: 'map',
                    mapValueControl: valueControl,
                    schema,
                    ...(valueControl.nestedFormInterface && { nestedFormInterface: valueControl.nestedFormInterface }),
                    ...(keyPattern && { keyPattern }) // Attach the pattern for renderer usage
                };
            }
            // 2c. Form Array
            else if (schema.type === 'array') {
                const itemSchema = schema.items as SwaggerDefinition;

                if (itemSchema?.properties) {
                    this.result.hasFormArrays = true;
                    const arrayItemInterfaceName = `${pascalCase(singular(prop.name))}Form`;

                    const nestedItemControls = this.analyzeControls(
                        Object.entries(itemSchema.properties).map(([k, v]) => ({ name: k, schema: v })),
                        arrayItemInterfaceName,
                        false
                    );

                    controlModel = {
                        name: prop.name,
                        propertyName: prop.name,
                        dataType: `${arrayItemInterfaceName}[]`,
                        defaultValue,
                        validationRules,
                        controlType: 'array',
                        nestedFormInterface: arrayItemInterfaceName,
                        nestedControls: nestedItemControls,
                        schema
                    };
                } else {
                    const itemTsType = this.getFormControlTypeString(itemSchema);

                    controlModel = {
                        name: prop.name,
                        propertyName: prop.name,
                        dataType: `(${itemTsType})[]`,
                        defaultValue,
                        validationRules,
                        controlType: 'array',
                        schema
                    };
                }
            }
            // 2d. Primitive Control
            else {
                const tsType = this.getFormControlTypeString(schema);

                controlModel = {
                    name: prop.name,
                    propertyName: prop.name,
                    dataType: tsType,
                    defaultValue,
                    validationRules,
                    controlType: 'control',
                    schema
                };
            }

            controls.push(controlModel);
        }

        this.result.interfaces.push({
            name: interfaceName,
            properties: interfaceProps,
            isTopLevel
        });

        return controls;
    }

    private analyzePolymorphism(prop: FormProperty): PolymorphicPropertyConfig | null {
        if (!prop.schema.discriminator) return null;

        const options = this.parser.getPolymorphicSchemaOptions(prop.schema);
        const dPropName = prop.schema.discriminator.propertyName;

        const config: PolymorphicPropertyConfig = {
            propertyName: dPropName,
            discriminatorOptions: options.map(o => o.name),
            options: []
        };

        const explicitMapping = prop.schema.discriminator?.mapping || {};

        for (const subSchemaRef of prop.schema.oneOf || []) {
            const refString = subSchemaRef.$ref || subSchemaRef.$dynamicRef;
            if (!refString) continue;

            const subSchema = this.parser.resolve(subSchemaRef);
            if (!subSchema) continue;

            const allProperties: Record<string, SwaggerDefinition> = { ...(subSchema.properties || {}) };

            const collectAllOfProps = (schema: SwaggerDefinition) => {
                if (schema.allOf) {
                    for (const inner of schema.allOf) {
                        const resolved = this.parser.resolve(inner);
                        if (resolved) {
                            Object.assign(allProperties, resolved.properties || {});
                            collectAllOfProps(resolved);
                        }
                    }
                }
            };
            collectAllOfProps(subSchema);

            if (Object.keys(allProperties).length === 0) continue;

            if (!allProperties[dPropName]) continue;

            let typeName = allProperties[dPropName]?.enum?.[0] as string;

            if (!typeName) {
                const mappedKey = Object.keys(explicitMapping).find(key => explicitMapping[key] === refString);
                if (mappedKey) typeName = mappedKey;
            }

            if (!typeName) {
                typeName = refString.split('/').pop() || '';
            }

            if (!typeName) continue;

            const refName = pascalCase(refString.split('/').pop()!);

            const subProperties = Object.entries(allProperties)
                .filter(([key, _schema]) => key !== dPropName)
                .map(([key, s]) => ({ name: key, schema: s as SwaggerDefinition }));

            const subControls: FormControlModel[] = [];
            for (const subProp of subProperties) {
                const controls = this.analyzeControls([subProp], `Temp${refName}`, false);
                this.result.interfaces.pop(); // Remove temp interface
                subControls.push(...controls);
            }

            if (!config.discriminatorOptions.includes(typeName)) {
                config.discriminatorOptions.push(typeName);
            }

            config.options.push({
                discriminatorValue: typeName,
                modelName: refName,
                subFormName: camelCase(typeName),
                controls: subControls
            });
        }

        if (prop.schema.discriminator?.defaultMapping) {
            const defaultName = pascalCase(prop.schema.discriminator.defaultMapping.split('/').pop() || '');
            if (defaultName && config.options.some(p => p.modelName === defaultName)) {
                config.defaultOption = defaultName;
            }
        }

        return config;
    }

    private getFormControlTypeString(schema: SwaggerDefinition): string {
        const knownTypes = this.parser.schemas.map(s => s.name);
        const dummyConfig = { options: { dateType: 'Date', enumStyle: 'enum' } } as any;
        const type = getTypeScriptType(schema, dummyConfig, knownTypes);
        return `${type} | null`;
    }
}

function isValidTsType(type: string): boolean {
    return type != null && type !== 'any' && type !== 'void';
}
