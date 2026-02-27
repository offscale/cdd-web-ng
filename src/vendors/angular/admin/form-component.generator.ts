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
        private readonly project: Project,
        private readonly parser: SwaggerParser,
    ) {}

    public generate(resource: Resource, outDir: string): { usesCustomValidators: boolean } {
        const formDir = `${outDir}/${resource.name}/${resource.name}-form`;
        this.project.getFileSystem().mkdirSync(formDir);

        // Phase 1: Analysis
        const builder = new FormModelBuilder(this.parser);
        const analysis = builder.build(resource);

        // Phase 2: Emission
        // FIX: Pass the already resolved formDir as the output location for the component TS
        const tsResult = this.generateFormComponentTs(resource, formDir, analysis);
        this.generateFormComponentHtml(resource, analysis, formDir);
        this.generateFormComponentScss(resource, formDir);

        return { usesCustomValidators: tsResult.usesCustomValidators };
    }

    private generateFormComponentTs(
        resource: Resource,
        outDir: string,
        analysis: FormAnalysisResult,
    ): {
        usesCustomValidators: boolean;
    } {
        const componentName = `${pascalCase(resource.modelName)}FormComponent`;
        const serviceName = `${pascalCase(resource.name)}Service`;
        // Construct path using the specific directory passed in (e.g. /admin/users/users-form)
        const formFilePath = `${outDir}/${resource.name}-form.component.ts`;
        const sourceFile = this.project.createSourceFile(formFilePath, undefined, { overwrite: true });
        // The builder creates the main interface with this name
        const formInterfaceName =
            analysis.interfaces.find(i => i.isTopLevel)?.name || `${pascalCase(resource.modelName)}Form`;

        // Collect all polymorphic models for import
        const oneOfImports = analysis.polymorphicProperties.flatMap(p => p.options.map(o => o.modelName)).join(', ');

        sourceFile.addStatements(
            [
                `import { Component, OnInit, computed, inject, signal, effect, ChangeDetectionStrategy, DestroyRef } from '@angular/core';`,
                `import { takeUntilDestroyed } from '@angular/core/rxjs-interop';`,
                `import { FormBuilder, FormGroup, FormArray, Validators, FormControl, ReactiveFormsModule } from '@angular/forms';`,
                `import { ActivatedRoute, Router, RouterModule } from '@angular/router';`,
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
        const findControlInModel = (
            controls: FormControlModel[],
            name: string,
            searchPolymorphic: boolean = true,
        ): FormControlModel | undefined => {
            for (const control of controls) {
                if (control.name === name) return control;
                if (control.nestedControls) {
                    const nested = findControlInModel(control.nestedControls, name);
                    if (nested) return nested;
                }
            }
            // Also check polymorphic options, as their controls are not in the main tree
            if (searchPolymorphic) {
                for (const propConfig of analysis.polymorphicProperties) {
                    for (const polyOption of propConfig.options) {
                        const nested = findControlInModel(polyOption.controls, name, false);
                        if (nested) return nested;
                    }
                }
            }
            return undefined;
        };

        // Emit all Interfaces generated by analysis
        analysis.interfaces.forEach(iface => {
            sourceFile.addInterface({
                name: iface.name,
                isExported: iface.isTopLevel,
                properties: iface.properties.map(prop => {
                    // Find the control model that corresponds to this property name
                    const control = findControlInModel(analysis.topLevelControls, prop.name);

                    // If a control isn't found (e.g., a polymorphic sub-form property),
                    // we search those specifically.
                    if (!control) {
                        // Silently fallback to any, assuming it might be handled in sub-type interfaces or not significant for layout
                        return { name: prop.name, type: 'any' };
                    }

                    // Build the final Angular-specific type string from the agnostic IR.
                    let finalType: string;
                    switch (control.controlType) {
                        case 'group':
                            finalType = `FormGroup<${control.dataType}>`;
                            break;
                        case 'array':
                            if (control.nestedControls) {
                                // Array of FormGroups
                                const itemType = control.dataType.replace('[]', '');
                                finalType = `FormArray<FormGroup<${itemType}>>`;
                            } else {
                                // Array of FormControls (primitives)
                                const itemType = control.dataType.replace(/[()]/g, '').replace('[]', '');
                                finalType = `FormArray<FormControl<${itemType}>>`;
                            }
                            break;
                        case 'map':
                            // Maps are rendered as FormArray of Key-Value tuples for editing
                            // dataType here is the Value type
                            // We use `any` for the generic here to simplify avoiding deep recursion in the type definition,
                            // since the form logic handles the transformation.
                            finalType = `FormArray<FormGroup<{ key: FormControl<string | null>, value: FormControl<any> }>>`;
                            break;
                        case 'control':
                        default:
                            finalType = `FormControl<${control.dataType}>`;
                            break;
                    }
                    return { name: control.name, type: finalType };
                }),
            });
        });

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

        this.addProperties(componentClass, resource, serviceName, formInterfaceName, analysis);

        // Dynamic Effects (Polymorphism + Dependent Schemas)
        if (analysis.isPolymorphic || analysis.dependencyRules.length > 0) {
            componentClass.addConstructor({
                statements: writer => {
                    writer.writeLine('// Setup dynamic form effects');

                    // 1. Polymorphism logic
                    if (analysis.isPolymorphic) {
                        analysis.polymorphicProperties.forEach(poly => {
                            const propName = poly.propertyName;
                            const updateMethod = `updateFormFor${pascalCase(propName)}`;
                            writer.write(`effect(() => {
    const val = this.form.get('${propName}')?.value;
    if (val) { this.${updateMethod}(val); }
});\n`);
                        });
                    }

                    // 2. Dependent Schemas/Required Logic (OAS 3.1)
                    if (analysis.dependencyRules.length > 0) {
                        writer.writeLine('// Dependent Schemas: If trigger field is present, target is required.');
                        writer.writeLine('effect(() => {');

                        // Group targets by trigger to avoid duplicate subscribes (though effect handles deps fine)
                        const groups = new Map<string, string[]>();
                        analysis.dependencyRules.forEach(r => {
                            if (!groups.has(r.triggerField)) groups.set(r.triggerField, []);
                            groups.get(r.triggerField)?.push(r.targetField);
                        });

                        groups.forEach((targets, trigger) => {
                            writer.writeLine(`  const ${trigger}Value = this.form.get('${trigger}')?.value;`);
                            writer.writeLine(
                                `  if (${trigger}Value !== null && ${trigger}Value !== undefined && ${trigger}Value !== '') {`,
                            );
                            targets.forEach(target => {
                                writer.writeLine(`    this.form.get('${target}')?.addValidators(Validators.required);`);
                                writer.writeLine(
                                    `    this.form.get('${target}')?.updateValueAndValidity({ emitEvent: false });`,
                                );
                            });
                            writer.writeLine(`  } else {`);
                            targets.forEach(target => {
                                writer.writeLine(
                                    `    this.form.get('${target}')?.removeValidators(Validators.required);`,
                                );
                                writer.writeLine(
                                    `    this.form.get('${target}')?.updateValueAndValidity({ emitEvent: false });`,
                                );
                            });
                            writer.writeLine(`  }`);
                        });

                        writer.writeLine('});');
                    }
                },
            });
        }

        this.addNgOnInit(
            componentClass,
            resource,
            serviceName,
            analysis.hasFormArrays || analysis.isPolymorphic || !!analysis.hasMaps,
        );
        this.addInitForm(componentClass, formInterfaceName, analysis.topLevelControls);

        if (analysis.isPolymorphic) this.addPolymorphismLogic(componentClass, resource, analysis);
        if (analysis.hasFileUploads) this.addFileHandling(componentClass);
        if (analysis.hasFormArrays) this.addFormArrayHelpers(componentClass, analysis.topLevelControls);
        if (analysis.hasMaps) this.addMapHelpers(componentClass, analysis.topLevelControls);
        if (analysis.hasFormArrays || analysis.isPolymorphic || analysis.hasMaps)
            this.addPatchForm(componentClass, resource, analysis);

        // Always add getPayload to ensure readOnly fields are stripped and structural transformations are applied
        this.addGetPayload(componentClass, analysis);

        // Pass true to force usage of getPayload()
        this.addOnSubmit(componentClass, resource, serviceName, true);
        this.addOnCancelMethod(componentClass);

        sourceFile.formatText({ ensureNewLineAtEndOfFile: true });
        return { usesCustomValidators: analysis.usesCustomValidators };
    }

    private addProperties(
        classDeclaration: ClassDeclaration,
        resource: Resource,
        serviceName: string,
        formInterfaceName: string,
        analysis: FormAnalysisResult,
    ): void {
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
        if (analysis.isPolymorphic) {
            analysis.polymorphicProperties.forEach(poly => {
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

        const processedEnums = new Set<string>();
        const findEnums = (properties: FormControlModel[]) => {
            for (const prop of properties) {
                const schema = prop.schema;
                if (!schema) continue;
                const itemsSchema = (schema.type === 'array' ? schema.items : schema) as SwaggerDefinition | undefined;
                if (!itemsSchema) continue;
                if (itemsSchema.enum) {
                    const optionsName = `${pascalCase(prop.name)}Options`;
                    if (!processedEnums.has(optionsName)) {
                        classDeclaration.addProperty({
                            name: optionsName,
                            isReadonly: true,
                            initializer: JSON.stringify(itemsSchema.enum),
                        });
                        processedEnums.add(optionsName);
                    }
                }
                if (prop.nestedControls) {
                    findEnums(prop.nestedControls);
                }
            }
        };
        findEnums(analysis.topLevelControls);
    }

    private addNgOnInit(
        classDeclaration: ClassDeclaration,
        resource: Resource,
        serviceName: string,
        needsComplexPatch: boolean,
    ): void {
        const getByIdOp = resource.operations.find(op => op.action === 'getById');
        const patchCall = needsComplexPatch ? 'this.patchForm(entity)' : 'this.form.patchValue(entity as any)';
        let body = `this.initForm();\nconst id = this.route.snapshot.paramMap.get('id');\nif (id) {\n  this.id.set(id);`;
        if (getByIdOp?.methodName) {
            body += `\n  this.${camelCase(serviceName)}.${getByIdOp.methodName}(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(entity => {\n    ${patchCall};\n  });`;
        }
        body += '\n}';
        classDeclaration.addMethod({ name: 'ngOnInit', statements: body });
    }

    private addInitForm(classDeclaration: ClassDeclaration, interfaceName: string, controls: FormControlModel[]): void {
        const formControls = controls
            .map(c => `'${c.name}': ${FormInitializerRenderer.renderControlInitializer(c)}`)
            .join(',\n      ');

        let statement = `this.form = new FormGroup<${interfaceName}>({\n      ${formControls}\n    });`;

        // CHANGE: Disable readOnly controls immediately after initialization
        const readOnlyPaths = this.findReadOnlyControls(controls);
        if (readOnlyPaths.length > 0) {
            const disableStats = readOnlyPaths
                .map(path => `this.form.get('${path}')?.disable({ emitEvent: false });`)
                .join('\n    ');
            statement += `\n    ${disableStats}`;
        }

        classDeclaration.addMethod({ name: 'initForm', scope: Scope.Private, statements: statement });
    }

    /**
     * Recursively finds paths for readOnly controls to disable.
     */
    private findReadOnlyControls(controls: FormControlModel[], prefix = ''): string[] {
        let paths: string[] = [];
        for (const control of controls) {
            const schema = control.schema;
            const controlPath = prefix ? `${prefix}.${control.name}` : control.name;

            if (schema?.readOnly) {
                paths.push(controlPath);
            }

            if (control.nestedControls && control.controlType === 'group') {
                // Only recurse for groups, arrays handle their own items dynamically usually
                // (though readOnly array implies the whole array is readOnly, handled by parent check usually)
                paths = paths.concat(this.findReadOnlyControls(control.nestedControls, controlPath));
            }
        }
        return paths;
    }

    private addFormArrayHelpers(classDeclaration: ClassDeclaration, topLevelControls: FormControlModel[]): void {
        const findArrays = (ctrls: FormControlModel[]): FormControlModel[] => {
            let found: FormControlModel[] = [];
            for (const c of ctrls) {
                if (c.controlType === 'array' && c.nestedControls) found.push(c);
            }
            return found;
        };

        const formArrayProps = findArrays(topLevelControls);

        formArrayProps.forEach(prop => {
            const arrayName = prop.name;
            const singularPascal = pascalCase(singular(arrayName));
            const singularCamel = camelCase(singular(arrayName));
            const arrayGetterName = `${singularCamel}Array`;

            const arrayItemInterfaceName = prop.nestedFormInterface || 'any';

            classDeclaration.addGetAccessor({
                name: arrayGetterName,
                returnType: `FormArray<FormGroup<${arrayItemInterfaceName}>>`,
                statements: `return this.form.get('${arrayName}') as FormArray<FormGroup<${arrayItemInterfaceName}>>;`,
                docs: [`Getter for the ${singularCamel} FormArray.`],
            });

            const createMethod = classDeclaration.addMethod({
                name: `create${singularPascal}`,
                scope: Scope.Private,
                parameters: [{ name: 'item?', type: 'any' }],
                returnType: `FormGroup<${arrayItemInterfaceName}>`,
            });

            const initializerString = FormInitializerRenderer.renderFormArrayItemInitializer(prop.nestedControls!);
            createMethod.setBodyText(`return ${initializerString};`);

            classDeclaration.addMethod({
                name: `add${singularPascal}`,
                statements: `this.${arrayGetterName}.push(this.create${singularPascal}());`,
            });
            classDeclaration.addMethod({
                name: `remove${singularPascal}`,
                parameters: [{ name: 'index', type: 'number' }],
                statements: `this.${arrayGetterName}.removeAt(index);`,
            });
        });
    }

    private addMapHelpers(classDeclaration: ClassDeclaration, topLevelControls: FormControlModel[]): void {
        const maps = topLevelControls.filter(c => c.controlType === 'map');

        maps.forEach(prop => {
            const mapName = prop.name;
            const pascalName = pascalCase(mapName);
            const getterName = `${camelCase(mapName)}Map`;

            classDeclaration.addGetAccessor({
                name: getterName,
                // Return specialized FormArray of KV pairs
                returnType: `FormArray<FormGroup<{ key: FormControl<string | null>, value: FormControl<any> }>>`,
                statements: `return this.form.get('${mapName}') as FormArray;`,
            });

            const createMethod = classDeclaration.addMethod({
                name: `create${pascalName}Entry`,
                scope: Scope.Private,
                parameters: [{ name: 'item?', type: 'any' }],
                returnType: `FormGroup`, // Simplify return type to generic FormGroup for brevity/compatibility
            });

            if (prop.mapValueControl) {
                const initializer = FormInitializerRenderer.renderMapItemInitializer(
                    prop.mapValueControl,
                    prop.keyPattern,
                    prop.keyMinLength,
                    prop.keyMaxLength,
                );
                createMethod.setBodyText(`return ${initializer};`);
            } else {
                createMethod.setBodyText(`return new FormGroup({});`);
            }

            classDeclaration.addMethod({
                name: `add${pascalName}Entry`,
                statements: `this.${getterName}.push(this.create${pascalName}Entry());`,
            });

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
        const createOp = resource.operations.find(op => op.action === 'create');
        const updateOp = resource.operations.find(op => op.action === 'update');
        if (!createOp?.methodName && !updateOp?.methodName) return;

        const payloadExpr = needsPayloadTransform ? 'this.getPayload()' : 'this.form.getRawValue()';
        let body = `if (!this.form.valid) { return; }\nconst finalPayload = ${payloadExpr};\n`;

        if (createOp?.methodName && updateOp?.methodName) {
            body += `const action$ = this.isEditMode()\n  ? this.${camelCase(serviceName)}.${updateOp.methodName}(this.id()!, finalPayload)\n  : this.${camelCase(serviceName)}.${createOp.methodName}(finalPayload);\n`;
        } else if (updateOp?.methodName) {
            body += `if (!this.isEditMode()) { console.error('Form is not in edit mode, but no create operation is available.'); return; }\n`;
            body += `const action$ = this.${camelCase(serviceName)}.${updateOp.methodName}(this.id()!, finalPayload);\n`;
        } else {
            body += `if (this.isEditMode()) { console.error('Form is in edit mode, but no update operation is available.'); return; }\n`;
            body += `const action$ = this.${camelCase(serviceName)}.${createOp!.methodName}(finalPayload);\n`;
        }
        body += `action$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({\n  next: () => {\n    this.snackBar.open('${resource.modelName} saved successfully!', 'Close', { duration: 3000 });\n    this.router.navigate(['../'], { relativeTo: this.route });\n  },\n  error: (err) => {\n    console.error('Error saving ${resource.modelName}', err);\n    this.snackBar.open('Error saving ${resource.modelName}', 'Close', { duration: 5000, panelClass: 'error-snackbar' });\n  }\n});`;
        classDeclaration.addMethod({ name: 'onSubmit', statements: body });
    }

    private addOnCancelMethod(classDeclaration: ClassDeclaration): void {
        classDeclaration.addMethod({
            name: 'onCancel',
            statements: `this.router.navigate(['../'], { relativeTo: this.route });`,
        });
    }

    private addPatchForm(classDeclaration: ClassDeclaration, resource: Resource, analysis: FormAnalysisResult): void {
        const arrayProps = analysis.topLevelControls.filter(c => c.controlType === 'array' && c.nestedControls);
        const mapProps = analysis.topLevelControls.filter(c => c.controlType === 'map');

        const discriminatorProps = analysis.polymorphicProperties.map(p => p.propertyName);

        const complexProps = [...arrayProps.map(p => p.name), ...mapProps.map(p => p.name), ...discriminatorProps];

        if (complexProps.length === 0) return;

        let body = `const { ${complexProps.join(', ')}, ...rest } = entity;\n`;
        body += 'this.form.patchValue(rest as any);\n\n';

        // Patch Arrays
        arrayProps.forEach(prop => {
            const arrayGetterName = `${camelCase(singular(prop.name))}Array`;
            const createItemMethodName = `create${pascalCase(singular(prop.name))}`;
            body += `if (Array.isArray(entity.${prop.name})) {\n`;
            body += `  this.${arrayGetterName}.clear();\n`;
            body += `  entity.${prop.name}.forEach((item: any) => this.${arrayGetterName}.push(this.${createItemMethodName}(item)));\n`;
            body += `}\n`;
        });

        // Patch Maps (Object -> Array of KV)
        mapProps.forEach(prop => {
            const mapGetter = `${camelCase(prop.name)}Map`;
            const createEntry = `create${pascalCase(prop.name)}Entry`;
            body += `if (entity.${prop.name} && typeof entity.${prop.name} === 'object') {\n`;
            body += `  this.${mapGetter}.clear();\n`;
            body += `  Object.entries(entity.${prop.name}).forEach(([key, value]) => {\n`;
            body += `    this.${mapGetter}.push(this.${createEntry}({ key, value }));\n`;
            body += `  });\n`;
            body += `}\n`;
        });

        if (analysis.isPolymorphic) {
            analysis.polymorphicProperties.forEach(poly => {
                const dPropName = poly.propertyName;

                body += `\nconst ${dPropName}Value = (entity as any).${dPropName};\n`;
                body += `if (${dPropName}Value) {\n`;
                body += `  this.form.get('${dPropName}')?.setValue(${dPropName}Value, { emitEvent: true });\n`;

                poly.options.forEach(opt => {
                    const subSchemaName = opt.modelName;
                    const typeName = opt.discriminatorValue;
                    const isMethodName = `is${pascalCase(dPropName)}_${subSchemaName}`;
                    body += `  if (this.${isMethodName}(entity)) {\n`;
                    body += `    (this.form.get('${typeName}') as FormGroup)?.patchValue(entity as any);\n  }\n`;
                });
                body += `}\n`;
            });
        }
        classDeclaration.addMethod({
            name: 'patchForm',
            scope: Scope.Private,
            parameters: [{ name: 'entity', type: resource.modelName || 'any' }],
            statements: body,
        });
    }

    private addPolymorphismLogic(classDeclaration: ClassDeclaration, resource: Resource, analysis: FormAnalysisResult) {
        analysis.polymorphicProperties.forEach(poly => {
            const dPropName = poly.propertyName;
            const optionsName = `${dPropName}Options`;

            const updateMethod = classDeclaration.addMethod({
                name: `updateFormFor${pascalCase(dPropName)}`,
                scope: Scope.Private,
                parameters: [{ name: 'type', type: 'string' }],
            });

            if (poly.options.length > 0) {
                let switchBody = `// Remove all options for this discriminator\n`;
                switchBody += `this.${optionsName}.forEach(opt => this.form.removeControl(opt as any));\n\nswitch(type) {\n`;

                poly.options.forEach(opt => {
                    const subFormProps = opt.controls
                        .map(c => `'${c.name}': ${FormInitializerRenderer.renderControlInitializer(c)}`)
                        .join(', ');
                    switchBody += `  case '${opt.discriminatorValue}':\n`;
                    switchBody += `    this.form.addControl('${opt.subFormName}' as any, this.fb.group({ ${subFormProps} }));\n`;
                    switchBody += '    break;\n';
                });
                switchBody += '}';
                updateMethod.setBodyText(switchBody);
            } else {
                updateMethod.setBodyText(`{}`);
            }

            classDeclaration.addMethod({
                name: `is${pascalCase(dPropName)}`,
                parameters: [{ name: 'type', type: 'string' }],
                returnType: 'boolean',
                statements: `return this.form.get('${dPropName}')?.value === type;`,
            });

            poly.options.forEach(opt => {
                const subSchemaName = opt.modelName;
                const typeName = opt.discriminatorValue;
                classDeclaration.addMethod({
                    name: `is${pascalCase(dPropName)}_${subSchemaName}`, // e.g. isPetType_Cat
                    scope: Scope.Private,
                    parameters: [{ name: 'entity', type: resource.modelName }],
                    returnType: `entity is ${subSchemaName}`,
                    statements: `return (entity as any).${dPropName} === '${typeName}';`,
                });
            });
        });
    }

    private addGetPayload(classDeclaration: ClassDeclaration, analysis: FormAnalysisResult) {
        let body = `const baseValue = this.form.getRawValue() as any; \n`;

        // We start by creating a shallow copy.
        // Note: Nested objects are still references, but we primarily modify top-level structural keys
        // (readOnly deletion, Maps transformation, Polymorphism merging).
        body += `let payload = { ...baseValue };\n`;

        // 1. Strip ReadOnly Fields (COMPLIANCE FIX)
        // Identify top-level read-only fields and remove them from the payload to ensure payload hygiene.
        // Note: We use analysis.topLevelControls rather than resource.formProperties because the controls
        // have parsed validation rules/schema info readily available.
        const readOnlyFields = analysis.topLevelControls.filter(c => c.schema && c.schema.readOnly).map(c => c.name);

        if (readOnlyFields.length > 0) {
            body += `\n// Strip readOnly fields\n`;
            readOnlyFields.forEach(field => {
                body += `delete (payload as any)['${field}'];\n`;
            });
        }

        // 2. Maps Transformation (Array of KV -> Object)
        const maps = analysis.topLevelControls.filter(c => c.controlType === 'map');
        maps.forEach(m => {
            body += `if (Array.isArray(payload['${m.name}'])) {\n`;
            body += `  const mapObj: Record<string, any> = {};\n`;
            body += `  payload['${m.name}'].forEach((pair: any) => { if(pair.key) mapObj[pair.key] = pair.value; });\n`;
            body += `  payload['${m.name}'] = mapObj;\n`;
            body += `}\n`;
        });

        // 3. Polymorphism
        if (analysis.isPolymorphic) {
            analysis.polymorphicProperties.forEach(poly => {
                const dProp = poly.propertyName;
                const optionsName = `${dProp}Options`;

                body += `const ${dProp}Value = payload['${dProp}'];\n`;
                body += `if (${dProp}Value) {\n`;
                body += `  const subFormValue = (this.form.get(${dProp}Value) as FormGroup | undefined)?.getRawValue() || {};\n`;
                body += `  payload = { ...payload, ...subFormValue };\n`;
                body += `}\n`;
                body += `this.${optionsName}.forEach(opt => delete (payload as any)[opt]);\n`;
            });
        }

        body += `return payload;`;

        classDeclaration.addMethod({ name: 'getPayload', scope: Scope.Private, statements: body });
    }

    private addFileHandling(classDeclaration: ClassDeclaration) {
        classDeclaration.addMethod({
            name: 'onFileSelected',
            parameters: [
                { name: 'event', type: 'Event' },
                { name: 'formControlName', type: 'string' },
            ],
            statements: `const file = (event.target as HTMLInputElement).files?.[0];\nif (file) {\n    this.form.patchValue({ [formControlName]: file } as any);\n    this.form.get(formControlName)?.markAsDirty();\n}`,
        });
    }

    private generateFormComponentHtml(resource: Resource, analysis: FormAnalysisResult, outDir: string): void {
        const htmlFilePath = `${outDir}/${resource.name}-form.component.html`;
        const content = generateFormComponentHtml(resource, analysis);
        this.project.getFileSystem().writeFileSync(htmlFilePath, content);
    }

    private generateFormComponentScss(resource: Resource, outDir: string): void {
        const scssFilePath = `${outDir}/${resource.name}-form.component.scss`;
        const content = generateFormComponentScss();
        this.project.getFileSystem().writeFileSync(scssFilePath, content);
    }
}
