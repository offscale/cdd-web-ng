// src/service/emit/admin/routing.generator.ts

import { Project } from 'ts-morph';
import { posix as path } from 'path';
import { Resource } from '../../../core/types.js';
import { kebabCase, pascalCase } from '../../../core/utils.js';

export class RoutingGenerator {
    constructor(private project: Project) { }

    public generate(resource: Resource, adminDir: string) {
        const routesDir = path.join(adminDir, resource.name);
        const filePath = path.join(routesDir, `${resource.name}.routes.ts`);
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        const hasList = resource.operations.some(op => op.action === 'list');
        const hasCreate = resource.operations.some(op => op.action === 'create');
        const hasEdit = resource.operations.some(op => op.action === 'update' || op.action === 'getById'); // Also consider getById for edit pages

        const listClassName = `${pascalCase(resource.name)}ListComponent`;
        const formClassName = `${pascalCase(resource.name)}FormComponent`;

        const routes: string[] = [];
        if (hasList) {
            routes.push(`{ path: '', loadComponent: () => import('./${kebabCase(resource.name)}-list/${kebabCase(resource.name)}-list.component').then(m => m.${listClassName}) }`);
        }
        if (hasCreate) {
            routes.push(`{ path: 'create', loadComponent: () => import('./${kebabCase(resource.name)}-form/${kebabCase(resource.name)}-form.component').then(m => m.${formClassName}) }`);
        }
        if (hasEdit) {
            routes.push(`{ path: 'edit/:id', loadComponent: () => import('./${kebabCase(resource.name)}-form/${kebabCase(resource.name)}-form.component').then(m => m.${formClassName}) }`);
        }

        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/router', namedImports: ['Routes'] });

        sourceFile.addVariableStatement({
            isExported: true,
            declarations: [{
                name: 'routes',
                type: 'Routes',
                initializer: `[\n  ${routes.join(',\n  ')}\n]`
            }]
        });
        sourceFile.formatText();
    }

    public generateMaster(resources: Resource[], adminDir: string) {
        const filePath = path.join(adminDir, `admin.routes.ts`);
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/router', namedImports: ['Routes'] });

        // ** FIX: Sort resources alphabetically to ensure a predictable default redirect **
        const sortedResources = [...resources].sort((a,b) => a.name.localeCompare(b.name));
        const redirectTarget = sortedResources.find(r => r.operations.some(op => op.action === 'list'))?.name || (sortedResources.length > 0 ? sortedResources[0].name : '');

        const defaultRedirect = redirectTarget ? `{ path: '', pathMatch: 'full', redirectTo: '${redirectTarget}' }` : '';
        // ** FIX: Use the sortedResources array for mapping **
        const childrenRoutes = sortedResources.map(r => `{
    path: '${r.name}',
    loadChildren: () => import('./${r.name}/${r.name}.routes').then(m => m.routes)
}`).join(',\n  ');

        sourceFile.addVariableStatement({
            isExported: true,
            declarations: [{
                name: 'routes',
                type: 'Routes',
                initializer: `[\n  ${defaultRedirect},\n  ${childrenRoutes}\n]`
            }]
        });
        sourceFile.formatText();
    }
}
