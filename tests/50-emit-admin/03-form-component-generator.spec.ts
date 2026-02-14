import { beforeEach, describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, Resource, SwaggerDefinition } from '@src/core/types/index.js';
import { FormAnalysisResult, FormControlModel } from '@src/analysis/form-types.js';
import { FormModelBuilder } from '@src/analysis/form-model.builder.js';
import { FormComponentGenerator } from '@src/generators/angular/admin/form-component.generator.js';

import { branchCoverageSpec } from '../fixtures/coverage.fixture.js';

describe('Generators (Angular): FormComponentGenerator', () => {
    let project: Project;
    let config: GeneratorConfig;
    const validBase = { openapi: '3.0.0', info: { title: 'Test', version: '1.0' }, paths: {} };

    const run = (spec: any, resourceOverrides: Partial<Resource> = {}) => {
        const parser = new SwaggerParser(spec, config);

        // Basic resource extraction simulation
        const schemaName = resourceOverrides.modelName || 'Test';
        const mainSchema = spec.components?.schemas?.[schemaName] || spec.components?.schemas?.Test;

        // We need to simulate the behavior of discovery:
        // 1. Denormalize 'required' fields from parent to child schemas
        // 2. Resolve references so the builder sees the real schema content
        const formProps =
            resourceOverrides.formProperties ||
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
            ...resourceOverrides,
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
                                age: { type: 'integer' },
                            },
                        },
                    },
                },
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
                                    additionalProperties: { type: 'boolean' },
                                },
                            },
                        },
                    },
                },
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
            expect(classText).toContain('this.settingsMap.push(this.createSettingsEntry({ key, value }));');

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
                                role: { type: 'string', default: 'user' },
                            },
                        },
                    },
                },
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
                                id: { type: 'string', readOnly: true },
                            },
                        },
                    },
                },
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
                                    oneOf: [{ type: 'string' }, { type: 'number' }],
                                },
                            },
                        },
                    },
                },
            };
            const { sourceFile } = run(spec, {
                name: 'poly',
                modelName: 'Poly',
                formProperties: [
                    {
                        name: 'value',
                        schema: spec.components.schemas.Poly.properties.value as SwaggerDefinition,
                    },
                ],
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
                                    $ref: '#/components/schemas/PolyReadonly',
                                },
                            },
                        },
                    },
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
                                phoneNumber: { type: 'string' },
                            },
                            dependentSchemas: {
                                hasPhone: {
                                    required: ['phoneNumber'],
                                },
                            },
                        },
                    },
                },
            };

            const { sourceFile } = run(spec, { modelName: 'Test' });
            const classText = sourceFile.getClass('TestFormComponent')!.getText();

            // Expect dependent schema effect block in constructor (which is where effects live)
            expect(classText).toContain('effect(() => {');
            expect(classText).toContain("const hasPhoneValue = this.form.get('hasPhone')?.value;");
            expect(classText).toContain(
                "if (hasPhoneValue !== null && hasPhoneValue !== undefined && hasPhoneValue !== '')",
            );
            expect(classText).toContain("this.form.get('phoneNumber')?.addValidators(Validators.required);");
            expect(classText).toContain("this.form.get('phoneNumber')?.removeValidators(Validators.required);");
        });

        it('should create effect for conditional validation based on dependentRequired', () => {
            const spec = {
                ...validBase,
                paths: {},
                components: {
                    schemas: {
                        Test: {
                            type: 'object',
                            properties: {
                                hasEmail: { type: 'boolean' },
                                emailAddress: { type: 'string' },
                            },
                            dependentRequired: {
                                hasEmail: ['emailAddress'],
                            },
                        },
                    },
                },
            };

            const { sourceFile } = run(spec, { modelName: 'Test' });
            const classText = sourceFile.getClass('TestFormComponent')!.getText();

            expect(classText).toContain('effect(() => {');
            expect(classText).toContain("const hasEmailValue = this.form.get('hasEmail')?.value;");
            expect(classText).toContain(
                "if (hasEmailValue !== null && hasEmailValue !== undefined && hasEmailValue !== '')",
            );
            expect(classText).toContain("this.form.get('emailAddress')?.addValidators(Validators.required);");
            expect(classText).toContain("this.form.get('emailAddress')?.removeValidators(Validators.required);");
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
                            value: { type: 'number', multipleOf: 10 },
                        },
                    },
                },
            },
        };

        const { sourceFile } = run(spec, {
            name: 'withUnsupported',
            modelName: 'WithUnsupported',
        });

        const importDecls = sourceFile.getImportDeclarations().map(d => d.getModuleSpecifierValue());
        // With current relative path structure, this should point to shared folder
        expect(importDecls).toContain('../../shared/custom-validators');
    });

    describe('Coverage: internal helpers', () => {
        it('should generate polymorphic form helpers with enum dedupe and map branches', () => {
            const parser = new SwaggerParser(validBase as any, config);
            const generator = new FormComponentGenerator(project, parser);

            const arrayItemControl: FormControlModel = {
                name: 'itemName',
                propertyName: 'itemName',
                dataType: 'string | null',
                defaultValue: null,
                validationRules: [],
                controlType: 'control',
                schema: { type: 'string' },
            } as any;

            const analysis: FormAnalysisResult = {
                interfaces: [{ name: 'IgnoredForm', properties: [{ name: 'subProp' }], isTopLevel: false }],
                topLevelControls: [
                    {
                        name: 'status',
                        propertyName: 'status',
                        dataType: 'string | null',
                        defaultValue: null,
                        validationRules: [],
                        controlType: 'control',
                        schema: { type: 'string', enum: ['A', 'B'] },
                    } as any,
                    {
                        name: 'status',
                        propertyName: 'status',
                        dataType: 'string | null',
                        defaultValue: null,
                        validationRules: [],
                        controlType: 'control',
                        schema: { type: 'string', enum: ['A', 'B'] },
                    } as any,
                    {
                        name: 'missingSchema',
                        propertyName: 'missingSchema',
                        dataType: 'string | null',
                        defaultValue: null,
                        validationRules: [],
                        controlType: 'control',
                        schema: undefined,
                    } as any,
                    {
                        name: 'items',
                        propertyName: 'items',
                        dataType: 'ItemForm[]',
                        defaultValue: null,
                        validationRules: [],
                        controlType: 'array',
                        schema: { type: 'array', items: { type: 'object' } },
                        nestedControls: [arrayItemControl],
                        nestedFormInterface: 'ItemForm',
                    } as any,
                    {
                        name: 'meta',
                        propertyName: 'meta',
                        dataType: 'Record<string, string>',
                        defaultValue: null,
                        validationRules: [],
                        controlType: 'map',
                        schema: { type: 'object' },
                        mapValueControl: {
                            name: 'value',
                            propertyName: 'value',
                            dataType: 'string | null',
                            defaultValue: null,
                            validationRules: [],
                            controlType: 'control',
                            schema: { type: 'string' },
                        } as any,
                    } as any,
                    {
                        name: 'meta2',
                        propertyName: 'meta2',
                        dataType: 'Record<string, string>',
                        defaultValue: null,
                        validationRules: [],
                        controlType: 'map',
                        schema: { type: 'object' },
                        mapValueControl: undefined,
                    } as any,
                ],
                usesCustomValidators: false,
                hasFormArrays: true,
                hasFileUploads: false,
                hasMaps: true,
                isPolymorphic: true,
                polymorphicProperties: [
                    {
                        propertyName: 'type',
                        discriminatorOptions: ['sub'],
                        options: [
                            {
                                discriminatorValue: 'sub',
                                modelName: 'SubModel',
                                subFormName: 'sub',
                                controls: [
                                    {
                                        name: 'subProp',
                                        propertyName: 'subProp',
                                        dataType: 'string | null',
                                        defaultValue: null,
                                        validationRules: [],
                                        controlType: 'control',
                                        schema: { type: 'string' },
                                    } as any,
                                ],
                            },
                        ],
                    } as any,
                ],
                dependencyRules: [
                    { type: 'required', triggerField: 'flag', targetField: 'target' },
                    { type: 'required', triggerField: 'flag', targetField: 'target2' },
                ],
            };

            const resource: Resource = {
                name: 'test',
                modelName: 'Test',
                isEditable: true,
                operations: [],
                formProperties: [],
                listProperties: [],
            };

            (generator as any).generateFormComponentTs(resource, '/admin/test/test-form', analysis);
            const sourceFile = project.getSourceFileOrThrow('/admin/test/test-form/test-form.component.ts');
            const text = sourceFile.getText();

            expect(text).toContain('updateFormForType');
            expect(text).toContain('StatusOptions');
            expect(text).toContain('FormArray<FormGroup<ItemForm>>');
            expect(text).toContain('createMetaEntry');
            expect(text).toContain('createMeta2Entry');
            expect(text).toContain('return new FormGroup({});');
        });

        it('should fall back to any when interface props are not found in polymorphic options', () => {
            const parser = new SwaggerParser(validBase as any, config);
            const generator = new FormComponentGenerator(project, parser);

            const analysis: FormAnalysisResult = {
                interfaces: [{ name: 'AnyForm', properties: [{ name: 'unknownProp' }], isTopLevel: false }],
                topLevelControls: [],
                usesCustomValidators: false,
                hasFormArrays: false,
                hasFileUploads: false,
                hasMaps: false,
                isPolymorphic: true,
                polymorphicProperties: [
                    {
                        propertyName: 'type',
                        discriminatorOptions: ['sub'],
                        options: [
                            {
                                discriminatorValue: 'sub',
                                modelName: 'SubModel',
                                subFormName: 'sub',
                                controls: [
                                    {
                                        name: 'subProp',
                                        propertyName: 'subProp',
                                        dataType: 'string | null',
                                        defaultValue: null,
                                        validationRules: [],
                                        controlType: 'control',
                                        schema: { type: 'string' },
                                    } as any,
                                ],
                            },
                        ],
                    } as any,
                ],
                dependencyRules: [],
            };

            const resource: Resource = {
                name: 'test',
                modelName: 'Test',
                isEditable: true,
                operations: [],
                formProperties: [],
                listProperties: [],
            };

            (generator as any).generateFormComponentTs(resource, '/admin/test-any/test-form', analysis);
            const sourceFile = project.getSourceFileOrThrow('/admin/test-any/test-form/test-form.component.ts');
            expect(sourceFile.getText()).toContain('unknownProp: any');
        });

        it('should default array item interface to any when nestedFormInterface is missing', () => {
            const parser = new SwaggerParser(validBase as any, config);
            const generator = new FormComponentGenerator(project, parser);

            const analysis: FormAnalysisResult = {
                interfaces: [],
                topLevelControls: [
                    {
                        name: 'items',
                        propertyName: 'items',
                        dataType: 'any[]',
                        defaultValue: null,
                        validationRules: [],
                        controlType: 'array',
                        nestedControls: [
                            {
                                name: 'name',
                                propertyName: 'name',
                                dataType: 'string | null',
                                defaultValue: null,
                                validationRules: [],
                                controlType: 'control',
                                schema: { type: 'string' },
                            } as any,
                        ],
                    } as any,
                ],
                usesCustomValidators: false,
                hasFormArrays: true,
                hasFileUploads: false,
                hasMaps: false,
                isPolymorphic: false,
                polymorphicProperties: [],
                dependencyRules: [],
            };

            const resource: Resource = {
                name: 'test',
                modelName: 'Test',
                isEditable: true,
                operations: [],
                formProperties: [],
                listProperties: [],
            };

            (generator as any).generateFormComponentTs(resource, '/admin/test-any-array/test-form', analysis);
            const sourceFile = project.getSourceFileOrThrow('/admin/test-any-array/test-form/test-form.component.ts');
            expect(sourceFile.getText()).toContain('FormArray<FormGroup<any>>');
        });

        it('should generate onSubmit branches for create-only and update-only flows', () => {
            const parser = new SwaggerParser(validBase as any, config);
            const generator = new FormComponentGenerator(project, parser);
            const sourceFile = project.createSourceFile('/admin/test-on-submit.ts', '', { overwrite: true });
            const classDeclaration = sourceFile.addClass({ name: 'OnSubmitTest' });

            const createOnly: Resource = {
                name: 'test',
                modelName: 'Test',
                isEditable: true,
                operations: [{ action: 'create', methodName: 'createTest' } as any],
                formProperties: [],
                listProperties: [],
            };

            (generator as any).addOnSubmit(classDeclaration, createOnly, 'TestService', false);
            const createBody = classDeclaration.getMethodOrThrow('onSubmit').getBodyText() ?? '';
            expect(createBody).toContain('this.form.getRawValue()');
            expect(createBody).toContain('createTest');
            expect(createBody).toContain('no update operation is available');

            classDeclaration.getMethodOrThrow('onSubmit').remove();
            const updateOnly: Resource = {
                name: 'test',
                modelName: 'Test',
                isEditable: true,
                operations: [{ action: 'update', methodName: 'updateTest' } as any],
                formProperties: [],
                listProperties: [],
            };
            (generator as any).addOnSubmit(classDeclaration, updateOnly, 'TestService', false);
            const updateBody = classDeclaration.getMethodOrThrow('onSubmit').getBodyText() ?? '';
            expect(updateBody).toContain('updateTest');
            expect(updateBody).toContain('no create operation is available');
        });

        it('should skip patchForm when there are no complex props and use any when modelName is missing', () => {
            const parser = new SwaggerParser(validBase as any, config);
            const generator = new FormComponentGenerator(project, parser);
            const sourceFile = project.createSourceFile('/admin/test-patch.ts', '', { overwrite: true });
            const classDeclaration = sourceFile.addClass({ name: 'PatchFormTest' });

            const analysisEmpty: FormAnalysisResult = {
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

            (generator as any).addPatchForm(
                classDeclaration,
                { name: 'test', modelName: 'Test' } as any,
                analysisEmpty,
            );
            expect(classDeclaration.getMethod('patchForm')).toBeUndefined();

            const analysisComplex: FormAnalysisResult = {
                ...analysisEmpty,
                topLevelControls: [
                    {
                        name: 'meta',
                        propertyName: 'meta',
                        dataType: 'Record<string, string>',
                        defaultValue: null,
                        validationRules: [],
                        controlType: 'map',
                        schema: { type: 'object' },
                    } as any,
                ],
                hasMaps: true,
            };

            (generator as any).addPatchForm(classDeclaration, { name: 'test', modelName: '' } as any, analysisComplex);
            const patchMethod = classDeclaration.getMethodOrThrow('patchForm');
            expect(patchMethod.getParameters()[0].getType().getText()).toBe('any');
        });
    });
});
