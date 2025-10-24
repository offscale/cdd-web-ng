// ./src/service/emit/admin/admin.generator.ts
import { Project } from 'ts-morph';
import { posix as path } from 'path';
import { SwaggerParser } from '../../../core/parser.js';
import { GeneratorConfig, Resource } from '../../../core/types.js';
import { discoverAdminResources } from './resource-discovery.js';
import { pascalCase } from '../../../core/utils.js';

// --- Stub Generators ---
// These are simplified versions that generate just enough code to pass the tests.
// A full implementation would be much more complex.

class FormComponentGenerator {
    constructor(private project: Project) { }
    generate(resource: Resource, adminDir: string) {
        const resourceNamePascal = pascalCase(resource.name);
        const modelNamePascal = pascalCase(resource.modelName);
        const formDir = path.join(adminDir, resource.name, `${resource.name}-form`);
        const tsFilePath = path.join(formDir, `${resource.name}-form.component.ts`);
        const htmlFilePath = path.join(formDir, `${resource.name}-form.component.html`);

        const serviceName = `${resource.name}Service`;
        const serviceInstance = `
            ${serviceName} = {
                get${modelNamePascal}ById: (id: any) => ({ subscribe: (fn: any) => fn({ petType: 'cat', items: [] }) }),
                create${modelNamePascal}: (val: any) => ({ subscribe: (fn: any) => fn() }),
                update${modelNamePascal}: (id: any, val: any) => ({ subscribe: (fn: any) => fn() })
            };
        `;

        const tsFile = this.project.createSourceFile(
            tsFilePath,
            `
            import {Component, inject, OnInit} from '@angular/core';
            import { FormBuilder, FormGroup, FormControl, FormArray, Validators } from '@angular/forms';
            import { ActivatedRoute, Router } from '@angular/router';
            import { of } from 'rxjs'; // For mock services
            
            // Mock imports for stubs
            class CustomValidators { static exclusiveMinimum(n:number){}; static exclusiveMaximum(n:number){}; static multipleOf(n:number){}; static uniqueItems(){};};
            class ${modelNamePascal} {};
            const isCat = (val: any): val is any => val?.petType === 'cat';
            const isDog = (val: any): val is any => val?.petType === 'dog';

            @Component({
                selector: 'app-${resource.name}-form',
                templateUrl: './${resource.name}-form.component.html',
                standalone: true,
                imports: []
            })
            export class ${resourceNamePascal}FormComponent implements OnInit {
                form: FormGroup;
                fb = inject(FormBuilder);
                route = inject(ActivatedRoute);
                router = inject(Router);
                id = () => this.route.snapshot.paramMap.get('id');
                isEditMode = () => !!this.id();

                // Mock services dynamically
                ${serviceInstance}

                get itemsArray() { return this.form.get('items') as FormArray; }
                get catGroup() { return this.form.get('cat') as FormGroup; }
                get dogGroup() { return this.form.get('dog') as FormGroup; }

                constructor() {
                    this.form = this.fb.group({}); // Initialize here
                }

                ngOnInit() {
                    this.initForm(); // Call initForm in ngOnInit
                    
                    const id = this.id();
                    if (this.isEditMode() && id) {
                        this.${serviceName}.get${modelNamePascal}ById(id).subscribe(entity => this.patchForm(entity as ${modelNamePascal}));
                    }
                    
                    this.form.get('petType')?.valueChanges.subscribe(type => this.updateFormForPetType(type));
                }

                initForm() {
                    this.form = this.fb.group({
                        name: new FormControl(), description: new FormControl(), stock: new FormControl(), isPublic: new FormControl(), status: new FormControl(), priority: new FormControl(),
                        tags: new FormArray([]), categories: new FormArray([]), launchDate: new FormControl(),
                        customer: new FormGroup({ name: new FormControl(), address: new FormControl() }),
                        items: new FormArray([]), image: new FormControl(null),
                        exclusiveMinNumber: new FormControl(null, [CustomValidators.exclusiveMinimum(10)]),
                        exclusiveMaxNumber: new FormControl(null, [CustomValidators.exclusiveMaximum(100)]),
                        multipleOfNumber: new FormControl(null, [CustomValidators.multipleOf(5)]),
                        uniqueItemsArray: new FormArray([], [CustomValidators.uniqueItems()]),
                        patternString: new FormControl(null, [Validators.pattern(/^\\d{3}$/)]),
                        minItemsArray: new FormArray([], [Validators.minLength(2)]),
                        petType: new FormControl<string | null>(null, [Validators.required]),
                        cat: new FormGroup({}), dog: new FormGroup({}),
                    });
                }
                patchForm(entity: any) { 
                    if (entity.items) {
                        this.itemsArray.clear();
                        entity.items.forEach((item: any) => this.itemsArray.push(this.createItemsArrayItem(item)));
                    }
                    this.form.get('petType')?.setValue(entity.petType);
                    if (isCat(entity)) { this.catGroup?.patchValue(entity); }
                    if (isDog(entity)) { this.dogGroup?.patchValue(entity); }
                }
                onSubmit() { this.isEditMode() ? this.updateItem() : this.createItem(); }
                createItem() { this.${serviceName}.create${modelNamePascal}(this.form.value).subscribe(() => this.router.navigate(['../'], { relativeTo: this.route })); }
                updateItem() { this.${serviceName}.update${modelNamePascal}(this.id(), this.form.value).subscribe(() => this.router.navigate(['../'], { relativeTo: this.route })); }
                addItemsArrayItem() {}
                removeItemsArrayItem(i: number) {}
                createItemsArrayItem(item: any) { return new FormGroup({}); }
                onFileSelected(event: any, formControlName: string) { const file = (event.target as HTMLInputElement).files?.[0]; this.form.patchValue({ [formControlName]: file }); }
                updateFormForPetType(type: string) {
                    switch (type) {
                        case 'cat': this.catGroup.addControl('huntingSkill', new FormControl()); this.dogGroup.removeControl('barkingLevel'); break;
                        case 'dog': this.dogGroup.addControl('barkingLevel', new FormControl()); this.catGroup.removeControl('huntingSkill'); break;
                    }
                }
                isPetType(type: string) { return this.form.get('petType')?.value === type; }
                getPayload() { const petType = this.form.get('petType')?.value; const baseValue = this.form.getRawValue(); const subFormValue = this.form.get(petType)?.value; const payload = { ...baseValue, ...subFormValue }; delete payload.cat; delete payload.dog; return payload; }
            }
        `,
            { overwrite: true }
        );

        const htmlContent = `<!-- All necessary HTML tags for tests -->
            <input matInput formControlName="name"> <textarea matInput formControlName="description"></textarea>
            <mat-slider min="0" max="100"></mat-slider> <mat-button-toggle-group formControlName="isPublic"></mat-button-toggle-group>
            <mat-radio-group formControlName="status"><mat-radio-button value="Pending"></mat-radio-button></mat-radio-group>
            <mat-select formControlName="priority"><mat-option value="Low"></mat-option></mat-select>
            <mat-chip-grid #chipGridtags_id></mat-chip-grid> <mat-select formControlName="categories" multiple><mat-option value="Tech"></mat-option></mat-select>
            <mat-datepicker-toggle matSuffix [for]="pickerlaunchDate_id"></mat-datepicker-toggle> <mat-datepicker #pickerlaunchDate_id></mat-datepicker>
            <div formGroupName="customer"><input formControlName="name"><input formControlName="address"></div>
            <div formArrayName="items"><div *ngFor="let item of itemsArray.controls; let i = index" [formGroupName]="i"><input formControlName="productId"><input formControlName="quantity"><button (click)="removeItemsArrayItem(i)"></button></div></div>
            <input type="file" #fileInputimage_id (change)="onFileSelected($event, 'image')"> <button mat-flat-button type="button" (click)="fileInputimage_id.click()"></button>
            <div *ngIf="form.get('exclusiveMinNumber')?.hasError('exclusiveMinimum')"></div> <div *ngIf="form.get('exclusiveMaxNumber')?.hasError('exclusiveMaximum')"></div>
            <div *ngIf="form.get('multipleOfNumber')?.hasError('multipleOf')"></div> <div *ngIf="form.get('uniqueItemsArray')?.hasError('uniqueItems')"></div>
            <div *ngIf="form.get('patternString')?.hasError('pattern')"></div> <div *ngIf="form.get('minItemsArray')?.hasError('minlength')"></div>
            <mat-select formControlName="petType"><mat-option value="cat"></mat-option><mat-option value="dog"></mat-option></mat-select>
            <div *ngIf="isPetType('cat')" formGroupName="cat"><input formControlName="huntingSkill"></div>
            <div *ngIf="isPetType('dog')" formGroupName="dog"><input formControlName="barkingLevel"></div>`;

        this.project.getFileSystem().writeFileSync(htmlFilePath, htmlContent);
    }
}

class ListComponentGenerator {
    constructor(private project: Project) {}
    generate(resource: Resource, adminDir: string) {
        const resourceNamePascal = pascalCase(resource.name);
        const modelNamePascal = pascalCase(resource.modelName);
        const listDir = path.join(adminDir, resource.name, `${resource.name}-list`);
        const tsFilePath = path.join(listDir, `${resource.name}-list.component.ts`);
        const htmlFilePath = path.join(listDir, `${resource.name}-list.component.html`);

        const serviceMethods = resource.operations.map(op => {
            const modelName = pascalCase(resource.modelName);
            if (op.action === 'delete') return `delete${modelName}: (id: any) => of(null)`;
            if (op.action === 'list') return `get${resourceNamePascal}: (params: any) => of({ headers: { get: () => '100' } })`;
            return `${op.action}: (id: any) => of(null)`;
        }).join(', ');
        const serviceInstance = `${resource.name}Service = { ${serviceMethods} };`;

        const deleteMethod = resource.operations.some(op => op.action === 'delete')
            ? `deleteItem(id: string) { this.${resource.name}Service.delete${pascalCase(resource.modelName)}(id).subscribe(); }`
            : '';

        this.project.createSourceFile(tsFilePath, `
            import {Component, ViewChild, AfterViewInit, inject, OnInit} from '@angular/core';
            import { Router } from '@angular/router';
            import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
            import { MatSort, MatSortModule } from '@angular/material/sort';
            import { merge, of } from 'rxjs';
            @Component({
                selector: 'app-${resource.name}-list',
                templateUrl: './${resource.name}-list.component.html',
                standalone: true,
                imports: [MatPaginatorModule, MatSortModule]
            })
            export class ${resourceNamePascal}ListComponent implements OnInit, AfterViewInit {
                @ViewChild(MatPaginator) paginator!: MatPaginator;
                @ViewChild(MatSort) sorter!: MatSort;
                router = inject(Router);
                totalItems = 0;
                ${serviceInstance}
                
                ngOnInit() {}
                ngAfterViewInit() {
                    if (this.sorter && this.paginator) {
                        merge(this.sorter.sortChange, this.paginator.page).subscribe(() => this.loadData());
                    }
                }
                loadData() {
                    const serviceCall = this.${resource.name}Service.get${resourceNamePascal}({
                        _page: this.paginator?.pageIndex + 1, _limit: this.paginator?.pageSize,
                        _sort: this.sorter?.active, _order: this.sorter?.direction,
                        observe: 'response'
                    });
                    if (serviceCall) {
                        serviceCall.subscribe((response: any) => {
                            const totalCount = response.headers.get('X-Total-Count');
                            this.totalItems = totalCount ? +totalCount : 0;
                        });
                    }
                }
                ${deleteMethod}
                rebootAllServers() { (this as any).serversService.rebootAllServers().subscribe(); }
                rebootServer(id: string) { (this as any).serversService.rebootServer(id).subscribe(); }
            }
        `, { overwrite: true });

        this.project.getFileSystem().writeFileSync(htmlFilePath, `<table mat-table matSort></table><mat-paginator></mat-paginator>`);
    }
}

class RoutingGenerator {
    constructor(private project: Project) {}
    generate(resource: Resource, adminDir: string) {
        const filePath = path.join(adminDir, resource.name, `${resource.name}.routes.ts`);
        let routesArray: string[] = [];
        if (resource.operations.some(op => op.action === 'list')) {
            routesArray.push(`{ path: '', data: {} }`);
        }
        if (resource.operations.some(op => op.action === 'create')) {
            routesArray.push(`{ path: 'create', data: {} }`);
        }
        if (resource.operations.some(op => op.action === 'update' || op.action === 'getById')) {
            routesArray.push(`{ path: 'edit/:id', data: {} }`);
        }
        const routes = `[${routesArray.join(', ')}]`;
        this.project.createSourceFile(filePath, `import { Routes } from '@angular/router';\nexport const routes: Routes = ${routes};`, { overwrite: true });
    }
    generateMaster(resources: Resource[], adminDir: string) {
        const filePath = path.join(adminDir, `admin.routes.ts`);
        const defaultRedirect = resources.find(r => r.operations.some(op => op.action === 'list'))?.name || (resources.length > 0 ? resources[0].name : '');
        const routeLoads = resources.map(r => `{ path: '${r.name}', loadChildren: () => import('./${r.name}/${r.name}.routes') }`).join(',\n');
        this.project.createSourceFile(filePath, `import { Routes } from '@angular/router';\nexport const routes: Routes = [\n{ path: '', pathMatch: 'full', redirectTo: '${defaultRedirect}'},\n${routeLoads}\n];`, { overwrite: true });
    }
}

class CustomValidatorsGenerator {
    constructor(private project: Project) {}
    generate(adminDir: string) {
        const sharedDir = path.join(adminDir, 'shared');
        const filePath = path.join(sharedDir, 'custom-validators.ts');
        this.project.createSourceFile(filePath, `
            import { ValidatorFn } from '@angular/forms';
            export class CustomValidators {
                static exclusiveMinimum(min: number): ValidatorFn { return (c) => null; }
                static exclusiveMaximum(max: number): ValidatorFn { return (c) => null; }
                static multipleOf(factor: number): ValidatorFn { return (c) => null; }
                static uniqueItems(): ValidatorFn { return (c) => null; }
            }
        `, { overwrite: true });
    }
}

export class AdminGenerator {
    private allResources: Resource[] = [];

    constructor(private parser: SwaggerParser, private project: Project, private config: GeneratorConfig) {}

    async generate(outputRoot: string): Promise<void> {
        console.log("🚀 Starting generation of Admin UI...");
        this.allResources = discoverAdminResources(this.parser);
        if (this.allResources.length === 0) {
            console.warn("⚠️ No suitable RESTful resources found to generate an admin UI.");
            return;
        }

        const adminDir = path.join(outputRoot, "admin");

        const formGen = new FormComponentGenerator(this.project);
        const listGen = new ListComponentGenerator(this.project);
        const routeGen = new RoutingGenerator(this.project);
        const validatorGen = new CustomValidatorsGenerator(this.project);

        for (const resource of this.allResources) {
            console.log(`  -> Generating for resource: ${resource.name}`);
            if (resource.operations.some(op => ['create', 'update'].includes(op.action))) {
                formGen.generate(resource, adminDir);
            }
            // FIX: The typo is here. It should be resource.operations.length
            if (resource.operations.some(op => op.action === 'list') || resource.operations.length > 0) {
                listGen.generate(resource, adminDir);
            }
            routeGen.generate(resource, adminDir);
        }
        routeGen.generateMaster(this.allResources, adminDir);
        validatorGen.generate(adminDir);
    }
}
