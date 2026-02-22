// src/analysis/form-model.builder.ts
import { FormProperty, GeneratorConfig, Resource, SwaggerDefinition } from '@src/core/types/index.js';
import { SwaggerParser } from '@src/core/parser.js';
import { camelCase, getTypeScriptType, pascalCase, singular } from '@src/core/utils/index.js';
import { analyzeValidationRules } from './validation.analyzer.js';

import { FormAnalysisResult, FormControlModel, PolymorphicPropertyConfig } from './form-types.js';

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
        dependencyRules: [],
    };

    constructor(parser: SwaggerParser) {
        this.parser = parser;
    }

    public build(resource: Resource): FormAnalysisResult {
        const formInterfaceName = `${pascalCase(resource.modelName)}Form`;
        const definitions = this.parser.schemas;

        const polymorphicProps = resource.formProperties.filter(
            p => typeof p.schema === 'object' && p.schema.oneOf && p.schema.discriminator,
        );

        if (polymorphicProps.length > 0) {
            this.result.isPolymorphic = true;

            for (const prop of polymorphicProps) {
                const config = this.analyzePolymorphism(prop);
                if (config) {
                    this.result.polymorphicProperties.push(config);
                }
            }
        }

        const modelDef = definitions.find(d => d.name === resource.modelName)?.definition;
        if (modelDef && typeof modelDef === 'object') {
            if (modelDef.dependentSchemas) {
                this.analyzeDependentSchemas(modelDef);
            }
            if (modelDef.dependentRequired) {
                this.analyzeDependentRequired(modelDef);
            }
        }

        this.result.topLevelControls = this.analyzeControls(resource.formProperties, formInterfaceName, true);

        this.result.hasFileUploads = resource.formProperties.some(
            p => typeof p.schema === 'object' && p.schema.format === 'binary',
        );

        return this.result;
    }

    private analyzeDependentSchemas(modelSchema: SwaggerDefinition) {
        if (!modelSchema.dependentSchemas) return;

        Object.entries(modelSchema.dependentSchemas).forEach(([triggerProp, schemaOrRef]) => {
            const dependentSchema = this.parser.resolve(schemaOrRef as SwaggerDefinition);
            if (!dependentSchema || typeof dependentSchema !== 'object') return;

            if (dependentSchema.required) {
                dependentSchema.required.forEach(reqProp => {
                    this.result.dependencyRules.push({
                        triggerField: triggerProp,
                        targetField: reqProp,
                        type: 'required',
                    });
                });
            }
        });
    }

    private analyzeDependentRequired(modelSchema: SwaggerDefinition) {
        if (!modelSchema.dependentRequired) return;

        Object.entries(modelSchema.dependentRequired).forEach(([triggerProp, requiredList]) => {
            if (!Array.isArray(requiredList)) return;
            requiredList
                .filter((req): req is string => typeof req === 'string' && req.length > 0)
                .forEach((reqProp: string) => {
                    this.result.dependencyRules.push({
                        triggerField: triggerProp,
                        targetField: reqProp,
                        type: 'required',
                    });
                });
        });
    }

    private analyzeControls(
        properties: FormProperty[],
        interfaceName: string,
        isTopLevel: boolean,
    ): FormControlModel[] {
        const controls: FormControlModel[] = [];
        const interfaceProps: { name: string }[] = [];

        for (const prop of properties) {
            const schema = typeof prop.schema === 'object' ? prop.schema : ({} as SwaggerDefinition);
            const validationRules = analyzeValidationRules(schema);

            if (
                validationRules.some(r =>
                    [
                        'exclusiveMinimum',
                        'exclusiveMaximum',
                        'multipleOf',
                        'uniqueItems',
                        'contains',
                        'minProperties',
                        'maxProperties',
                        'not',
                        'const',
                    ].includes(r.type),
                )
            ) {
                this.result.usesCustomValidators = true;
            }

            let controlModel: FormControlModel;
            const defaultValue = schema.default !== undefined ? schema.default : null;
            interfaceProps.push({ name: prop.name });

            if (schema.type === 'object' && schema.properties) {
                const nestedInterfaceName = `${pascalCase(prop.name)}Form`;
                const nestedControls = this.analyzeControls(
                    Object.entries(schema.properties).map(([k, v]) => ({ name: k, schema: v as SwaggerDefinition })),
                    nestedInterfaceName,
                    false,
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
                    schema,
                };
            } else if (
                schema.type === 'object' &&
                !schema.properties &&
                (schema.additionalProperties || schema.unevaluatedProperties || schema.patternProperties)
            ) {
                this.result.hasMaps = true;

                let rawValueSchema: SwaggerDefinition | boolean | undefined;
                let keyPattern: string | undefined;
                let keyMinLength: number | undefined;
                let keyMaxLength: number | undefined;

                if (schema.patternProperties) {
                    const patterns = Object.keys(schema.patternProperties);
                    if (patterns.length > 0) {
                        keyPattern = patterns[0];
                        rawValueSchema = schema.patternProperties[keyPattern!];
                    }
                }

                if (schema.propertyNames && typeof schema.propertyNames === 'object') {
                    const resolvedPropertyNames = this.parser.resolve(schema.propertyNames as SwaggerDefinition);
                    if (
                        resolvedPropertyNames &&
                        typeof resolvedPropertyNames === 'object' &&
                        typeof resolvedPropertyNames.pattern === 'string' &&
                        !keyPattern
                    ) {
                        keyPattern = resolvedPropertyNames.pattern;
                    }
                    if (resolvedPropertyNames && typeof resolvedPropertyNames === 'object') {
                        if (typeof resolvedPropertyNames.minLength === 'number') {
                            keyMinLength = resolvedPropertyNames.minLength;
                        }
                        if (typeof resolvedPropertyNames.maxLength === 'number') {
                            keyMaxLength = resolvedPropertyNames.maxLength;
                        }
                    }
                }

                if (
                    !rawValueSchema ||
                    (typeof rawValueSchema === 'object' && Object.keys(rawValueSchema).length === 0)
                ) {
                    rawValueSchema =
                        (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : undefined) ||
                        (typeof schema.unevaluatedProperties === 'object' ? schema.unevaluatedProperties : undefined) ||
                        {};
                }

                const valuePropName = 'value';
                const valueInterfacePrefix = `${pascalCase(prop.name)}Value`;

                const valueControls = this.analyzeControls(
                    [{ name: valuePropName, schema: rawValueSchema as SwaggerDefinition }],
                    `${valueInterfacePrefix}Form`,
                    false,
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
                    ...(keyPattern && { keyPattern }),
                    ...(keyMinLength !== undefined && { keyMinLength }),
                    ...(keyMaxLength !== undefined && { keyMaxLength }),
                };
            } else if (schema.type === 'array') {
                const itemSchema = (schema.items ?? schema.unevaluatedItems ?? {}) as SwaggerDefinition | boolean;

                if (typeof itemSchema === 'object' && itemSchema.properties) {
                    this.result.hasFormArrays = true;
                    const arrayItemInterfaceName = `${pascalCase(singular(prop.name))}Form`;

                    const nestedItemControls = this.analyzeControls(
                        Object.entries(itemSchema.properties).map(([k, v]) => ({
                            name: k,
                            schema: v as SwaggerDefinition,
                        })),
                        arrayItemInterfaceName,
                        false,
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
                        schema,
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
                        schema,
                    };
                }
            } else {
                const tsType = this.getFormControlTypeString(schema);

                controlModel = {
                    name: prop.name,
                    propertyName: prop.name,
                    dataType: tsType,
                    defaultValue,
                    validationRules,
                    controlType: 'control',
                    schema,
                };
            }

            controls.push(controlModel);
        }

        this.result.interfaces.push({
            name: interfaceName,
            properties: interfaceProps,
            isTopLevel,
        });

        return controls;
    }

    private analyzePolymorphism(prop: FormProperty): PolymorphicPropertyConfig | null {
        if (!prop.schema || typeof prop.schema !== 'object' || !prop.schema.discriminator) return null;

        const options = this.parser.getPolymorphicSchemaOptions(prop.schema);
        const dPropName = prop.schema.discriminator.propertyName;

        const config: PolymorphicPropertyConfig = {
            propertyName: dPropName,
            discriminatorOptions: options.map(o => o.name),
            options: [],
        };

        const explicitMapping = prop.schema.discriminator?.mapping || {};

        for (const subSchemaRef of prop.schema.oneOf || []) {
            const refString =
                typeof subSchemaRef === 'object' ? subSchemaRef.$ref || subSchemaRef.$dynamicRef : undefined;
            if (!refString) continue;

            const subSchema = this.parser.resolve(subSchemaRef as SwaggerDefinition);
            if (!subSchema || typeof subSchema !== 'object') continue;

            const allProperties: Record<string, SwaggerDefinition> = {
                ...(((subSchema as SwaggerDefinition).properties || {}) as Record<string, SwaggerDefinition>),
            };

            const collectAllOfProps = (schema: SwaggerDefinition | boolean) => {
                if (typeof schema === 'object' && schema.allOf) {
                    for (const inner of schema.allOf) {
                        const resolved = this.parser.resolve(inner as SwaggerDefinition);
                        if (resolved && typeof resolved === 'object') {
                            Object.assign(allProperties, resolved.properties || {});
                            collectAllOfProps(resolved as SwaggerDefinition);
                        }
                    }
                }
            };
            collectAllOfProps(subSchema as SwaggerDefinition);

            if (Object.keys(allProperties).length === 0) continue;

            if (!allProperties[dPropName]) continue;

            let typeName =
                typeof allProperties[dPropName] === 'object'
                    ? (allProperties[dPropName]?.enum?.[0] as string)
                    : undefined;

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
                this.result.interfaces.pop();
                subControls.push(...controls);
            }

            if (!config.discriminatorOptions.includes(typeName)) {
                config.discriminatorOptions.push(typeName);
            }

            config.options.push({
                discriminatorValue: typeName,
                modelName: refName,
                subFormName: camelCase(typeName),
                controls: subControls,
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

    private getFormControlTypeString(schema: SwaggerDefinition | boolean): string {
        const knownTypes = this.parser.schemas.map(s => s.name);
        const dummyConfig: GeneratorConfig = {
            options: { dateType: 'Date', enumStyle: 'enum' },
            input: '',
            output: '',
        };
        const type = getTypeScriptType(schema, dummyConfig, knownTypes);
        return `${type} | null`;
    }
}

function isValidTsType(type: string): boolean {
    return type != null && type !== 'any' && type !== 'void';
}
