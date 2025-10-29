// src/service/emit/admin/form-component.generator.ts

import { Project, ClassDeclaration, Scope } from "ts-morph";
import { posix as path } from "node:path";
import { Resource, SwaggerDefinition } from "../../../core/types.js";
import { camelCase, kebabCase, pascalCase } from "../../../core/utils.js";
import { FormControlInfo } from './form-control.mapper.js';

// Import all templates
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

// A complete list of imports needed for a standalone form component
const standaloneFormImportsArray = `[
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatRadioModule,
    MatButtonToggleModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSliderModule,
    MatChipsModule,
    MatIconModule
]`;

export class FormComponentGenerator {
    constructor(private project: Project) { }

    public generate(
        resource: Resource,
        formControls: FormControlInfo[],
        discriminator: any, // This is part of resource, but passed for explicitness
        oneOfSchemas: SwaggerDefinition[], // Same as above
        adminDir: string
    ): { usesCustomValidators: boolean } {
        const componentDir = path.join(adminDir, resource.name, `${resource.name}-form`);
        this.project.getFileSystem().mkdirSync(componentDir, { recursive: true });

        const tsFilePath = path.join(componentDir, `${resource.name}-form.component.ts`);
        const htmlFilePath = path.join(componentDir, `${resource.name}-form.component.html`);
        const scssFilePath = path.join(componentDir, `${resource.name}-form.component.scss`);

        const usesCustomValidators = this.checkForCustomValidators(formControls);

        this.generateTypeScript(resource, tsFilePath, formControls, discriminator, oneOfSchemas);
        this.generateHtml(resource, htmlFilePath, formControls, discriminator);
        this.generateScss(scssFilePath);

        return { usesCustomValidators };
    }

    private checkForCustomValidators(controls: FormControlInfo[]): boolean {
        for (const control of controls) {
            if (control.validators.some(v => v.startsWith('CustomValidators.'))) {
                return true;
            }
            if (control.nestedProperties && this.checkForCustomValidators(control.nestedProperties)) {
                return true;
            }
            if (control.arrayItemInfo && this.checkForCustomValidators([control.arrayItemInfo])) {
                return true;
            }
        }
        return false;
    }

    private generateTypeScript(resource: Resource, filePath: string, formControls: FormControlInfo[], discriminator: any, oneOfSchemas: SwaggerDefinition[]): void {
        const componentClassName = `${pascalCase(resource.name)}FormComponent`;
        const serviceName = `${camelCase(resource.name)}Service`;
        const serviceClassName = `${pascalCase(serviceName)}`;
        const modelName = resource.modelName;

        const sourceFile = this.project.createSourceFile(filePath, undefined, { overwrite: true });
        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core', namedImports: ['Component', 'OnInit', 'inject', 'signal', 'effect', 'computed', 'input', 'OnDestroy'] },
            { moduleSpecifier: '@angular/common', namedImports: ['CommonModule'] },
            { moduleSpecifier: '@angular/forms', namedImports: ['FormBuilder', 'FormGroup', 'FormControl', 'FormArray', 'Validators', 'ReactiveFormsModule'] },
            { moduleSpecifier: '@angular/router', namedImports: ['Router', 'ActivatedRoute', 'RouterModule'] },
            { moduleSpecifier: 'rxjs', namedImports: ['Subscription'] },
            { moduleSpecifier: `../../../services/${kebabCase(resource.name)}.service`, namedImports: [serviceClassName] },
            { moduleSpecifier: `../../../models`, isTypeOnly: true, namedImports: [modelName, ...oneOfSchemas.map(s => pascalCase(s.$ref!.split('/').pop()!))] },
            // Dynamically add CustomValidators import if needed
            ...(this.checkForCustomValidators(formControls) ? [{ moduleSpecifier: '../../shared/custom-validators', namedImports: ['CustomValidators'] }] : []),
            // Add all material imports
            { moduleSpecifier: '@angular/material/button', namedImports: ['MatButtonModule'] },
            { moduleSpecifier: '@angular/material/form-field', namedImports: ['MatFormFieldModule'] },
            { moduleSpecifier: '@angular/material/input', namedImports: ['MatInputModule'] },
            { moduleSpecifier: '@angular/material/select', namedImports: ['MatSelectModule'] },
            { moduleSpecifier: '@angular/material/radio', namedImports: ['MatRadioModule'] },
            { moduleSpecifier: '@angular/material/button-toggle', namedImports: ['MatButtonToggleModule'] },
            { moduleSpecifier: '@angular/material/datepicker', namedImports: ['MatDatepickerModule'] },
            { moduleSpecifier: '@angular/material/core', namedImports: ['MatNativeDateModule'] },
            { moduleSpecifier: '@angular/material/slider', namedImports: ['MatSliderModule'] },
            { moduleSpecifier: '@angular/material/chips', namedImports: ['MatChipsModule'] },
            { moduleSpecifier: '@angular/material/icon', namedImports: ['MatIconModule'] },
        ]);

        const componentClass = sourceFile.addClass({
            name: componentClassName,
            isExported: true,
            implements: ['OnInit', 'OnDestroy'],
            decorators: [{
                name: 'Component',
                arguments: [`{
                selector: 'app-${kebabCase(resource.name)}-form',
                standalone: true,
                imports: ${standaloneFormImportsArray},
                templateUrl: './${kebabCase(resource.name)}-form.component.html',
                styleUrl: './${kebabCase(resource.name)}-form.component.scss'
            }`]
            }]
        });

        // Add class properties
        this.addProperties(componentClass, resource, formControls, discriminator);

        // Add constructor with data fetching effect
        this.addConstructor(componentClass, resource, serviceName);

        // Add Lifecycle hooks and form methods
        this.addMethods(componentClass, resource, serviceName, formControls, discriminator, oneOfSchemas);
    }

    private addProperties(componentClass: ClassDeclaration, resource: Resource, formControls: FormControlInfo[], discriminator: any): void {
        const serviceName = `${camelCase(resource.name)}Service`;
        componentClass.addProperties([
            { name: 'id', initializer: 'input<string | number>()' },
            { name: 'isEditMode', isReadonly: true, initializer: `computed(() => !!this.id())` },
            { name: 'formTitle', type: 'string', initializer: `computed(() => this.isEditMode() ? 'Edit ${resource.modelName}' : 'Create ${resource.modelName}')` },
            { name: 'form!', type: 'FormGroup' },
            { name: 'private readonly fb', initializer: 'inject(FormBuilder)' },
            { name: 'private readonly router', initializer: 'inject(Router)' },
            { name: 'private readonly route', initializer: 'inject(ActivatedRoute)' },
            { name: `private readonly ${serviceName}`, initializer: `inject(${pascalCase(serviceName)})` },
        ]);

        if (discriminator) {
            componentClass.addProperty({ name: `private discriminatorSub!: Subscription` });
            const options = discriminator.schema.oneOf.map((s: SwaggerDefinition) => `'${s.properties![discriminator.propertyName].enum![0]}'`).join(', ');
            componentClass.addProperty({ name: 'public static readonly discriminatorOptions', isStatic: true, initializer: `[${options}]` });
        }

        formControls.forEach(fc => {
            if ((fc.controlType === 'select' || fc.controlType === 'radio') && fc.options && !fc.options.enumName?.startsWith('discriminator')) {
                const options = fc.options.values.map(v => typeof v === 'string' ? `'${v}'` : v).join(', ');
                componentClass.addProperty({ name: `${fc.options.enumName}`, initializer: `[${options}]`, isReadonly: true });
            }
        });
    }

    private addConstructor(componentClass: ClassDeclaration, resource: Resource, serviceName: string): void {
        const getByIdOp = resource.operations.find(op => op.action === 'getById');
        if (!getByIdOp) return;

        componentClass.addConstructor({
            statements: `
effect(() => {
    const id = this.id();
    if (this.isEditMode() && id) {
    this.${serviceName}.${camelCase(getByIdOp.operationId!)} (id).subscribe(entity => {
        if(entity) this.patchForm(entity);
    });
    } else {
        this.initForm();
    }
});`
        });
    }

    private addMethods(cls: ClassDeclaration, res: Resource, srv: string, fcs: FormControlInfo[], disc: any, oneOf: SwaggerDefinition[]): void {
        cls.addMethod({ name: 'ngOnInit', statements: 'this.initForm();' });
        cls.addMethod({ name: 'ngOnDestroy', statements: disc ? 'this.discriminatorSub?.unsubscribe();' : '' });

        cls.addMethod({
            name: 'initForm',
            scope: Scope.Private,
            statements: `this.form = this.fb.group({
    ${fcs.map(fc => this.getFormControlInitString(fc)).join(',\n    ')}
});
${disc ? `
this.discriminatorSub = this.form.get('${disc.propertyName}')!.valueChanges.subscribe(type => {
    this.updateFormForPetType(type);
});
` : ''}
`
        });

        cls.addMethod({ name: 'patchForm', scope: Scope.Private, parameters: [{ name: 'entity', type: res.modelName }], statements: this.getPatchFormBody(fcs, disc, oneOf, res.modelName) });
        this.addFormArrayHelpers(cls, fcs);

        const createOp = res.operations.find(op => op.action === 'create');
        const updateOp = res.operations.find(op => op.action === 'update');
        if (createOp || updateOp) {
            const updateHasBody = !!updateOp?.requestBody;
            const updateCall = updateOp ? (updateHasBody ? `this.${srv}.${camelCase(updateOp.operationId!)} (this.id()!, payload)`: `this.${srv}.${camelCase(updateOp.operationId!)} (this.id()!)`) : 'null';
            const createCall = createOp ? `this.${srv}.${camelCase(createOp.operationId!)} (payload)` : 'null';
            cls.addMethod({ name: 'getPayload', scope: Scope.Private, returnType: "any", statements: this.getPayloadBody(disc) });
            cls.addMethod({ name: 'onSubmit', statements: `if (this.form.invalid) return;\nconst payload = this.getPayload();\nconst action$ = this.isEditMode() ? ${updateCall} : ${createCall};\nif (action$) action$.subscribe(() => this.onCancel());` });
        }

        cls.addMethod({ name: 'onCancel', statements: `this.router.navigate(['..'], { relativeTo: this.route });` });

        if(disc) this.addDiscriminatorMethods(cls, disc, oneOf);
    }

    private getFormControlInitString(fc: FormControlInfo): string {
        const validators = fc.validators.length > 0 ? `, [${fc.validators.join(', ')}]` : '';
        switch (fc.controlType) {
            case 'group': return `${fc.name}: this.fb.group({ ${fc.nestedProperties?.map(p => this.getFormControlInitString(p)).join(',\n')} })`;
            case 'array': return `${fc.name}: this.fb.array([]${validators})`;
            default: return `${fc.name}: new FormControl(null${validators})`;
        }
    }

    private addFormArrayHelpers(cls: ClassDeclaration, formControls: FormControlInfo[]): void {
        formControls.forEach(fc => {
            if (fc.controlType === 'array' && fc.arrayItemInfo) {
                const arrayName = fc.name;
                const arrayPascal = pascalCase(arrayName);
                cls.addGetAccessor({ name: `${arrayName}Array`, returnType: 'FormArray', statements: `return this.form.get('${arrayName}') as FormArray;` });
                cls.addMethod({ name: `add${arrayPascal}Item`, statements: `this.${arrayName}Array.push(this.create${arrayPascal}Item());` });
                cls.addMethod({ name: `remove${arrayPascal}Item`, parameters: [{ name: 'index', type: 'number' }], statements: `this.${arrayName}Array.removeAt(index);` });
                cls.addMethod({
                    name: `create${arrayPascal}Item`, scope: Scope.Private, parameters: [{ name: 'item?', type: 'any' }], returnType: 'FormGroup',
                    statements: `return this.fb.group({
    ${fc.arrayItemInfo.nestedProperties?.map(p => this.getFormControlInitString(p)).join(',\n    ')}
});`
                });
            }
        });
    }

    private getPatchFormBody(fcs: FormControlInfo[], disc: any, oneOf: SwaggerDefinition[], modelName: string): string {
        const statements: string[] = [];
        const arrayPatchers = fcs.filter(fc => fc.controlType === 'array').map(fc => `
if(entity.${fc.name}) {
    this.${fc.name}Array.clear();
    entity.${fc.name}.forEach(item => {
        const formGroup = this.create${pascalCase(fc.name)}Item();
        formGroup.patchValue(item);
        this.${fc.name}Array.push(formGroup);
    });
}`);

        if (disc) {
            statements.push(`const petType = entity.${disc.propertyName};`);
            statements.push(`this.form.get('${disc.propertyName}')?.setValue(petType, { emitEvent: true });`);
            statements.push(...oneOf.map(schemaDef => {
                const typeName = schemaDef.$ref!.split('/').pop()!;
                return `if(this.is${pascalCase(typeName)}(entity)) {
    (this.form.get('${camelCase(typeName)}') as FormGroup)?.patchValue(entity);
}`;
            }));
            statements.push(`this.form.patchValue(entity);`);
        } else {
            statements.push(`this.form.patchValue(entity);`);
        }
        statements.push(...arrayPatchers);
        return statements.join('\n');
    }

    private getPayloadBody(disc: any): string {
        if (!disc) return 'return this.form.getRawValue();';
        return `const baseValue = this.form.getRawValue();
const petType = baseValue.${disc.propertyName};
const subFormValue = this.form.get(petType)?.value || {};
const payload = { ...baseValue, ...subFormValue };
${disc.schema.oneOf.map((s: any) => `delete payload.${camelCase(s.$ref.split('/').pop())};`).join('\n')}
return payload;`;
    }

    private addDiscriminatorMethods(cls: ClassDeclaration, disc: any, oneOf: SwaggerDefinition[]): void {
        const dProp = disc.propertyName;
        const dPropPascal = pascalCase(dProp);
        cls.addMethod({
            name: `updateFormFor${dPropPascal}`, scope: Scope.Private, parameters: [{ name: 'type', type: 'string | null' }],
            statements: `
${oneOf.map(s => { const n = camelCase(s.$ref!.split('/').pop()!); return `this.form.removeControl('${n}');`; }).join('\n')}
switch (type) {
    ${oneOf.map(s => {
                const typeName = s.$ref!.split('/').pop()!;
                const enumVal = s.properties![dProp].enum![0];
                const subFormControls = Object.entries(s.properties!).filter(([key]) => key !== dProp)
                    .map(([key, schema]) => this.getFormControlInitString({ name: key, schema } as any));
                return `case '${enumVal}':
        this.form.addControl('${camelCase(typeName)}', this.fb.group({ ${subFormControls.join(', ')} }));
        break;`;
            }).join('\n    ')}
}`
        });

        cls.addMethod({ name: `is${dPropPascal}`, parameters: [{ name: 'type', type: 'string' }], returnType: 'boolean', statements: `return this.form.get('${dProp}')?.value === type;` });

        oneOf.forEach(schemaDef => {
            const typeName = pascalCase(schemaDef.$ref!.split('/').pop()!);
            cls.addMethod({ name: `is${typeName}`, parameters:[{name: 'entity', type: 'any'}], returnType: `entity is ${typeName}`, statements: `return entity && entity.${dProp} === '${schemaDef.properties![dProp].enum![0]}';`})
        })
    }

    private generateHtml(resource: Resource, filePath: string, formControls: FormControlInfo[], discriminator: any): void {
        const controlsHtml = formControls.map(fc => this.renderControl(fc, discriminator)).join('\n\n');
        let template = formTemplate
            .replace('{{formControlsHtml}}', controlsHtml)
            .replace('{{modelName}}', resource.modelName);
        this.project.getFileSystem().writeFileSync(filePath, template);
    }

    private renderControl(fc: FormControlInfo, discriminator: any): string {
        let template = '';
        switch (fc.controlType) {
            case 'input': template = inputTemplate; break;
            case 'textarea': template = textareaTemplate; break;
            case 'datepicker': template = datepickerTemplate; break;
            case 'slider': template = sliderTemplate; break;
            case 'toggle': template = toggleTemplate; break;
            case 'radio': template = radioTemplate; break;
            case 'select': template = selectTemplate; break;
            case 'chips': template = chipsTemplate; break;
            case 'file': template = fileTemplate; break;
            case 'group': return this.renderGroup(fc);
            case 'array': return this.renderArray(fc);
            default: return `<!-- Control for ${fc.name} (type: ${fc.controlType}) not implemented -->`;
        }

        template = template
            .replace(/{{label}}/g, fc.label)
            .replace(/{{propertyName}}/g, fc.name)
            .replace(/{{inputType}}/g, fc.inputType || 'text')
            .replace(/{{enumName}}/g, fc.options?.enumName || '')
            .replace(/{{multiple}}/g, fc.options?.multiple ? ' multiple' : '')
            .replace(/{{min}}/g, String(fc.attributes?.min ?? ''))
            .replace(/{{max}}/g, String(fc.attributes?.max ?? ''))
            .replace(/{{minLength}}/g, String(fc.attributes?.minLength ?? ''))
            .replace(/{{maxLength}}/g, String(fc.attributes?.maxLength ?? ''));

        if (discriminator && fc.name === discriminator.propertyName) {
            return template.replace(/{{enumName}}/g, `${pascalCase(resource.name)}FormComponent.discriminatorOptions`);
        }

        return template;
    }

    private renderGroup(fc: FormControlInfo): string {
        return `<div formGroupName="${fc.name}">
    <h3>${fc.label}</h3>
    ${fc.nestedProperties?.map(p => this.renderControl(p, null)).join('\n')}
</div>`;
    }

    private renderArray(fc: FormControlInfo): string {
        return `<div formArrayName="${fc.name}">
    <h3>${fc.label}</h3>
    <button mat-stroked-button type="button" (click)="add${pascalCase(fc.name)}Item()">Add ${pascalCase(singular(fc.name))}</button>
    @for (item of ${fc.name}Array.controls; track i; let i = $index) {
        <div [formGroupName]="i" class="form-array-item">
             <h4>${pascalCase(singular(fc.name))} {{i + 1}}</h4>
             ${fc.arrayItemInfo?.nestedProperties?.map(p => this.renderControl(p, null)).join('\n') ?? ''}
             <button mat-icon-button color="warn" type="button" (click)="remove${pascalCase(fc.name)}Item(i)">
                 <mat-icon>delete</mat-icon>
             </button>
        </div>
    }
</div>`;
    }
}
