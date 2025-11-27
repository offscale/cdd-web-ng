// tests/analysis/01-form-model-builder.spec.ts

import { describe, expect, it } from 'vitest';
import { FormModelBuilder } from '@src/analysis/form-model.builder.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, Resource } from '@src/core/types/index.js';

describe('Analysis: FormModelBuilder', () => {
    const setup = (spec: any, resourceName = 'TestResource') => {
        const config: GeneratorConfig = { input: '', output: '', options: {} };
        const parser = new SwaggerParser(spec, config);
        const builder = new FormModelBuilder(parser);
        const mainSchema = spec.components.schemas[resourceName];

        const resource: Resource = {
            name: resourceName.toLowerCase(),
            modelName: resourceName,
            isEditable: true,
            operations: [],
            formProperties: Object.entries(mainSchema.properties || {}).map(([name, schema]) => ({
                name,
                schema: schema as any,
            })),
            listProperties: [],
        };

        return { builder, resource, parser };
    };

    it('should set usesCustomValidators flag when schema contains exclusiveMinimum', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            components: {
                schemas: {
                    TestResource: {
                        type: 'object',
                        properties: {
                            value: { type: 'number', exclusiveMinimum: 10 },
                        },
                    },
                },
            },
        };
        const { builder, resource } = setup(spec);
        const result = builder.build(resource);
        expect(result.usesCustomValidators).toBe(true);
    });

    it('should detect Map/Dictionary types via additionalProperties', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            components: {
                schemas: {
                    TestResource: {
                        type: 'object',
                        properties: {
                            meta: {
                                type: 'object',
                                additionalProperties: { type: 'string' },
                            },
                        },
                    },
                },
            },
        };
        const { builder, resource } = setup(spec);
        const result = builder.build(resource);

        expect(result.hasMaps).toBe(true);
        const mapControl = result.topLevelControls.find(c => c.name === 'meta');
        expect(mapControl).toBeDefined();
        expect(mapControl!.controlType).toBe('map');
        // Value control check
        expect(mapControl!.mapValueControl).toBeDefined();
        expect(mapControl!.mapValueControl!.dataType).toContain('string');
    });

    it('should extract keyPattern from patternProperties for Map types', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Pattern Map', version: '1.0' },
            components: {
                schemas: {
                    TestResource: {
                        type: 'object',
                        properties: {
                            prefixedMap: {
                                type: 'object',
                                patternProperties: {
                                    '^X-': { type: 'integer' },
                                },
                            },
                        },
                    },
                },
            },
        };
        const { builder, resource } = setup(spec);
        const result = builder.build(resource);

        const mapControl = result.topLevelControls.find(c => c.name === 'prefixedMap');
        expect(mapControl).toBeDefined();
        expect(mapControl?.controlType).toBe('map');
        expect(mapControl?.keyPattern).toBe('^X-');
        expect(mapControl?.mapValueControl?.dataType).toContain('number');
    });

    it('should extract dependentSchemas logic into dependencyRules', () => {
        const spec = {
            openapi: '3.1.0',
            info: { title: 'Deps', version: '1.0' },
            components: {
                schemas: {
                    TestResource: {
                        type: 'object',
                        properties: {
                            creditCard: { type: 'string' },
                            cvv: { type: 'string' },
                            billingAddress: { type: 'string' },
                        },
                        dependentSchemas: {
                            creditCard: {
                                required: ['cvv', 'billingAddress'],
                            },
                        },
                    },
                },
            },
        };

        const { builder, resource } = setup(spec);
        const result = builder.build(resource);

        expect(result.dependencyRules.length).toBe(2);

        const rules = result.dependencyRules.filter(r => r.triggerField === 'creditCard');
        expect(rules.length).toBe(2);
        expect(rules.some(r => r.targetField === 'cvv')).toBe(true);
        expect(rules.some(r => r.targetField === 'billingAddress')).toBe(true);
        expect(rules[0].type).toBe('required');
    });

    it('should set usesCustomValidators flag for other custom rules like uniqueItems', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            components: {
                schemas: {
                    TestResource: {
                        type: 'object',
                        properties: {
                            tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
                        },
                    },
                },
            },
        };
        const { builder, resource } = setup(spec);
        const result = builder.build(resource);
        expect(result.usesCustomValidators).toBe(true);
    });

    it('should handle polymorphic oneOf referencing only primitive types', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            components: {
                schemas: {
                    TestResource: {
                        type: 'object',
                        properties: {
                            value: {
                                description: 'Polymorphic primitive value',
                                oneOf: [{ type: 'string' }, { type: 'number' }],
                                discriminator: { propertyName: 'type' },
                            },
                        },
                    },
                },
            },
        };
        const { builder, resource } = setup(spec);
        const result = builder.build(resource);

        expect(result.isPolymorphic).toBe(true);
        // It detects polymorphism but generates no sub-form options because primitives have no properties.
        expect(result.polymorphicProperties.length).toBe(1);
        expect(result.polymorphicProperties[0].options).toEqual([]);
    });

    it('should gracefully skip invalid oneOf items during polymorphism analysis', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            components: {
                schemas: {
                    TestResource: {
                        type: 'object',
                        properties: {
                            poly: {
                                discriminator: { propertyName: 'type' },
                                oneOf: [
                                    // Case 1: Non-$ref item (will be skipped for having no $ref)
                                    { type: 'object', properties: { inlineProp: { type: 'string' } } },
                                    // Case 2: $ref to non-existent schema (will be skipped as unresolvable)
                                    { $ref: '#/components/schemas/NonExistent' },
                                    // Case 3: $ref to a schema with no properties (will be skipped by Object.keys().length check)
                                    { $ref: '#/components/schemas/EmptySchema' },
                                    // Case 4: $ref where discriminator property is missing (will be skipped via stricter property check)
                                    { $ref: '#/components/schemas/MissingDiscriminatorProp' },
                                    // Valid item that should be processed
                                    { $ref: '#/components/schemas/ValidSub' },
                                ],
                            },
                        },
                    },
                    EmptySchema: {
                        type: 'object',
                        // No properties
                    },
                    MissingDiscriminatorProp: {
                        type: 'object',
                        properties: {
                            anotherProp: { type: 'string' },
                        },
                    },
                    ValidSub: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['valid'] },
                            name: { type: 'string' },
                        },
                    },
                },
            },
        };

        const { builder, resource } = setup(spec);
        const result = builder.build(resource);

        expect(result.isPolymorphic).toBe(true);
        // Only the single valid sub-schema should be processed and added to the options.
        const polyConfig = result.polymorphicProperties[0];
        expect(polyConfig).toBeDefined();
        expect(polyConfig.options.length).toBe(1);
        expect(polyConfig.options[0].discriminatorValue).toBe('valid');
        expect(polyConfig.options[0].modelName).toBe('ValidSub');
    });

    it('should identify defaultOption when defaultMapping is present', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            components: {
                schemas: {
                    TestResource: {
                        type: 'object',
                        properties: {
                            poly: {
                                discriminator: {
                                    propertyName: 'type',
                                    defaultMapping: '#/components/schemas/DefaultSub',
                                },
                                oneOf: [
                                    { $ref: '#/components/schemas/DefaultSub' },
                                    { $ref: '#/components/schemas/OtherSub' },
                                ],
                            },
                        },
                    },
                    DefaultSub: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['default'] },
                            propA: { type: 'string' },
                        },
                    },
                    OtherSub: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['other'] },
                            propB: { type: 'string' },
                        },
                    },
                },
            },
        };

        const { builder, resource } = setup(spec);
        const result = builder.build(resource);

        expect(result.isPolymorphic).toBe(true);
        const config = result.polymorphicProperties[0];
        expect(config.defaultOption).toBe('DefaultSub');
        expect(config.options.length).toBe(2);
    });

    it('should support implicit discriminator mapping based on component name (OAS 3.2)', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Implicit Poly', version: '1.0' },
            components: {
                schemas: {
                    Transport: {
                        type: 'object',
                        properties: {
                            type: { type: 'string' }, // No enum defined here!
                            payload: {
                                oneOf: [{ $ref: '#/components/schemas/Car' }, { $ref: '#/components/schemas/Plane' }],
                                discriminator: { propertyName: 'type' },
                            },
                        },
                    },
                    Car: {
                        type: 'object',
                        // Car does implicitly map 'type' = 'Car' via component name
                        properties: {
                            type: { type: 'string' },
                            wheels: { type: 'number' },
                        },
                    },
                    Plane: {
                        type: 'object',
                        // Plane does implicitly map 'type' = 'Plane'
                        properties: {
                            type: { type: 'string' },
                            wings: { type: 'number' },
                        },
                    },
                },
            },
        };

        const { builder } = setup(spec, 'Transport'); // uses same setup util but will overwrite resource manually below since we need deep prop

        // Manually construct the resource property for 'payload' which targets the polymorphic schema
        const resource: Resource = {
            name: 'transport',
            modelName: 'Transport',
            isEditable: true,
            operations: [],
            formProperties: [
                {
                    name: 'payload',
                    schema: spec.components.schemas.Transport.properties.payload as any,
                },
            ],
            listProperties: [],
        };

        const result = builder.build(resource);

        expect(result.isPolymorphic).toBe(true);
        expect(result.polymorphicProperties[0].discriminatorOptions).toContain('Car');
        expect(result.polymorphicProperties[0].discriminatorOptions).toContain('Plane');

        const carOption = result.polymorphicProperties[0].options.find(o => o.modelName === 'Car');
        expect(carOption).toBeDefined();
        expect(carOption?.discriminatorValue).toBe('Car');

        // Ensure it actually processed the properties
        expect(carOption?.controls.some(c => c.name === 'wheels')).toBe(true);
        expect(carOption?.subFormName).toBe('car'); // camelCase check
    });
});
