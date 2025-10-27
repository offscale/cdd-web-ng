import { Project } from 'ts-morph';
import { posix as path } from 'path';
import { SwaggerParser } from '../../../core/parser.js';
import { GeneratorConfig, Resource } from '../../../core/types.js';
import { discoverAdminResources } from './resource-discovery.js';
import { FormComponentGenerator } from './form-component.generator.ts';
import { ListComponentGenerator } from './list-component.generator.js';
import { pascalCase } from '../../../core/utils.js';
import customValidatorsTemplate from '../../templates/custom-validators.ts.template'; // <-- IMPORT

class CustomValidatorsGenerator {
    constructor(private project: Project) { }
    generate(adminDir: string) {
        const sharedDir = path.join(adminDir, 'shared');
        // FIX: Use the imported template string directly, no more fs!
        this.project.createSourceFile(path.join(sharedDir, 'custom-validators.ts'), customValidatorsTemplate, { overwrite: true });
    }
}

class RoutingGenerator {
    constructor(private project: Project) { }
    generate(resource: Resource, adminDir: string) {
        const filePath = path.join(adminDir, resource.name, `${resource.name}.routes.ts`);
        const listComp = `${pascalCase(resource.name)}ListComponent`;
        const formComp = `${pascalCase(resource.name)}FormComponent`;

        let routesArray: string[] = [];
        let imports = new Set<string>();

        if (resource.operations.some(op => op.action === 'list')) {
            routesArray.push(`{ path: '', component: ${listComp} }`);
            imports.add(listComp);
        }
        if (resource.operations.some(op => op.action === 'create')) {
            routesArray.push(`{ path: 'create', component: ${formComp} }`);
            imports.add(formComp);
        }
        if (resource.operations.some(op => op.action === 'update' || op.action === 'getById')) {
            routesArray.push(`{ path: 'edit/:id', component: ${formComp} }`);
            imports.add(formComp);
        }

        const importStatements = `
            import { Routes } from '@angular/router';
            ${imports.has(listComp) ? `import { ${listComp} } from './${resource.name}-list/${resource.name}-list.component';` : ''}
            ${imports.has(formComp) ? `import { ${formComp} } from './${resource.name}-form/${resource.name}-form.component';` : ''}
        `;

        const routes = `export const routes: Routes = [\n  ${routesArray.join(',\n  ')}\n];`;
        this.project.createSourceFile(filePath, `${importStatements}\n\n${routes}`, { overwrite: true }).formatText();
    }

    generateMaster(resources: Resource[], adminDir: string) {
        const filePath = path.join(adminDir, `admin.routes.ts`);
        const sortedResources = [...resources].sort((a,b) => a.name.localeCompare(b.name));
        const defaultRedirect = sortedResources.find(r => r.operations.some(op => op.action === 'list'))?.name || (sortedResources.length > 0 ? sortedResources[0].name : '');
        const routeLoads = sortedResources.map(r => `{ path: '${r.name}', loadChildren: () => import('./${r.name}/${r.name}.routes').then(m => m.routes) }`).join(',\n    ');
        this.project.createSourceFile(filePath, `import { Routes } from '@angular/router';\n\nexport const routes: Routes = [\n    { path: '', pathMatch: 'full', redirectTo: '${defaultRedirect}'},\n    ${routeLoads}\n];`, { overwrite: true }).formatText();
    }
}

export class AdminGenerator {
    private allResources: Resource[] = [];

    constructor(private parser: SwaggerParser, private project: Project, private config: GeneratorConfig) { }

    async generate(outputRoot: string): Promise<void> {
        console.log("🚀 Generating Admin UI...");
        this.allResources = discoverAdminResources(this.parser);
        if (this.allResources.length === 0) {
            console.warn("⚠️ No resources suitable for admin UI generation were found. Skipping.");
            return;
        }

        const adminDir = path.join(outputRoot, "admin");

        const formGen = new FormComponentGenerator(this.project);
        const listGen = new ListComponentGenerator(this.project);
        const routeGen = new RoutingGenerator(this.project);
        const validatorGen = new CustomValidatorsGenerator(this.project);

        let needsCustomValidators = false;
        for (const resource of this.allResources) {
            console.log(`  -> Generating for resource: ${resource.name}`);

            if (resource.operations.some(op => op.action === 'list')) {
                listGen.generate(resource, adminDir);
            }

            if (resource.operations.some(op => ['create', 'update'].includes(op.action))) {
                const formResult = formGen.generate(resource, adminDir);
                if (formResult.usesCustomValidators) {
                    needsCustomValidators = true;
                }
            }
            routeGen.generate(resource, adminDir);
        }

        routeGen.generateMaster(this.allResources, adminDir);

        if (needsCustomValidators) {
            console.log('  -> Generating shared custom validators...');
            validatorGen.generate(adminDir);
        }
    }
}
