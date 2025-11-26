import { beforeEach, describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, Resource, SwaggerDefinition } from '@src/core/types/index.js';
import { FormModelBuilder } from '@src/analysis/form-model.builder.js';
import { FormComponentGenerator } from '@src/generators/angular/admin/form-component.generator.js';
import { branchCoverageSpec } from '../fixtures/coverage.fixture.js';

describe('Generators (Angular): FormComponentGenerator', () => {
    let project: Project;
    let config: GeneratorConfig;
    const validBase = { openapi: '3.0.0', info: { title: 'Test', version: '1.0' } };

    const run = (spec: any, resourceOverrides: Partial<Resource> = {}) => {
        const parser = new SwaggerParser(spec, config);

        // Basic resource extraction simulation
        const schemaName = resourceOverrides.modelName || 'Test';
        const mainSchema = spec.components?.schemas?.[schemaName] || spec.components?.schemas?.Test;

        // We need to simulate the behavior of discovery:
        // 1. Denormalize 'required' fields from parent to child schemas
        // 2. Resolve references so the builder sees the real schema content
        const formProps = resourceOverrides.formProperties ||
            Object.entries(mainSchema?.properties || {}).map(([name, schema]) => {
                let s = schema as SwaggerDefinition;

                // Resolve Ref if needed
                if (s.$ref) {
                    const resolved = parser.resolve(s);
                    if (resolved) {
                        s = { ...s, ...resolved };
                    }
                }

                // Denormalize Required
                if (mainSchema.required && mainSchema.required.includes(name)) {
                    // Note: The analyzer expects 'required' to be present/truthy on the schema object
                    return { name, schema: { ...s, required: [name] } };
                }
                return { name, schema: s };
            });

        const resource: Resource = {
            name: 'test',
            modelName: schemaName,
            isEditable: true,
            operations: [],
            formProperties: formProps as any[],
            listProperties: [],
            ...resourceOverrides
        };

        const generator = new FormComponentGenerator(project, parser);
        generator.generate(resource, '/admin');

        // Use the builder just to return the view model for some tests inspections validity
        const builder = new FormModelBuilder(parser);
        const viewModel = builder.build(resource);

        const rName = resourceOverrides.name || 'test';
        const filePath = `/admin/${rName}/${rName}-form/${rName}-form.component.ts`;
        return { sourceFile: project.getSourceFileOrThrow(filePath), viewModel };
    };

    beforeEach(() => {
        project = new Project({ useInMemoryFileSystem: true });
        config = { input: '', output: '', options: {} };
    });

    describe('Standard Form Generation', () => {
        it('should handle a simple form with basic properties and typed controls', () => {
            const spec = {
                ...validBase,
                paths: {},
                components: {
                    schemas: {
                        Test: {
                            type: 'object',
                            required: ['name', 'age'],
                            properties: {
                                name: { type: 'string' },
                                age: { type: 'integer' }
                            }
                        }
                    }
                }
            };
            const { sourceFile } = run(spec);
            const classText = sourceFile.getClass('TestFormComponent')?.getText()!;

            // Updated expectations for new FormControl syntax used by generator
            expect(classText).toContain(`'name': new FormControl<string | null>(null, [Validators.required])`);
            expect(classText).toContain(`'age': new FormControl<number | null>(null, [Validators.required])`);
        });

        it('should generate Map helpers for additionalProperties', () => {
            const spec = {
                ...validBase,
                components: {
                    schemas: {
                        Test: {
                            type: 'object',
                            properties: {
                                settings: {
                                    type: 'object',
                                    additionalProperties: { type: 'boolean' }
                                }
                            }
                        }
                    }
                }
            };
            const { sourceFile } = run(spec);
            const classText = sourceFile.getClass('TestFormComponent')?.getText()!;

            // Has helpers
            expect(classText).toContain('get settingsMap()');
            expect(classText).toContain('createSettingsEntry()');
            expect(classText).toContain('addSettingsEntry()');
            expect(classText).toContain('removeSettingsEntry(index');

            // Has Patch Logic for Maps
            expect(classText).toContain("if (entity.settings && typeof entity.settings === 'object')");
            expect(classText).toContain("this.settingsMap.push(this.createSettingsEntry({ key, value }));");

            // Has Payload logic for Maps
            // FIXED: Now using `payload` variable due to readOnly stripping hygiene
            expect(classText).toContain("if (Array.isArray(payload['settings']))");
            expect(classText).toContain("payload['settings'].forEach((pair: any)");
        });

        it('should handle properties with defaults', () => {
            const spec = {
                ...validBase,
                paths: {},
                components: {
                    schemas: {
                        Test: {
                            type: 'object',
                            required: ['role'],
                            properties: {
                                role: { type: 'string', default: 'user' }
                            }
                        }
                    }
                }
            };

            const { sourceFile } = run(spec);
            const classText = sourceFile.getClass('TestFormComponent')?.getText()!;
            // Generator outputs default value in constructor
            expect(classText).toContain(`'role': new FormControl<string | null>("user", [Validators.required])`);
        });

        it('should include readOnly properties in form group but disable them', () => {
            const spec = {
                ...validBase,
                paths: {},
                components: {
                    schemas: {
                        Test: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', readOnly: true }
                            }
                        }
                    }
                }
            };
            const { sourceFile } = run(spec);
            const classText = sourceFile.getClass('TestFormComponent')?.getText()!;

            expect(classText).toContain(`'id':`);
            expect(classText).toContain(`this.form.get('id')?.disable({ emitEvent: false });`);
        });

        it('should handle oneOf with ONLY primitive types', () => {
            const spec = {
                ...validBase,
                paths: {},
                components: {
                    schemas: {
                        Poly: {
                            type: 'object',
                            properties: {
                                value: {
                                    discriminator: { propertyName: 'type' },
                                    oneOf: [{ type: 'string' }, { type: 'number' }]
                                }
                            }
                        }
                    }
                },
            };
            const { sourceFile } = run(spec, {
                name: 'poly',
                modelName: 'Poly',
                formProperties: [{
                    name: 'value',
                    schema: spec.components.schemas.Poly.properties.value as SwaggerDefinition
                }]
            });
            const classText = sourceFile.getClass('PolyFormComponent')!.getText();

            // Use FormControl for simple unions, not addControl logic
            expect(classText).toContain(`'value': new FormControl<string | number | null>(null)`);
        });
    });

    describe('Polymorphic (oneOf) Form Generation', () => {
        it('should create dynamic form controls for a polymorphic property', () => {
            const spec = {
                ...validBase,
                paths: {},
                components: {
                    schemas: {
                        ...branchCoverageSpec.components.schemas,
                        Test: {
                            type: 'object',
                            properties: {
                                polymorphicProp: {
                                    $ref: '#/components/schemas/PolyReadonly'
                                }
                            }
                        }
                    }
                },
            };

            // Run with automatic resolution in helper
            const { sourceFile } = run(spec, { modelName: 'Test' });
            const classText = sourceFile.getClass('TestFormComponent')!.getText();

            // Expect logic switching on the discriminator property
            // The discriminator property name inside PolyReadonly is 'petType'
            // So we expect updateFormForPetType
            expect(classText).toContain('updateFormForPetType');
        });
    });

    describe('Dependent Schemas Form Generation', () => {
        it('should create effect for conditional validation based on dependentSchemas', () => {
            const spec = {
                ...validBase,
                paths: {},
                components: {
                    schemas: {
                        Test: {
                            type: 'object',
                            properties: {
                                hasPhone: { type: 'boolean' },
                                phoneNumber: { type: 'string' }
                            },
                            dependentSchemas: {
                                hasPhone: {
                                    required: ['phoneNumber']
                                }
                            }
                        }
                    }
                }
            };

            const { sourceFile } = run(spec, { modelName: 'Test' });
            const classText = sourceFile.getClass('TestFormComponent')!.getText();

            // Expect dependent schema effect block in constructor (which is where effects live)
            expect(classText).toContain('effect(() => {');
            expect(classText).toContain("const hasPhoneValue = this.form.get('hasPhone')?.value;");
            expect(classText).toContain("if (hasPhoneValue !== null && hasPhoneValue !== undefined && hasPhoneValue !== '')");
            expect(classText).toContain("this.form.get('phoneNumber')?.addValidators(Validators.required);");
            expect(classText).toContain("this.form.get('phoneNumber')?.removeValidators(Validators.required);");
        });
    });

    it('should generate imports for custom validation functions', () => {
        // Modify spec to force a custom validator utilization
        const spec = {
            ...validBase,
            paths: {},
            components: {
                schemas: {
                    WithUnsupported: {
                        type: 'object',
                        properties: {
                            // 'multipleOf' triggers CustomValidators
                            value: { type: 'number', multipleOf: 10 }
                        }
                    }
                }
            }
        };

        const { sourceFile } = run(spec, {
            name: 'withUnsupported',
            modelName: 'WithUnsupported'
        });

        const importDecls = sourceFile.getImportDeclarations().map(d => d.getModuleSpecifierValue());
        // With current relative path structure, this should point to shared folder
        expect(importDecls).toContain('../../shared/custom-validators');
    });
});
