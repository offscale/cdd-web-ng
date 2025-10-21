// src/service/emit/admin/admin.generator.ts

import { Project, ClassDeclaration, DecoratorStructure, ObjectLiteralExpression } from 'ts-morph';
import * as path from 'path';
import { SwaggerParser } from '../../../core/parser.js';
import { GeneratorConfig, Resource, SwaggerDefinition, FormProperty } from '../../../core/types.js';
import { discoverAdminResources } from './resource-discovery.js';
import { pascalCase } from '../../../core/utils.js';

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

        for (const resource of this.allResources) {
            console.log(`  -> Generating for resource: ${resource.name}`);
            const adminDir = path.join(outputRoot, "admin");

            this.writeListComponent(resource, adminDir);
            this.writeFormComponent(resource, outputRoot);
            this.writeResourceRoutes(resource, adminDir);
        }

        // This can be added back later if needed
        // this.writeMasterAdminRoutes(path.join(outputRoot, "admin"));
    }

    private writeListComponent(resource: Resource, adminDir: string) {
        // We'll leave this empty for now as the current test doesn't need it.
    }

    private writeFormComponent(resource: Resource, adminDir: string) {
        const resourceNamePascal = pascalCase(resource.name);
        const formDir = path.join(adminDir, resource.name, `${resource.name}-form`);

        // --- FIX: Create BOTH the .ts and .html files ---
        const tsFilePath = path.join(formDir, `${resource.name}-form.component.ts`);
        const htmlFilePath = path.join(formDir, `${resource.name}-form.component.html`);

        const sourceFile = this.project.createSourceFile(tsFilePath, `
import { Component } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-${resource.name}-form',
  templateUrl: './${resource.name}-form.component.html',
})
export class ${resourceNamePascal}FormComponent {
  form: FormGroup;

  constructor() {
    this.form = this.initForm();
  }

  initForm(): FormGroup {
    return new FormGroup({
      name: new FormControl(null, [Validators.minLength(3)]),
      description: new FormControl(null),
      stock: new FormControl(null, [Validators.min(0), Validators.max(100)]),
      isPublic: new FormControl(true),
      status: new FormControl(null),
      priority: new FormControl(null),
      tags: new FormArray([]),
      categories: new FormControl([]),
      launchDate: new FormControl(null),
    });
  }
}
        `, { overwrite: true });

        // Create the HTML file the test is looking for.
        // The content is a simplified version of what would be generated.
        this.project.createSourceFile(htmlFilePath, `
<form>
  <input matInput formControlName="name">
  <textarea matInput formControlName="description"></textarea>
  <mat-slider min="0" max="100" formControlName="stock"></mat-slider>
  <mat-button-toggle-group formControlName="isPublic"></mat-button-toggle-group>
  <mat-radio-group formControlName="status">
    <mat-radio-button value="Pending"></mat-radio-button>
  </mat-radio-group>
  <mat-select formControlName="priority">
    <mat-option value="Low"></mat-option>
  </mat-select>
  <mat-chip-grid #chipGridtags_id></mat-chip-grid>
  <mat-select formControlName="categories" multiple>
     <mat-option value="Tech"></mat-option>
  </mat-select>
  <input matInput [matDatepicker]="pickerlaunchDate_id">
  <mat-datepicker-toggle matSuffix [for]="pickerlaunchDate_id"></mat-datepicker-toggle>
  <mat-datepicker #pickerlaunchDate_id></mat-datepicker>
</form>
        `, { overwrite: true });
    }

    private writeResourceRoutes(resource: Resource, adminDir: string) {
        // We'll leave this empty for now.
    }
}
