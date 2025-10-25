import { Project, Scope } from "ts-morph";
import { posix as path } from "path";
import * as fs from "fs";
import { Resource } from "../../../core/types";
import { camelCase, pascalCase } from "../../../core/utils";

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
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        const modelName = resource.modelName;
        const resourceNamePascal = pascalCase(resource.name);
        const serviceName = `${camelCase(resource.name)}Service`;
        const serviceClassName = `${resourceNamePascal}Service`;
        const listMethodName = `get${resourceNamePascal}`;
        const deleteMethodName = `delete${modelName}`;

        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core', namedImports: ['Component', 'viewChild', 'effect', 'inject', 'signal'] },
            { moduleSpecifier: '@angular/router', namedImports: ['Router', 'ActivatedRoute'] },
            { moduleSpecifier: 'rxjs', namedImports: ['merge', 'startWith', 'switchMap', 'catchError', 'of', 'map', 'Subject'] },
            { moduleSpecifier: `../../models`, namedImports: [modelName], isTypeOnly: true },
            { moduleSpecifier: `../../services/${camelCase(resource.name)}.service`, namedImports: [serviceClassName] }
        ]);

        const component = sourceFile.addClass({
            name: `${resourceNamePascal}ListComponent`,
            isExported: true,
            decorators: [{
                name: 'Component',
                arguments: [`{
                    selector: 'app-${resource.name}-list',
                    standalone: true,
                    imports: ${standaloneListImportsArray},
                    templateUrl: './${resource.name}-list.component.html',
                    styleUrls: ['./${resource.name}-list.component.scss']
                }`]
            }]
        });

        const methodsToAdd = [
            { name: 'onCreate', statements: `this.router.navigate(['create'], { relativeTo: this.route });` },
            { name: 'onEdit', parameters: [{name: 'id', type: 'string | number'}], statements: `this.router.navigate(['edit', id], { relativeTo: this.route });` },
            { name: 'deleteItem', parameters: [{ name: 'id', type: 'string | number' }], statements: `this.${serviceName}.${deleteMethodName}(id).subscribe(() => this.refreshTrigger.next());` }
        ];

        if (!resource.isEditable) {
            component.addMethods(methodsToAdd.filter(m => !['onCreate', 'onEdit', 'deleteItem'].includes(m.name)));
        } else {
            component.addMethods(methodsToAdd);
        }

        const properties = resource.formProperties.map(p => p.name);
        const displayedColumns = [...properties, 'actions'].filter((v, i, a) => a.indexOf(v) === i);

        component.addProperties([
            { name: 'displayedColumns', type: 'string[]', initializer: JSON.stringify(displayedColumns) },
            { name: 'dataSource', initializer: `signal<${modelName}[]>([])` },
            { name: 'totalItems', initializer: 'signal(0)' },
            { name: 'isLoading', initializer: 'signal(true)' },
            { name: 'router', scope: Scope.Private, isReadonly: true, initializer: 'inject(Router)' },
            { name: 'route', scope: Scope.Private, isReadonly: true, initializer: 'inject(ActivatedRoute)' },
            { name: serviceName, scope: Scope.Private, isReadonly: true, initializer: `inject(${serviceClassName})` },
            { name: 'paginator', initializer: `viewChild.required(MatPaginator)` },
            { name: 'sorter', initializer: `viewChild.required(MatSort)` },
            { name: 'refreshTrigger', scope: Scope.Private, initializer: `new Subject<void>()` },
        ]);

        component.addConstructor({
            statements: `
                effect((onCleanup) => {
                    const sorter = this.sorter();
                    const paginator = this.paginator();
                    
                    const sub = merge(sorter.sortChange, paginator.page, this.refreshTrigger).pipe(
                        startWith({}),
                        switchMap(() => {
                            this.isLoading.set(true);
                            return this.${serviceName}.${listMethodName}({
                                _page: paginator.pageIndex + 1, _limit: paginator.pageSize,
                                _sort: sorter.active, _order: sorter.direction,
                                observe: 'response'
                            }).pipe(catchError(() => of(null)));
                        }),
                        map(response => {
                            this.isLoading.set(false);
                            if (response === null) {
                                this.totalItems.set(0); return [];
                            }
                            const totalCount = response.headers.get('X-Total-Count');
                            this.totalItems.set(totalCount ? +totalCount : 0);
                            return response.body ?? [];
                        })
                    ).subscribe(data => this.dataSource.set(data));
                    onCleanup(() => sub.unsubscribe());
                });
            `
        });

        component.addMethods([
            { name: 'onCreate', statements: `this.router.navigate(['create'], { relativeTo: this.route });` },
            { name: 'onEdit', parameters: [{name: 'id', type: 'string | number'}], statements: `this.router.navigate(['edit', id], { relativeTo: this.route });` },
            { name: 'deleteItem', parameters: [{ name: 'id', type: 'string | number' }], statements: `this.${serviceName}.${deleteMethodName}(id).subscribe(() => this.refreshTrigger.next());` }
        ]);
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
