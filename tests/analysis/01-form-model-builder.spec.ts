// tests/analysis/01-form-model-builder.spec.ts

import { describe, expect, it, vi } from 'vitest';
import { FormModelBuilder } from '@src/vendors/angular/admin/analysis/form-model.builder.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { GeneratorConfig, Resource } from '@src/core/types/index.js';

describe('Analysis: FormModelBuilder', () => {
    // type-coverage:ignore-next-line
    const setup = (spec: any, resourceName = 'TestResource') => {
        const config: GeneratorConfig = { input: '', output: '', options: {} };
        const parser = new SwaggerParser(spec, config);
        const builder = new FormModelBuilder(parser);
        // type-coverage:ignore-next-line
        const mainSchema = spec.components.schemas[resourceName];

        const resource: Resource = {
            name: resourceName.toLowerCase(),
            modelName: resourceName,
            isEditable: true,
            operations: [],
            // type-coverage:ignore-next-line
            formProperties: Object.entries(mainSchema.properties || {}).map(([name, schema]) => ({
                name,
                // type-coverage:ignore-next-line
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

    it('should carry nestedFormInterface for map value objects', () => {
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
                                additionalProperties: {
                                    type: 'object',
                                    properties: {
                                        value: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };
        const { builder, resource } = setup(spec);
        const result = builder.build(resource);
        const mapControl = result.topLevelControls.find(c => c.name === 'meta');

        expect(mapControl?.controlType).toBe('map');
        expect(mapControl?.nestedFormInterface).toBeDefined();
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

    it('should extract keyPattern and length constraints from propertyNames when patternProperties are absent', () => {
        const spec = {
            openapi: '3.1.0',
            info: { title: 'Property Names Map', version: '1.0' },
            components: {
                schemas: {
                    TestResource: {
                        type: 'object',
                        properties: {
                            headerMap: {
                                type: 'object',
                                propertyNames: { pattern: '^x-', minLength: 2, maxLength: 10 },
                                additionalProperties: { type: 'string' },
                            },
                        },
                    },
                },
            },
        };
        const { builder, resource } = setup(spec);
        const result = builder.build(resource);

        const mapControl = result.topLevelControls.find(c => c.name === 'headerMap');
        expect(mapControl).toBeDefined();
        expect(mapControl?.controlType).toBe('map');
        expect(mapControl?.keyPattern).toBe('^x-');
        expect(mapControl?.keyMinLength).toBe(2);
        expect(mapControl?.keyMaxLength).toBe(10);
        expect(mapControl?.mapValueControl?.dataType).toContain('string');
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

    it('should extract dependentRequired logic into dependencyRules', () => {
        const spec = {
            openapi: '3.1.0',
            info: { title: 'Deps', version: '1.0' },
            components: {
                schemas: {
                    TestResource: {
                        type: 'object',
                        properties: {
                            hasPhone: { type: 'boolean' },
                            phoneNumber: { type: 'string' },
                            phoneExtension: { type: 'string' },
                        },
                        dependentRequired: {
                            hasPhone: ['phoneNumber', 'phoneExtension'],
                        },
                    },
                },
            },
        };

        const { builder, resource } = setup(spec);
        const result = builder.build(resource);

        const rules = result.dependencyRules.filter(r => r.triggerField === 'hasPhone');
        expect(rules.length).toBe(2);
        expect(rules.some(r => r.targetField === 'phoneNumber')).toBe(true);
        expect(rules.some(r => r.targetField === 'phoneExtension')).toBe(true);
        expect(rules[0].type).toBe('required');
    });

    it('should not error when dependentSchemas includes properties', () => {
        const spec = {
            openapi: '3.1.0',
            info: { title: 'Deps', version: '1.0' },
            components: {
                schemas: {
                    TestResource: {
                        type: 'object',
                        properties: {
                            flag: { type: 'string' },
                        },
                        dependentSchemas: {
                            flag: {
                                required: ['flag'],
                                properties: { extra: { type: 'string' } },
                            },
                        },
                    },
                },
            },
        };
        const { builder, resource } = setup(spec);
        const result = builder.build(resource);
        expect(result.dependencyRules.length).toBe(1);
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

    it('should set usesCustomValidators flag for contains rules', () => {
        const spec = {
            openapi: '3.1.0',
            info: { title: 'Test', version: '1.0' },
            components: {
                schemas: {
                    TestResource: {
                        type: 'object',
                        properties: {
                            tags: {
                                type: 'array',
                                contains: { type: 'string' },
                                minContains: 1,
                            },
                        },
                    },
                },
            },
        };
        const { builder, resource } = setup(spec);
        const result = builder.build(resource);
        expect(result.usesCustomValidators).toBe(true);
    });

    it('should set usesCustomValidators flag for const rules', () => {
        const spec = {
            openapi: '3.1.0',
            info: { title: 'Test', version: '1.0' },
            components: {
                schemas: {
                    TestResource: {
                        type: 'object',
                        properties: {
                            status: { type: 'string', const: 'active' },
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
                                properties: { type: { type: 'string' } },
                                required: ['type'],
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
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
                                properties: { type: { type: 'string' } },
                                required: ['type'],
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
        warnSpy.mockRestore();
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

    it('should skip adding polymorphic config when analyzer returns null', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            components: {
                schemas: {
                    TestResource: {
                        type: 'object',
                        properties: {
                            poly: {
                                oneOf: [{ $ref: '#/components/schemas/Sub' }],
                                discriminator: { propertyName: 'type' },
                                properties: { type: { type: 'string' } },
                                required: ['type'],
                            },
                        },
                    },
                    Sub: {
                        type: 'object',
                        properties: { type: { type: 'string', enum: ['sub'] } },
                    },
                },
            },
        };
        const { builder, resource } = setup(spec);
        vi.spyOn(builder as any, 'analyzePolymorphism').mockReturnValue(null);
        const result = builder.build(resource);

        expect(result.isPolymorphic).toBe(true);
        expect(result.polymorphicProperties).toHaveLength(0);
    });

    it('should return early when dependentSchemas is missing', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            components: {
                schemas: {
                    TestResource: { type: 'object', properties: {} },
                },
            },
        };
        const { builder } = setup(spec);
        // type-coverage:ignore-next-line
        (builder as any).analyzeDependentSchemas({ type: 'object' });
        // type-coverage:ignore-next-line
        expect((builder as any).result.dependencyRules).toEqual([]);
    });

    it('should ignore dependentSchemas when ref cannot be resolved', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            components: {
                schemas: {
                    TestResource: { type: 'object', properties: {} },
                },
            },
        };
        const { builder } = setup(spec);
        // type-coverage:ignore-next-line
        (builder as any).analyzeDependentSchemas({
            dependentSchemas: {
                missing: { $ref: '#/components/schemas/DoesNotExist' },
            },
        });
        // type-coverage:ignore-next-line
        expect((builder as any).result.dependencyRules).toEqual([]);
        warnSpy.mockRestore();
    });

    it('should ignore dependentSchemas without required fields', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            components: {
                schemas: {
                    TestResource: { type: 'object', properties: {} },
                },
            },
        };
        const { builder } = setup(spec);
        // type-coverage:ignore-next-line
        (builder as any).analyzeDependentSchemas({
            dependentSchemas: {
                flag: { properties: { extra: { type: 'string' } } },
            },
        });
        // type-coverage:ignore-next-line
        expect((builder as any).result.dependencyRules).toEqual([]);
    });

    it('should return null when analyzePolymorphism receives schema without discriminator', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            components: {
                schemas: {
                    TestResource: { type: 'object', properties: {} },
                },
            },
        };
        const { builder } = setup(spec);
        // type-coverage:ignore-next-line
        const result = (builder as any).analyzePolymorphism({
            name: 'poly',
            schema: { oneOf: [{ type: 'string' }] },
        });
        // type-coverage:ignore-next-line
        expect(result).toBeNull();
    });

    it('should handle discriminator-only schemas without oneOf', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            components: {
                schemas: {
                    TestResource: { type: 'object', properties: {} },
                },
            },
        };
        const { builder } = setup(spec);
        // type-coverage:ignore-next-line
        const config = (builder as any).analyzePolymorphism({
            name: 'poly',
            schema: { discriminator: { propertyName: 'type' } },
        });
        // type-coverage:ignore-next-line
        expect(config).toBeDefined();
        // type-coverage:ignore-next-line
        expect(config.options).toEqual([]);
        // type-coverage:ignore-next-line
        expect(config.discriminatorOptions).toEqual([]);
    });

    it('should use discriminator mapping when explicit mapping is present', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            components: {
                schemas: {
                    Poly: {
                        oneOf: [{ $ref: '#/components/schemas/Sub' }],
                        properties: { type: { type: 'string' } },
                        required: ['type'],
                        discriminator: {
                            propertyName: 'type',
                            mapping: { mapped: '#/components/schemas/Sub' },
                        },
                    },
                    Sub: {
                        type: 'object',
                        properties: { type: { type: 'string' }, name: { type: 'string' } },
                        allOf: [{ $ref: '#/components/schemas/Missing' }],
                    },
                },
            },
        };
        const { builder } = setup(spec, 'Poly');
        // type-coverage:ignore-next-line
        const config = (builder as any).analyzePolymorphism({
            name: 'poly',
            schema: spec.components.schemas.Poly,
        });
        // type-coverage:ignore-next-line
        expect(config.options[0].discriminatorValue).toBe('mapped');
        warnSpy.mockRestore();
    });

    it('should handle map schemas with empty patternProperties and unevaluatedProperties', () => {
        const spec = {
            openapi: '3.1.0',
            info: { title: 'Map', version: '1.0' },
            components: {
                schemas: {
                    TestResource: {
                        type: 'object',
                        properties: {
                            prefixed: {
                                type: 'object',
                                patternProperties: {},
                                additionalProperties: { type: 'string' },
                            },
                            unevaluated: {
                                type: 'object',
                                unevaluatedProperties: { type: 'integer' },
                            },
                        },
                    },
                },
            },
        };
        const { builder, resource } = setup(spec);
        const result = builder.build(resource);

        const prefixed = result.topLevelControls.find(c => c.name === 'prefixed');
        expect(prefixed?.controlType).toBe('map');
        expect(prefixed?.keyPattern).toBeUndefined();

        const unevaluated = result.topLevelControls.find(c => c.name === 'unevaluated');
        expect(unevaluated?.controlType).toBe('map');
        expect(unevaluated?.mapValueControl?.dataType).toContain('number');
    });

    it('should fall back to Record<string, any> for invalid map value types', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Map', version: '1.0' },
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
        // type-coverage:ignore-next-line
        (builder as any).getFormControlTypeString = () => 'any';
        const result = builder.build(resource);
        const mapControl = result.topLevelControls.find(c => c.name === 'meta');

        expect(mapControl?.dataType).toBe('Record<string, any>');
    });

    it('should handle boolean additionalProperties fallback to empty schema', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Map', version: '1.0' },
            components: {
                schemas: {
                    TestResource: {
                        type: 'object',
                        properties: {
                            loose: {
                                type: 'object',
                                additionalProperties: true,
                                unevaluatedProperties: false,
                            },
                        },
                    },
                },
            },
        };
        const { builder, resource } = setup(spec);
        const result = builder.build(resource);
        const mapControl = result.topLevelControls.find(c => c.name === 'loose');
        expect(mapControl?.controlType).toBe('map');
    });

    it('should include properties from resolvable allOf schemas in polymorphism', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Poly', version: '1.0' },
            components: {
                schemas: {
                    Poly: {
                        oneOf: [{ $ref: '#/components/schemas/Sub' }],
                        discriminator: { propertyName: 'type' },
                        properties: { type: { type: 'string' } },
                        required: ['type'],
                    },
                    Base: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                        },
                    },
                    Sub: {
                        allOf: [{ $ref: '#/components/schemas/Base' }],
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['sub'] },
                        },
                    },
                },
            },
        };
        const { builder } = setup(spec, 'Poly');
        // type-coverage:ignore-next-line
        const config = (builder as any).analyzePolymorphism({
            name: 'poly',
            schema: spec.components.schemas.Poly,
        });
        // type-coverage:ignore-next-line
        expect(config.options[0].controls.some((c: any) => c.name === 'name')).toBe(true);
    });

    it('should handle allOf schemas without properties during polymorphism analysis', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Poly', version: '1.0' },
            components: {
                schemas: {
                    Poly: {
                        oneOf: [{ $ref: '#/components/schemas/Sub' }],
                        discriminator: { propertyName: 'type' },
                        properties: { type: { type: 'string' } },
                        required: ['type'],
                    },
                    Empty: {
                        type: 'object',
                    },
                    Sub: {
                        allOf: [
                            { $ref: '#/components/schemas/Empty' },
                            {
                                type: 'object',
                                properties: { type: { type: 'string', enum: ['sub'] }, name: { type: 'string' } },
                            },
                        ],
                    },
                },
            },
        };
        const { builder } = setup(spec, 'Poly');
        // type-coverage:ignore-next-line
        const config = (builder as any).analyzePolymorphism({
            name: 'poly',
            schema: spec.components.schemas.Poly,
        });
        // type-coverage:ignore-next-line
        expect(config.options[0].controls.some((c: any) => c.name === 'name')).toBe(true);
    });

    it('should not set defaultOption when defaultMapping does not match any option', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Poly', version: '1.0' },
            components: {
                schemas: {
                    Poly: {
                        oneOf: [{ $ref: '#/components/schemas/Sub' }],
                        discriminator: { propertyName: 'type', defaultMapping: '#/components/schemas/Missing' },
                    },
                    Sub: {
                        type: 'object',
                        properties: { type: { type: 'string', enum: ['sub'] } },
                    },
                },
            },
        };
        const { builder } = setup(spec, 'Poly');
        // type-coverage:ignore-next-line
        const config = (builder as any).analyzePolymorphism({
            name: 'poly',
            schema: spec.components.schemas.Poly,
        });
        // type-coverage:ignore-next-line
        expect(config.defaultOption).toBeUndefined();
    });

    it('should skip unresolved allOf refs when collecting polymorphic properties', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Poly', version: '1.0' },
            components: {
                schemas: {
                    Poly: {
                        oneOf: [{ $ref: '#/components/schemas/Sub' }],
                        discriminator: { propertyName: 'type' },
                        properties: { type: { type: 'string' } },
                        required: ['type'],
                    },
                    Sub: {
                        allOf: [
                            { $ref: '#/components/schemas/Missing' },
                            {
                                type: 'object',
                                properties: { type: { type: 'string', enum: ['sub'] }, name: { type: 'string' } },
                            },
                        ],
                    },
                },
            },
        };
        const { builder } = setup(spec, 'Poly');
        // type-coverage:ignore-next-line
        const config = (builder as any).analyzePolymorphism({
            name: 'poly',
            schema: spec.components.schemas.Poly,
        });
        // type-coverage:ignore-next-line
        expect(config.options[0].controls.some((c: any) => c.name === 'name')).toBe(true);
        warnSpy.mockRestore();
    });

    it('should handle defaultMapping with empty ref segment gracefully', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Poly', version: '1.0' },
            components: {
                schemas: {
                    Poly: {
                        oneOf: [{ $ref: '#/components/schemas/Sub' }],
                        discriminator: { propertyName: 'type', defaultMapping: '#/components/schemas/' },
                    },
                    Sub: {
                        type: 'object',
                        properties: { type: { type: 'string', enum: ['sub'] } },
                    },
                },
            },
        };
        const { builder } = setup(spec, 'Poly');
        // type-coverage:ignore-next-line
        const config = (builder as any).analyzePolymorphism({
            name: 'poly',
            schema: spec.components.schemas.Poly,
        });
        // type-coverage:ignore-next-line
        expect(config.defaultOption).toBeUndefined();
    });

    it('should add discriminator option when parser options are empty', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            components: {
                schemas: {
                    Poly: {
                        oneOf: [{ $ref: '#/components/schemas/Sub' }],
                        discriminator: { propertyName: 'type' },
                        properties: { type: { type: 'string' } },
                        required: ['type'],
                    },
                    Sub: {
                        type: 'object',
                        properties: { type: { type: 'string', enum: ['sub'] }, name: { type: 'string' } },
                    },
                },
            },
        };
        const { builder, parser } = setup(spec, 'Poly');
        // type-coverage:ignore-next-line
        const prop = {
            name: 'poly',
            schema: spec.components.schemas.Poly,
        } as any;
        vi.spyOn(parser, 'getPolymorphicSchemaOptions').mockReturnValue([]);
        // type-coverage:ignore-next-line
        const config = (builder as any).analyzePolymorphism(prop);
        // type-coverage:ignore-next-line
        expect(config.discriminatorOptions).toContain('sub');
    });

    it('should fall back to ref name when discriminator value has no enum', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            components: {
                schemas: {
                    Poly: {
                        oneOf: [{ $ref: '#/components/schemas/Sub' }],
                        discriminator: { propertyName: 'type' },
                        properties: { type: { type: 'string' } },
                        required: ['type'],
                    },
                    Sub: {
                        type: 'object',
                        properties: { type: { type: 'string' }, name: { type: 'string' } },
                    },
                },
            },
        };
        const { builder } = setup(spec, 'Poly');
        // type-coverage:ignore-next-line
        const prop = { name: 'poly', schema: spec.components.schemas.Poly } as any;
        // type-coverage:ignore-next-line
        const config = (builder as any).analyzePolymorphism(prop);
        // type-coverage:ignore-next-line
        expect(config.options[0].discriminatorValue).toBe('Sub');
    });

    it('should skip polymorphic option when ref name is empty', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            components: {
                schemas: {
                    TestResource: { type: 'object', properties: {} },
                },
            },
        };
        const { builder, parser } = setup(spec);
        // type-coverage:ignore-next-line
        const prop = {
            name: 'poly',
            schema: {
                discriminator: { propertyName: 'type' },
                oneOf: [{ $ref: '/' }],
            },
        } as any;
        vi.spyOn(parser, 'resolve').mockReturnValue({
            type: 'object',
            properties: { type: { type: 'string' } },
        } as any);
        // type-coverage:ignore-next-line
        const config = (builder as any).analyzePolymorphism(prop);
        // type-coverage:ignore-next-line
        expect(config.options.length).toBe(0);
        warnSpy.mockRestore();
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
                                properties: { type: { type: 'string' } },
                                required: ['type'],
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

    it('should use unevaluatedItems when array items are absent', () => {
        const spec = {
            openapi: '3.1.0',
            info: { title: 'Array', version: '1.0' },
            components: {
                schemas: {
                    TestResource: {
                        type: 'object',
                        properties: {
                            tags: {
                                type: 'array',
                                unevaluatedItems: { type: 'string' },
                            },
                        },
                    },
                },
            },
        };

        const { builder, resource } = setup(spec);
        const result = builder.build(resource);
        const arrayControl = result.topLevelControls.find(c => c.name === 'tags');

        expect(arrayControl).toBeDefined();
        expect(arrayControl?.controlType).toBe('array');
        expect(arrayControl?.dataType).toContain('string');
    });
});
