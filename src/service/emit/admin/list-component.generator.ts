import { ClassDeclaration, Project, Scope } from 'ts-morph';
import { FormProperty, Resource } from '../../../core/types.js';
import { camelCase, pascalCase } from '../../../core/utils.js';
import { commonStandaloneImports } from './common-imports.js';
import { generateListComponentHtml } from './html/list-component-html.builder.js';
import { generateListComponentScss } from './html/list-component-scss.builder.js';

/**
 * Generates the list component for a given administrative resource.
 *
 * This component displays a paginated Material table of the resource's items and provides
 * buttons for creating, editing, deleting, and performing custom actions on them.
 */
export class ListComponentGenerator {
    /**
     * Initializes a new instance of the ListComponentGenerator.
     * @param project The ts-morph project instance for AST manipulation.
     */
    constructor(private readonly project: Project) {
    }

    /**
     * Generates all necessary files for the list component (.ts, .html, .scss).
     * @param resource The resource metadata object.
     * @param outDir The base output directory for the admin module (e.g., '/generated/admin').
     */
    public generate(resource: Resource, outDir: string): void {
        const listDir = `${outDir}/${resource.name}/${resource.name}-list`;
        this.project.getFileSystem().mkdirSync(listDir);

        this.generateListComponentTs(resource, listDir);
        this.generateListComponentHtml(resource, listDir);
        this.generateListComponentScss(resource, listDir);
    }

    /**
     * Generates the main TypeScript file (`.component.ts`) for the list component.
     * @param resource The resource metadata object.
     * @param outDir The specific directory for this component's files.
     * @private
     */
    private generateListComponentTs(resource: Resource, outDir: string): void {
        const componentName = `${pascalCase(resource.name)}ListComponent`;
        const serviceName = `${pascalCase(resource.name)}Service`;
        const sourceFile = this.project.createSourceFile(`${outDir}/${resource.name}-list.component.ts`, '', { overwrite: true });

        sourceFile.addStatements([
            `import { Component, ViewChild, AfterViewInit, effect, inject, signal, ChangeDetectionStrategy, DestroyRef } from '@angular/core';`,
            `import { takeUntilDestroyed } from '@angular/core/rxjs-interop';`,
            `import { MatPaginator, PageEvent } from '@angular/material/paginator';`,
            `import { MatTableDataSource } from '@angular/material/table';`,
            `import { Router, ActivatedRoute } from '@angular/router';`,
            `import { MatSnackBar } from '@angular/material/snack-bar';`,
            `import { of, catchError, startWith, switchMap } from 'rxjs';`,
            `import { ${serviceName} } from '../../../../services/${camelCase(resource.name)}.service';`,
            `import { ${resource.modelName} } from '../../../../models';`,
            `${commonStandaloneImports.map(a => 'import { ' + a[0] + ' } from "' + a[1] + '";').join("\n")}`,
        ]);

        const componentClass = sourceFile.addClass({
            name: componentName,
            isExported: true,
            implements: ['AfterViewInit'],
            decorators: [{
                name: 'Component',
                arguments: [`{ 
                    selector: 'app-${resource.name}-list', 
                    imports: [ ${commonStandaloneImports.map(a => a[0]).join(',\n')} ], 
                    templateUrl: './${resource.name}-list.component.html', 
                    styleUrl: './${resource.name}-list.component.scss',
                    changeDetection: ChangeDetectionStrategy.OnPush
                }`]
            }],
        });

        this.addProperties(componentClass, resource, serviceName);
        this.addConstructorAndDataLoadingEffect(componentClass, resource, serviceName);
        this.addLifecycleAndUtilityMethods(componentClass);
        this.addCrudActions(componentClass, resource, serviceName);
        this.addCustomActions(componentClass, resource, serviceName);
    }

    /**
     * Adds class properties, including DI-injected services, component state signals,
     * and configuration for the Material table.
     * @param componentClass The class to which properties will be added.
     * @param resource The resource metadata object.
     * @param serviceName The name of the resource's service class.
     * @private
     */
    private addProperties(componentClass: ClassDeclaration, resource: Resource, serviceName: string): void {
        const idProperty = this.getIdProperty(resource);

        const listableProps = resource.listProperties || [];
        const displayedColumns = [...new Set([idProperty, ...listableProps.map((p: FormProperty) => p.name)])].filter(Boolean);

        const hasActions = resource.operations.some(op => ['update', 'delete'].includes(op.action) || op.isCustomItemAction);
        if (hasActions) {
            displayedColumns.push('actions');
        }

        componentClass.addProperties([
            { name: 'router', isReadonly: true, initializer: 'inject(Router)' },
            { name: 'route', isReadonly: true, initializer: 'inject(ActivatedRoute)' },
            { name: 'snackBar', isReadonly: true, initializer: 'inject(MatSnackBar)' },
            {
                name: `${camelCase(serviceName)}`,
                isReadonly: true,
                type: serviceName,
                initializer: `inject(${serviceName})`
            },
            { name: 'destroyRef', scope: Scope.Private, isReadonly: true, initializer: 'inject(DestroyRef)' },
            {
                name: `paginator!: MatPaginator`,
                decorators: [{ name: 'ViewChild', arguments: ['MatPaginator'] }]
            },
            {
                name: 'dataSource',
                type: `MatTableDataSource<${resource.modelName}>`,
                initializer: `new MatTableDataSource<${resource.modelName}>()`
            },
            { name: 'totalItems', initializer: 'signal(0)' },
            { name: 'isViewInitialized', scope: Scope.Private, initializer: 'signal(false)' },
            { name: 'displayedColumns: string[]', initializer: JSON.stringify(displayedColumns) },
            { name: 'idProperty: string', initializer: `'${idProperty}'` },
        ]);
    }

    /**
     * Adds the constructor and the data-loading `effect`.
     * The effect reacts to paginator changes to fetch data from the server. It is designed to run only
     * after the view is initialized to ensure the paginator is available.
     * @param componentClass The class to which the constructor and effect will be added.
     * @param resource The resource metadata object.
     * @param serviceName The name of the resource's service class.
     * @private
     */
    private addConstructorAndDataLoadingEffect(componentClass: ClassDeclaration, resource: Resource, serviceName: string): void {
        const listOp = resource.operations.find(op => op.action === 'list')!;

        const constructor = componentClass.addConstructor();
        constructor.setBodyText(writer => {
            writer.writeLine('effect(() => {').indent(() => {
                writer.writeLine(`if (!this.isViewInitialized()) { return; }`);
                writer.writeLine('this.paginator.page.pipe(').indent(() => {
                    writer.writeLine(`startWith({} as PageEvent),`);
                    writer.writeLine(`switchMap((pageEvent: PageEvent) => {`);
                    writer.indent(() => {
                        writer.writeLine(`const page = pageEvent.pageIndex ?? this.paginator.pageIndex;`);
                        writer.writeLine(`const limit = pageEvent.pageSize ?? this.paginator.pageSize;`);
                        writer.writeLine(`const query = { _page: page + 1, _limit: limit };`);
                        writer.writeLine(`return this.${camelCase(serviceName)}.${listOp.methodName}(query, 'response').pipe(`).indent(() => {
                            writer.writeLine(`catchError(() => of(null))`);
                        }).write(');');
                    });
                    writer.writeLine('}),');
                    writer.writeLine('takeUntilDestroyed(this.destroyRef)');
                }).write(').subscribe(response => {');
                writer.indent(() => {
                    writer.writeLine(`if (response === null) {`);
                    writer.indent(() => {
                        writer.writeLine(`this.dataSource.data = [];`);
                        writer.writeLine(`this.totalItems.set(0);`);
                        writer.writeLine(`this.snackBar.open('Error fetching data', 'Close', { duration: 5000, panelClass: 'error-snackbar' });`);
                    });
                    writer.writeLine(`} else {`);
                    writer.indent(() => {
                        writer.writeLine(`this.dataSource.data = response.body ?? [];`);
                        writer.writeLine(`const totalCount = response.headers.get('X-Total-Count');`);
                        writer.writeLine(`this.totalItems.set(totalCount ? +totalCount : response.body?.length ?? 0);`);
                    });
                    writer.writeLine('}');
                });
                writer.write('});');
            }).write('});');
        });
    }

    /**
     * Adds standard Angular lifecycle and utility methods like `ngAfterViewInit` and a `refresh` helper.
     * @param componentClass The class to which methods will be added.
     * @private
     */
    private addLifecycleAndUtilityMethods(componentClass: ClassDeclaration): void {
        componentClass.addMethod({
            name: 'ngAfterViewInit',
            statements: [
                'this.dataSource.paginator = this.paginator;',
                'this.isViewInitialized.set(true);'
            ]
        });
        componentClass.addMethod({
            name: 'refresh',
            statements: `this.paginator.page.emit({ pageIndex: this.paginator.pageIndex, pageSize: this.paginator.pageSize, length: this.paginator.length });`,
        });
    }

    /**
     * Adds methods for standard CRUD actions (Create, Edit, Delete) if they are defined for the resource.
     * @param componentClass The class to which methods will be added.
     * @param resource The resource metadata object.
     * @param serviceName The name of the resource's service class.
     * @private
     */
    private addCrudActions(componentClass: ClassDeclaration, resource: Resource, serviceName: string): void {
        if (resource.operations.some(op => op.action === 'create')) {
            componentClass.addMethod({
                name: 'onCreate',
                statements: `this.router.navigate(['new'], { relativeTo: this.route });`
            });
        }
        if (resource.operations.some(op => op.action === 'update')) {
            componentClass.addMethod({
                name: 'onEdit',
                parameters: [{ name: 'id', type: 'string' }],
                statements: `this.router.navigate([id], { relativeTo: this.route });`
            });
        }
        if (resource.operations.some(op => op.action === 'delete')) {
            const deleteOp = resource.operations.find(op => op.action === 'delete')!;
            componentClass.addMethod({
                name: 'onDelete',
                parameters: [{ name: 'id', type: 'string' }],
                statements: [
                    `if (confirm('Are you sure you want to delete this item?')) {`,
                    `  this.${camelCase(serviceName)}.${deleteOp.methodName}(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {`,
                    `    this.snackBar.open('Item deleted successfully!', 'Close', { duration: 3000 });`,
                    `    this.refresh();`,
                    `  });`,
                    `}`
                ]
            });
        }
    }

    /**
     * Adds methods for any non-CRUD custom actions (both item and collection level) defined in the OpenAPI spec.
     * @param componentClass The class to which methods will be added.
     * @param resource The resource metadata object.
     * @param serviceName The name of the resource's service class.
     * @private
     */
    private addCustomActions(classDeclaration: ClassDeclaration, resource: Resource, serviceName: string): void {
        const customActions = resource.operations.filter(op => op.isCustomCollectionAction || op.isCustomItemAction);

        customActions.forEach(op => {
            const params = op.isCustomItemAction ? [{ name: 'id', type: 'string' }] : [];
            const args = op.isCustomItemAction ? 'id' : '';

            const body = `this.${camelCase(serviceName)}.${op.methodName}(${args}).pipe(
    takeUntilDestroyed(this.destroyRef), 
    catchError((err: any) => { 
        console.error('Action failed', err); 
        this.snackBar.open('Action failed', 'Close', { duration: 5000, panelClass: 'error-snackbar' }); 
        return of(null); 
    }) 
).subscribe(response => { 
    if (response !== null) { 
        this.snackBar.open('Action successful!', 'Close', { duration: 3000 }); 
        this.refresh(); 
    } 
});`;

            classDeclaration.addMethod({
                name: op.action,
                parameters: params,
                statements: body
            });
        });
    }

    /**
     * Generates the HTML template file (`.component.html`) for the list component.
     * @param resource The resource metadata object.
     * @param outDir The specific directory for this component's files.
     * @private
     */
    private generateListComponentHtml(resource: Resource, outDir: string): void {
        const iconMap = new Map<string, string>();
        resource.operations
            .filter(op => op.isCustomCollectionAction || op.isCustomItemAction)
            .forEach(op => iconMap.set(op.action, this.getIconForAction(op.action)));

        const idProperty = this.getIdProperty(resource);
        const htmlContent = generateListComponentHtml(resource, idProperty, iconMap);
        this.project.getFileSystem().writeFileSync(`${outDir}/${resource.name}-list.component.html`, htmlContent);
    }

    /**
     * Generates the SCSS style file (`.component.scss`) for the list component.
     * @param resource The resource metadata object.
     * @param outDir The specific directory for this component's files.
     * @private
     */
    private generateListComponentScss(resource: Resource, outDir: string): void {
        const scssContent = generateListComponentScss();
        this.project.getFileSystem().writeFileSync(`${outDir}/${resource.name}-list.component.scss`, scssContent);
    }

    /**
     * Determines the unique identifier property for table rows.
     * It prefers 'id', but falls back to the first available property if 'id' is not found.
     * If no properties exist at all, it defaults to 'id' as a safe fallback.
     * @param resource The resource metadata object.
     * @returns The name of the ID property.
     * @private
     */
    private getIdProperty(resource: Resource): string {
        const allProps = resource.formProperties;
        if (allProps.some(p => p.name === 'id')) {
            return 'id';
        }
        // `resource.formProperties` is guaranteed by the discovery phase
        // to have at least one property (falling back to a default 'id'). 
        return allProps[0].name;
    }

    /**
     * Maps an action name to a Material Design icon name based on common keywords.
     * @param action The camelCase name of the action (e.g., 'rebootServer', 'approveItem').
     * @returns The name of the Material icon (e.g., 'refresh', 'check').
     * @private
     */
    private getIconForAction(action: string): string {
        const lowerAction = action.toLowerCase();
        if (lowerAction.includes('delete') || lowerAction.includes('remove')) return 'delete';
        if (lowerAction.includes('edit') || lowerAction.includes('update')) return 'edit';
        if (lowerAction.includes('add') || lowerAction.includes('create')) return 'add';
        if (lowerAction.includes('start') || lowerAction.includes('play')) return 'play_arrow';
        if (lowerAction.includes('stop') || lowerAction.includes('pause')) return 'pause';
        if (lowerAction.includes('reboot') || lowerAction.includes('refresh') || lowerAction.includes('sync')) return 'refresh';
        if (lowerAction.includes('approve') || lowerAction.includes('check')) return 'check';
        if (lowerAction.includes('cancel') || lowerAction.includes('block')) return 'block';
        return 'play_arrow'; // Default fallback icon
    }
}
