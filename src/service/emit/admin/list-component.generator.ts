import { Project, Scope } from "ts-morph";
import { posix as path } from "path";
import * as fs from "fs";
import { Resource } from "../../../core/types";
import { camelCase, kebabCase, pascalCase } from "../../../core/utils";

// This is the correct, complete list of imports for the component array.
const standaloneListImportsArray = `[ CommonModule, RouterModule, MatPaginatorModule, MatSortModule, MatTableModule, MatButtonModule, MatProgressBarModule, MatIconModule ]`;

export class ListComponentGenerator {
    constructor(private project: Project) {}

    generate(resource: Resource, adminDir: string) {
        const listDir = path.join(adminDir, resource.name, `${resource.name}-list`);
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
        const servicePath = `../../services/${kebabCase(resource.name)}.service`;
        const modelPath = `../../../data/models`;
        const modelName = resource.modelName;
        const deleteMethodName = `delete${modelName}`;
        const listMethodName = `get${pascalCase(resource.name)}`;

        const sourceFile = this.project.createSourceFile(filePath, undefined, { overwrite: true });

        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core', namedImports: ['Component', 'inject', 'signal', 'effect', 'viewChild'] },
            { moduleSpecifier: '@angular/common', namedImports: ['DatePipe'] },
            { moduleSpecifier: '@angular/router', namedImports: ['Router', 'ActivatedRoute'] },
            { moduleSpecifier: servicePath, namedImports: [`${pascalCase(serviceName)}`] },
            { moduleSpecifier: modelPath, isTypeOnly: true, namespaceImport: 'models' },
            { moduleSpecifier: 'rxjs', namedImports: ['Subject', 'merge', 'of', 'startWith', 'switchMap', 'map', 'catchError'] },
            { moduleSpecifier: '@angular/material/table', namedImports: ['MatTableModule'] },
            { moduleSpecifier: '@angular/material/paginator', namedImports: ['MatPaginator', 'MatPaginatorModule'] },
            { moduleSpecifier: '@angular/material/sort', namedImports: ['MatSort', 'MatSortModule'] },
            { moduleSpecifier: '@angular/material/icon', namedImports: ['MatIconModule'] },
            { moduleSpecifier: '@angular/material/button', namedImports: ['MatButtonModule'] },
            { moduleSpecifier: '@angular/material/input', namedImports: ['MatInputModule'] },
            { moduleSpecifier: '@angular/material/form-field', namedImports: ['MatFormFieldModule'] },
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
                imports: [ MatFormFieldModule, MatInputModule, MatTableModule, MatSortModule, MatPaginatorModule, MatIconModule, MatButtonModule, MatProgressBarModule, DatePipe ],
                templateUrl: './${kebabCase(resource.name)}-list.component.html',
                styleUrl: './${kebabCase(resource.name)}-list.component.scss'
            }`]
            }]
        });

        component.addProperties([
            { name: 'router', scope: Scope.Private, type: 'Router', initializer: 'inject(Router)' },
            { name: 'route', scope: Scope.Private, type: 'ActivatedRoute', initializer: 'inject(ActivatedRoute)' },
            { name: 'displayedColumns', type: 'string[]', initializer: `[${resource.formProperties.map(p => `'${p.name}'`).join(', ')}, 'actions']` },
            { name: 'paginator', initializer: 'viewChild.required(MatPaginator)' },
            { name: 'sorter', initializer: 'viewChild.required(MatSort)' },
            { name: 'isLoadingResults', initializer: 'signal(true)' },
            { name: 'resultsLength', initializer: 'signal(0)' },
            { name: 'refreshTrigger', scope: Scope.Private, type: 'Subject<void>', initializer: 'new Subject<void>()' },
            { name: serviceName, scope: Scope.Private, type: pascalCase(serviceName), initializer: `inject(${pascalCase(serviceName)})` },
            { name: 'dataSource', initializer: `signal<models.${modelName}[]>([])` } // FIX: Renamed 'data' to 'dataSource'
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
                        this.isLoadingResults.set(true);
                        const listCall$ = this.${serviceName}.${listMethodName}(
                            sorter.active,
                            sorter.direction,
                            paginator.pageIndex,
                            paginator.pageSize
                        ).pipe(catchError(() => of(null)));
                        return listCall$;
                    }),
                    map(data => {
                        this.isLoadingResults.set(false);
                        if (data === null) { return []; }
                        this.resultsLength.set((data as any).total_count ?? 0);
                        return (data as any).items ?? data;
                    })
                ).subscribe(data => this.dataSource.set(data)); // FIX: Subscribes to dataSource.set()
            
            onCleanup(() => sub.unsubscribe());
        });`
        });

        // FIX: Add custom action methods
        const customActions = resource.operations.filter(op => !['list', 'create', 'getById', 'update', 'delete'].includes(op.action));
        customActions.forEach(action => {
            const params = (action.parameters || []).filter(p => p.in === 'path').map(p => ({
                name: camelCase(p.name), type: 'string | number'
            }));
            component.addMethod({
                name: action.action,
                parameters: params,
                statements: `this.${serviceName}.${action.action}(${params.map(p => p.name).join(', ')}).subscribe(() => this.refreshTrigger.next());`
            });
        });

        component.addMethod({ name: 'applyFilter', parameters: [{ name: 'event', type: 'Event' }], statements: `this.refreshTrigger.next();` });

        if (resource.isEditable) {
            component.addMethods([
                { name: 'onCreate', statements: `this.router.navigate(['create'], { relativeTo: this.route });` },
                { name: 'onEdit', parameters: [{name: 'id', type: 'string | number'}], statements: `this.router.navigate(['edit', id], { relativeTo: this.route });` },
                { name: 'deleteItem', parameters: [{ name: 'id', 'type': 'string | number' }], statements: `this.${serviceName}.${deleteMethodName}(id).subscribe(() => this.refreshTrigger.next());` }
            ]);
        }
    }

    private generateHtml(resource: Resource, filePath: string) {
        const templatePath = path.resolve(__dirname, '../../templates/list.component.html.template');
        let template = fs.readFileSync(templatePath, 'utf8');
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
        // ... (This function remains unchanged)
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
