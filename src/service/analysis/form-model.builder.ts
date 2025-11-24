import { FormProperty, Resource, SwaggerDefinition } from "../../core/types.js";
import { SwaggerParser } from "../../core/parser.js";
import { camelCase, getTypeScriptType, pascalCase, singular } from "../../core/utils.js";
import { mapSchemaToFormControl } from "../emit/admin/form-control.mapper.js";
import { FormAnalysisResult, FormControlModel, PolymorphicOptionModel } from "./form-types.js";

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
            this.analyzePolymorphism(oneOfProp, resource.modelName);
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
        const interfaceProps: { name: string; type: string }[] = [];

        for (const prop of properties) {
            if (prop.schema.readOnly) continue;

            const schema = prop.schema;
            const validationInfo = mapSchemaToFormControl(schema);

            if (validationInfo?.validators.some(v => v.startsWith('CustomValidators'))) {
                this.result.usesCustomValidators = true;
            }

            const validators = validationInfo?.validators || [];
            const validatorString = validators.length > 0 ? `, [${validators.join(', ')}]` : '';

            let controlModel: FormControlModel;

            // 2a. Nested Group
            if (schema.type === 'object' && schema.properties) {
                const nestedInterfaceName = `${pascalCase(prop.name)}Form`;
                // Recurse
                const nestedControls = this.analyzeControls(
                    Object.entries(schema.properties).map(([k, v]) => ({ name: k, schema: v })),
                    nestedInterfaceName,
                    false
                );

                const formGroupType = `FormGroup<${nestedInterfaceName}>`;
                interfaceProps.push({ name: prop.name, type: formGroupType });

                // Build Group Initializer
                const nestedInits = nestedControls
                    .map(c => `'${c.name}': ${c.initialValue}`)
                    .join(',\n      ');
                const initialValue = `this.fb.group({${nestedInits}}${validatorString.replace(',', '')})`;

                controlModel = {
                    name: prop.name,
                    propertyName: prop.name,
                    tsType: formGroupType,
                    initialValue,
                    validators,
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

                    const propType = `FormArray<FormGroup<${arrayItemInterfaceName}>>`;
                    interfaceProps.push({ name: prop.name, type: propType });

                    // For complex arrays, we initialize as empty array.
                    // The generator creates helper methods to add items.
                    controlModel = {
                        name: prop.name,
                        propertyName: prop.name,
                        tsType: propType,
                        initialValue: `this.fb.array([]${validatorString})`,
                        validators,
                        controlType: 'array',
                        nestedFormInterface: arrayItemInterfaceName, // References the Item interface
                        nestedControls: nestedItemControls, // Stored for "createItem" helper generation
                        schema
                    };
                } else {
                    // Array of Primitives
                    const itemTsType = this.getFormControlTypeString(itemSchema);
                    const propType = `FormArray<FormControl<${itemTsType}>>`;
                    interfaceProps.push({ name: prop.name, type: propType });

                    controlModel = {
                        name: prop.name,
                        propertyName: prop.name,
                        tsType: propType,
                        initialValue: `this.fb.array([]${validatorString})`,
                        validators,
                        controlType: 'array',
                        schema
                    };
                }
            }
            // 2c. Primitive Control
            else {
                const tsType = this.getFormControlTypeString(schema);
                const propType = `FormControl<${tsType}>`;
                interfaceProps.push({ name: prop.name, type: propType });

                const defaultValue = schema.default !== undefined ? JSON.stringify(schema.default) : 'null';

                controlModel = {
                    name: prop.name,
                    propertyName: prop.name,
                    tsType: propType,
                    initialValue: `new FormControl<${tsType}>(${defaultValue}${validatorString})`,
                    validators,
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

    private analyzePolymorphism(prop: FormProperty, rootModelName: string) {
        const options = this.parser.getPolymorphicSchemaOptions(prop.schema);
        this.result.discriminatorOptions = options.map(o => o.name);
        this.result.polymorphicOptions = [];

        const dPropName = prop.schema.discriminator!.propertyName;

        // Determine if sub-options are actually objects requiring sub-forms
        const oneOfHasObjects = prop.schema.oneOf!.some(s => this.parser.resolve(s)?.properties);
        if (!oneOfHasObjects) return;

        for (const subSchemaRef of prop.schema.oneOf!) {
            // Skip primitives in oneOf
            if (!subSchemaRef.$ref) continue;

            const subSchema = this.parser.resolve(subSchemaRef);
            if (!subSchema || !subSchema.properties) continue;

            const typeName = subSchema.properties[dPropName].enum![0] as string; // e.g. 'cat'
            const refName = pascalCase(subSchemaRef.$ref.split('/').pop()!); // e.g. 'Cat'

            // Generate controls for the sub-form (excluding discriminator itself and readOnly)
            const subProperties = Object.entries(subSchema.properties)
                .filter(([key]) => key !== dPropName && !subSchema.properties![key].readOnly)
                .map(([key, s]) => ({ name: key, schema: s as SwaggerDefinition }));

            // We don't generate a named interface for these inline sub-forms in the main FormModel usually,
            // they are just FormGroup<{ ... }> literal types or reusing existing models?
            // The previous generator created inline initializers.
            // We will analyze to get the control models for initialization string building.
            // Note: We use a dummy interface name since we might not be emitting it specifically here
            // or simply don't register it if we pass `false` for register.
            // Actually, previous code relied on `this.getFormControlInitializerString` directly.

            // Let's reuse analyzeControls but suppress interface registration?
            // For separate concerns, let's manually build the logic needed for the switch case.

            const subControls: FormControlModel[] = [];
            for (const subProp of subProperties) {
                // Reuse primitive analysis or full recursion?
                // For now, we assume shallow sub-forms based on previous implementation complexity
                // But to be robust, let's assume they could be controls.
                // We'll duplicate the primitive logic briefly or extract `getInitializer` logic to class scope.
                // Simplified:
                const controls = this.analyzeControls([subProp], `Temp${refName}`, false);
                // Remove the temp interface it just added
                this.result.interfaces.pop();
                subControls.push(...controls);
            }

            this.result.polymorphicOptions.push({
                discriminatorValue: typeName,
                modelName: refName,
                subFormName: typeName,
                controls: subControls
            });
        }
    }

    private getFormControlTypeString(schema: SwaggerDefinition): string {
        const knownTypes = this.parser.schemas.map(s => s.name);
        // Use Date option explicitly for form models
        const type = getTypeScriptType(schema, { options: { dateType: 'Date' } } as any, knownTypes);
        return `${type} | null`;
    }
}
