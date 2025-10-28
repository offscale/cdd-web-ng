import { ClassDeclaration, Project, Scope, SourceFile } from "ts-morph";
import { posix as path } from "node:path";
import { Resource, SwaggerDefinition } from "../../../core/types";
import { camelCase, pascalCase, singular } from "../../../core/utils";
import { FormControlInfo, mapSchemaToFormControl } from "./form-control.mapper";

// Import all templates as strings
import formTemplate from '../../templates/form.component.html.template';
import chipsTemplate from '../../templates/form-controls/chips.html.template';
import datepickerTemplate from '../../templates/form-controls/datepicker.html.template';
import fileTemplate from '../../templates/form-controls/file.html.template';
import inputTemplate from '../../templates/form-controls/input.html.template';
import radioTemplate from '../../templates/form-controls/radio.html.template';
import selectTemplate from '../../templates/form-controls/select.html.template';
import sliderTemplate from '../../templates/form-controls/slider.html.template';
import textareaTemplate from '../../templates/form-controls/textarea.html.template';
import toggleTemplate from '../../templates/form-controls/toggle.html.template';

// Map control types to their imported templates
const controlTemplates: Record<string, string> = {
    chips: chipsTemplate,
    datepicker: datepickerTemplate,
    file: fileTemplate,
    input: inputTemplate,
    radio: radioTemplate,
    select: selectTemplate,
    slider: sliderTemplate,
    textarea: textareaTemplate,
    toggle: toggleTemplate,
};

export class FormComponentGenerator {
    constructor(private project: Project) {
    }

    public generate(resource: Resource, adminDir: string): { usesCustomValidators: boolean } {
        const formDir = path.join(adminDir, resource.name, `${resource.name}-form`);
        this.project.getFileSystem().mkdirSync(formDir, { recursive: true });

        const tsFilePath = path.join(formDir, `${resource.name}-form.component.ts`);
        const htmlFilePath = path.join(formDir, `${resource.name}-form.component.html`);
        const scssFilePath = path.join(formDir, `${resource.name}-form.component.scss`);

        const formControls = resource.formProperties
            .map(prop => mapSchemaToFormControl(prop.name, {
                ...prop.schema,
                required: resource.formProperties.some(p => p.name === prop.name && p.schema.required)
            }))
            .filter((fc): fc is FormControlInfo => !!fc);

        const usesCustomValidators = JSON.stringify(formControls).includes('CustomValidators');

        const oneOfProp = resource.formProperties.find(p => p.schema.oneOf);
        const discriminator = oneOfProp?.schema.discriminator;
        const oneOfSchemas = oneOfProp?.schema.oneOf as SwaggerDefinition[] ?? [];

        this.generateTypeScript(resource, formControls, discriminator, oneOfSchemas, tsFilePath);
        this.generateHtml(resource, formControls, discriminator, oneOfSchemas, htmlFilePath);
        this.generateScss(scssFilePath);

        return { usesCustomValidators };
    }

    // --- MAIN TYPESCRIPT GENERATOR ---
    private generateTypeScript(resource: Resource, formControls: FormControlInfo[], discriminator: any, oneOfSchemas: SwaggerDefinition[], filePath: string) {
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        const resourceNamePascal = pascalCase(resource.name);
        const hasArray = formControls.some(fc => fc.controlType === 'array');
        const hasCustomValidators = formControls.some(fc => (fc.validators || []).join('').includes('CustomValidators'));

        const componentDecoratorImports = new Set<string>([
            'CommonModule', 'ReactiveFormsModule', 'RouterModule', 'MatButtonModule',
            'MatInputModule', 'MatFormFieldModule', 'MatIconModule' // <-- Ensure MatFormFieldModule is here
        ]);

        for (const control of formControls) {
            switch(control.controlType) {
                case 'select': componentDecoratorImports.add('MatSelectModule'); break;
                case 'radio': componentDecoratorImports.add('MatRadioModule'); break;
                case 'toggle': componentDecoratorImports.add('MatButtonToggleModule'); break;
                case 'datepicker': componentDecoratorImports.add('MatDatepickerModule'); break;
                case 'chips': componentDecoratorImports.add('MatChipsModule'); break;
                case 'slider': componentDecoratorImports.add('MatSliderModule'); break;
            }
        }

        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/core', namedImports: ['Component', 'OnInit', 'OnDestroy', 'inject', 'input', 'computed', 'effect'].filter(Boolean) as string[] });
        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/forms', namedImports: ['FormBuilder', 'FormGroup', 'FormControl', 'Validators', 'ReactiveFormsModule', hasArray ? 'FormArray' : undefined].filter(Boolean) as string[] });
        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/router', namedImports: ['Router', 'ActivatedRoute', 'RouterModule'] });
        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/common', namedImports: ['CommonModule'] });

        for (const mod of Array.from(componentDecoratorImports).filter(m => m.startsWith('Mat'))) {
            // FIX: Use the correct path for form-field
            const materialPath = `@angular/material/${mod.replace('Mat','').toLowerCase().replace('module','').replace('formfield', 'form-field')}`;
            sourceFile.addImportDeclaration({ moduleSpecifier: materialPath, namedImports: [mod] });
        }

        sourceFile.addImportDeclaration({ moduleSpecifier: `../../../models`, namespaceImport: 'models' });
        sourceFile.addImportDeclaration({ moduleSpecifier: `../../../services`, namedImports: [`${resourceNamePascal}Service`] });
        if (hasCustomValidators) {
            sourceFile.addImportDeclaration({ moduleSpecifier: `../../shared/custom-validators`, namedImports: ['CustomValidators'] });
        }
        if (discriminator) {
            sourceFile.addImportDeclaration({ moduleSpecifier: 'rxjs', namedImports: ['Subscription'] });
        }

        const formClass = sourceFile.addClass({
            name: `${resourceNamePascal}FormComponent`,
            isExported: true,
            implements: discriminator ? ['OnInit', 'OnDestroy'] : [],
            decorators: [{ name: 'Component', arguments: [this.getComponentDecorator(resource, Array.from(componentDecoratorImports))] }]
        });

        this.addPropertiesAndConstructor(formClass, resource, formControls, discriminator, oneOfSchemas);
        this.addLifecycleAndHelpers(formClass, resource, formControls, discriminator, oneOfSchemas);
        if (discriminator) {
            this.addPolymorphismTypeGuards(sourceFile, oneOfSchemas, resource.modelName);
        }
    }

    private getComponentDecorator(resource: Resource, imports: string[]): string {
        // This now correctly uses the module names as identifiers, not strings
        return `{
        selector: 'app-${resource.name}-form',
        standalone: true,
        imports: [${imports.sort().join(', ')}],
        templateUrl: './${resource.name}-form.component.html',
        styleUrls: ['./${resource.name}-form.component.scss']
    }`;
    }

    private addPropertiesAndConstructor(formClass: ClassDeclaration, resource: Resource, formControls: FormControlInfo[], discriminator: any, oneOfSchemas: SwaggerDefinition[]) {
        const resourceNamePascal = pascalCase(resource.name);
        const serviceName = `${camelCase(resource.name)}Service`;
        const serviceClassName = `${resourceNamePascal}Service`;

        const getByIdOperation = resource.operations.find(op => op.action === 'getById');
        const getByIdMethodName = getByIdOperation?.operationId ? camelCase(getByIdOperation.operationId) : camelCase(`get ${resource.modelName} by id`);

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

        // --- START FIX ---
        // Move this function declaration back inside the method that uses it.
        const addEnumOptions = (controls: FormControlInfo[]) => {
            controls.forEach(p => {
                if (p.options && p.options.enumName) {
                    formClass.addProperty({ name: p.options.enumName, isStatic: true, initializer: JSON.stringify(p.options.values) });
                }
                if(p.nestedProperties) addEnumOptions(p.nestedProperties);
                if(p.arrayItemInfo?.nestedProperties) addEnumOptions(p.arrayItemInfo.nestedProperties);
            });
        };
        // --- END FIX ---

        addEnumOptions(formControls);

        if (discriminator) {
            formClass.addProperty({ name: 'discriminatorSub!: Subscription' });
            formClass.addProperty({
                name: 'discriminatorOptions',
                isStatic: true,
                isReadonly: true,
                initializer: `[${oneOfSchemas.map(s => `'${s.properties![discriminator.propertyName].enum![0]}'`).join(', ')}]`
            });
        }

        formClass.addConstructor({
            statements: `
                this.initForm();
                effect(() => {
                    this.form.reset();
                    const id = this.id();
                    if (this.isEditMode() && id) {
                        this.${serviceName}.${getByIdMethodName}(id).subscribe((entity: any) => {
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
        formClass.addMethod({
            name: 'initForm',
            scope: Scope.Private,
            statements: `this.form = new FormGroup({ ${buildFormGroupInitializer(formControls)} });`
        });

        formControls.filter(fc => fc.controlType === 'array').forEach(fc => {
            if (fc.arrayItemInfo?.nestedProperties) {
                const arrayName = camelCase(fc.name);
                const arrayPascal = pascalCase(fc.name);
                const itemControls = fc.arrayItemInfo.nestedProperties;

                formClass.addGetAccessor({
                    name: `${arrayName}Array`,
                    returnType: 'FormArray',
                    statements: `return this.form.get('${fc.name}') as FormArray;`
                });
                formClass.addMethod({
                    name: `create${arrayPascal}ArrayItem`,
                    parameters: [{ name: 'item?', type: `any` }],
                    returnType: 'FormGroup',
                    statements: `return new FormGroup({ ${buildFormGroupInitializer(itemControls)} });`
                });
                formClass.addMethod({
                    name: `add${arrayPascal}ArrayItem`,
                    statements: `this.${arrayName}Array.push(this.create${arrayPascal}ArrayItem());`
                });
                formClass.addMethod({
                    name: `remove${arrayPascal}ArrayItem`,
                    parameters: [{ name: 'index', type: 'number' }],
                    statements: `this.${arrayName}Array.removeAt(index);`
                });
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
        formClass.addMethod({
            name: 'patchForm',
            parameters: [{ name: 'entity', type: `models.${modelName}` }],
            statements: patchFormBody
        });

        if (discriminator) {
            formClass.addGetAccessor({
                name: `${discriminator.propertyName}Ctrl`,
                returnType: 'FormControl',
                statements: `return this.form.get('${discriminator.propertyName}') as FormControl;`
            });
            formClass.addMethod({
                name: `isPetType`,
                parameters: [{ name: 'type', type: 'string' }],
                returnType: 'boolean',
                statements: `return this.${discriminator.propertyName}Ctrl.value === type;`
            });

            const switchCases = oneOfSchemas.map(schema => {
                const typeName = schema.properties![discriminator.propertyName].enum![0] as string;
                const subControls = Object.keys(schema.properties!).filter(p => !resource.formProperties.some(fp => fp.name === p))
                    .map(pName => mapSchemaToFormControl(pName, schema.properties![pName]))
                    .filter((c): c is FormControlInfo => !!c);

                return `case '${typeName}':
                this.form.addControl('${typeName}', new FormGroup({ ${buildFormGroupInitializer(subControls)} }));
                break;`;
            }).join('\n            ');

            formClass.addMethod({
                name: `updateFormFor${pascalCase(discriminator.propertyName)}`,
                parameters: [{ name: 'type', type: 'string | null' }],
                statements: `
            ${oneOfSchemas.map(s => `this.form.removeControl('${s.properties![discriminator.propertyName].enum![0]}');`).join('\n            ')}
            switch(type) {
            ${switchCases}
            }
        `
            });

            formClass.addMethod({
                name: 'getPayload', returnType: `any`, statements: `
            const petType = this.${discriminator.propertyName}Ctrl.value;
            const baseValue = this.form.getRawValue();
            const subFormValue = this.form.get(petType)?.value ?? {};
            const payload = { ...baseValue, ...subFormValue };
            ${oneOfSchemas.map(s => `delete payload.${s.properties![discriminator.propertyName].enum![0]};`).join('\n            ')}
            return payload;
        `
            });

            formClass.addMethods([
                {
                    name: 'ngOnInit',
                    statements: `this.discriminatorSub = this.form.get('${discriminator.propertyName}')?.valueChanges.subscribe(type => this.updateFormFor${pascalCase(discriminator.propertyName)}(type));`
                },
                {
                    name: 'ngOnDestroy',
                    statements: `if (this.discriminatorSub) { this.discriminatorSub.unsubscribe(); }`
                }
            ]);
        }

        const serviceName = `${camelCase(resource.name)}Service`;
        const createOperation = resource.operations.find(op => op.action === 'create');
        const updateOperation = resource.operations.find(op => op.action === 'update');

        const createMethod = createOperation?.operationId ? camelCase(createOperation.operationId) : `create${resource.modelName}`;
        const updateMethod = updateOperation?.operationId ? camelCase(updateOperation.operationId) : `update${resource.modelName}`;
        const payload = discriminator ? 'this.getPayload()' : 'this.form.value';

        const updateHasBody = !!updateOperation?.requestBody;

        // Construct the argument list for the update call.
        // We start with the payload if the operation expects a body.
        const updateCallArgs: string[] = [];
        if (updateHasBody) {
            updateCallArgs.push('finalPayload');
        }
        // Then, we add the ID, which is always expected for an update.
        updateCallArgs.push('this.id()!');

        formClass.addMethod({
            name: 'onSubmit',
            statements: `
if (this.form.invalid) { return; }
const finalPayload = ${payload};
const action$ = this.isEditMode()
  ? this.${serviceName}.${updateMethod}(${updateCallArgs.join(', ')})
  : this.${serviceName}.${createMethod}(finalPayload);
action$.subscribe(() => this.onCancel());
`});

        formClass.addMethod({
            name: 'onCancel',
            statements: `this.router.navigate(['..'], { relativeTo: this.route });`
        });

        if (formControls.some(fc => fc.controlType === 'file')) {
            formClass.addMethod({
                name: 'onFileSelected',
                parameters: [{ name: 'event', type: 'Event' }, { name: 'formControlName', type: 'string' }],
                statements: `
            const file = (event.target as HTMLInputElement).files?.[0];
            if (file) this.form.patchValue({ [formControlName]: file });
        `
            });
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
        let template = formTemplate; // Use imported template

        const componentClassName = `${pascalCase(resource.name)}FormComponent`;
        const controlsHtml = this.buildFormHtml(resource, formControls, componentClassName, discriminator, oneOfSchemas);

        template = template.replace('{{formControlsHtml}}', controlsHtml)
            .replace('{{modelName}}', resource.modelName)
            .replace('{{formTitle}}', '{{ formTitle() }}');

        this.project.getFileSystem().writeFileSync(filePath, template);
    }

    private buildFormHtml(resource: Resource, controls: FormControlInfo[], componentClassName: string, discriminator: any, oneOfSchemas: SwaggerDefinition[]): string {
        return controls.map(fc => {
            if (fc.controlType === 'group' && fc.nestedProperties) {
                const innerHtml = this.buildFormHtml(resource, fc.nestedProperties, componentClassName, null, []);
                return `<div formGroupName="${fc.name}" class="admin-form-group"><h3>${fc.label}</h3>${innerHtml}</div>`;
            }

            if (fc.controlType === 'array') {
                if (fc.arrayItemInfo?.nestedProperties) {
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
                } else {
                    return `<div>
            <div formArrayName="${fc.name}">
              <!-- Simplified view for primitive arrays; full control would be more complex -->
            </div>
            @if (form.get('${fc.name}')?.hasError('uniqueItems')) {
                <mat-error>All items must be unique.</mat-error>
            }
            @if (form.get('${fc.name}')?.hasError('minlength')) {
                <mat-error>Must have at least ${fc.attributes?.minLength} items.</mat-error>
            }
        </div>`;
                }
            }

            if (discriminator && fc.name === discriminator.propertyName) {
                const polyHtml = oneOfSchemas.map(schema => {
                    const typeName = schema.properties![discriminator.propertyName].enum![0];
                    const subControls = Object.keys(schema.properties!).filter(p => !resource.formProperties.some(fp => fp.name === p))
                        .map(pName => mapSchemaToFormControl(pName, schema.properties![pName]))
                        .filter(c => c) as FormControlInfo[];

                    return `@if (isPetType('${typeName}')) { <div formGroupName="${typeName}">${this.buildFormHtml(resource, subControls, componentClassName, null, [])}</div> }`;
                }).join('\n');
                return this.getSimpleControlHtml(fc, componentClassName) + '\n' + polyHtml;
            }

            return this.getSimpleControlHtml(fc, componentClassName);
        }).join('\n\n');
    }

    private getSimpleControlHtml(fc: FormControlInfo, componentClassName: string): string {
        let template = controlTemplates[fc.controlType] || inputTemplate;

        template = template.replace(/{{propertyName}}/g, fc.name)
            .replace(/{{label}}/g, fc.label)
            .replace(/{{inputType}}/g, fc.inputType ?? 'text');

        if (fc.options) {
            template = template.replace(/{{enumName}}/g, `${componentClassName}.${fc.options.enumName}`)
                .replace(/{{multiple}}/g, fc.options.multiple ? ' multiple' : '');
        }

        if (fc.attributes) {
            template = template.replace(/{{minLength}}/g, String(fc.attributes.minLength))
                .replace(/{{maxLength}}/g, String(fc.attributes.maxLength))
                .replace(/min="{{min}}"/g, `min="${fc.attributes.min}"`)
                .replace(/max="{{max}}"/g, `max="${fc.attributes.max}"`);
        }

        return template;
    }

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
