import { FormProperty, Resource, SwaggerDefinition } from "@src/core/types/index.js";
import { SwaggerParser } from '@src/core/parser.js';
import { getTypeScriptType, pascalCase, singular } from "@src/core/utils/index.js";
import { analyzeValidationRules } from "./validation.analyzer.js";

import { FormAnalysisResult, FormControlModel } from "./form-types.js";

export class FormModelBuilder {
    private parser: SwaggerParser;
    private result: FormAnalysisResult = {
        interfaces: [],
        topLevelControls: [],
        usesCustomValidators: false,
        hasFormArrays: false,
        hasFileUploads: false,
        isPolymorphic: false
    };

    constructor(parser: SwaggerParser) {
        this.parser = parser;
    }

    public build(resource: Resource): FormAnalysisResult {
        const formInterfaceName = `${pascalCase(resource.modelName)}Form`;

        // 1. Detect Polymorphism
        const oneOfProp = resource.formProperties.find(p => p.schema.oneOf && p.schema.discriminator);
        if (oneOfProp) {
            this.result.isPolymorphic = true;
            this.result.discriminatorPropName = oneOfProp.schema.discriminator!.propertyName;
            this.analyzePolymorphism(oneOfProp);
        }

        // 2. Build Top Level Controls & Interfaces
        // This method recursively populates this.result.interfaces
        this.result.topLevelControls = this.analyzeControls(
            resource.formProperties,
            formInterfaceName,
            true
        );

        // 3. Global Flags
        this.result.hasFileUploads = resource.formProperties.some(p => p.schema.format === 'binary');
        // hasFormArrays logic is handled inside analyzeControls where recursion happens

        return this.result;
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
            if (prop.schema.readOnly) continue;

            const schema = prop.schema;
            const validationRules = analyzeValidationRules(schema);

            if (validationRules.some(r => ['exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'uniqueItems'].includes(r.type))) {
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
            // 2b. Form Array
            else if (schema.type === 'array') {
                const itemSchema = schema.items as SwaggerDefinition;

                if (itemSchema?.properties) {
                    // Array of Objects (Complex)
                    this.result.hasFormArrays = true;
                    const arrayItemInterfaceName = `${pascalCase(singular(prop.name))}Form`;

                    // Recurse for item structure (phantom call to generate interface)
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
                        nestedFormInterface: arrayItemInterfaceName, // References the Item interface
                        nestedControls: nestedItemControls, // Stored for "createItem" helper generation
                        schema
                    };
                } else {
                    // Array of Primitives
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
            // 2c. Primitive Control
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

        // Register the interface
        this.result.interfaces.push({
            name: interfaceName,
            properties: interfaceProps,
            isTopLevel
        });

        return controls;
    }

    private analyzePolymorphism(prop: FormProperty) {
        const options = this.parser.getPolymorphicSchemaOptions(prop.schema);
        this.result.discriminatorOptions = options.map(o => o.name);
        this.result.polymorphicOptions = [];

        const dPropName = prop.schema.discriminator!.propertyName;

        const oneOfHasObjects = prop.schema.oneOf!.some(s => this.parser.resolve(s)?.properties);
        if (!oneOfHasObjects) return;

        for (const subSchemaRef of prop.schema.oneOf!) {
            if (!subSchemaRef.$ref) continue;

            const subSchema = this.parser.resolve(subSchemaRef);
            if (!subSchema) continue;

            const allProperties: Record<string, SwaggerDefinition> = { ...(subSchema.properties || {}) };

            // **THE FIX**: Recursively collect properties from allOf references
            const collectAllOfProps = (schema: SwaggerDefinition) => {
                if (schema.allOf) {
                    for (const inner of schema.allOf) {
                        const resolved = this.parser.resolve(inner);
                        if (resolved) {
                            Object.assign(allProperties, resolved.properties || {});
                            collectAllOfProps(resolved); // Recurse
                        }
                    }
                }
            };
            collectAllOfProps(subSchema);

            if (Object.keys(allProperties).length === 0) continue;

            const typeName = allProperties[dPropName]?.enum?.[0] as string;
            if (!typeName) continue;

            const refName = pascalCase(subSchemaRef.$ref.split('/').pop()!);

            const subProperties = Object.entries(allProperties)
                .filter(([key, schema]) => key !== dPropName && !schema.readOnly)
                .map(([key, s]) => ({ name: key, schema: s as SwaggerDefinition }));

            const subControls: FormControlModel[] = [];
            for (const subProp of subProperties) {
                const controls = this.analyzeControls([subProp], `Temp${refName}`, false);
                this.result.interfaces.pop();
                subControls.push(...controls);
            }

            this.result.polymorphicOptions.push({
                discriminatorValue: typeName,
                modelName: refName,
                subFormName: typeName.toLowerCase(), // Ensure sub-form name is consistent (e.g., 'cat', 'dog')
                controls: subControls
            });
        }

        // Detect default mapping
        if (prop.schema.discriminator?.defaultMapping) {
            const defaultName = pascalCase(prop.schema.discriminator.defaultMapping.split('/').pop() || '');
            if (defaultName && this.result.polymorphicOptions.some(p => p.modelName === defaultName)) {
                this.result.defaultPolymorphicOption = defaultName;
            }
        }
    }

    private getFormControlTypeString(schema: SwaggerDefinition): string {
        const knownTypes = this.parser.schemas.map(s => s.name);
        const type = getTypeScriptType(schema, { options: { dateType: 'Date' } } as any, knownTypes);
        return `${type} | null`;
    }
}
