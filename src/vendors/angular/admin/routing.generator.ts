import { Project, VariableDeclarationKind } from 'ts-morph';
import { Resource } from '@src/core/types/index.js';
import { camelCase, pascalCase } from '@src/functions/utils.js';
import * as path from 'node:path';

/**
 * The Angular Admin UI Routing Generator.
 *
 * Generates both the master `admin.routes.ts` file and per-resource
 * `[resource].routes.ts` files for module-level lazy routing in a generated admin UI.
 */
export class RoutingGenerator {
    private static ensureDir(project: Project, dirPath: string): void {
        /* v8 ignore next */
        if (!project.getFileSystem().directoryExists(dirPath)) {
            /* v8 ignore next */
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
        /* v8 ignore next */
        const routesFilePath = path.join(outDir, 'admin.routes.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(routesFilePath, undefined, { overwrite: true });

        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/router',
            namedImports: ['Routes'],
        });

        /* v8 ignore next */
        const routeObjects = resources.map(
            resource =>
                /* v8 ignore next */
                `{ 
    path: '${resource.name}', 
    loadChildren: () => import('./${resource.name}/${resource.name}.routes').then(m => m.${camelCase(resource.name)}Routes) 
}`,
        );

        /* v8 ignore next */
        if (resources.length > 0) {
            /* v8 ignore next */
            routeObjects.unshift(`{ path: '', pathMatch: 'full', redirectTo: '${resources[0].name}' }`);
        }

        /* v8 ignore next */
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
        /* v8 ignore next */
        const resourceDir = path.join(outDir, resource.name);
        /* v8 ignore next */
        RoutingGenerator.ensureDir(this.project, resourceDir);

        /* v8 ignore next */
        const routesFilePath = path.join(resourceDir, `${resource.name}.routes.ts`);
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(routesFilePath, undefined, { overwrite: true });

        /* v8 ignore next */
        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/router', namedImports: ['Routes'] });

        /* v8 ignore next */
        const routes: string[] = [];
        /* v8 ignore next */
        const hasList = resource.operations.some(op => op.action === 'list');
        /* v8 ignore next */
        const hasCreate = resource.operations.some(op => op.action === 'create');
        /* v8 ignore next */
        const hasEdit = resource.operations.some(op => op.action === 'getById' || op.action === 'update');

        /* v8 ignore next */
        if (hasList) {
            /* v8 ignore next */
            const componentName = `${pascalCase(resource.modelName)}ListComponent`;
            /* v8 ignore next */
            const componentPath = `./${resource.name}-list/${resource.name}-list.component`;
            /* v8 ignore next */
            routes.push(`{ path: '', loadComponent: () => import('${componentPath}').then(m => m.${componentName}) }`);
        }

        /* v8 ignore next */
        if (hasCreate) {
            /* v8 ignore next */
            const componentName = `${pascalCase(resource.modelName)}FormComponent`;
            /* v8 ignore next */
            const componentPath = `./${resource.name}-form/${resource.name}-form.component`;
            /* v8 ignore next */
            routes.push(
                `{ path: 'new', loadComponent: () => import('${componentPath}').then(m => m.${componentName}) }`,
            );
        }

        /* v8 ignore next */
        if (hasEdit) {
            /* v8 ignore next */
            const componentName = `${pascalCase(resource.modelName)}FormComponent`;
            /* v8 ignore next */
            const componentPath = `./${resource.name}-form/${resource.name}-form.component`;
            /* v8 ignore next */
            routes.push(
                `{ path: ':id/edit', loadComponent: () => import('${componentPath}').then(m => m.${componentName}) }`,
            );
        }

        /* v8 ignore next */
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
    /* v8 ignore next */
    constructor(private readonly project: Project) {}
}
