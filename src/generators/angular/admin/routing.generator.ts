import { Project, VariableDeclarationKind } from 'ts-morph';
import { Resource } from '@src/core/types/index.js';
import { camelCase, pascalCase } from '@src/core/utils/index.js';
import * as path from 'node:path';

/**
 * The Angular Admin UI Routing Generator.
 *
 * Generates both the master `admin.routes.ts` file and per-resource
 * `[resource].routes.ts` files for module-level lazy routing in a generated admin UI.
 */
export class RoutingGenerator {
    private static ensureDir(project: Project, dirPath: string): void {
        if (!project.getFileSystem().directoryExists(dirPath)) {
            project.getFileSystem().mkdirSync(dirPath);
        }
    }

    /**
     * Generates the master route file at `admin.routes.ts`, delegating to resource-specific route files.
     *
     * @param resources The discovered admin resources.
     * @param outDir The parent output directory (should already contain the admin folder).
     */
    public generateMaster(resources: Resource[], outDir: string): void {
        const routesFilePath = path.join(outDir, 'admin.routes.ts');
        const sourceFile = this.project.createSourceFile(routesFilePath, undefined, { overwrite: true });

        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/router',
            namedImports: ['Routes'],
        });

        const routeObjects = resources.map(
            resource =>
                `{ 
    path: '${resource.name}', 
    loadChildren: () => import('./${resource.name}/${resource.name}.routes').then(m => m.${camelCase(resource.name)}Routes) 
}`,
        );

        if (resources.length > 0) {
            routeObjects.unshift(`{ path: '', pathMatch: 'full', redirectTo: '${resources[0].name}' }`);
        }

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'adminRoutes',
                    type: 'Routes',
                    initializer: `[\n  ${routeObjects.join(',\n  ')}\n]`,
                },
            ],
        });
    }

    /**
     * Generates the per-resource route file, e.g. for `users` this is at `users/users.routes.ts`.
     *
     * @param resource The admin resource.
     * @param outDir The admin output directory (e.g. `/admin`).
     */
    public generate(resource: Resource, outDir: string): void {
        // Ensure subdirectory for this resource exists
        const resourceDir = path.join(outDir, resource.name);
        RoutingGenerator.ensureDir(this.project, resourceDir);

        const routesFilePath = path.join(resourceDir, `${resource.name}.routes.ts`);
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
            routes.push(
                `{ path: 'new', loadComponent: () => import('${componentPath}').then(m => m.${componentName}) }`,
            );
        }

        if (hasEdit) {
            const componentName = `${pascalCase(resource.modelName)}FormComponent`;
            const componentPath = `./${resource.name}-form/${resource.name}-form.component`;
            routes.push(
                `{ path: ':id/edit', loadComponent: () => import('${componentPath}').then(m => m.${componentName}) }`,
            );
        }

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: `${camelCase(resource.name)}Routes`,
                    type: 'Routes',
                    initializer: `[\n  ${routes.join(',\n  ')}\n]`,
                },
            ],
        });
    }

    /**
     * @param project ts-morph Project used for emitting files.
     */
    constructor(private readonly project: Project) {}
}
