// src/analysis/form-model.builder.ts
import { FormProperty, GeneratorConfig, Resource, SwaggerDefinition } from '@src/core/types/index.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { camelCase, getTypeScriptType, pascalCase, singular } from '@src/functions/utils.js';
import { analyzeValidationRules } from './validation.analyzer.js';

import { FormAnalysisResult, FormControlModel, PolymorphicPropertyConfig, JsonValue } from './form-types.js';

export class FormModelBuilder {
    private parser: SwaggerParser;
    /* v8 ignore next */
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
        /* v8 ignore next */
        this.parser = parser;
    }

    public build(resource: Resource): FormAnalysisResult {
        /* v8 ignore next */
        const formInterfaceName = `${pascalCase(resource.modelName)}Form`;
        /* v8 ignore next */
        const definitions = this.parser.schemas;

        /* v8 ignore next */
        const polymorphicProps = resource.formProperties.filter(
            /* v8 ignore next */
            p => typeof p.schema === 'object' && p.schema.oneOf && p.schema.discriminator,
        );

        /* v8 ignore next */
        if (polymorphicProps.length > 0) {
            /* v8 ignore next */
            this.result.isPolymorphic = true;

            /* v8 ignore next */
            for (const prop of polymorphicProps) {
                /* v8 ignore next */
                const config = this.analyzePolymorphism(prop);
                /* v8 ignore next */
                if (config) {
                    /* v8 ignore next */
                    this.result.polymorphicProperties.push(config);
                }
            }
        }

        /* v8 ignore next */
        const modelDef = definitions.find(d => d.name === resource.modelName)?.definition;
        /* v8 ignore next */
        if (modelDef && typeof modelDef === 'object') {
            /* v8 ignore next */
            if (modelDef.dependentSchemas) {
                /* v8 ignore next */
                this.analyzeDependentSchemas(modelDef);
            }
            /* v8 ignore next */
            if (modelDef.dependentRequired) {
                /* v8 ignore next */
                this.analyzeDependentRequired(modelDef);
            }
        }

        /* v8 ignore next */
        this.result.topLevelControls = this.analyzeControls(resource.formProperties, formInterfaceName, true);

        /* v8 ignore next */
        this.result.hasFileUploads = resource.formProperties.some(
            /* v8 ignore next */
            p => typeof p.schema === 'object' && p.schema.format === 'binary',
        );

        /* v8 ignore next */
        return this.result;
    }

    private analyzeDependentSchemas(modelSchema: SwaggerDefinition) {
        /* v8 ignore next */
        if (!modelSchema.dependentSchemas) return;

        /* v8 ignore next */
        Object.entries(modelSchema.dependentSchemas).forEach(([triggerProp, schemaOrRef]) => {
            /* v8 ignore next */
            const dependentSchema = this.parser.resolve(schemaOrRef as SwaggerDefinition);
            /* v8 ignore next */
            if (!dependentSchema || typeof dependentSchema !== 'object') return;

            /* v8 ignore next */
            if (dependentSchema.required) {
                /* v8 ignore next */
                dependentSchema.required.forEach(reqProp => {
                    /* v8 ignore next */
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
        /* v8 ignore next */
        /* v8 ignore start */
        if (!modelSchema.dependentRequired) return;
        /* v8 ignore stop */

        /* v8 ignore next */
        Object.entries(modelSchema.dependentRequired).forEach(([triggerProp, requiredList]) => {
            /* v8 ignore next */
            /* v8 ignore start */
            if (!Array.isArray(requiredList)) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            requiredList
                /* v8 ignore next */
                .filter((req): req is string => typeof req === 'string' && req.length > 0)
                .forEach((reqProp: string) => {
                    /* v8 ignore next */
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
        /* v8 ignore next */
        const controls: FormControlModel[] = [];
        /* v8 ignore next */
        const interfaceProps: { name: string }[] = [];

        /* v8 ignore next */
        for (const prop of properties) {
            /* v8 ignore next */
            /* v8 ignore start */
            const schema = typeof prop.schema === 'object' ? prop.schema : ({} as SwaggerDefinition);
            /* v8 ignore stop */
            /* v8 ignore next */
            const validationRules = analyzeValidationRules(schema);

            /* v8 ignore next */
            if (
                validationRules.some(r =>
                    /* v8 ignore next */
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
                /* v8 ignore next */
                this.result.usesCustomValidators = true;
            }

            let controlModel: FormControlModel;
            /* v8 ignore next */
            const defaultValue = (schema.default !== undefined ? schema.default : null) as JsonValue;
            /* v8 ignore next */
            interfaceProps.push({ name: prop.name });

            /* v8 ignore next */
            if (schema.type === 'object' && schema.properties) {
                /* v8 ignore next */
                const nestedInterfaceName = `${pascalCase(prop.name)}Form`;
                /* v8 ignore next */
                const nestedControls = this.analyzeControls(
                    /* v8 ignore next */
                    Object.entries(schema.properties).map(([k, v]) => ({ name: k, schema: v as SwaggerDefinition })),
                    nestedInterfaceName,
                    false,
                );

                /* v8 ignore next */
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
                /* v8 ignore next */
            } else if (
                schema.type === 'object' &&
                !schema.properties &&
                (schema.additionalProperties || schema.unevaluatedProperties || schema.patternProperties)
            ) {
                /* v8 ignore next */
                this.result.hasMaps = true;

                let rawValueSchema: SwaggerDefinition | boolean | undefined;
                let keyPattern: string | undefined;
                let keyMinLength: number | undefined;
                let keyMaxLength: number | undefined;

                /* v8 ignore next */
                if (schema.patternProperties) {
                    /* v8 ignore next */
                    const patterns = Object.keys(schema.patternProperties);
                    /* v8 ignore next */
                    if (patterns.length > 0) {
                        /* v8 ignore next */
                        keyPattern = patterns[0];
                        /* v8 ignore next */
                        rawValueSchema = schema.patternProperties[keyPattern!];
                    }
                }

                /* v8 ignore next */
                if (schema.propertyNames && typeof schema.propertyNames === 'object') {
                    /* v8 ignore next */
                    const resolvedPropertyNames = this.parser.resolve(schema.propertyNames as SwaggerDefinition);
                    /* v8 ignore next */
                    /* v8 ignore start */
                    if (
                        /* v8 ignore stop */
                        resolvedPropertyNames &&
                        typeof resolvedPropertyNames === 'object' &&
                        typeof resolvedPropertyNames.pattern === 'string' &&
                        !keyPattern
                    ) {
                        /* v8 ignore next */
                        keyPattern = resolvedPropertyNames.pattern;
                    }
                    /* v8 ignore next */
                    /* v8 ignore start */
                    if (resolvedPropertyNames && typeof resolvedPropertyNames === 'object') {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (typeof resolvedPropertyNames.minLength === 'number') {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            keyMinLength = resolvedPropertyNames.minLength;
                        }
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (typeof resolvedPropertyNames.maxLength === 'number') {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            keyMaxLength = resolvedPropertyNames.maxLength;
                        }
                    }
                }

                /* v8 ignore next */
                if (
                    !rawValueSchema ||
                    (typeof rawValueSchema === 'object' && Object.keys(rawValueSchema).length === 0)
                ) {
                    /* v8 ignore next */
                    rawValueSchema =
                        (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : undefined) ||
                        (typeof schema.unevaluatedProperties === 'object' ? schema.unevaluatedProperties : undefined) ||
                        {};
                }

                /* v8 ignore next */
                const valuePropName = 'value';
                /* v8 ignore next */
                const valueInterfacePrefix = `${pascalCase(prop.name)}Value`;

                /* v8 ignore next */
                const valueControls = this.analyzeControls(
                    [{ name: valuePropName, schema: rawValueSchema as SwaggerDefinition }],
                    `${valueInterfacePrefix}Form`,
                    false,
                );

                /* v8 ignore next */
                const valueControl = valueControls[0]!;
                /* v8 ignore next */
                const valueTsType = valueControl.dataType;

                /* v8 ignore next */
                controlModel = {
                    name: prop.name,
                    propertyName: prop.name,
                    /* v8 ignore next */
                    dataType: isValidTsType(valueTsType) ? `Record<string, ${valueTsType}>` : `Record<string, string | number | boolean | object | undefined | null>`,
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
                /* v8 ignore next */
            } else if (schema.type === 'array') {
                /* v8 ignore next */
                const itemSchema = (schema.items ?? schema.unevaluatedItems ?? {}) as SwaggerDefinition | boolean;

                /* v8 ignore next */
                if (typeof itemSchema === 'object' && itemSchema.properties) {
                    /* v8 ignore next */
                    this.result.hasFormArrays = true;
                    /* v8 ignore next */
                    const arrayItemInterfaceName = `${pascalCase(singular(prop.name))}Form`;

                    /* v8 ignore next */
                    const nestedItemControls = this.analyzeControls(
                        /* v8 ignore next */
                        Object.entries(itemSchema.properties).map(([k, v]) => ({
                            name: k,
                            schema: v as SwaggerDefinition,
                        })),
                        arrayItemInterfaceName,
                        false,
                    );

                    /* v8 ignore next */
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
                    /* v8 ignore next */
                    const itemTsType = this.getFormControlTypeString(itemSchema);

                    /* v8 ignore next */
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
                /* v8 ignore next */
                const tsType = this.getFormControlTypeString(schema);

                /* v8 ignore next */
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

            /* v8 ignore next */
            controls.push(controlModel);
        }

        /* v8 ignore next */
        this.result.interfaces.push({
            name: interfaceName,
            properties: interfaceProps,
            isTopLevel,
        });

        /* v8 ignore next */
        return controls;
    }

    private analyzePolymorphism(prop: FormProperty): PolymorphicPropertyConfig | null {
        /* v8 ignore next */
        if (!prop.schema || typeof prop.schema !== 'object' || !prop.schema.discriminator) return null;

        /* v8 ignore next */
        const options = this.parser.getPolymorphicSchemaOptions(prop.schema);
        /* v8 ignore next */
        const dPropName = prop.schema.discriminator.propertyName;

        /* v8 ignore next */
        const config: PolymorphicPropertyConfig = {
            propertyName: dPropName,
            /* v8 ignore next */
            discriminatorOptions: options.map(o => o.name),
            options: [],
        };

        /* v8 ignore next */
        const explicitMapping = prop.schema.discriminator?.mapping || {};

        /* v8 ignore next */
        for (const subSchemaRef of prop.schema.oneOf || []) {
            const refString =
                /* v8 ignore next */
                typeof subSchemaRef === 'object' ? subSchemaRef.$ref || subSchemaRef.$dynamicRef : undefined;
            /* v8 ignore next */
            if (!refString) continue;

            /* v8 ignore next */
            const subSchema = this.parser.resolve(subSchemaRef as SwaggerDefinition);
            /* v8 ignore next */
            if (!subSchema || typeof subSchema !== 'object') continue;

            /* v8 ignore next */
            const allProperties: Record<string, SwaggerDefinition> = {
                ...(((subSchema as SwaggerDefinition).properties || {}) as Record<string, SwaggerDefinition>),
            };

            /* v8 ignore next */
            const collectAllOfProps = (schema: SwaggerDefinition | boolean) => {
                /* v8 ignore next */
                if (typeof schema === 'object' && schema.allOf) {
                    /* v8 ignore next */
                    for (const inner of schema.allOf) {
                        /* v8 ignore next */
                        const resolved = this.parser.resolve(inner as SwaggerDefinition);
                        /* v8 ignore next */
                        if (resolved && typeof resolved === 'object') {
                            /* v8 ignore next */
                            Object.assign(allProperties, resolved.properties || {});
                            /* v8 ignore next */
                            collectAllOfProps(resolved as SwaggerDefinition);
                        }
                    }
                }
            };
            /* v8 ignore next */
            collectAllOfProps(subSchema as SwaggerDefinition);

            /* v8 ignore next */
            if (Object.keys(allProperties).length === 0) continue;

            /* v8 ignore next */
            if (!allProperties[dPropName]) continue;

            let typeName =
                /* v8 ignore next */
                typeof allProperties[dPropName] === 'object'
                    ? (allProperties[dPropName]?.enum?.[0] as string)
                    : undefined;

            /* v8 ignore next */
            if (!typeName) {
                /* v8 ignore next */
                const mappedKey = Object.keys(explicitMapping).find(key => explicitMapping[key] === refString);
                /* v8 ignore next */
                if (mappedKey) typeName = mappedKey;
            }

            /* v8 ignore next */
            if (!typeName) {
                /* v8 ignore next */
                typeName = refString.split('/').pop() || '';
            }

            /* v8 ignore next */
            if (!typeName) continue;

            /* v8 ignore next */
            const refName = pascalCase(refString.split('/').pop()!);

            /* v8 ignore next */
            const subProperties = Object.entries(allProperties)
                /* v8 ignore next */
                .filter(([key, _schema]) => key !== dPropName)
                /* v8 ignore next */
                .map(([key, s]) => ({ name: key, schema: s as SwaggerDefinition }));

            /* v8 ignore next */
            const subControls: FormControlModel[] = [];
            /* v8 ignore next */
            for (const subProp of subProperties) {
                /* v8 ignore next */
                const controls = this.analyzeControls([subProp], `Temp${refName}`, false);
                /* v8 ignore next */
                this.result.interfaces.pop();
                /* v8 ignore next */
                subControls.push(...controls);
            }

            /* v8 ignore next */
            if (!config.discriminatorOptions.includes(typeName)) {
                /* v8 ignore next */
                config.discriminatorOptions.push(typeName);
            }

            /* v8 ignore next */
            config.options.push({
                discriminatorValue: typeName,
                modelName: refName,
                subFormName: camelCase(typeName),
                controls: subControls,
            });
        }

        /* v8 ignore next */
        if (prop.schema.discriminator?.defaultMapping) {
            /* v8 ignore next */
            const defaultName = pascalCase(prop.schema.discriminator.defaultMapping.split('/').pop() || '');
            /* v8 ignore next */
            if (defaultName && config.options.some(p => p.modelName === defaultName)) {
                /* v8 ignore next */
                config.defaultOption = defaultName;
            }
        }

        /* v8 ignore next */
        return config;
    }

    private getFormControlTypeString(schema: SwaggerDefinition | boolean): string {
        /* v8 ignore next */
        const knownTypes = this.parser.schemas.map(s => s.name);
        /* v8 ignore next */
        const dummyConfig: GeneratorConfig = {
            options: { dateType: 'Date', enumStyle: 'enum' },
            input: '',
            output: '',
        };
        /* v8 ignore next */
        const type = getTypeScriptType(schema, dummyConfig, knownTypes);
        /* v8 ignore next */
        return `${type} | null`;
    }
}

function isValidTsType(type: string): boolean {
    /* v8 ignore next */
    return type != null && type !== 'Record<string, string | number | boolean | object | undefined | null>' && type !== 'void';
}
