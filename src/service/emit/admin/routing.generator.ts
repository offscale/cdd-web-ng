// src/service/emit/admin/routing.generator.ts

import { Project, VariableDeclarationKind } from 'ts-morph';
import { Resource } from '@src/core/types.js';
import { camelCase, pascalCase } from '@src/core/utils.js';

/**
 * Generates the Angular routing configuration for the admin UI.
 */
export class RoutingGenerator {
    constructor(private readonly project: Project) {
    }

    /**
     * Generates the master `admin.routes.ts` file.
     */
    public generateMaster(resources: Resource[], outDir: string): void {
        const routesFilePath = `${outDir}/admin.routes.ts`;
        const sourceFile = this.project.createSourceFile(routesFilePath, undefined, { overwrite: true });

        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/router',
            namedImports: ['Routes']
        });

        const routeObjects = resources.map(resource => (
            `{
    path: '${resource.name}',
    loadChildren: () => import('./${resource.name}/${resource.name}.routes').then(m => m.${camelCase(resource.name)}Routes)
}`
        ));

        if (resources.length > 0) {
            routeObjects.unshift(`{ path: '', pathMatch: 'full', redirectTo: '${resources[0].name}' }`);
        }

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [{
                name: 'adminRoutes',
                type: 'Routes',
                initializer: `[\n  ${routeObjects.join(',\n  ')}\n]`
            }]
        });
    }

    /**
     * Generates a resource-specific routing file (e.g., `users.routes.ts`).
     */
    public generate(resource: Resource, outDir: string): void {
        const resourceDir = `${outDir}/${resource.name}`;
        const routesFilePath = `${resourceDir}/${resource.name}.routes.ts`;
        const sourceFile = this.project.createSourceFile(routesFilePath, undefined, { overwrite: true });

        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/router', namedImports: ['Routes'] });

        const routes: string[] = [];
        const hasList = resource.operations.some(op => op.action === 'list');
        const hasCreate = resource.operations.some(op => op.action === 'create');
        const hasEdit = resource.operations.some(op => op.action === 'getById' || op.action === 'update');

        if (hasList) {
            const componentName = `${pascalCase(resource.modelName)}ListComponent`;
            const componentPath = `./${resource.name}-list/${resource.name}-list.component`;
            routes.push(`{ path: '', loadComponent: () => import('${componentPath}').then(m => m.${componentName}) }`);
        }

        if (hasCreate) {
            const componentName = `${pascalCase(resource.modelName)}FormComponent`;
            const componentPath = `./${resource.name}-form/${resource.name}-form.component`;
            routes.push(`{ path: 'new', loadComponent: () => import('${componentPath}').then(m => m.${componentName}) }`);
        }

        if (hasEdit) {
            const componentName = `${pascalCase(resource.modelName)}FormComponent`;
            const componentPath = `./${resource.name}-form/${resource.name}-form.component`;
            routes.push(`{ path: ':id/edit', loadComponent: () => import('${componentPath}').then(m => m.${componentName}) }`);
        }

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [{
                name: `${camelCase(resource.name)}Routes`,
                type: 'Routes',
                initializer: `[\n  ${routes.join(',\n  ')}\n]`
            }]
        });
    }
}
