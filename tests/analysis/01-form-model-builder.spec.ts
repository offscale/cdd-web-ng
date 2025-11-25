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
                schema: schema as any
            })),
            listProperties: []
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
                                description: "Polymorphic primitive value",
                                oneOf: [{ type: 'string' }, { type: 'number' }],
                                discriminator: { propertyName: 'type' }
                            }
                        }
                    }
                }
            }
        };
        const { builder, resource } = setup(spec);
        const result = builder.build(resource);

        expect(result.isPolymorphic).toBe(true);
        // It detects polymorphism but generates no sub-form options because primitives have no properties.
        expect(result.polymorphicOptions).toEqual([]);
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
                                    // Case 4: $ref where discriminator property is missing (will be skipped)
                                    { $ref: '#/components/schemas/MissingDiscriminatorProp' },
                                    // Valid item that should be processed
                                    { $ref: '#/components/schemas/ValidSub' }
                                ]
                            }
                        }
                    },
                    EmptySchema: {
                        type: 'object'
                        // No properties
                    },
                    MissingDiscriminatorProp: {
                        type: 'object',
                        properties: {
                            anotherProp: { type: 'string' }
                        }
                    },
                    ValidSub: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['valid'] },
                            name: { type: 'string' }
                        }
                    }
                }
            }
        };

        const { builder, resource } = setup(spec);
        const result = builder.build(resource);

        expect(result.isPolymorphic).toBe(true);
        // Only the single valid sub-schema should be processed and added to the options.
        expect(result.polymorphicOptions).toBeDefined();
        expect(result.polymorphicOptions?.length).toBe(1);
        expect(result.polymorphicOptions?.[0].discriminatorValue).toBe('valid');
        expect(result.polymorphicOptions?.[0].modelName).toBe('ValidSub');
    });
});
