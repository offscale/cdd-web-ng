import { ClassDeclaration, Project, Scope, SyntaxKind, InterfaceDeclaration, WriterFunction } from 'ts-morph';
import { FormProperty, Resource, SwaggerDefinition } from '../../../core/types.js';
import { camelCase, getTypeScriptType, pascalCase, singular } from '../../../core/utils.js';
import { commonStandaloneImports } from './common-imports.js';
import { mapSchemaToFormControl } from './form-control.mapper.js';
import { generateFormComponentHtml } from './html/form-component-html.builder.js';
import { generateFormComponentScss } from './html/form-component-scss.builder.js';
import { SwaggerParser } from '../../../core/parser.js';

/**
 * Generates the TypeScript, HTML, and SCSS files for an Angular standalone
 * form component based on an OpenAPI resource definition.
 */
export class FormComponentGenerator {
    /**
     * @param project The ts-morph Project instance for AST manipulation.
     * @param parser The SwaggerParser instance to resolve schema references for polymorphism.
     */
    constructor(
        private readonly project: Project,
        private readonly parser: SwaggerParser
    ) {}

    /**
     * Main entry point for generating all files related to a form component.
     * It creates the component's directory and orchestrates the generation of its
     * TypeScript class, HTML template, and SCSS styles.
     *
     * @param resource The resource definition, including its name, model, and properties.
     * @param outDir The root directory for admin component generation (e.g., '/generated/admin').
     * @returns An object indicating if custom validators were used, which informs the AdminGenerator.
     */
    public generate(resource: Resource, outDir: string): { usesCustomValidators: boolean } {
        const formDir = `${outDir}/${resource.name}/${resource.name}-form`;
        this.project.getFileSystem().mkdirSync(formDir);

        const tsResult = this.generateFormComponentTs(resource, formDir);
        this.generateFormComponentHtml(resource, formDir);
        this.generateFormComponentScss(resource, formDir);
        return { usesCustomValidators: tsResult.usesCustomValidators };
    }

    /**
     * Generates the `.component.ts` file.
     * @private
     */
    private generateFormComponentTs(resource: Resource, outDir: string): { usesCustomValidators: boolean } {
        const componentName = `${pascalCase(resource.modelName)}FormComponent`;
        const serviceName = `${pascalCase(resource.name)}Service`;
        const formFilePath = `${outDir}/${resource.name}-form.component.ts`;
        const sourceFile = this.project.createSourceFile(formFilePath, undefined, { overwrite: true });
        const formInterfaceName = `${pascalCase(resource.modelName)}Form`;

        const hasFormArrays = resource.formProperties.some(p => p.schema.type === 'array' && (p.schema.items as SwaggerDefinition)?.properties);
        const hasFileUploads = resource.formProperties.some(p => p.schema.format === 'binary');
        const oneOfProp = resource.formProperties.find(p => p.schema.oneOf && p.schema.discriminator);

        let usesCustomValidators = false;

        const checkValidators = (properties: FormProperty[]) => {
            for (const prop of properties) {
                const schema = prop.schema;

                // Check top-level property
                let info = mapSchemaToFormControl(schema);
                if (info?.validators.some(v => v.startsWith('CustomValidators'))) {
                    usesCustomValidators = true;
                }

                // If it's an array, check the items
                if (schema.type === 'array' && schema.items) {
                    const itemsSchema = schema.items as SwaggerDefinition;
                    info = mapSchemaToFormControl(itemsSchema);
                    if (info?.validators.some(v => v.startsWith('CustomValidators'))) {
                        usesCustomValidators = true;
                    }
                    // Recursively check properties of objects inside arrays
                    if (itemsSchema.properties) {
                        checkValidators(Object.entries(itemsSchema.properties).map(([name, schema]) => ({ name, schema })));
                    }
                }

                // Recursively check properties of nested objects
                if (schema.type === 'object' && schema.properties) {
                    checkValidators(Object.entries(schema.properties).map(([name, schema]) => ({ name, schema })));
                }
            }
        };
        checkValidators(resource.formProperties);

        const oneOfImports = oneOfProp?.schema.oneOf
            ?.map(s => s.$ref ? pascalCase(s.$ref.split('/').pop()!) : null)
            .filter((name): name is string => !!name)
            .join(', ') || '';

        sourceFile.addStatements([
            `import { Component, OnInit, OnDestroy, computed, inject, signal, effect } from '@angular/core';`,
            `import { FormBuilder, FormGroup, FormArray, Validators, FormControl } from '@angular/forms';`,
            `import { ActivatedRoute, Router } from '@angular/router';`,
            ...commonStandaloneImports.map(a => `import { ${a[0]} } from "${a[1]}";`),
            `import { MatSnackBar } from '@angular/material/snack-bar';`,
            `import { Subscription } from 'rxjs';`,
            `import { ${serviceName} } from '../../../services/${camelCase(resource.name)}.service';`,
            `import { ${resource.modelName}${oneOfImports ? ', ' + oneOfImports : ''} } from '../../../models';`,
            usesCustomValidators ? `import { CustomValidators } from '../../shared/custom-validators';` : ''
        ].filter(Boolean));

        this.generateFormInterface(sourceFile, formInterfaceName, resource.formProperties);

        const componentClass = sourceFile.addClass({
            name: componentName,
            isExported: true,
            decorators: [{
                name: 'Component',
                arguments: [`{
                    selector: 'app-${resource.name}-form',
                    standalone: true,
                    imports: [
                        ReactiveFormsModule,
                        RouterModule,
                        ${commonStandaloneImports.map(a => a[0]).join(',\n')}
                    ],
                    templateUrl: './${resource.name}-form.component.html',
                    styleUrl: './${resource.name}-form.component.scss'
                }`]
            }],
            implements: ['OnInit', 'OnDestroy']
        });

        this.addProperties(componentClass, resource, serviceName, formInterfaceName, oneOfProp);
        this.addNgOnInit(componentClass, resource, serviceName, hasFormArrays || !!oneOfProp);
        this.addInitForm(componentClass, resource, formInterfaceName);
        if (oneOfProp) this.addPolymorphismLogic(componentClass, oneOfProp, resource);
        if (hasFileUploads) this.addFileHandling(componentClass);
        if (hasFormArrays) this.addFormArrayHelpers(componentClass, resource);
        if (hasFormArrays || oneOfProp) this.addPatchForm(componentClass, resource, oneOfProp);
        if (oneOfProp) this.addGetPayload(componentClass, oneOfProp);
        this.addOnSubmit(componentClass, resource, serviceName, !!oneOfProp);
        this.addOnCancelMethod(componentClass);
        this.addNgOnDestroy(componentClass);

        sourceFile.formatText({ ensureNewLineAtEndOfFile: true });
        return { usesCustomValidators };
    }

    private getFormControlTypeString(schema: SwaggerDefinition): string {
        const knownTypes = this.parser.schemas.map(s => s.name);
        // The type inside FormControl should be the same as the model property type.
        // We pass a temporary config to getTypeScriptType to ensure Date is handled correctly.
        const type = getTypeScriptType(schema, { options: { dateType: 'Date' } } as any, knownTypes);
        return `${type} | null`;
    }

    private generateFormInterface(
        sourceFile: SourceFile,
        interfaceName: string,
        properties: FormProperty[],
        isTopLevel = true
    ): void {
        const interfaceDeclaration = sourceFile.addInterface({
            name: interfaceName,
            isExported: isTopLevel,
        });

        for (const prop of properties) {
            if (prop.schema.readOnly) continue;

            const schema = prop.schema;
            let propType: string;

            if (schema.type === 'object' && schema.properties) {
                const nestedInterfaceName = `${pascalCase(prop.name)}Form`;
                this.generateFormInterface(sourceFile, nestedInterfaceName,
                    Object.entries(schema.properties).map(([name, schema]) => ({ name, schema })),
                    false // Nested interfaces don't need to be exported
                );
                propType = `FormGroup<${nestedInterfaceName}>`;
            } else if (schema.type === 'array') {
                const itemSchema = schema.items as SwaggerDefinition;
                if (itemSchema?.properties) {
                    const arrayItemInterfaceName = `${pascalCase(singular(prop.name))}Form`;
                    this.generateFormInterface(sourceFile, arrayItemInterfaceName,
                        Object.entries(itemSchema.properties).map(([name, schema]) => ({ name, schema })),
                        false
                    );
                    propType = `FormArray<FormGroup<${arrayItemInterfaceName}>>`;
                } else {
                    const itemTsType = this.getFormControlTypeString(itemSchema);
                    propType = `FormArray<FormControl<${itemTsType}>>`;
                }
            } else {
                const tsType = this.getFormControlTypeString(schema);
                propType = `FormControl<${tsType}>`;
            }
            interfaceDeclaration.addProperty({ name: prop.name, type: propType });
        }
    }

    /**
     * Adds all necessary properties to the component class, including injected services,
     * signals for state management, and dynamic properties for enums or discriminators.
     * @private
     */
    private addProperties(classDeclaration: ClassDeclaration, resource: Resource, serviceName: string, formInterfaceName: string, oneOfProp?: FormProperty): void {
        classDeclaration.addProperties([
            { name: 'fb', isReadonly: true, initializer: 'inject(FormBuilder)' },
            { name: 'route', isReadonly: true, initializer: 'inject(ActivatedRoute)' },
            { name: 'router', isReadonly: true, initializer: 'inject(Router)' },
            { name: 'snackBar', isReadonly: true, initializer: 'inject(MatSnackBar)' },
            { name: `${camelCase(serviceName)}`, isReadonly: true, type: serviceName, initializer: `inject(${serviceName})` },
            { name: `form!: FormGroup<${formInterfaceName}>` },
            { name: 'id = signal<string | null>(null)' },
            { name: 'isEditMode = computed(() => !!this.id())' },
            { name: 'formTitle', initializer: `computed(() => this.isEditMode() ? 'Edit ${resource.modelName}' : 'Create ${resource.modelName}')` },
            { name: 'subscriptions: Subscription[]', initializer: '[]' },
        ]);

        if (oneOfProp) {
            const dPropName = oneOfProp.schema.discriminator!.propertyName;
            const dOptions = oneOfProp.schema.oneOf!
                .map(s => this.parser.resolveReference(s.$ref!)!)
                .map(def => def.properties![dPropName].enum![0]);
            classDeclaration.addProperties([
                { name: 'discriminatorOptions', isReadonly: true, initializer: JSON.stringify(dOptions) },
                { name: 'discriminatorPropName', isReadonly: true, scope: Scope.Private, initializer: `'${dPropName}'` }
            ]);
        }

        const processedEnums = new Set<string>();
        const findEnums = (properties: FormProperty[]) => {
            for (const prop of properties) {
                const schema = prop.schema;
                const itemsSchema = (schema.type === 'array' ? schema.items : schema) as SwaggerDefinition | undefined;

                if (!itemsSchema) {
                    continue;
                }

                if (itemsSchema.enum) {
                    const optionsName = `${pascalCase(prop.name)}Options`;
                    if (!processedEnums.has(optionsName)) {
                        classDeclaration.addProperty({ name: optionsName, isReadonly: true, initializer: JSON.stringify(itemsSchema.enum) });
                        processedEnums.add(optionsName);
                    }
                }
                if (itemsSchema.properties) {
                    findEnums(Object.entries(itemsSchema.properties).map(([name, schema]) => ({ name, schema })));
                }
            }
        };
        findEnums(resource.formProperties);
    }

    /** @private */
    private addNgOnInit(classDeclaration: ClassDeclaration, resource: Resource, serviceName: string, needsComplexPatch: boolean): void {
        const getByIdOp = resource.operations.find(op => op.action === 'getById');
        const patchCall = needsComplexPatch ? 'this.patchForm(entity)' : 'this.form.patchValue(entity as any)';
        let body = `this.initForm();\nconst id = this.route.snapshot.paramMap.get('id');\nif (id) {\n  this.id.set(id);`;
        if (getByIdOp?.methodName) {
            body += `\n  const sub = this.${camelCase(serviceName)}.${getByIdOp.methodName}(id).subscribe(entity => {\n    ${patchCall};\n  });\n  this.subscriptions.push(sub);`;
        }
        body += '\n}';
        classDeclaration.addMethod({ name: 'ngOnInit', statements: body });
    }

    /** @private */
    private addInitForm(classDeclaration: ClassDeclaration, resource: Resource, formInterfaceName: string): void {
        const formControls = resource.formProperties
            .filter(prop => !prop.schema.readOnly)
            .map(prop => `'${prop.name}': ${this.getFormControlInitializerString(prop.schema)}`)
            .join(',\n      ');

        const statement = `this.form = new FormGroup<${formInterfaceName}>({\n      ${formControls}\n    });`;
        classDeclaration.addMethod({ name: 'initForm', scope: Scope.Private, statements: statement });
    }

    /** @private */
    private addOnSubmit(classDeclaration: ClassDeclaration, resource: Resource, serviceName: string, hasPolymorphism: boolean): void {
        const createOp = resource.operations.find(op => op.action === 'create');
        const updateOp = resource.operations.find(op => op.action === 'update');

        if (!createOp?.methodName && !updateOp?.methodName) {
            return;
        }

        const payloadExpr = hasPolymorphism ? 'this.getPayload()' : 'this.form.getRawValue()';
        let body = `if (!this.form.valid) { return; }\nconst finalPayload = ${payloadExpr};\n`;

        if (createOp?.methodName && updateOp?.methodName) {
            body += `const action$ = this.isEditMode()\n  ? this.${camelCase(serviceName)}.${updateOp.methodName}(this.id()!, finalPayload)\n  : this.${camelCase(serviceName)}.${createOp.methodName}(finalPayload);\n`;
        } else if (updateOp?.methodName) {
            body += `if (!this.isEditMode()) { console.error('Form is not in edit mode, but no create operation is available.'); return; }\n`;
            body += `const action$ = this.${camelCase(serviceName)}.${updateOp.methodName}(this.id()!, finalPayload);\n`;
        } else if (createOp?.methodName) {
            body += `if (this.isEditMode()) { console.error('Form is in edit mode, but no update operation is available.'); return; }\n`;
            body += `const action$ = this.${camelCase(serviceName)}.${createOp.methodName}(finalPayload);\n`;
        } else {
            return; // Should not be reached due to the initial guard
        }

        body += `const sub = action$.subscribe({\n  next: () => {\n    this.snackBar.open('${resource.modelName} saved successfully!', 'Close', { duration: 3000 });\n    this.router.navigate(['../'], { relativeTo: this.route });\n  },\n  error: (err) => {\n    console.error('Error saving ${resource.modelName}', err);\n    this.snackBar.open('Error saving ${resource.modelName}', 'Close', { duration: 5000, panelClass: 'error-snackbar' });\n  }\n});\nthis.subscriptions.push(sub);`;
        classDeclaration.addMethod({ name: 'onSubmit', statements: body });
    }

    /** @private */
    private addOnCancelMethod(classDeclaration: ClassDeclaration): void {
        classDeclaration.addMethod({ name: 'onCancel', statements: `this.router.navigate(['../'], { relativeTo: this.route });` });
    }

    /** @private */
    private addNgOnDestroy(classDeclaration: ClassDeclaration): void {
        classDeclaration.addMethod({ name: 'ngOnDestroy', statements: 'this.subscriptions.forEach(sub => sub.unsubscribe());' });
    }

    /**
     * Generates the `.component.html` file using the HtmlElementBuilder.
     * @private
     */
    private generateFormComponentHtml(resource: Resource, outDir: string): void {
        const htmlFilePath = `${outDir}/${resource.name}-form.component.html`;
        const content = generateFormComponentHtml(resource, this.parser);
        this.project.getFileSystem().writeFileSync(htmlFilePath, content);
    }

    /**
     * Generates the `.component.scss` file.
     * @private
     */
    private generateFormComponentScss(resource: Resource, outDir: string): void {
        const scssFilePath = `${outDir}/${resource.name}-form.component.scss`;
        const content = generateFormComponentScss();
        this.project.getFileSystem().writeFileSync(scssFilePath, content);
    }

    /** @private */
    private addPatchForm(classDeclaration: ClassDeclaration, resource: Resource, oneOfProp?: FormProperty): void {
        const arrayProps = resource.formProperties.filter(p => p.schema.type === 'array' && (p.schema.items as SwaggerDefinition)?.properties);
        const allComplexProps = [...arrayProps.map(p => p.name), ...(oneOfProp ? [oneOfProp.name] : [])];
        if (allComplexProps.length === 0) return;

        let body = `const { ${allComplexProps.join(', ')}, ...rest } = entity;\n`;
        body += 'this.form.patchValue(rest as any);\n\n';

        arrayProps.forEach(prop => {
            const arrayGetterName = `${camelCase(singular(prop.name))}Array`;
            const createItemMethodName = `create${pascalCase(singular(prop.name))}`;
            body += `if (Array.isArray(entity.${prop.name})) {\n`;
            body += `  this.${arrayGetterName}.clear();\n`;
            body += `  entity.${prop.name}.forEach(item => this.${arrayGetterName}.push(this.${createItemMethodName}(item)));\n`;
            body += `}\n`;
        });

        if (oneOfProp) {
            const dPropName = oneOfProp.schema.discriminator!.propertyName;
            body += `\nconst petType = (entity as any).${dPropName};\n`;
            body += `if (petType) {\n`;
            body += `  this.form.get(this.discriminatorPropName)?.setValue(petType, { emitEvent: true });\n`;
            for (const subSchameRef of oneOfProp.schema.oneOf!) {
                const subSchemaName = pascalCase(subSchameRef.$ref!.split('/').pop()!);
                const typeName = this.parser.resolveReference(subSchameRef.$ref!)!.properties![dPropName].enum![0] as string;
                body += `  if (this.is${subSchemaName}(entity)) {\n`;
                body += `    (this.form.get('${typeName}') as FormGroup)?.patchValue(entity as any);\n  }\n`;
            }
            body += `}\n`;
        }

        classDeclaration.addMethod({
            name: 'patchForm',
            scope: Scope.Private,
            parameters: [{ name: 'entity', type: resource.modelName }],
            statements: body
        });
    }

    private getFormControlInitializerString(schema: SwaggerDefinition): string {
        if (schema.readOnly) {
            return '';
        }

        const info = mapSchemaToFormControl(schema);
        const validators = info?.validators ?? [];
        const validatorString = validators.length > 0 ? `, [${validators.join(', ')}]` : '';

        if (schema.type === 'object' && schema.properties) {
            const nestedControls = Object.entries(schema.properties)
                .filter(([, propSchema]) => !propSchema.readOnly)
                .map(([propName, propSchema]) => `'${propName}': ${this.getFormControlInitializerString(propSchema)}`)
                .join(',\n      ');
            // FormBuilder is still useful here for creating groups dynamically.
            return `this.fb.group({\n      ${nestedControls}\n    }${validatorString})`;
        }

        if (schema.type === 'array') {
            // FormBuilder is needed for arrays. The initial array is empty.
            return `this.fb.array([]${validatorString})`;
        }

        const defaultValue = schema.default !== undefined ? JSON.stringify(schema.default) : 'null';
        // Use new FormControl for primitives to get strong typing.
        return `new FormControl(${defaultValue}${validatorString})`;
    }

    /** @private */
    private addFormArrayHelpers(classDeclaration: ClassDeclaration, resource: Resource): void {
        const formArrayProps = resource.formProperties.filter(p => p.schema.type === 'array' && (p.schema.items as SwaggerDefinition)?.properties);
        formArrayProps.forEach(prop => {
            const arrayName = prop.name;
            const singularPascal = pascalCase(singular(arrayName));
            const arrayGetterName = `${camelCase(singular(arrayName))}Array`;
            const arrayItemInterfaceName = `${singularPascal}Form`;

            classDeclaration.addGetAccessor({
                name: arrayGetterName,
                returnType: `FormArray<FormGroup<${arrayItemInterfaceName}>>`,
                statements: `return this.form.get('${arrayName}') as FormArray<FormGroup<${arrayItemInterfaceName}>>;`
            });

            const createMethod = classDeclaration.addMethod({
                name: `create${singularPascal}`,
                scope: Scope.Private,
                parameters: [{ name: 'item?', type: 'any /* Replace with actual item type */', initializer: '{}' }],
                returnType: `FormGroup<${arrayItemInterfaceName}>`
            });

            const itemSchema = (prop.schema.items as SwaggerDefinition).properties!;
            const formControls = Object.entries(itemSchema)
                .map(([key, schema]) => `'${key}': new FormControl(item?.${key} ?? null${this.getValidatorString(schema)})`)
                .join(',\n');

            createMethod.setBodyText(`return new FormGroup<${arrayItemInterfaceName}>({\n      ${formControls}\n    });`);

            classDeclaration.addMethod({ name: `add${singularPascal}`, statements: `this.${arrayGetterName}.push(this.create${singularPascal}());` });
            classDeclaration.addMethod({ name: `remove${singularPascal}`, parameters: [{ name: 'index', type: 'number' }], statements: `this.${arrayGetterName}.removeAt(index);` });
        });
    }

    private getValidatorString(schema: SwaggerDefinition): string {
        const info = mapSchemaToFormControl(schema);
        const validators = info?.validators ?? [];
        return validators.length > 0 ? `, [${validators.join(', ')}]` : '';
    }

    /** @private */
    private addPolymorphismLogic(classDeclaration: ClassDeclaration, prop: FormProperty, resource: Resource) {
        const dPropName = prop.schema.discriminator!.propertyName;

        classDeclaration.addConstructor({
            statements: writer => writer.write(`effect(() => {
    const type = this.form.get(this.discriminatorPropName)?.value;
    if (type) {
        this.updateFormForPetType(type);
    }
});`)
        });

        const updateMethod = classDeclaration.addMethod({
            name: 'updateFormForPetType',
            scope: Scope.Private,
            parameters: [{ name: 'type', type: 'string' }]
        });

        let switchBody = `this.discriminatorOptions.forEach(opt => this.form.removeControl(opt as any));\n\nswitch(type) {\n`;
        for (const subSchemaRef of prop.schema.oneOf!) {
            const subSchema = subSchemaRef.$ref ? this.parser.resolveReference(subSchemaRef.$ref)! : subSchemaRef;
            if (!subSchema) continue;

            const typeName = subSchema.properties![dPropName].enum![0] as string;

            const subFormProperties = Object.entries(subSchema.properties!)
                .filter(([key]) => key !== dPropName && !subSchema.properties![key].readOnly)
                .map(([key, schema]) => `'${key}': ${this.getFormControlInitializerString(schema)}`).join(', ');

            switchBody += `  case '${typeName}':\n`;
            switchBody += `    this.form.addControl('${typeName}' as any, this.fb.group({ ${subFormProperties} }));\n`;
            switchBody += '    break;\n';
        }
        switchBody += '}';
        updateMethod.setBodyText(switchBody);

        classDeclaration.addMethod({
            name: 'isPetType',
            parameters: [{ name: 'type', type: 'string' }],
            returnType: 'boolean',
            statements: `return this.form.get(this.discriminatorPropName)?.value === type;`
        });

        for (const subSchemaRef of prop.schema.oneOf!) {
            if (!subSchemaRef.$ref) continue;
            const subSchemaName = pascalCase(subSchemaRef.$ref!.split('/').pop()!);
            const typeName = this.parser.resolveReference(subSchemaRef.$ref!)!.properties![dPropName].enum![0] as string;
            classDeclaration.addMethod({
                name: `is${subSchemaName}`,
                scope: Scope.Private,
                parameters: [{ name: 'entity', type: resource.modelName }],
                returnType: `entity is ${subSchemaName}`,
                statements: `return (entity as any).${dPropName} === '${typeName}';`
            });
        }
    }

    /** @private */
    private addGetPayload(classDeclaration: ClassDeclaration, prop: FormProperty) {
        const dPropName = prop.schema.discriminator!.propertyName;
        const body = `const baseValue = this.form.getRawValue();\nconst petType = (baseValue as any).${dPropName};\nif (!petType) return baseValue;\n\nconst subFormValue = (this.form.get(petType) as FormGroup | undefined)?.value || {};\nconst payload = { ...baseValue, ...subFormValue };\nthis.discriminatorOptions.forEach(opt => delete (payload as any)[opt]);\nreturn payload;`;
        classDeclaration.addMethod({ name: 'getPayload', scope: Scope.Private, statements: body });
    }

    /** @private */
    private addFileHandling(classDeclaration: ClassDeclaration) {
        classDeclaration.addMethod({
            name: 'onFileSelected',
            parameters: [{ name: 'event', type: 'Event' }, { name: 'formControlName', type: 'string' }],
            statements: `const file = (event.target as HTMLInputElement).files?.[0];\nif (file) {\n    this.form.patchValue({ [formControlName]: file } as any);\n    this.form.get(formControlName)?.markAsDirty();\n}`
        });
    }
}
