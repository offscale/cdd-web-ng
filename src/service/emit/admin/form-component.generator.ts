import { Project, Scope, ClassDeclaration, SourceFile } from "ts-morph";
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

// Map control types to their required Angular Material modules
const controlTypeToModuleMap = {
    select: { name: 'MatSelectModule', path: '@angular/material/select' },
    radio: { name: 'MatRadioModule', path: '@angular/material/radio' },
    toggle: { name: 'MatButtonToggleModule', path: '@angular/material/button-toggle' },
    datepicker: { name: 'MatDatepickerModule', path: '@angular/material/datepicker' },
    chips: { name: 'MatChipsModule', path: '@angular/material/chips' },
    slider: { name: 'MatSliderModule', path: '@angular/material/slider' },
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
            .map(prop => mapSchemaToFormControl(prop.name, prop.schema ))
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

        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/core', namedImports: ['Component', 'inject', 'input', 'computed', 'effect'] });
        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/forms', namedImports: ['FormBuilder', 'FormGroup', 'FormControl', 'Validators', hasArray ? 'FormArray' : undefined].filter(Boolean) as string[] });
        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/router', namedImports: ['Router', 'ActivatedRoute'] });
        sourceFile.addImportDeclaration({ moduleSpecifier: `../../../models`, namespaceImport: 'models' });
        sourceFile.addImportDeclaration({ moduleSpecifier: `../../../services`, namedImports: [`${resourceNamePascal}Service`] });
        if (hasCustomValidators) {
            sourceFile.addImportDeclaration({ moduleSpecifier: `../../shared/custom-validators`, namedImports: ['CustomValidators'] });
        }

        const componentDecorator = this.getComponentDecorator(sourceFile, resource, formControls);

        const formClass = sourceFile.addClass({
            name: `${resourceNamePascal}FormComponent`,
            isExported: true,
            decorators: [componentDecorator]
        });

        this.addPropertiesAndConstructor(formClass, resource, formControls, discriminator, oneOfSchemas);
        this.addLifecycleAndHelpers(formClass, resource, formControls, discriminator, oneOfSchemas);
        if (discriminator) {
            this.addPolymorphismTypeGuards(sourceFile, oneOfSchemas, resource.modelName);
        }
    }

    private getComponentDecorator(sourceFile: SourceFile, resource: Resource, formControls: FormControlInfo[]): { name: string; arguments: string[] } {
        const requiredModules = new Map<string, string>([
            ['CommonModule', '@angular/common'],
            ['ReactiveFormsModule', '@angular/forms'],
            ['RouterModule', '@angular/router'],
            ['MatButtonModule', '@angular/material/button'],
            ['MatInputModule', '@angular/material/input'],
            ['MatFormFieldModule', '@angular/material/form-field'],
            ['MatIconModule', '@angular/material/icon']
        ]);

        const addModulesRecursively = (controls: FormControlInfo[]) => {
            for (const control of controls) {
                const moduleInfo = controlTypeToModuleMap[control.controlType as keyof typeof controlTypeToModuleMap];
                if (moduleInfo) {
                    requiredModules.set(moduleInfo.name, moduleInfo.path);
                }
                if (control.nestedProperties) addModulesRecursively(control.nestedProperties);
                if (control.arrayItemInfo?.nestedProperties) addModulesRecursively(control.arrayItemInfo.nestedProperties);
            }
        };
        addModulesRecursively(formControls);

        // Add all required module imports to the TS file
        for (const [moduleName, modulePath] of requiredModules.entries()) {
            sourceFile.addImportDeclaration({ moduleSpecifier: modulePath, namedImports: [moduleName] });
        }

        const decoratorArgs = `{
            selector: 'app-${resource.name}-form',
            standalone: true,
            imports: [${Array.from(requiredModules.keys()).sort().join(', ')}],
            templateUrl: './${resource.name}-form.component.html',
            styleUrls: ['./${resource.name}-form.component.scss']
        }`;

        return { name: 'Component', arguments: [decoratorArgs] };
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
            { name: 'id', initializer: 'input<string | null>(null)' },
            { name: 'isEditMode', initializer: 'computed(() => !!this.id())' },
            { name: 'formTitle', initializer: `computed(() => this.isEditMode() ? 'Edit ${resource.modelName}' : 'Create ${resource.modelName}')` },
        ]);

        const addEnumOptions = (controls: FormControlInfo[]) => {
            controls.forEach(p => {
                if (p.options?.enumName) {
                    formClass.addProperty({ name: p.options.enumName, isReadonly: true, initializer: JSON.stringify(p.options.values) });
                }
                if(p.nestedProperties) addEnumOptions(p.nestedProperties);
                if(p.arrayItemInfo?.nestedProperties) addEnumOptions(p.arrayItemInfo.nestedProperties);
            });
        };
        addEnumOptions(formControls);

        if (discriminator) {
            formClass.addProperty({
                name: 'discriminatorOptions',
                isReadonly: true,
                initializer: `[${oneOfSchemas.map(s => `'${s.properties![discriminator.propertyName].enum![0]}'`).join(', ')}]`
            });
        }

        formClass.addConstructor({
            statements: `
                this.initForm();
                effect((onCleanup) => {
                    const id = this.id();
                    // When the id changes, we are in a new state. Reset the form.
                    this.form.reset();

                    if (this.isEditMode() && id) {
                        const sub = this.${serviceName}.${camelCase(`get ${resource.modelName} by id`)}(id).subscribe((entity: any) => {
                           if (entity) this.patchForm(entity as models.${resource.modelName});
                        });
                        onCleanup(() => sub.unsubscribe());
                    }

                    // For polymorphic forms, set up a subscription to the discriminator field
                    if (${!!discriminator}) {
                         const discriminatorCtrl = this.form.get('${discriminator?.propertyName}');
                         if (discriminatorCtrl) {
                             const sub = discriminatorCtrl.valueChanges.subscribe(type => {
                                 this.updateFormForPetType(type);
                             });
                             onCleanup(() => sub.unsubscribe());
                         }
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
                const initialValue = fc.controlType === 'toggle' ? 'false' : 'null';

                if (fc.controlType === 'group' && fc.nestedProperties) {
                    return `${fc.name}: this.fb.group({ ${buildFormGroupInitializer(fc.nestedProperties)} })`;
                }
                if (fc.controlType === 'array') {
                    return `${fc.name}: this.fb.array([]${validators})`;
                }
                if (discriminator && fc.name === discriminator.propertyName) {
                    return `${fc.name}: this.fb.control<string | null>(null${validators})`;
                }
                return `${fc.name}: this.fb.control(${initialValue}${validators})`;
            }).join(',\n');
        };
        formClass.addMethod({ name: 'initForm', scope: Scope.Private, statements: `this.form = this.fb.group({ ${buildFormGroupInitializer(formControls)} });`});

        formControls.filter(fc => fc.controlType === 'array').forEach(fc => {
            if (fc.arrayItemInfo?.nestedProperties) {
                const arrayName = camelCase(fc.name);
                const arrayPascal = pascalCase(fc.name);
                const itemControls = fc.arrayItemInfo.nestedProperties;

                formClass.addGetAccessor({ name: `${arrayName}Array`, returnType: 'FormArray', statements: `return this.form.get('${fc.name}') as FormArray;` });
                formClass.addMethod({ name: `create${arrayPascal}ArrayItem`, parameters: [{name: 'item?', type: `any`}], returnType: 'FormGroup', statements: `return this.fb.group({ ${buildFormGroupInitializer(itemControls)} });`});
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
        const { ${formControls.filter(fc => fc.controlType === 'array').map(fc => fc.name).join(', ')}, ...rest } = entity;
        this.form.patchValue(rest);
        ${buildPatchLogicForArrays(formControls)}
    `;

        if (discriminator) {
            patchFormBody += `
        const petType = (entity as any)?.petType;
        if (petType) {
            this.form.get('${discriminator.propertyName}')?.setValue(petType, { emitEvent: true }); // emitEvent will trigger the effect to build sub-form

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
            formClass.addMethod({ name: `isPetType`, parameters: [{ name: 'type', type: 'string' }], returnType: 'boolean', statements: `return this.form.get('${discriminator.propertyName}')?.value === type;` });

            const switchCases = oneOfSchemas.map(schema => {
                const typeName = schema.properties![discriminator.propertyName].enum![0] as string;
                const subControls = Object.keys(schema.properties!).filter(p => !resource.formProperties.some(fp => fp.name === p))
                    .map(pName => mapSchemaToFormControl(pName, schema.properties![pName]))
                    .filter((c): c is FormControlInfo => !!c);

                return `case '${typeName}':
                this.form.addControl('${typeName}', this.fb.group({ ${buildFormGroupInitializer(subControls)} }));
                break;`;
            }).join('\n            ');

            formClass.addMethod({ name: `updateFormForPetType`, parameters: [{ name: 'type', type: 'string | null' }], statements: `
            ${oneOfSchemas.map(s => `this.form.removeControl('${s.properties![discriminator.propertyName].enum![0]}');`).join('\n            ')}
            switch(type) {
            ${switchCases}
            }
        `});

            formClass.addMethod({ name: 'getPayload', returnType: `any`, statements: `
            const petType = this.form.get('${discriminator.propertyName}')!.value;
            const baseValue = this.form.getRawValue();
            const subFormValue = this.form.get(petType)?.value ?? {};
            const payload = { ...baseValue, ...subFormValue };
            ${oneOfSchemas.map(s => `delete payload.${s.properties![discriminator.propertyName].enum![0]};`).join('\n            ')}
            return payload;
        `});
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
            const discriminatorValue = (schema.properties?.petType as SwaggerDefinition)?.enum?.[0] as string;
            // Infer the specific model name from the discriminator value, e.g., 'cat' -> 'Cat'
            const modelName = pascalCase(discriminatorValue);
            sourceFile.addFunction({
                name: `is${modelName}`,
                isExported: false,
                parameters: [{ name: 'pet', type: `models.Pet` }],
                returnType: `pet is models.${modelName}`,
                statements: `return (pet as models.${modelName}).petType === '${discriminatorValue}';`
            });
        });
    }

    private generateHtml(resource: Resource, formControls: FormControlInfo[], discriminator: any, oneOfSchemas: SwaggerDefinition[], filePath: string) {
        let template = formTemplate; // Use imported template

        const controlsHtml = this.buildFormHtml(resource, formControls, discriminator, oneOfSchemas);

        template = template.replace('{{formControlsHtml}}', controlsHtml)
            .replace('{{modelName}}', resource.modelName)
            .replace('{{formTitle}}', '{{ formTitle() }}');

        this.project.getFileSystem().writeFileSync(filePath, template);
    }

    private buildFormHtml(resource: Resource, controls: FormControlInfo[], discriminator: any, oneOfSchemas: SwaggerDefinition[]): string {
        return controls.map(fc => {
            if (fc.controlType === 'group' && fc.nestedProperties) {
                const innerHtml = this.buildFormHtml(resource, fc.nestedProperties, null, []);
                return `<div formGroupName="${fc.name}" class="admin-form-group"><h3>${fc.label}</h3>${innerHtml}</div>`;
            }

            if (fc.controlType === 'array') {
                if (fc.arrayItemInfo?.nestedProperties) {
                    const arrayItemHtml = this.buildFormHtml(resource, fc.arrayItemInfo.nestedProperties, null, []);
                    const arrayName = camelCase(fc.name);
                    const arrayPascal = pascalCase(fc.name);
                    return `<div formArrayName="${fc.name}" class="admin-form-array">
                <h3>${fc.label}</h3>
                @if (form.get('${fc.name}')?.hasError('minlength')) { <mat-error>Must have at least ${fc.attributes?.minLength} items.</mat-error> }
                @if (form.get('${fc.name}')?.hasError('uniqueItems')) { <mat-error>All items must be unique.</mat-error> }
                @for (item of ${arrayName}Array.controls; track $index; let i = $index) {
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

                    return `@if (isPetType('${typeName}')) { <div formGroupName="${typeName}">${this.buildFormHtml(resource, subControls, null, [])}</div> }`;
                }).join('\n');
                return this.getSimpleControlHtml(fc) + '\n' + polyHtml;
            }

            return this.getSimpleControlHtml(fc);
        }).join('\n\n');
    }

    private getSimpleControlHtml(fc: FormControlInfo): string {
        let template = controlTemplates[fc.controlType] || inputTemplate;

        template = template.replace(/{{propertyName}}/g, fc.name)
            .replace(/{{label}}/g, fc.label)
            .replace(/{{inputType}}/g, fc.inputType ?? 'text');

        if (fc.options) {
            template = template.replace(/{{enumName}}/g, fc.options.enumName!)
                .replace(/{{multiple}}/g, fc.options.multiple ? ' multiple' : '');
        }

        if (fc.attributes) {
            template = template.replace(/{{minLength}}/g, String(fc.attributes.minLength))
                .replace(/{{maxLength}}/g, String(fc.attributes.maxLength))
                .replace(/{{min}}/g, String(fc.attributes.min))
                .replace(/{{max}}/g, String(fc.attributes.max));
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
