// src/service/emit/admin/list-component.generator.ts

import { Project, Scope } from "ts-morph";
import { posix as path } from "node:path";
import { Resource } from "../../../core/types.js";
import { camelCase, kebabCase, pascalCase } from "../../../core/utils.js";
import { HtmlElementBuilder as _ } from './html-element.builder.js';

const CRUD_ACTIONS = new Set(['list', 'create', 'getById', 'update', 'delete']);

export class ListComponentGenerator {
    constructor(private project: Project) {}

    generate(resource: Resource, adminDir: string) {
        const listDir = path.join(adminDir, resource.name, `${resource.name}-list`);
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
        const serviceClassName = `${pascalCase(resource.name)}Service`;
        const serviceName = `${camelCase(resource.name)}Service`;
        const servicePath = `../../../../services/${camelCase(resource.name)}.service`;
        const modelPath = `../../../../models`;
        const modelName = resource.modelName;
        const deleteOp = resource.operations.find(op => op.action === 'delete');
        const listOp = resource.operations.find(op => op.action === 'list');
        const listMethodName = listOp?.methodName ?? `get${pascalCase(resource.name)}`;
        const customItemOps = resource.operations.filter(op => !CRUD_ACTIONS.has(op.action) && op.path.includes('{'));
        const customCollectionOps = resource.operations.filter(op => !CRUD_ACTIONS.has(op.action) && !op.path.includes('{'));

        const sourceFile = this.project.createSourceFile(filePath, undefined, { overwrite: true });

        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core', namedImports: ['Component', 'inject', 'signal', 'effect', 'viewChild'] },
            { moduleSpecifier: '@angular/common', namedImports: ['CommonModule'] },
            { moduleSpecifier: '@angular/router', namedImports: ['Router', 'RouterModule', 'ActivatedRoute' ] },
            { moduleSpecifier: servicePath.replace(/\\/g, '/'), namedImports: [ serviceClassName ] },
            { moduleSpecifier: modelPath, isTypeOnly: true, namedImports: [modelName] },
            { moduleSpecifier: 'rxjs', namedImports: ['merge', 'of', 'startWith', 'switchMap', 'map', 'catchError'] },
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
                imports: [ CommonModule, RouterModule, MatPaginatorModule, MatSortModule, MatTableModule, MatButtonModule, MatProgressBarModule, MatIconModule ],
                templateUrl: './${kebabCase(resource.name)}-list.component.html',
                styleUrl: './${kebabCase(resource.name)}-list.component.scss'
            }`]
            }]
        });

        const idProp = resource.formProperties.find(p => p.name.toLowerCase() === 'id') ?? resource.formProperties[0];

        component.addProperties([
            { name: 'router', scope: Scope.Private, isReadonly: true, initializer: 'inject(Router)' },
            { name: 'route', scope: Scope.Private, isReadonly: true, initializer: 'inject(ActivatedRoute)' },
            { name: 'displayedColumns', type: 'string[]', initializer: `[${resource.formProperties.map(p => `'${p.name}'`).join(', ')}, 'actions']` },
            { name: `paginator = viewChild.required(MatPaginator)` },
            { name: `sorter = viewChild.required(MatSort)` },
            { name: `isLoading = signal(true)` },
            { name: `totalItems = signal(0)` },
            { name: 'refreshTrigger', scope: Scope.Private, initializer: 'signal(0)' },
            { name: serviceName, scope: Scope.Private, type: serviceClassName, initializer: `inject(${serviceClassName})` },
            { name: 'dataSource', initializer: `signal<${modelName}[]>([])` }
        ]);

        component.addConstructor({
            statements: `
        effect((onCleanup) => {
            const sorter = this.sorter();
            const paginator = this.paginator();

            this.refreshTrigger(); // Depend on the refresh signal

            const sub = merge(sorter.sortChange, paginator.page).pipe(
                startWith({}),
                switchMap(() => {
                    this.isLoading.set(true);
                    return this.${serviceName}.${listMethodName}(
                        paginator.pageIndex + 1,
                        paginator.pageSize,
                        sorter.active,
                        sorter.direction,
                        'response'
                    ).pipe(catchError(() => of(null)));
                }),
                map(response => {
                    this.isLoading.set(false);
                    if (response === null) {
                       this.totalItems.set(0);
                       return [];
                    }

                    const totalCount = response.headers.get('X-Total-Count');
                    this.totalItems.set(totalCount ? +totalCount : 0);
                    return response.body ?? [];
                })
            ).subscribe(data => this.dataSource.set(data));

            onCleanup(() => sub.unsubscribe());
        }, { allowSignalWrites: true });`
        });

        component.addMethod({ name: 'refresh', statements: 'this.refreshTrigger.update(v => v + 1);' });

        if (resource.isEditable) {
            component.addMethods([
                { name: 'onCreate', statements: `this.router.navigate(['new'], { relativeTo: this.route });` },
                // FIX: Pass the correct property 'id' to the method. The 'id' parameter is what the router link uses.
                { name: 'onEdit', parameters: [{name: 'id', type: 'string | number'}], statements: `this.router.navigate([':id/edit', id], { relativeTo: this.route });` },
            ]);
            if (deleteOp?.methodName) {
                component.addMethod({
                    name: `deleteItem`,
                    parameters: [{ name: 'id', 'type': 'string | number' }],
                    // FIX: The 'id' parameter is passed directly to the service call.
                    statements: `this.${serviceName}.${deleteOp.methodName}(id).subscribe(() => this.refresh());`
                });
            }
        }

        // Add methods for custom actions
        [...customItemOps, ...customCollectionOps].forEach(op => {
            if (op.methodName) {
                const params = customItemOps.includes(op) ? [{ name: 'id', type: 'string | number' }] : [];
                const serviceCallParams = customItemOps.includes(op) ? ['id'] : [];

                component.addMethod({
                    name: op.methodName,
                    parameters: params,
                    statements: `this.${serviceName}.${op.methodName}(${serviceCallParams.join(', ')}).subscribe(() => this.refresh());`
                });
            }
        });
    }

    private generateHtml(resource: Resource, filePath: string) {
        const idProp = resource.formProperties.find(p => p.name.toLowerCase() === 'id') ?? resource.formProperties[0];
        const customItemOps = resource.operations.filter(op => !CRUD_ACTIONS.has(op.action) && op.path.includes('{'));
        const customCollectionOps = resource.operations.filter(op => !CRUD_ACTIONS.has(op.action) && !op.path.includes('{'));

        const container = _.create('div').addClass('admin-list-container');
        container.appendChild(_.create('h1').setTextContent(pascalCase(resource.name)));

        // Main action buttons container
        const mainActions = _.create('div').addClass('admin-list-actions');
        if (resource.isEditable) {
            mainActions.appendChild(
                _.create('button')
                    .setAttribute('mat-flat-button', '')
                    .setAttribute('color', 'primary')
                    .setAttribute('(click)', 'onCreate()')
                    .setTextContent(`Create New ${resource.modelName}`)
            );
        }
        customCollectionOps.forEach(op => {
            if (op.methodName) {
                mainActions.appendChild(
                    _.create('button')
                        .setAttribute('mat-stroked-button', '')
                        .setAttribute('(click)', `${op.methodName}()`)
                        .setTextContent(pascalCase(op.methodName))
                );
            }
        });
        container.appendChild(mainActions);

        // Progress Bar
        container.appendChild(_.create('div').setInnerHtml('@if (isLoading()) {\n  <mat-progress-bar mode="indeterminate"></mat-progress-bar>\n}'));

        const tableContainer = _.create('div').addClass('mat-elevation-z8');
        const table = _.create('table').setAttribute('mat-table', '').setAttribute('[dataSource]', 'dataSource()').setAttribute('matSort', '');

        // Column Definitions
        resource.formProperties.forEach(prop => {
            const colContainer = _.create('ng-container').setAttribute('matColumnDef', prop.name);
            colContainer.appendChild(_.create('th').setAttribute('mat-header-cell', '').setAttribute('*matHeaderCellDef', '').setAttribute('mat-sort-header', '').setTextContent(pascalCase(prop.name)));
            colContainer.appendChild(_.create('td').setAttribute('mat-cell', '').setAttribute('*matCellDef', 'let row').setTextContent(`{{row.${prop.name}}}`));
            table.appendChild(colContainer);
        });

        // Actions Column
        const actionsCol = _.create('ng-container').setAttribute('matColumnDef', 'actions');
        actionsCol.appendChild(_.create('th').setAttribute('mat-header-cell', '').setAttribute('*matHeaderCellDef', ''));
        const actionsCell = _.create('td').setAttribute('mat-cell', '').setAttribute('*matCellDef', 'let row').addClass('admin-table-actions');

        let actionsContent = '';
        if (resource.isEditable) {
            // FIX: Consistently use idProp.name for all row actions
            actionsContent += `<button mat-icon-button (click)="onEdit(row.${idProp.name})"><mat-icon>edit</mat-icon></button>\n`;
            if (resource.operations.some(op => op.action === 'delete')) {
                actionsContent += `<button mat-icon-button color="warn" (click)="deleteItem(row.${idProp.name})"><mat-icon>delete</mat-icon></button>\n`;
            }
        }
        customItemOps.forEach(op => {
            if (op.methodName) {
                const icon = op.methodName.toLowerCase().includes('reboot') ? 'refresh' : 'play_arrow';
                // FIX: Consistently use idProp.name here too
                actionsContent += `<button mat-icon-button (click)="${op.methodName}(row.${idProp.name})"><mat-icon>${icon}</mat-icon></button>\n`;
            }
        });

        actionsCell.setInnerHtml(`@if (true) { ${actionsContent} }`);
        actionsCol.appendChild(actionsCell);
        table.appendChild(actionsCol);

        table.appendChild(_.create('tr').setAttribute('mat-header-row', '').setAttribute('*matHeaderRowDef', 'displayedColumns'));
        table.appendChild(_.create('tr').setAttribute('mat-row', '').setAttribute('*matRowDef', 'let row; columns: displayedColumns;'));

        tableContainer.appendChild(table);

        const noData = _.create('div').addClass('admin-no-data');
        noData.setInnerHtml(`@if (!isLoading() && dataSource().length === 0) {
  <span>No ${pascalCase(resource.name)} found.</span>
}`);
        tableContainer.appendChild(noData);

        tableContainer.appendChild(_.create('mat-paginator')
            .setAttribute('[length]', 'totalItems()')
            .setAttribute('[pageSizeOptions]', '[5, 10, 25, 100]')
            .setAttribute('showFirstLastButtons', ''));

        container.appendChild(tableContainer);

        this.project.getFileSystem().writeFileSync(filePath, container.render());
    }

    private generateScss(filePath: string) {
        const scssContent = `
.admin-list-container { padding: 24px; }
.admin-list-actions { display: flex; gap: 8px; margin-bottom: 16px; }
.admin-no-data { padding: 24px; text-align: center; color: grey; }
.mat-elevation-z8 { width: 100%; }
.admin-table-actions { text-align: right; }
        `;
        this.project.getFileSystem().writeFileSync(filePath, scssContent);
    }
}
