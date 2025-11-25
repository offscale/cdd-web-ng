import { ClassDeclaration, Project, Scope } from 'ts-morph';

import { Resource } from '@src/core/types/index.js';
import { camelCase, pascalCase } from "@src/core/utils/index.js";
import { ListModelBuilder } from "@src/analysis/list-model.builder.js";
import { ListActionKind, ListViewModel } from "@src/analysis/list-types.js";

import { generateListComponentHtml } from './html/list-component-html.builder.js';
import { generateListComponentScss } from './html/list-component-scss.builder.js';
import { commonStandaloneImports } from './common-imports.js';

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
     * Maps an abstract action kind to a specific Angular Material icon name.
     * This is where framework-specific UI knowledge is centralized.
     * @param kind The abstract action kind from the IR.
     * @returns A string representing a Material Icon.
     */
    private mapKindToIcon(actionName: string, kind: ListActionKind): string {
        const lowerAction = actionName.toLowerCase();
        // Specific overrides take precedence over general kind
        if (lowerAction.includes('start') || lowerAction.includes('play')) return 'play_arrow';
        if (lowerAction.includes('stop') || lowerAction.includes('pause')) return 'pause';
        if (lowerAction.includes('reboot') || lowerAction.includes('refresh') || lowerAction.includes('sync')) return 'refresh';
        if (lowerAction.includes('approve') || lowerAction.includes('check')) return 'check';
        if (lowerAction.includes('cancel') || lowerAction.includes('block')) return 'block';
        if (lowerAction.includes('edit') || lowerAction.includes('update')) return 'edit';

        switch (kind) {
            case 'constructive':
                return 'add';
            case 'destructive':
                return 'delete';
            case 'state-change':
                return 'sync';
            case 'navigation':
                return 'arrow_forward';
            case 'default':
            default:
                return 'play_arrow';
        }
    }

    /**
     * Generates all necessary files for the list component (.ts, .html, .scss).
     * @param resource The resource metadata object.
     * @param outDir The base output directory for the admin module (e.g., '/generated/admin').
     */
    public generate(resource: Resource, outDir: string): void {
        // Phase 1: Analysis
        const builder = new ListModelBuilder();
        const model = builder.build(resource);

        const listDir = `${outDir}/${resource.name}/${resource.name}-list`;
        this.project.getFileSystem().mkdirSync(listDir);

        // Phase 2: Emission
        this.emitListComponentTs(model, resource, listDir);
        this.emitListComponentHtml(model, resource, listDir);
        this.emitListComponentScss(model, listDir);
    }

    /**
     * Generates the main TypeScript file (`.component.ts`) for the list component.
     * @param model The analyzed view model.
     * @param resource The original resource object (used to look up operation method names).
     * @param outDir The specific directory for this component's files.
     * @private
     */
    private emitListComponentTs(model: ListViewModel, resource: Resource, outDir: string): void {
        const componentName = `${pascalCase(model.resourceName)}ListComponent`;
        const sourceFile = this.project.createSourceFile(`${outDir}/${model.resourceName}-list.component.ts`, '', { overwrite: true });

        sourceFile.addStatements([
            `import { Component, ViewChild, AfterViewInit, effect, inject, signal, ChangeDetectionStrategy, DestroyRef } from '@angular/core';`,
            `import { takeUntilDestroyed } from '@angular/core/rxjs-interop';`,
            `import { MatPaginator, PageEvent } from '@angular/material/paginator';`,
            `import { MatTableDataSource } from '@angular/material/table';`,
            `import { Router, ActivatedRoute } from '@angular/router';`,
            `import { MatSnackBar } from '@angular/material/snack-bar';`,
            `import { of, catchError, startWith, switchMap } from 'rxjs';`,
            `import { ${model.serviceName} } from '../../../../services/${camelCase(model.resourceName)}.service';`,
            `import { ${model.modelName} } from '../../../../models';`,
            ...commonStandaloneImports.map(a => `import { ${a[0]} } from "${a[1]}";`),
        ]);

        const componentClass = sourceFile.addClass({
            name: componentName,
            isExported: true,
            implements: ['AfterViewInit'],
            decorators: [{
                name: 'Component',
                arguments: [`{
                    selector: 'app-${model.resourceName}-list',
                    standalone: true,
                    imports: [ ${commonStandaloneImports.map(a => a[0]).join(',\n')} ],
                    templateUrl: './${model.resourceName}-list.component.html',
                    styleUrl: './${model.resourceName}-list.component.scss',
                    changeDetection: ChangeDetectionStrategy.OnPush
                }`]
            }],
        });

        this.addProperties(componentClass, model);
        this.addConstructorAndDataLoadingEffect(componentClass, model);
        this.addLifecycleAndUtilityMethods(componentClass);
        this.addCrudActions(componentClass, model, resource);
        this.addCustomActions(componentClass, model);

        sourceFile.formatText();
    }

    /**
     * Adds class properties, including DI-injected services, component state signals,
     * and configuration for the Material table.
     * @private
     */
    private addProperties(componentClass: ClassDeclaration, model: ListViewModel): void {
        componentClass.addProperties([
            { name: 'router', isReadonly: true, initializer: 'inject(Router)' },
            { name: 'route', isReadonly: true, initializer: 'inject(ActivatedRoute)' },
            { name: 'snackBar', isReadonly: true, initializer: 'inject(MatSnackBar)' },
            {
                name: `${camelCase(model.serviceName)}`,
                isReadonly: true,
                type: model.serviceName,
                initializer: `inject(${model.serviceName})`
            },
            { name: 'destroyRef', scope: Scope.Private, isReadonly: true, initializer: 'inject(DestroyRef)' },
            {
                name: `paginator!: MatPaginator`,
                decorators: [{ name: 'ViewChild', arguments: ['MatPaginator'] }]
            },
            {
                name: 'dataSource',
                type: `MatTableDataSource<${model.modelName}>`,
                initializer: `new MatTableDataSource<${model.modelName}>()`
            },
            { name: 'totalItems', initializer: 'signal(0)' },
            { name: 'isViewInitialized', scope: Scope.Private, initializer: 'signal(false)' },
            { name: 'displayedColumns: string[]', initializer: JSON.stringify(model.displayedColumns) },
            { name: 'idProperty: string', initializer: `'${model.idProperty}'` },
        ]);
    }

    /**
     * Adds the constructor and the data-loading `effect`.
     * @private
     */
    private addConstructorAndDataLoadingEffect(componentClass: ClassDeclaration, model: ListViewModel): void {
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
                        writer.writeLine(`return this.${camelCase(model.serviceName)}.${model.listOperationName}(query, 'response').pipe(`).indent(() => {
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
     * Adds standard Angular lifecycle and utility methods like `ngAfterViewInit`.
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
     * Adds methods for standard CRUD actions (Create, Edit, Delete).
     * @param componentClass The ts-morph class declaration.
     * @param model The view model.
     * @param resource The full resource definition (needed to find the specific operation MethodName for deletion).
     * @private
     */
    private addCrudActions(componentClass: ClassDeclaration, model: ListViewModel, resource: Resource): void {
        if (model.hasCreate) {
            componentClass.addMethod({
                name: 'onCreate',
                statements: `this.router.navigate(['new'], { relativeTo: this.route });`
            });
        }
        if (model.hasEdit) {
            componentClass.addMethod({
                name: 'onEdit',
                parameters: [{ name: 'id', type: 'string' }],
                statements: `this.router.navigate([id], { relativeTo: this.route });`
            });
        }
        if (model.hasDelete) {
            // Standard Delete Logic: Verify the resource actually has a DELETE op and get its name
            const deleteOp = resource.operations.find(op => op.action === 'delete');

            if (deleteOp?.methodName) {
                componentClass.addMethod({
                    name: 'onDelete',
                    parameters: [{ name: 'id', type: 'string' }],
                    statements: [
                        `if (confirm('Are you sure you want to delete this item?')) {`,
                        `  this.${camelCase(model.serviceName)}.${deleteOp.methodName}(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {`,
                        `    this.snackBar.open('Item deleted successfully!', 'Close', { duration: 3000 });`,
                        `    this.refresh();`,
                        `  });`,
                        `}`
                    ]
                });
            }
        }
    }

    /**
     * Adds methods for any non-CRUD custom actions defined in the IR.
     * @private
     */
    private addCustomActions(componentClass: ClassDeclaration, model: ListViewModel): void {
        model.customActions.forEach(action => {
            // action.operation is available in the ListAction interface from the analyzer
            const params = action.requiresId ? [{ name: 'id', type: 'string' }] : [];
            const args = action.requiresId ? 'id' : '';

            const body = `this.${camelCase(model.serviceName)}.${action.operation.methodName}(${args}).pipe(
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

            componentClass.addMethod({
                name: action.name,
                parameters: params,
                statements: body
            });
        });
    }

    /**
     * Generates the HTML template file (`.component.html`).
     * @private
     */
    private emitListComponentHtml(model: ListViewModel, resource: Resource, outDir: string): void {
        // Build the icon map for the template using the new internal mapping logic.
        const iconMap = new Map<string, string>();
        model.customActions.forEach(a => iconMap.set(a.name, this.mapKindToIcon(a.name, a.kind)));

        // Delegate to HTML builder.
        const htmlContent = generateListComponentHtml(resource, model.idProperty, iconMap);
        this.project.getFileSystem().writeFileSync(`${outDir}/${model.resourceName}-list.component.html`, htmlContent);
    }

    /**
     * Generates the SCSS style file (`.component.scss`).
     * @private
     */
    private emitListComponentScss(model: ListViewModel, outDir: string): void {
        const scssContent = generateListComponentScss();
        this.project.getFileSystem().writeFileSync(`${outDir}/${model.resourceName}-list.component.scss`, scssContent);
    }
}
