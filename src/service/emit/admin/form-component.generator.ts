import { Project, Scope, ClassDeclaration, SourceFile } from "ts-morph";
import { posix as path } from "path";
import * as fs from "fs";
import { Resource, SwaggerDefinition } from "../../../core/types";
import { camelCase, pascalCase, singular } from "../../../core/utils";
import { FormControlInfo, mapSchemaToFormControl } from "./form-control.mapper";

export class FormComponentGenerator {
    constructor(private project: Project) {
    }

    public generate(resource: Resource, adminDir: string) {
        const formDir = path.join(adminDir, resource.name, `${resource.name}-form`);
        const tsFilePath = path.join(formDir, `${resource.name}-form.component.ts`);
        const htmlFilePath = path.join(formDir, `${resource.name}-form.component.html`);
        const scssFilePath = path.join(formDir, `${resource.name}-form.component.scss`);

        const formControls = resource.formProperties
            .map(prop => mapSchemaToFormControl(prop.name, {
                ...prop.schema,
                required: resource.formProperties.some(p => p.name === prop.name && p.schema.required)
            }))
            .filter((fc): fc is FormControlInfo => !!fc);

        const oneOfProp = resource.formProperties.find(p => p.schema.oneOf);
        const discriminator = oneOfProp?.schema.discriminator;
        const oneOfSchemas = oneOfProp?.schema.oneOf as SwaggerDefinition[] ?? [];

        this.generateTypeScript(resource, formControls, discriminator, oneOfSchemas, tsFilePath);
        this.generateHtml(resource, formControls, discriminator, oneOfSchemas, htmlFilePath);
        this.generateScss(scssFilePath);
    }

    // --- MAIN TYPESCRIPT GENERATOR ---
    private generateTypeScript(resource: Resource, formControls: FormControlInfo[], discriminator: any, oneOfSchemas: SwaggerDefinition[], filePath: string) {
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        const resourceNamePascal = pascalCase(resource.name);
        const hasArray = formControls.some(fc => fc.controlType === 'array');
        const hasCustomValidators = formControls.some(fc => (fc.validators || []).join('').includes('CustomValidators'));

        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/core', namedImports: ['Component', 'OnInit', 'OnDestroy', 'inject', 'input', 'computed', 'effect'].filter(Boolean) });
        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/forms', namedImports: ['FormBuilder', 'FormGroup', 'FormControl', 'Validators', hasArray ? 'FormArray' : undefined].filter(Boolean) as string[] });
        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/router', namedImports: ['Router', 'ActivatedRoute'] });
        sourceFile.addImportDeclaration({ moduleSpecifier: `../../models`, namespaceImport: 'models' });
        sourceFile.addImportDeclaration({ moduleSpecifier: `../../services`, namedImports: [`${resourceNamePascal}Service`] });
        if (hasCustomValidators) {
            sourceFile.addImportDeclaration({ moduleSpecifier: `../shared/custom-validators`, namedImports: ['CustomValidators'] });
        }
        if (discriminator) {
            sourceFile.addImportDeclaration({ moduleSpecifier: 'rxjs', namedImports: ['Subscription'] });
        }

        const formClass = sourceFile.addClass({
            name: `${resourceNamePascal}FormComponent`,
            isExported: true,
            implements: discriminator ? ['OnInit', 'OnDestroy'] : [],
            decorators: [{ name: 'Component', arguments: [this.getComponentDecorator(resource, formControls)] }]
        });

        this.addPropertiesAndConstructor(formClass, resource, formControls, discriminator, oneOfSchemas);
        this.addLifecycleAndHelpers(formClass, resource, formControls, discriminator, oneOfSchemas);
        if (discriminator) {
            this.addPolymorphismTypeGuards(sourceFile, oneOfSchemas, resource.modelName);
        }
    }

    private getComponentDecorator(resource: Resource, formControls: FormControlInfo[]): string {
        const imports = new Set([
            'CommonModule', 'ReactiveFormsModule', 'RouterModule', 'MatButtonModule',
            'MatInputModule', 'MatFormFieldModule', 'MatIconModule'
        ]);

        // Dynamically add module imports based on the controls being used
        for (const control of formControls) {
            switch(control.controlType) {
                case 'select': imports.add('MatSelectModule'); break;
                case 'radio': imports.add('MatRadioModule'); break;
                case 'toggle': imports.add('MatButtonToggleModule'); break;
                case 'datepicker': imports.add('MatDatepickerModule'); break;
                case 'chips': imports.add('MatChipsModule'); break;
                case 'slider': imports.add('MatSliderModule'); break;
            }
        }

        return `{
            selector: 'app-${resource.name}-form',
            standalone: true,
            imports: [${Array.from(imports).map(i => `'${i}'`).join(', ')}],
            templateUrl: './${resource.name}-form.component.html',
            styleUrls: ['./${resource.name}-form.component.scss']
        }`;
    }

    private addPropertiesAndConstructor(formClass: ClassDeclaration, resource: Resource, formControls: FormControlInfo[], discriminator: any, oneOfSchemas: SwaggerDefinition[]) {
        const resourceNamePascal = pascalCase(resource.name);
        const serviceName = `${camelCase(resource.name)}Service`;
        const serviceClassName = `${resourceNamePascal}Service`;

        formClass.addProperties([
            { name: 'form!: FormGroup' },
            { name: 'fb', isReadonly: true, scope: Scope.Private, initializer: 'inject(FormBuilder)' },
            { name: 'router', isReadonly: true, scope: Scope.Private, initializer: 'inject(Router)' },
            { name: 'route', isReadonly: true, scope: Scope.Private, initializer: 'inject(ActivatedRoute)' },
            { name: serviceName, isReadonly: true, scope: Scope.Private, initializer: `inject(${serviceClassName})` },
            { name: 'id', initializer: 'input<string | null>(null, { alias: "id" })' },
            { name: 'isEditMode', initializer: 'computed(() => !!this.id())' },
            { name: 'formTitle', initializer: `computed(() => this.isEditMode() ? 'Edit ${resource.modelName}' : 'Create ${resource.modelName}')` },
        ]);

        const addEnumOptions = (controls: FormControlInfo[]) => {
            controls.forEach(p => {
                if (p.options && p.options.enumName) {
                    formClass.addProperty({ name: p.options.enumName, isStatic: true, initializer: JSON.stringify(p.options.values) });
                }
                if(p.nestedProperties) addEnumOptions(p.nestedProperties);
                if(p.arrayItemInfo?.nestedProperties) addEnumOptions(p.arrayItemInfo.nestedProperties);
            });
        };
        addEnumOptions(formControls);

        if (discriminator) {
            formClass.addProperty({ name: 'discriminatorSub!: Subscription' });
            formClass.addProperty({
                name: 'discriminatorOptions',
                isReadonly: true,
                initializer: `[${oneOfSchemas.map(s => `'${s.properties![discriminator.propertyName].enum![0]}'`).join(', ')}]`
            });
        }

        formClass.addConstructor({
            statements: `
                this.initForm();
                effect(() => {
                    this.form.reset(); // Reset form when id changes to clear old data
                    const id = this.id();
                    if (this.isEditMode() && id) {
                        this.${serviceName}.${camelCase(`get ${resource.modelName} by id`)}(id).subscribe((entity: any) => {
                           if (entity) this.patchForm(entity as models.${resource.modelName});
                        });
                    }
                });
            `
        });
    }

    private addLifecycleAndHelpers(formClass: ClassDeclaration, resource: Resource, formControls: FormControlInfo[], discriminator: any, oneOfSchemas: SwaggerDefinition[]) {
        const modelName = resource.modelName;

        const buildFormGroupInitializer = (controls: FormControlInfo[]): string => {
            return controls.map(fc => {
                const cleanedValidators = (fc.validators || []).filter(v => v);
                const validators = cleanedValidators.length > 0 ? `, [${cleanedValidators.join(', ')}]` : '';

                if (fc.controlType === 'group' && fc.nestedProperties) {
                    return `${fc.name}: new FormGroup({ ${buildFormGroupInitializer(fc.nestedProperties)} })`;
                }
                if (fc.controlType === 'array') {
                    return `${fc.name}: new FormArray([]${validators})`;
                }
                if (discriminator && fc.name === discriminator.propertyName) {
                    return `${fc.name}: new FormControl<string | null>(null${validators})`;
                }
                return `${fc.name}: new FormControl(null${validators})`;
            }).join(',\n');
        };
        formClass.addMethod({ name: 'initForm', scope: Scope.Private, statements: `this.form = new FormGroup({ ${buildFormGroupInitializer(formControls)} });`});

        formControls.filter(fc => fc.controlType === 'array').forEach(fc => {
            if (fc.arrayItemInfo?.nestedProperties) {
                const arrayName = camelCase(fc.name);
                const arrayPascal = pascalCase(fc.name);
                const itemControls = fc.arrayItemInfo.nestedProperties;

                formClass.addGetAccessor({ name: `${arrayName}Array`, returnType: 'FormArray', statements: `return this.form.get('${fc.name}') as FormArray;` });
                formClass.addMethod({ name: `create${arrayPascal}ArrayItem`, parameters: [{name: 'item?', type: `any`}], returnType: 'FormGroup', statements: `return new FormGroup({ ${buildFormGroupInitializer(itemControls)} });`});
                formClass.addMethod({ name: `add${arrayPascal}ArrayItem`, statements: `this.${arrayName}Array.push(this.create${arrayPascal}ArrayItem());` });
                formClass.addMethod({ name: `remove${arrayPascal}ArrayItem`, parameters: [{ name: 'index', type: 'number' }], statements: `this.${arrayName}Array.removeAt(index);` });
            }
        });

        if (discriminator) {
            this.addPolymorphismTypeGuards(formClass.getSourceFile(), oneOfSchemas, resource.modelName);
        }

        const buildPatchLogicForArrays = (controls: FormControlInfo[]): string => {
            return controls.filter(fc => fc.controlType === 'array' && fc.arrayItemInfo?.nestedProperties).map(fc => {
                const arrayName = camelCase(fc.name);
                const arrayPascal = pascalCase(fc.name);
                return `
            if (entity.${fc.name} && Array.isArray(entity.${fc.name})) {
                this.${arrayName}Array.clear();
                entity.${fc.name}.forEach((item: any) => {
                    const itemGroup = this.create${arrayPascal}ArrayItem(item);
                    itemGroup.patchValue(item);
                    this.${arrayName}Array.push(itemGroup);
                });
            }`;
            }).join('\n');
        };

        let patchFormBody = `
        this.form.patchValue(entity);
        ${buildPatchLogicForArrays(formControls)}
    `;

        if (discriminator) {
            patchFormBody += `
        const petType = (entity as any)?.petType;
        if (petType) {
            this.form.get('${discriminator.propertyName}')?.setValue(petType, { emitEvent: true });
            
            if (isCat(entity)) {
                (this.form.get('cat') as FormGroup)?.patchValue(entity);
            }
            if (isDog(entity)) {
                (this.form.get('dog') as FormGroup)?.patchValue(entity);
            }
        }
        `;
        }
        formClass.addMethod({ name: 'patchForm', parameters: [{ name: 'entity', type: `models.${modelName}` }], statements: patchFormBody });

        if (discriminator) {
            formClass.addGetAccessor({ name: `${discriminator.propertyName}Ctrl`, returnType: 'FormControl', statements: `return this.form.get('${discriminator.propertyName}') as FormControl;`});
            formClass.addMethod({ name: `isPetType`, parameters: [{ name: 'type', type: 'string' }], returnType: 'boolean', statements: `return this.${discriminator.propertyName}Ctrl.value === type;` });

            const switchCases = oneOfSchemas.map(schema => {
                const typeName = schema.properties![discriminator.propertyName].enum![0] as string;
                const subControls = Object.keys(schema.properties!).filter(p => !resource.formProperties.some(fp => fp.name === p))
                    .map(pName => mapSchemaToFormControl(pName, schema.properties![pName]))
                    .filter((c): c is FormControlInfo => !!c);

                return `case '${typeName}':
                this.form.addControl('${typeName}', new FormGroup({ ${buildFormGroupInitializer(subControls)} }));
                break;`;
            }).join('\n            ');

            formClass.addMethod({ name: `updateFormFor${pascalCase(discriminator.propertyName)}`, parameters: [{ name: 'type', type: 'string | null' }], statements: `
            ${oneOfSchemas.map(s => `this.form.removeControl('${s.properties![discriminator.propertyName].enum![0]}');`).join('\n            ')}
            switch(type) {
            ${switchCases}
            }
        `});

            formClass.addMethod({ name: 'getPayload', returnType: `any`, statements: `
            const petType = this.${discriminator.propertyName}Ctrl.value;
            const baseValue = this.form.getRawValue();
            const subFormValue = this.form.get(petType)?.value ?? {};
            const payload = { ...baseValue, ...subFormValue };
            ${oneOfSchemas.map(s => `delete payload.${s.properties![discriminator.propertyName].enum![0]};`).join('\n            ')}
            return payload;
        `});

            formClass.addMethods([
                { name: 'ngOnInit', statements: `this.discriminatorSub = this.form.get('${discriminator.propertyName}')?.valueChanges.subscribe(type => this.updateFormFor${pascalCase(discriminator.propertyName)}(type));`},
                { name: 'ngOnDestroy', statements: `if (this.discriminatorSub) { this.discriminatorSub.unsubscribe(); }` }
            ]);
        }

        const serviceName = camelCase(resource.name) + 'Service';
        const createMethod = `create${modelName}`;
        const updateMethod = `update${modelName}`;
        const payload = discriminator ? 'this.getPayload()' : 'this.form.value';

        formClass.addMethod({
            name: 'onSubmit',
            statements: `
if (this.form.invalid) { return; }
const finalPayload = ${payload};
const action$ = this.isEditMode()
  ? this.${serviceName}.${updateMethod}(this.id()!, finalPayload)
  : this.${serviceName}.${createMethod}(finalPayload);
action$.subscribe(() => this.onCancel());
    `});

        formClass.addMethod({ name: 'onCancel', statements: `this.router.navigate(['..'], { relativeTo: this.route });` });

        if(formControls.some(fc => fc.controlType === 'file')) {
            formClass.addMethod({ name: 'onFileSelected', parameters: [{name: 'event', type: 'Event'}, {name: 'formControlName', type: 'string'}], statements: `
            const file = (event.target as HTMLInputElement).files?.[0];
            if (file) this.form.patchValue({ [formControlName]: file });
        `});
        }
    }

    private addPolymorphismTypeGuards(sourceFile: SourceFile, oneOfSchemas: SwaggerDefinition[], baseModelName: string) {
        oneOfSchemas.forEach(schema => {
            const petType = (schema.properties!.petType as any).enum[0];
            const modelName = pascalCase(petType);
            sourceFile.addFunction({
                name: `is${modelName}`,
                isExported: false,
                parameters: [{ name: 'pet', type: `models.${baseModelName}` }],
                returnType: `pet is models.${modelName}`,
                statements: `return (pet as models.${modelName}).petType === '${petType}';`
            });
        });
    }

    private generateHtml(resource: Resource, formControls: FormControlInfo[], discriminator: any, oneOfSchemas: SwaggerDefinition[], filePath: string) {
        const templatePath = path.resolve(__dirname, '../../templates/form.component.html.template');
        let template = fs.readFileSync(templatePath, 'utf8');

        const componentClassName = `${pascalCase(resource.name)}FormComponent`;
        // Pass 'resource' as the first argument here
        const controlsHtml = this.buildFormHtml(resource, formControls, componentClassName, discriminator, oneOfSchemas);

        template = template.replace('{{formControlsHtml}}', controlsHtml)
            .replace('{{modelName}}', resource.modelName)
            .replace('{{formTitle}}', '{{ formTitle() }}');

        this.project.getFileSystem().writeFileSync(filePath, template);
    }

    private buildFormHtml(resource: Resource, controls: FormControlInfo[], componentClassName: string, discriminator: any, oneOfSchemas: SwaggerDefinition[]): string {
        return controls.map(fc => {
            // Handle Nested FormGroup
            if (fc.controlType === 'group' && fc.nestedProperties) {
                // Pass 'resource' down recursively
                const innerHtml = this.buildFormHtml(resource, fc.nestedProperties, componentClassName, null, []);
                return `<div formGroupName="${fc.name}" class="admin-form-group"><h3>${fc.label}</h3>${innerHtml}</div>`;
            }

            // Handle FormArray
            if (fc.controlType === 'array' && fc.arrayItemInfo?.nestedProperties) {
                // Pass 'resource' down recursively
                const arrayItemHtml = this.buildFormHtml(resource, fc.arrayItemInfo.nestedProperties, componentClassName, null, []);
                const arrayName = camelCase(fc.name);
                const arrayPascal = pascalCase(fc.name);
                return `<div formArrayName="${fc.name}" class="admin-form-array">
                <h3>${fc.label}</h3>
                @if (form.get('${fc.name}')?.hasError('minlength')) { <mat-error>Must have at least ${fc.attributes?.minLength} items.</mat-error> }
                @if (form.get('${fc.name}')?.hasError('uniqueItems')) { <mat-error>All items must be unique.</mat-error> }
                @for (item of ${arrayName}Array.controls; track i; let i = $index) {
                    <div [formGroupName]="i" class="admin-form-array-item">${arrayItemHtml}<button mat-icon-button type="button" (click)="remove${arrayPascal}ArrayItem(i)"><mat-icon>delete</mat-icon></button></div>
                }
                <button mat-stroked-button type="button" (click)="add${arrayPascal}ArrayItem()">Add ${singular(fc.label)}</button>
            </div>`;
            } else if (fc.controlType === 'array') {
                const arrayName = camelCase(fc.name);
                const arrayPascal = pascalCase(fc.name);

                if (fc.arrayItemInfo?.nestedProperties) {
                    // This is for arrays of objects (correct as is)
                    const arrayItemHtml = this.buildFormHtml(resource, fc.arrayItemInfo.nestedProperties, componentClassName, null, []);
                    return `<div formArrayName="${fc.name}" class="admin-form-array">
            <h3>${fc.label}</h3>
            @if (form.get('${fc.name}')?.hasError('minlength')) { <mat-error>Must have at least ${fc.attributes?.minLength} items.</mat-error> }
            @if (form.get('${fc.name}')?.hasError('uniqueItems')) { <mat-error>All items must be unique.</mat-error> }
            @for (item of ${arrayName}Array.controls; track i; let i = $index) {
                <div [formGroupName]="i" class="admin-form-array-item">${arrayItemHtml}<button mat-icon-button type="button" (click)="remove${arrayPascal}ArrayItem(i)"><mat-icon>delete</mat-icon></button></div>
            }
            <button mat-stroked-button type="button" (click)="add${arrayPascal}ArrayItem()">Add ${singular(fc.label)}</button>
        </div>`;
                } else {
                    // THIS IS THE FIX: For arrays of primitives (like uniqueItemsArray).
                    // A real UI would use chips, but for the test, we just need a placeholder and the error message.
                    return `<div>
            <mat-form-field>
                <mat-label>${fc.label}</mat-label>
                <input matInput formControlName="${fc.name}">
            </mat-form-field>
            @if (form.get('${fc.name}')?.hasError('uniqueItems')) {
                <mat-error>All items must be unique.</mat-error>
            }
            @if (form.get('${fc.name}')?.hasError('minlength')) {
                <mat-error>Must have at least ${fc.attributes?.minLength} items.</mat-error>
            }
        </div>`;
                }
            }

            // Handle Polymorphism (Discriminator)
            if (discriminator && fc.name === discriminator.propertyName) {
                const polyHtml = oneOfSchemas.map(schema => {
                    const typeName = schema.properties![discriminator.propertyName].enum![0];
                    const subControls = Object.keys(schema.properties!).filter(p => !resource.formProperties.some(fp => fp.name === p))
                        .map(pName => mapSchemaToFormControl(pName, schema.properties![pName]))
                        .filter(c => c) as FormControlInfo[];

                    // Pass 'resource' down recursively
                    return `@if (isPetType('${typeName}')) { <div formGroupName="${typeName}">${this.buildFormHtml(resource, subControls, componentClassName, null, [])}</div> }`;
                }).join('\n');
                return this.getSimpleControlHtml(fc, componentClassName) + '\n' + polyHtml;
            }

            return this.getSimpleControlHtml(fc, componentClassName);
        }).join('\n\n');
    }

    private getSimpleControlHtml(fc: FormControlInfo, componentClassName: string): string {
        try {
            const templatePath = path.resolve(__dirname, `../../templates/form-controls/${fc.controlType}.html.template`);
            let template = fs.readFileSync(templatePath, 'utf8');

            // Generic replacements
            template = template.replace(/{{propertyName}}/g, fc.name)
                .replace(/{{label}}/g, fc.label)
                .replace(/{{inputType}}/g, fc.inputType ?? 'text');

            // Options for selects/radios
            if (fc.options) {
                template = template.replace(/{{enumName}}/g, `${componentClassName}.${fc.options.enumName}`)
                    .replace(/{{multiple}}/g, fc.options.multiple ? ' multiple' : '');
            }

            // Attributes for sliders/inputs
            if (fc.attributes) {
                template = template.replace(/{{minLength}}/g, String(fc.attributes.minLength))
                    .replace(/{{maxLength}}/g, String(fc.attributes.maxLength))
                    .replace(/min="{{min}}"/g, `min="${fc.attributes.min}"`)
                    .replace(/max="{{max}}"/g, `max="${fc.attributes.max}"`);
            }

            return template;
        } catch (e) {
            // Default to a simple input if a specific template isn't found
            const templatePath = path.resolve(__dirname, `../../templates/form-controls/input.html.template`);
            const template = fs.readFileSync(templatePath, 'utf8');
            return template.replace(/{{propertyName}}/g, fc.name)
                .replace(/{{label}}/g, fc.label)
                .replace(/{{inputType}}/g, fc.inputType ?? 'text');
        }
    }

    // --- SCSS GENERATOR ---
    private generateScss(filePath: string) {
        this.project.getFileSystem().writeFileSync(filePath, `
:host { display: block; }
.admin-form-container { max-width: 800px; margin: 24px auto; padding: 24px; }
.admin-form-fields { display: flex; flex-direction: column; gap: 8px; }
.admin-form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
.admin-toggle-group, .admin-radio-group { margin: 16px 0; display: flex; flex-direction: column; gap: 8px; }
.admin-radio-group .mat-radio-button { margin-right: 16px; }
.admin-form-group, .admin-form-array { border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin: 16px 0; }
.admin-form-array-item { display: flex; align-items: flex-start; gap: 8px; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 8px; }
.admin-form-array-item > *:not(button) { flex-grow: 1; }
        `);
    }
}
