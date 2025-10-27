import { Project, Scope } from "ts-morph";
import { posix as path } from "node:path";
import { Resource } from "../../../core/types";
import { camelCase, kebabCase, pascalCase } from "../../../core/utils";
import listTemplate from '../../templates/list.component.html.template'; // <-- IMPORT

// This is the correct, complete list of imports for the component array.
const standaloneListImportsArray = `[ CommonModule, RouterModule, MatPaginatorModule, MatSortModule, MatTableModule, MatButtonModule, MatProgressBarModule, MatIconModule ]`;

export class ListComponentGenerator {
    constructor(private project: Project) {}

    generate(resource: Resource, adminDir: string) {
        const listDir = path.join(adminDir, resource.name, `${resource.name}-list`);
        // FIX: Explicitly create the component's directory.
        this.project.getFileSystem().mkdirSync(listDir, { recursive: true });

        const tsFilePath = path.join(listDir, `${resource.name}-list.component.ts`);
        const htmlFilePath = path.join(listDir, `${resource.name}-list.component.html`);
        const scssFilePath = path.join(listDir, `${resource.name}-list.component.scss`);

        this.generateTypeScript(resource, tsFilePath);
        this.generateHtml(resource, htmlFilePath);
        this.generateScss(scssFilePath);
    }

    private generateTypeScript(resource: Resource, filePath: string) {
        const componentClassName = `${pascalCase(resource.name)}ListComponent`;
        const serviceName = `${camelCase(resource.name)}Service`;
        const servicePath = `../../../services/${camelCase(resource.name)}.service`;
        const modelPath = `../../../models`;
        const modelName = resource.modelName;
        const deleteMethodName = `delete${modelName}`;
        const listMethodName = `get${pascalCase(resource.name)}`;

        const sourceFile = this.project.createSourceFile(filePath, undefined, { overwrite: true });

        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core', namedImports: ['Component', 'inject', 'signal', 'effect', 'viewChild'] },
            { moduleSpecifier: '@angular/common', namedImports: ['CommonModule'] },
            { moduleSpecifier: '@angular/router', namedImports: ['Router', 'RouterModule', 'ActivatedRoute' ] },
            { moduleSpecifier: servicePath.replace(/\\/g, '/'), namedImports: [ `${pascalCase(serviceName)}` ] },
            { moduleSpecifier: modelPath, isTypeOnly: true, namedImports: [modelName] },
            { moduleSpecifier: 'rxjs', namedImports: ['Subject', 'merge', 'of', 'startWith', 'switchMap', 'map', 'catchError'] },
            { moduleSpecifier: '@angular/material/table', namedImports: ['MatTableModule'] },
            { moduleSpecifier: '@angular/material/paginator', namedImports: ['MatPaginator', 'MatPaginatorModule'] },
            { moduleSpecifier: '@angular/material/sort', namedImports: ['MatSort', 'MatSortModule'] },
            { moduleSpecifier: '@angular/material/icon', namedImports: ['MatIconModule'] },
            { moduleSpecifier: '@angular/material/button', namedImports: ['MatButtonModule'] },
            { moduleSpecifier: '@angular/material/progress-bar', namedImports: ['MatProgressBarModule']}
        ]);

        const component = sourceFile.addClass({
            name: componentClassName,
            isExported: true,
            decorators: [{
                name: 'Component',
                arguments: [`{
                selector: 'app-${kebabCase(resource.name)}-list',
                standalone: true,
                imports: ${standaloneListImportsArray},
                templateUrl: './${kebabCase(resource.name)}-list.component.html',
                styleUrl: './${kebabCase(resource.name)}-list.component.scss'
            }`]
            }]
        });

        component.addProperties([
            { name: 'router', scope: Scope.Private, isReadonly: true, initializer: 'inject(Router)' },
            { name: 'route', scope: Scope.Private, isReadonly: true, initializer: 'inject(ActivatedRoute)' },
            { name: 'displayedColumns', type: 'string[]', initializer: `[${resource.formProperties.map(p => `'${p.name}'`).join(', ')}, 'actions']` },
            { name: 'paginator', initializer: 'viewChild.required(MatPaginator)' },
            { name: 'sorter', initializer: 'viewChild.required(MatSort)' },
            { name: 'isLoading', initializer: 'signal(true)' },
            { name: 'totalItems', initializer: 'signal(0)' },
            { name: 'refreshTrigger', scope: Scope.Private, type: 'Subject<void>', initializer: 'new Subject<void>()' },
            { name: serviceName, scope: Scope.Private, type: pascalCase(serviceName), initializer: `inject(${pascalCase(serviceName)})` },
            { name: 'dataSource', initializer: `signal<${modelName}[]>([])` }
        ]);

        component.addConstructor({
            statements: `
        effect((onCleanup) => {
            const sorter = this.sorter();
            const paginator = this.paginator();
            const sub = merge(sorter.sortChange, paginator.page, this.refreshTrigger)
                .pipe(
                    startWith({}),
                    switchMap(() => {
                        this.isLoading.set(true);
                        const listCall$ = this.${serviceName}.${listMethodName}(
                            paginator.pageIndex + 1,
                            paginator.pageSize,
                            sorter.active,
                            sorter.direction,
                            'response'
                        ).pipe(catchError(() => of(null)));
                        return listCall$;
                    }),
                    map(response => {
                        this.isLoading.set(false);
                        if (response === null) { return []; }
                          
                        const totalCount = response.headers.get('X-Total-Count');
                        this.totalItems.set(totalCount ? +totalCount : 0);
                        return response.body ?? [];
                    })
                ).subscribe(data => this.dataSource.set(data));
                  
            onCleanup(() => sub.unsubscribe());
        });`
        });

        const customActions = resource.operations.filter(op => !['list', 'create', 'getById', 'update', 'delete'].includes(op.action));
        customActions.forEach(action => {
            const hasPathParams = action.path.includes('{');
            const params = hasPathParams ? [{ name: 'id', type: 'string | number' }] : [];
            component.addMethod({
                name: action.action,
                parameters: params,
                statements: `this.${serviceName}.${action.action}(${params.map(p => p.name).join(', ')}).subscribe(() => this.refreshTrigger.next());`
            });
        });

        if (resource.isEditable) {
            component.addMethods([
                { name: 'onCreate', statements: `this.router.navigate(['create'], { relativeTo: this.route });` },
                { name: 'onEdit', parameters: [{name: 'id', type: 'string | number'}], statements: `this.router.navigate(['edit', id], { relativeTo: this.route });` },
                { name: 'deleteItem', parameters: [{ name: 'id', 'type': 'string | number' }], statements: `this.${serviceName}.${deleteMethodName}(id).subscribe(() => this.refreshTrigger.next());` }
            ]);
        }
    }

    private generateHtml(resource: Resource, filePath: string) {
        let template = listTemplate; // <-- USE IMPORTED TEMPLATE

        const modelName = resource.modelName;
        const properties = resource.formProperties.map(p => p.name);
        const columnDefs = properties.map(prop => `
        <ng-container matColumnDef="${prop}">
          <th mat-header-cell *matHeaderCellDef mat-sort-header>${pascalCase(prop)}</th>
          <td mat-cell *matCellDef="let row">{{row.${prop}}}</td>
        </ng-container>
       `).join('\n');

        let actionsDef = '';
        if (resource.isEditable) {
            actionsDef = `
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let row" class="admin-table-actions">
                <button mat-icon-button (click)="onEdit(row.id)"><mat-icon>edit</mat-icon></button>
                <button mat-icon-button color="warn" (click)="deleteItem(row.id)"><mat-icon>delete</mat-icon></button>
              </td>
            </ng-container>
           `;
        }

        if(!resource.isEditable) {
            template = template.replace(/<button mat-flat-button.*?<\/button>/gs, '');
        }
        template = template.replace('{{modelName}}', modelName);
        template = template.replace(/{{pluralModelName}}/g, `${modelName}s`);
        template = template.replace('{{columnDefinitions}}', columnDefs + actionsDef);
        this.project.getFileSystem().writeFileSync(filePath, template);
    }

    private generateScss(filePath: string) {
        const scssContent = `
.admin-list-container { padding: 24px; }
.admin-list-actions { margin-bottom: 16px; }
.admin-no-data { padding: 24px; text-align: center; color: grey; }
.mat-elevation-z8 { width: 100%; }
.admin-table-actions { text-align: right; }
        `;
        this.project.getFileSystem().writeFileSync(filePath, scssContent);
    }
}
