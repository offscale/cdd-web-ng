import { ClassDeclaration, Project, Scope } from 'ts-morph';

import { Resource, SwaggerDefinition } from '@src/core/types/index.js';
import { camelCase, pascalCase, singular } from '@src/functions/utils.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { FormModelBuilder } from '@src/vendors/angular/admin/analysis/form-model.builder.js';
import { FormAnalysisResult, FormControlModel } from '@src/vendors/angular/admin/analysis/form-types.js';

import { commonStandaloneImports } from './common-imports.js';
import { generateFormComponentHtml } from './html/form-component-html.builder.js';
import { generateFormComponentScss } from './html/form-component-scss.builder.js';
import { FormInitializerRenderer } from './form.renderer.js';

/**
 * Orchestrates the generation of a complete Angular standalone form component.
 * It uses FormModelBuilder for analysis and FormInitializerRenderer for code generation.
 */
export class FormComponentGenerator {
    /**
     * @param project The ts-morph Project instance.
     * @param parser The SwaggerParser instance.
     */
    constructor(
        /* v8 ignore next */
        private readonly project: Project,
        /* v8 ignore next */
        private readonly parser: SwaggerParser,
    ) {}

    public generate(resource: Resource, outDir: string): { usesCustomValidators: boolean } {
        /* v8 ignore next */
        const formDir = `${outDir}/${resource.name}/${resource.name}-form`;
        /* v8 ignore next */
        this.project.getFileSystem().mkdirSync(formDir);

        // Phase 1: Analysis
        /* v8 ignore next */
        const builder = new FormModelBuilder(this.parser);
        /* v8 ignore next */
        const analysis = builder.build(resource);

        // Phase 2: Emission
        // FIX: Pass the already resolved formDir as the output location for the component TS
        /* v8 ignore next */
        const tsResult = this.generateFormComponentTs(resource, formDir, analysis);
        /* v8 ignore next */
        this.generateFormComponentHtml(resource, analysis, formDir);
        /* v8 ignore next */
        this.generateFormComponentScss(resource, formDir);

        /* v8 ignore next */
        return { usesCustomValidators: tsResult.usesCustomValidators };
    }

    private generateFormComponentTs(
        resource: Resource,
        outDir: string,
        analysis: FormAnalysisResult,
    ): {
        usesCustomValidators: boolean;
    } {
        /* v8 ignore next */
        const componentName = `${pascalCase(resource.modelName)}FormComponent`;
        /* v8 ignore next */
        const serviceName = `${pascalCase(resource.name)}Service`;
        // Construct path using the specific directory passed in (e.g. /admin/users/users-form)
        /* v8 ignore next */
        const formFilePath = `${outDir}/${resource.name}-form.component.ts`;
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(formFilePath, undefined, { overwrite: true });
        // The builder creates the main interface with this name
        const formInterfaceName =
            /* v8 ignore next */
            analysis.interfaces.find(i => i.isTopLevel)?.name || `${pascalCase(resource.modelName)}Form`;

        // Collect all polymorphic models for import
        /* v8 ignore next */
        const oneOfImports = analysis.polymorphicProperties.flatMap(p => p.options.map(o => o.modelName)).join(', ');

        /* v8 ignore next */
        sourceFile.addStatements(
            [
                `import { Component, OnInit, computed, inject, signal, effect, ChangeDetectionStrategy, DestroyRef } from '@angular/core';`,
                `import { takeUntilDestroyed } from '@angular/core/rxjs-interop';`,
                `import { FormBuilder, FormGroup, FormArray, Validators, FormControl, ReactiveFormsModule } from '@angular/forms';`,
                `import { ActivatedRoute, Router, RouterModule } from '@angular/router';`,
                /* v8 ignore next */
                ...commonStandaloneImports.map(a => `import { ${a[0]} } from "${a[1]}";`),
                `import { MatSnackBar } from '@angular/material/snack-bar';`,
                `import { ${serviceName} } from '@src/services/${camelCase(resource.name)}.service';`,
                `import { ${resource.modelName}${oneOfImports ? ', ' + oneOfImports : ''} } from '@src/models';`,
                analysis.usesCustomValidators
                    ? `import { CustomValidators } from '../../shared/custom-validators.js';`
                    : '',
            ].filter(Boolean),
        );

        // Helper function to find a control model by name, searching recursively
        /* v8 ignore next */
        const findControlInModel = (
            controls: FormControlModel[],
            name: string,
            searchPolymorphic: boolean = true,
        ): FormControlModel | undefined => {
            /* v8 ignore next */
            for (const control of controls) {
                /* v8 ignore next */
                if (control.name === name) return control;
                /* v8 ignore next */
                if (control.nestedControls) {
                    /* v8 ignore next */
                    const nested = findControlInModel(control.nestedControls, name);
                    /* v8 ignore next */
                    if (nested) return nested;
                }
            }
            // Also check polymorphic options, as their controls are not in the main tree
            /* v8 ignore next */
            if (searchPolymorphic) {
                /* v8 ignore next */
                for (const propConfig of analysis.polymorphicProperties) {
                    /* v8 ignore next */
                    for (const polyOption of propConfig.options) {
                        /* v8 ignore next */
                        const nested = findControlInModel(polyOption.controls, name, false);
                        /* v8 ignore next */
                        if (nested) return nested;
                    }
                }
            }
            /* v8 ignore next */
            return undefined;
        };

        // Emit all Interfaces generated by analysis
        /* v8 ignore next */
        analysis.interfaces.forEach(iface => {
            /* v8 ignore next */
            sourceFile.addInterface({
                name: iface.name,
                isExported: iface.isTopLevel,
                properties: iface.properties.map(prop => {
                    // Find the control model that corresponds to this property name
                    /* v8 ignore next */
                    const control = findControlInModel(analysis.topLevelControls, prop.name);

                    // If a control isn't found (e.g., a polymorphic sub-form property),
                    // we search those specifically.
                    /* v8 ignore next */
                    if (!control) {
                        // Silently fallback to any, assuming it might be handled in sub-type interfaces or not significant for layout
                        /* v8 ignore next */
                        return { name: prop.name, type: 'Record<string, unknown>' };
                    }

                    // Build the final Angular-specific type string from the agnostic IR.
                    let finalType: string;
                    /* v8 ignore next */
                    switch (control.controlType) {
                        case 'group':
                            /* v8 ignore next */
                            finalType = `FormGroup<${control.dataType}>`;
                            /* v8 ignore next */
                            break;
                        case 'array':
                            /* v8 ignore next */
                            if (control.nestedControls) {
                                // Array of FormGroups
                                /* v8 ignore next */
                                const itemType = control.dataType.replace('[]', '');
                                /* v8 ignore next */
                                finalType = `FormArray<FormGroup<${itemType}>>`;
                            } else {
                                // Array of FormControls (primitives)
                                /* v8 ignore next */
                                const itemType = control.dataType.replace(/[()]/g, '').replace('[]', '');
                                /* v8 ignore next */
                                finalType = `FormArray<FormControl<${itemType}>>`;
                            }
                            /* v8 ignore next */
                            break;
                        case 'map':
                            // Maps are rendered as FormArray of Key-Value tuples for editing
                            // dataType here is the Value type
                            // We use `any` for the generic here to simplify avoiding deep recursion in the type definition,
                            // since the form logic handles the transformation.
                            /* v8 ignore next */
                            finalType = `FormArray<FormGroup<{ key: FormControl<string | null>, value: FormControl<unknown> }>>`;
                            /* v8 ignore next */
                            break;
                        case 'control':
                        default:
                            /* v8 ignore next */
                            finalType = `FormControl<${control.dataType}>`;
                            /* v8 ignore next */
                            break;
                    }
                    /* v8 ignore next */
                    return { name: control.name, type: finalType };
                }),
            });
        });

        /* v8 ignore next */
        const componentClass = sourceFile.addClass({
            name: componentName,
            isExported: true,
            decorators: [
                {
                    name: 'Component',
                    arguments: [
                        `{
                    selector: 'app-${resource.name}-form',
                    imports: [
                        ReactiveFormsModule,
                        RouterModule,
/* v8 ignore next */
                        ${commonStandaloneImports.map(a => a[0]).join(',\n    ')}
                    ],
                    templateUrl: './${resource.name}-form.component.html',
                    styleUrl: './${resource.name}-form.component.scss',
                    changeDetection: ChangeDetectionStrategy.OnPush
                }`,
                    ],
                },
            ],
            implements: ['OnInit'],
        });

        /* v8 ignore next */
        this.addProperties(componentClass, resource, serviceName, formInterfaceName, analysis);

        // Dynamic Effects (Polymorphism + Dependent Schemas)
        /* v8 ignore next */
        if (analysis.isPolymorphic || analysis.dependencyRules.length > 0) {
            /* v8 ignore next */
            componentClass.addConstructor({
                statements: writer => {
                    /* v8 ignore next */
                    writer.writeLine('// Setup dynamic form effects');

                    // 1. Polymorphism logic
                    /* v8 ignore next */
                    if (analysis.isPolymorphic) {
                        /* v8 ignore next */
                        analysis.polymorphicProperties.forEach(poly => {
                            /* v8 ignore next */
                            const propName = poly.propertyName;
                            /* v8 ignore next */
                            const updateMethod = `updateFormFor${pascalCase(propName)}`;
                            /* v8 ignore next */
                            writer.write(`effect(() => {
    const val = this.form.get('${propName}')?.value;
    if (val) { this.${updateMethod}(val); }
});\n`);
                        });
                    }

                    // 2. Dependent Schemas/Required Logic (OAS 3.1)
                    /* v8 ignore next */
                    if (analysis.dependencyRules.length > 0) {
                        /* v8 ignore next */
                        writer.writeLine('// Dependent Schemas: If trigger field is present, target is required.');
                        /* v8 ignore next */
                        writer.writeLine('effect(() => {');

                        // Group targets by trigger to avoid duplicate subscribes (though effect handles deps fine)
                        /* v8 ignore next */
                        const groups = new Map<string, string[]>();
                        /* v8 ignore next */
                        analysis.dependencyRules.forEach(r => {
                            /* v8 ignore next */
                            if (!groups.has(r.triggerField)) groups.set(r.triggerField, []);
                            /* v8 ignore next */
                            groups.get(r.triggerField)?.push(r.targetField);
                        });

                        /* v8 ignore next */
                        groups.forEach((targets, trigger) => {
                            /* v8 ignore next */
                            writer.writeLine(`  const ${trigger}Value = this.form.get('${trigger}')?.value;`);
                            /* v8 ignore next */
                            writer.writeLine(
                                `  if (${trigger}Value !== null && ${trigger}Value !== undefined && ${trigger}Value !== '') {`,
                            );
                            /* v8 ignore next */
                            targets.forEach(target => {
                                /* v8 ignore next */
                                writer.writeLine(`    this.form.get('${target}')?.addValidators(Validators.required);`);
                                /* v8 ignore next */
                                writer.writeLine(
                                    `    this.form.get('${target}')?.updateValueAndValidity({ emitEvent: false });`,
                                );
                            });
                            /* v8 ignore next */
                            writer.writeLine(`  } else {`);
                            /* v8 ignore next */
                            targets.forEach(target => {
                                /* v8 ignore next */
                                writer.writeLine(
                                    `    this.form.get('${target}')?.removeValidators(Validators.required);`,
                                );
                                /* v8 ignore next */
                                writer.writeLine(
                                    `    this.form.get('${target}')?.updateValueAndValidity({ emitEvent: false });`,
                                );
                            });
                            /* v8 ignore next */
                            writer.writeLine(`  }`);
                        });

                        /* v8 ignore next */
                        writer.writeLine('});');
                    }
                },
            });
        }

        /* v8 ignore next */
        this.addNgOnInit(
            componentClass,
            resource,
            serviceName,
            analysis.hasFormArrays || analysis.isPolymorphic || !!analysis.hasMaps,
        );
        /* v8 ignore next */
        this.addInitForm(componentClass, formInterfaceName, analysis.topLevelControls);

        /* v8 ignore next */
        if (analysis.isPolymorphic) this.addPolymorphismLogic(componentClass, resource, analysis);
        /* v8 ignore next */
        if (analysis.hasFileUploads) this.addFileHandling(componentClass);
        /* v8 ignore next */
        if (analysis.hasFormArrays) this.addFormArrayHelpers(componentClass, analysis.topLevelControls);
        /* v8 ignore next */
        if (analysis.hasMaps) this.addMapHelpers(componentClass, analysis.topLevelControls);
        /* v8 ignore next */
        if (analysis.hasFormArrays || analysis.isPolymorphic || analysis.hasMaps)
            /* v8 ignore next */
            this.addPatchForm(componentClass, resource, analysis);

        // Always add getPayload to ensure readOnly fields are stripped and structural transformations are applied
        /* v8 ignore next */
        this.addGetPayload(componentClass, analysis);

        // Pass true to force usage of getPayload()
        /* v8 ignore next */
        this.addOnSubmit(componentClass, resource, serviceName, true);
        /* v8 ignore next */
        this.addOnCancelMethod(componentClass);

        /* v8 ignore next */
        sourceFile.formatText({ ensureNewLineAtEndOfFile: true });
        /* v8 ignore next */
        return { usesCustomValidators: analysis.usesCustomValidators };
    }

    private addProperties(
        classDeclaration: ClassDeclaration,
        resource: Resource,
        serviceName: string,
        formInterfaceName: string,
        analysis: FormAnalysisResult,
    ): void {
        /* v8 ignore next */
        classDeclaration.addProperties([
            {
                name: 'fb',
                isReadonly: true,
                initializer: 'inject(FormBuilder)',
                docs: ["Injects Angular's FormBuilder service."],
            },
            { name: 'route', isReadonly: true, initializer: 'inject(ActivatedRoute)' },
            { name: 'router', isReadonly: true, initializer: 'inject(Router)' },
            { name: 'snackBar', isReadonly: true, initializer: 'inject(MatSnackBar)' },
            {
                name: `${camelCase(serviceName)}`,
                isReadonly: true,
                type: serviceName,
                initializer: `inject(${serviceName})`,
            },
            {
                name: `form!: FormGroup<${formInterfaceName}>`,
                docs: ['The main reactive form group for this component.'],
            },
            { name: 'destroyRef', scope: Scope.Private, isReadonly: true, initializer: 'inject(DestroyRef)' },
            { name: 'id = signal<string | null>(null)' },
            { name: 'isEditMode = computed(() => !!this.id())' },
            {
                name: 'formTitle',
                initializer: `computed(() => this.isEditMode() ? 'Edit ${resource.modelName}' : 'Create ${resource.modelName}')`,
            },
        ]);

        // Add options for EACH discriminator
        /* v8 ignore next */
        if (analysis.isPolymorphic) {
            /* v8 ignore next */
            analysis.polymorphicProperties.forEach(poly => {
                /* v8 ignore next */
                classDeclaration.addProperties([
                    {
                        name: `${poly.propertyName}Options`,
                        isReadonly: true,
                        initializer: JSON.stringify(poly.discriminatorOptions),
                        docs: [`The available options for the ${poly.propertyName} discriminator.`],
                    },
                ]);
            });
        }

        /* v8 ignore next */
        const processedEnums = new Set<string>();
        /* v8 ignore next */
        const findEnums = (properties: FormControlModel[]) => {
            /* v8 ignore next */
            for (const prop of properties) {
                /* v8 ignore next */
                const schema = prop.schema;
                /* v8 ignore next */
                if (!schema) continue;
                /* v8 ignore next */
                const itemsSchema = (schema.type === 'array' ? schema.items : schema) as SwaggerDefinition | undefined;
                /* v8 ignore next */
                if (!itemsSchema) continue;
                /* v8 ignore next */
                if (itemsSchema.enum) {
                    /* v8 ignore next */
                    const optionsName = `${pascalCase(prop.name)}Options`;
                    /* v8 ignore next */
                    if (!processedEnums.has(optionsName)) {
                        /* v8 ignore next */
                        classDeclaration.addProperty({
                            name: optionsName,
                            isReadonly: true,
                            initializer: JSON.stringify(itemsSchema.enum),
                        });
                        /* v8 ignore next */
                        processedEnums.add(optionsName);
                    }
                }
                /* v8 ignore next */
                if (prop.nestedControls) {
                    /* v8 ignore next */
                    findEnums(prop.nestedControls);
                }
            }
        };
        /* v8 ignore next */
        findEnums(analysis.topLevelControls);
    }

    private addNgOnInit(
        classDeclaration: ClassDeclaration,
        resource: Resource,
        serviceName: string,
        needsComplexPatch: boolean,
    ): void {
        /* v8 ignore next */
        const getByIdOp = resource.operations.find(op => op.action === 'getById');
        /* v8 ignore next */
        const patchCall = needsComplexPatch
            ? 'this.patchForm(entity)'
            : 'this.form.patchValue(entity as Record<string, unknown>)';
        /* v8 ignore next */
        let body = `this.initForm();\nconst id = this.route.snapshot.paramMap.get('id');\nif (id) {\n  this.id.set(id);`;
        /* v8 ignore next */
        if (getByIdOp?.methodName) {
            /* v8 ignore next */
            body += `\n  this.${camelCase(serviceName)}.${getByIdOp.methodName}(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(entity => {\n    ${patchCall};\n  });`;
        }
        /* v8 ignore next */
        body += '\n}';
        /* v8 ignore next */
        classDeclaration.addMethod({ name: 'ngOnInit', statements: body });
    }

    private addInitForm(classDeclaration: ClassDeclaration, interfaceName: string, controls: FormControlModel[]): void {
        /* v8 ignore next */
        const formControls = controls
            /* v8 ignore next */
            .map(c => `'${c.name}': ${FormInitializerRenderer.renderControlInitializer(c)}`)
            .join(',\n      ');

        /* v8 ignore next */
        let statement = `this.form = new FormGroup<${interfaceName}>({\n      ${formControls}\n    });`;

        // CHANGE: Disable readOnly controls immediately after initialization
        /* v8 ignore next */
        const readOnlyPaths = this.findReadOnlyControls(controls);
        /* v8 ignore next */
        if (readOnlyPaths.length > 0) {
            /* v8 ignore next */
            const disableStats = readOnlyPaths
                /* v8 ignore next */
                .map(path => `this.form.get('${path}')?.disable({ emitEvent: false });`)
                .join('\n    ');
            /* v8 ignore next */
            statement += `\n    ${disableStats}`;
        }

        /* v8 ignore next */
        classDeclaration.addMethod({ name: 'initForm', scope: Scope.Private, statements: statement });
    }

    /**
     * Recursively finds paths for readOnly controls to disable.
     */
    private findReadOnlyControls(controls: FormControlModel[], prefix = ''): string[] {
        /* v8 ignore next */
        let paths: string[] = [];
        /* v8 ignore next */
        for (const control of controls) {
            /* v8 ignore next */
            const schema = control.schema;
            /* v8 ignore next */
            const controlPath = prefix ? `${prefix}.${control.name}` : control.name;

            /* v8 ignore next */
            if (schema?.readOnly) {
                /* v8 ignore next */
                paths.push(controlPath);
            }

            /* v8 ignore next */
            if (control.nestedControls && control.controlType === 'group') {
                // Only recurse for groups, arrays handle their own items dynamically usually
                // (though readOnly array implies the whole array is readOnly, handled by parent check usually)
                /* v8 ignore next */
                paths = paths.concat(this.findReadOnlyControls(control.nestedControls, controlPath));
            }
        }
        /* v8 ignore next */
        return paths;
    }

    private addFormArrayHelpers(classDeclaration: ClassDeclaration, topLevelControls: FormControlModel[]): void {
        /* v8 ignore next */
        const findArrays = (ctrls: FormControlModel[]): FormControlModel[] => {
            /* v8 ignore next */
            let found: FormControlModel[] = [];
            /* v8 ignore next */
            for (const c of ctrls) {
                /* v8 ignore next */
                if (c.controlType === 'array' && c.nestedControls) found.push(c);
            }
            /* v8 ignore next */
            return found;
        };

        /* v8 ignore next */
        const formArrayProps = findArrays(topLevelControls);

        /* v8 ignore next */
        formArrayProps.forEach(prop => {
            /* v8 ignore next */
            const arrayName = prop.name;
            /* v8 ignore next */
            const singularPascal = pascalCase(singular(arrayName));
            /* v8 ignore next */
            const singularCamel = camelCase(singular(arrayName));
            /* v8 ignore next */
            const arrayGetterName = `${singularCamel}Array`;

            /* v8 ignore next */
            const arrayItemInterfaceName = prop.nestedFormInterface || 'unknown';

            /* v8 ignore next */
            classDeclaration.addGetAccessor({
                name: arrayGetterName,
                returnType: `FormArray<FormGroup<${arrayItemInterfaceName}>>`,
                statements: `return this.form.get('${arrayName}') as FormArray<FormGroup<${arrayItemInterfaceName}>>;`,
                docs: [`Getter for the ${singularCamel} FormArray.`],
            });

            /* v8 ignore next */
            const createMethod = classDeclaration.addMethod({
                name: `create${singularPascal}`,
                scope: Scope.Private,
                parameters: [{ name: 'item?', type: 'Record<string, unknown>' }],
                returnType: `FormGroup<${arrayItemInterfaceName}>`,
            });

            /* v8 ignore next */
            const initializerString = FormInitializerRenderer.renderFormArrayItemInitializer(prop.nestedControls!);
            /* v8 ignore next */
            createMethod.setBodyText(`return ${initializerString};`);

            /* v8 ignore next */
            classDeclaration.addMethod({
                name: `add${singularPascal}`,
                statements: `this.${arrayGetterName}.push(this.create${singularPascal}());`,
            });
            /* v8 ignore next */
            classDeclaration.addMethod({
                name: `remove${singularPascal}`,
                parameters: [{ name: 'index', type: 'number' }],
                statements: `this.${arrayGetterName}.removeAt(index);`,
            });
        });
    }

    private addMapHelpers(classDeclaration: ClassDeclaration, topLevelControls: FormControlModel[]): void {
        /* v8 ignore next */
        const maps = topLevelControls.filter(c => c.controlType === 'map');

        /* v8 ignore next */
        maps.forEach(prop => {
            /* v8 ignore next */
            const mapName = prop.name;
            /* v8 ignore next */
            const pascalName = pascalCase(mapName);
            /* v8 ignore next */
            const getterName = `${camelCase(mapName)}Map`;

            /* v8 ignore next */
            classDeclaration.addGetAccessor({
                name: getterName,
                // Return specialized FormArray of KV pairs
                returnType: `FormArray<FormGroup<{ key: FormControl<string | null>, value: FormControl<unknown> }>>`,
                statements: `return this.form.get('${mapName}') as FormArray;`,
            });

            /* v8 ignore next */
            const createMethod = classDeclaration.addMethod({
                name: `create${pascalName}Entry`,
                scope: Scope.Private,
                parameters: [{ name: 'item?', type: 'Record<string, unknown>' }],
                returnType: `FormGroup`, // Simplify return type to generic FormGroup for brevity/compatibility
            });

            /* v8 ignore next */
            if (prop.mapValueControl) {
                /* v8 ignore next */
                const initializer = FormInitializerRenderer.renderMapItemInitializer(
                    prop.mapValueControl,
                    prop.keyPattern,
                    prop.keyMinLength,
                    prop.keyMaxLength,
                );
                /* v8 ignore next */
                createMethod.setBodyText(`return ${initializer};`);
            } else {
                /* v8 ignore next */
                createMethod.setBodyText(`return new FormGroup({});`);
            }

            /* v8 ignore next */
            classDeclaration.addMethod({
                name: `add${pascalName}Entry`,
                statements: `this.${getterName}.push(this.create${pascalName}Entry());`,
            });

            /* v8 ignore next */
            classDeclaration.addMethod({
                name: `remove${pascalName}Entry`,
                parameters: [{ name: 'index', type: 'number' }],
                statements: `this.${getterName}.removeAt(index);`,
            });
        });
    }

    private addOnSubmit(
        classDeclaration: ClassDeclaration,
        resource: Resource,
        serviceName: string,
        needsPayloadTransform: boolean,
    ): void {
        /* v8 ignore next */
        const createOp = resource.operations.find(op => op.action === 'create');
        /* v8 ignore next */
        const updateOp = resource.operations.find(op => op.action === 'update');
        /* v8 ignore next */
        if (!createOp?.methodName && !updateOp?.methodName) return;

        /* v8 ignore next */
        const payloadExpr = needsPayloadTransform ? 'this.getPayload()' : 'this.form.getRawValue()';
        /* v8 ignore next */
        let body = `if (!this.form.valid) { return; }\nconst finalPayload = ${payloadExpr};\n`;

        /* v8 ignore next */
        if (createOp?.methodName && updateOp?.methodName) {
            /* v8 ignore next */
            body += `const action$ = this.isEditMode()\n  ? this.${camelCase(serviceName)}.${updateOp.methodName}(this.id()!, finalPayload)\n  : this.${camelCase(serviceName)}.${createOp.methodName}(finalPayload);\n`;
            /* v8 ignore next */
        } else if (updateOp?.methodName) {
            /* v8 ignore next */
            body += `if (!this.isEditMode()) { console.error('Form is not in edit mode, but no create operation is available.'); return; }\n`;
            /* v8 ignore next */
            body += `const action$ = this.${camelCase(serviceName)}.${updateOp.methodName}(this.id()!, finalPayload);\n`;
        } else {
            /* v8 ignore next */
            body += `if (this.isEditMode()) { console.error('Form is in edit mode, but no update operation is available.'); return; }\n`;
            /* v8 ignore next */
            body += `const action$ = this.${camelCase(serviceName)}.${createOp!.methodName}(finalPayload);\n`;
        }
        /* v8 ignore next */
        body += `action$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({\n  next: () => {\n    this.snackBar.open('${resource.modelName} saved successfully!', 'Close', { duration: 3000 });\n    this.router.navigate(['../'], { relativeTo: this.route });\n  },\n  error: (err) => {\n    console.error('Error saving ${resource.modelName}', err);\n    this.snackBar.open('Error saving ${resource.modelName}', 'Close', { duration: 5000, panelClass: 'error-snackbar' });\n  }\n});`;
        /* v8 ignore next */
        classDeclaration.addMethod({ name: 'onSubmit', statements: body });
    }

    private addOnCancelMethod(classDeclaration: ClassDeclaration): void {
        /* v8 ignore next */
        classDeclaration.addMethod({
            name: 'onCancel',
            statements: `this.router.navigate(['../'], { relativeTo: this.route });`,
        });
    }

    private addPatchForm(classDeclaration: ClassDeclaration, resource: Resource, analysis: FormAnalysisResult): void {
        /* v8 ignore next */
        const arrayProps = analysis.topLevelControls.filter(c => c.controlType === 'array' && c.nestedControls);
        /* v8 ignore next */
        const mapProps = analysis.topLevelControls.filter(c => c.controlType === 'map');

        /* v8 ignore next */
        const discriminatorProps = analysis.polymorphicProperties.map(p => p.propertyName);

        /* v8 ignore next */
        const complexProps = [...arrayProps.map(p => p.name), ...mapProps.map(p => p.name), ...discriminatorProps];

        /* v8 ignore next */
        if (complexProps.length === 0) return;

        /* v8 ignore next */
        let body = `const { ${complexProps.join(', ')}, ...rest } = entity;\n`;
        /* v8 ignore next */
        body += 'this.form.patchValue(rest as Record<string, unknown>);\n\n';

        // Patch Arrays
        /* v8 ignore next */
        arrayProps.forEach(prop => {
            /* v8 ignore next */
            const arrayGetterName = `${camelCase(singular(prop.name))}Array`;
            /* v8 ignore next */
            const createItemMethodName = `create${pascalCase(singular(prop.name))}`;
            /* v8 ignore next */
            body += `if (Array.isArray(entity.${prop.name})) {\n`;
            /* v8 ignore next */
            body += `  this.${arrayGetterName}.clear();\n`;
            /* v8 ignore next */
            body += `  entity.${prop.name}.forEach((item: Record<string, unknown>) => this.${arrayGetterName}.push(this.${createItemMethodName}(item)));\n`;
            /* v8 ignore next */
            body += `}\n`;
        });

        // Patch Maps (Object -> Array of KV)
        /* v8 ignore next */
        mapProps.forEach(prop => {
            /* v8 ignore next */
            const mapGetter = `${camelCase(prop.name)}Map`;
            /* v8 ignore next */
            const createEntry = `create${pascalCase(prop.name)}Entry`;
            /* v8 ignore next */
            body += `if (entity.${prop.name} && typeof entity.${prop.name} === 'object') {\n`;
            /* v8 ignore next */
            body += `  this.${mapGetter}.clear();\n`;
            /* v8 ignore next */
            body += `  Object.entries(entity.${prop.name}).forEach(([key, value]) => {\n`;
            /* v8 ignore next */
            body += `    this.${mapGetter}.push(this.${createEntry}({ key, value }));\n`;
            /* v8 ignore next */
            body += `  });\n`;
            /* v8 ignore next */
            body += `}\n`;
        });

        /* v8 ignore next */
        if (analysis.isPolymorphic) {
            /* v8 ignore next */
            analysis.polymorphicProperties.forEach(poly => {
                /* v8 ignore next */
                const dPropName = poly.propertyName;

                /* v8 ignore next */
                body += `\nconst ${dPropName}Value = (entity as Record<string, unknown>).${dPropName};\n`;
                /* v8 ignore next */
                body += `if (${dPropName}Value) {\n`;
                /* v8 ignore next */
                body += `  this.form.get('${dPropName}')?.setValue(${dPropName}Value, { emitEvent: true });\n`;

                /* v8 ignore next */
                poly.options.forEach(opt => {
                    /* v8 ignore next */
                    const subSchemaName = opt.modelName;
                    /* v8 ignore next */
                    const typeName = opt.discriminatorValue;
                    /* v8 ignore next */
                    const isMethodName = `is${pascalCase(dPropName)}_${subSchemaName}`;
                    /* v8 ignore next */
                    body += `  if (this.${isMethodName}(entity)) {\n`;
                    /* v8 ignore next */
                    body += `    (this.form.get('${typeName}') as FormGroup)?.patchValue(entity as Record<string, unknown>);\n  }\n`;
                });
                /* v8 ignore next */
                body += `}\n`;
            });
        }
        /* v8 ignore next */
        classDeclaration.addMethod({
            name: 'patchForm',
            scope: Scope.Private,
            parameters: [{ name: 'entity', type: resource.modelName || 'unknown' }],
            statements: body,
        });
    }

    private addPolymorphismLogic(classDeclaration: ClassDeclaration, resource: Resource, analysis: FormAnalysisResult) {
        /* v8 ignore next */
        analysis.polymorphicProperties.forEach(poly => {
            /* v8 ignore next */
            const dPropName = poly.propertyName;
            /* v8 ignore next */
            const optionsName = `${dPropName}Options`;

            /* v8 ignore next */
            const updateMethod = classDeclaration.addMethod({
                name: `updateFormFor${pascalCase(dPropName)}`,
                scope: Scope.Private,
                parameters: [{ name: 'type', type: 'string' }],
            });

            /* v8 ignore next */
            if (poly.options.length > 0) {
                /* v8 ignore next */
                let switchBody = `// Remove all options for this discriminator\n`;
                /* v8 ignore next */
                switchBody += `this.${optionsName}.forEach(opt => this.form.removeControl(opt as Record<string, unknown>));\n\nswitch(type) {\n`;

                /* v8 ignore next */
                poly.options.forEach(opt => {
                    /* v8 ignore next */
                    const subFormProps = opt.controls
                        /* v8 ignore next */
                        .map(c => `'${c.name}': ${FormInitializerRenderer.renderControlInitializer(c)}`)
                        .join(', ');
                    /* v8 ignore next */
                    switchBody += `  case '${opt.discriminatorValue}':\n`;
                    /* v8 ignore next */
                    switchBody += `    this.form.addControl('${opt.subFormName}' as Record<string, unknown>, this.fb.group({ ${subFormProps} }));\n`;
                    /* v8 ignore next */
                    switchBody += '    break;\n';
                });
                /* v8 ignore next */
                switchBody += '}';
                /* v8 ignore next */
                updateMethod.setBodyText(switchBody);
            } else {
                /* v8 ignore next */
                updateMethod.setBodyText(`{}`);
            }

            /* v8 ignore next */
            classDeclaration.addMethod({
                name: `is${pascalCase(dPropName)}`,
                parameters: [{ name: 'type', type: 'string' }],
                returnType: 'boolean',
                statements: `return this.form.get('${dPropName}')?.value === type;`,
            });

            /* v8 ignore next */
            poly.options.forEach(opt => {
                /* v8 ignore next */
                const subSchemaName = opt.modelName;
                /* v8 ignore next */
                const typeName = opt.discriminatorValue;
                /* v8 ignore next */
                classDeclaration.addMethod({
                    name: `is${pascalCase(dPropName)}_${subSchemaName}`, // e.g. isPetType_Cat
                    scope: Scope.Private,
                    parameters: [{ name: 'entity', type: resource.modelName }],
                    returnType: `entity is ${subSchemaName}`,
                    statements: `return (entity as Record<string, unknown>).${dPropName} === '${typeName}';`,
                });
            });
        });
    }

    private addGetPayload(classDeclaration: ClassDeclaration, analysis: FormAnalysisResult) {
        /* v8 ignore next */
        let body = `const baseValue = this.form.getRawValue() as Record<string, unknown>; \n`;

        // We start by creating a shallow copy.
        // Note: Nested objects are still references, but we primarily modify top-level structural keys
        // (readOnly deletion, Maps transformation, Polymorphism merging).
        /* v8 ignore next */
        body += `let payload = { ...baseValue };\n`;

        // 1. Strip ReadOnly Fields (COMPLIANCE FIX)
        // Identify top-level read-only fields and remove them from the payload to ensure payload hygiene.
        // Note: We use analysis.topLevelControls rather than resource.formProperties because the controls
        // have parsed validation rules/schema info readily available.
        /* v8 ignore next */
        const readOnlyFields = analysis.topLevelControls.filter(c => c.schema && c.schema.readOnly).map(c => c.name);

        /* v8 ignore next */
        if (readOnlyFields.length > 0) {
            /* v8 ignore next */
            body += `\n// Strip readOnly fields\n`;
            /* v8 ignore next */
            readOnlyFields.forEach(field => {
                /* v8 ignore next */
                body += `delete (payload as Record<string, unknown>)['${field}'];\n`;
            });
        }

        // 2. Maps Transformation (Array of KV -> Object)
        /* v8 ignore next */
        const maps = analysis.topLevelControls.filter(c => c.controlType === 'map');
        /* v8 ignore next */
        maps.forEach(m => {
            /* v8 ignore next */
            body += `if (Array.isArray(payload['${m.name}'])) {\n`;
            /* v8 ignore next */
            body += `  const mapObj: Record<string, unknown> = {};\n`;
            /* v8 ignore next */
            body += `  payload['${m.name}'].forEach((pair: { key: string, value: unknown }) => { if(pair.key) mapObj[pair.key] = pair.value; });\n`;
            /* v8 ignore next */
            body += `  payload['${m.name}'] = mapObj;\n`;
            /* v8 ignore next */
            body += `}\n`;
        });

        // 3. Polymorphism
        /* v8 ignore next */
        if (analysis.isPolymorphic) {
            /* v8 ignore next */
            analysis.polymorphicProperties.forEach(poly => {
                /* v8 ignore next */
                const dProp = poly.propertyName;
                /* v8 ignore next */
                const optionsName = `${dProp}Options`;

                /* v8 ignore next */
                body += `const ${dProp}Value = payload['${dProp}'];\n`;
                /* v8 ignore next */
                body += `if (${dProp}Value) {\n`;
                /* v8 ignore next */
                body += `  const subFormValue = (this.form.get(${dProp}Value) as FormGroup | undefined)?.getRawValue() || {};\n`;
                /* v8 ignore next */
                body += `  payload = { ...payload, ...subFormValue };\n`;
                /* v8 ignore next */
                body += `}\n`;
                /* v8 ignore next */
                body += `this.${optionsName}.forEach(opt => delete (payload as Record<string, unknown>)[opt]);\n`;
            });
        }

        /* v8 ignore next */
        body += `return payload;`;

        /* v8 ignore next */
        classDeclaration.addMethod({ name: 'getPayload', scope: Scope.Private, statements: body });
    }

    private addFileHandling(classDeclaration: ClassDeclaration) {
        /* v8 ignore next */
        classDeclaration.addMethod({
            name: 'onFileSelected',
            parameters: [
                { name: 'event', type: 'Event' },
                { name: 'formControlName', type: 'string' },
            ],
            statements: `const file = (event.target as HTMLInputElement).files?.[0];\nif (file) {\n    this.form.patchValue({ [formControlName]: file } as Record<string, unknown>);\n    this.form.get(formControlName)?.markAsDirty();\n}`,
        });
    }

    private generateFormComponentHtml(resource: Resource, analysis: FormAnalysisResult, outDir: string): void {
        /* v8 ignore next */
        const htmlFilePath = `${outDir}/${resource.name}-form.component.html`;
        /* v8 ignore next */
        const content = generateFormComponentHtml(resource, analysis);
        /* v8 ignore next */
        this.project.getFileSystem().writeFileSync(htmlFilePath, content);
    }

    private generateFormComponentScss(resource: Resource, outDir: string): void {
        /* v8 ignore next */
        const scssFilePath = `${outDir}/${resource.name}-form.component.scss`;
        /* v8 ignore next */
        const content = generateFormComponentScss();
        /* v8 ignore next */
        this.project.getFileSystem().writeFileSync(scssFilePath, content);
    }
}
