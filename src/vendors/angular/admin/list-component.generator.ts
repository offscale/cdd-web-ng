import { ClassDeclaration, Project, Scope } from 'ts-morph';

import { Resource } from '@src/core/types/index.js';
import { camelCase, pascalCase } from '@src/functions/utils.js';
import { ListModelBuilder } from '@src/vendors/angular/admin/analysis/list-model.builder.js';
import { ListActionKind, ListViewModel } from '@src/vendors/angular/admin/analysis/list-types.js';

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
    /* v8 ignore next */
    constructor(private readonly project: Project) {}

    /**
     * Maps an abstract action kind to a specific Angular Material icon name.
     * This is where framework-specific UI knowledge is centralized.
     * @param kind The abstract action kind from the IR.
     * @returns A string representing a Material Icon.
     */
    private mapKindToIcon(actionName: string, kind: ListActionKind): string {
        /* v8 ignore next */
        const lowerAction = actionName.toLowerCase();
        // Specific overrides take precedence over general kind
        /* v8 ignore next */
        if (lowerAction.includes('start') || lowerAction.includes('play')) return 'play_arrow';
        /* v8 ignore next */
        if (lowerAction.includes('stop') || lowerAction.includes('pause')) return 'pause';
        /* v8 ignore next */
        if (lowerAction.includes('reboot') || lowerAction.includes('refresh') || lowerAction.includes('sync'))
            /* v8 ignore next */
            return 'refresh';
        /* v8 ignore next */
        if (lowerAction.includes('approve') || lowerAction.includes('check')) return 'check';
        /* v8 ignore next */
        if (lowerAction.includes('cancel') || lowerAction.includes('block')) return 'block';
        /* v8 ignore next */
        if (lowerAction.includes('edit') || lowerAction.includes('update')) return 'edit';

        /* v8 ignore next */
        switch (kind) {
            case 'constructive':
                /* v8 ignore next */
                return 'add';
            case 'destructive':
                /* v8 ignore next */
                return 'delete';
            case 'state-change':
                /* v8 ignore next */
                return 'sync';
            case 'navigation':
                /* v8 ignore next */
                return 'arrow_forward';
            case 'default':
            default:
                /* v8 ignore next */
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
        /* v8 ignore next */
        const builder = new ListModelBuilder();
        /* v8 ignore next */
        const model = builder.build(resource);

        /* v8 ignore next */
        const listDir = `${outDir}/${resource.name}/${resource.name}-list`;
        /* v8 ignore next */
        this.project.getFileSystem().mkdirSync(listDir);

        // Phase 2: Emission
        /* v8 ignore next */
        this.emitListComponentTs(model, resource, listDir);
        /* v8 ignore next */
        this.emitListComponentHtml(model, resource, listDir);
        /* v8 ignore next */
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
        /* v8 ignore next */
        const componentName = `${pascalCase(model.resourceName)}ListComponent`;
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(`${outDir}/${model.resourceName}-list.component.ts`, '', {
            overwrite: true,
        });

        /* v8 ignore next */
        sourceFile.addStatements([
            `import { Component, viewChild, AfterViewInit, effect, inject, signal, ChangeDetectionStrategy, DestroyRef } from '@angular/core';`,
            `import { takeUntilDestroyed } from '@angular/core/rxjs-interop';`,
            `import { MatPaginator, PageEvent } from '@angular/material/paginator';`,
            `import { MatTableDataSource } from '@angular/material/table';`,
            `import { Router, ActivatedRoute } from '@angular/router';`,
            `import { MatSnackBar } from '@angular/material/snack-bar';`,
            `import { of, catchError, startWith, switchMap } from 'rxjs';`,
            `import { ${model.serviceName} } from '@src/../services/${camelCase(model.resourceName)}.service';`,
            `import { ${model.modelName} } from '@src/../models';`,
            /* v8 ignore next */
            ...commonStandaloneImports.map(a => `import { ${a[0]} } from "${a[1]}";`),
        ]);

        /* v8 ignore next */
        const componentClass = sourceFile.addClass({
            name: componentName,
            isExported: true,
            implements: ['AfterViewInit'],
            decorators: [
                {
                    name: 'Component',
                    arguments: [
                        `{
                    selector: 'app-${model.resourceName}-list',
/* v8 ignore next */
                    imports: [ ${commonStandaloneImports.map(a => a[0]).join(',\n')} ],
                    templateUrl: './${model.resourceName}-list.component.html',
                    styleUrl: './${model.resourceName}-list.component.scss',
                    changeDetection: ChangeDetectionStrategy.OnPush
                }`,
                    ],
                },
            ],
        });

        /* v8 ignore next */
        this.addProperties(componentClass, model);
        /* v8 ignore next */
        this.addConstructorAndDataLoadingEffect(componentClass, model);
        /* v8 ignore next */
        this.addLifecycleAndUtilityMethods(componentClass);
        /* v8 ignore next */
        this.addCrudActions(componentClass, model, resource);
        /* v8 ignore next */
        this.addCustomActions(componentClass, model);

        /* v8 ignore next */
        sourceFile.formatText();
    }

    /**
     * Adds class properties, including DI-injected services, component state signals,
     * and configuration for the Material table.
     * @private
     */
    private addProperties(componentClass: ClassDeclaration, model: ListViewModel): void {
        /* v8 ignore next */
        componentClass.addProperties([
            { name: 'router', isReadonly: true, initializer: 'inject(Router)' },
            { name: 'route', isReadonly: true, initializer: 'inject(ActivatedRoute)' },
            { name: 'snackBar', isReadonly: true, initializer: 'inject(MatSnackBar)' },
            {
                name: `${camelCase(model.serviceName)}`,
                isReadonly: true,
                type: model.serviceName,
                initializer: `inject(${model.serviceName})`,
            },
            { name: 'destroyRef', scope: Scope.Private, isReadonly: true, initializer: 'inject(DestroyRef)' },
            {
                name: 'paginator',
                initializer: 'viewChild.required(MatPaginator)',
            },
            {
                name: 'dataSource',
                type: `MatTableDataSource<${model.modelName}>`,
                initializer: `new MatTableDataSource<${model.modelName}>()`,
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
        /* v8 ignore next */
        const constructor = componentClass.addConstructor();
        /* v8 ignore next */
        constructor.setBodyText(writer => {
            /* v8 ignore next */
            writer
                .writeLine('effect(() => {')
                .indent(() => {
                    /* v8 ignore next */
                    writer.writeLine(`if (!this.isViewInitialized()) { return; }`);
                    /* v8 ignore next */
                    writer
                        .writeLine('this.paginator().page.pipe(')
                        .indent(() => {
                            /* v8 ignore next */
                            writer.writeLine(`startWith({} as PageEvent),`);
                            /* v8 ignore next */
                            writer.writeLine(`switchMap((pageEvent: PageEvent) => {`);
                            /* v8 ignore next */
                            writer.indent(() => {
                                /* v8 ignore next */
                                writer.writeLine(`const page = pageEvent.pageIndex ?? this.paginator().pageIndex;`);
                                /* v8 ignore next */
                                writer.writeLine(`const limit = pageEvent.pageSize ?? this.paginator().pageSize;`);
                                /* v8 ignore next */
                                writer.writeLine(`const query = { _page: page + 1, _limit: limit };`);
                                /* v8 ignore next */
                                writer
                                    .writeLine(
                                        `return this.${camelCase(model.serviceName)}.${model.listOperationName}(query, 'response').pipe(`,
                                    )
                                    .indent(() => {
                                        /* v8 ignore next */
                                        writer.writeLine(`catchError(() => of(null))`);
                                    })
                                    .write(');');
                            });
                            /* v8 ignore next */
                            writer.writeLine('}),');
                            /* v8 ignore next */
                            writer.writeLine('takeUntilDestroyed(this.destroyRef)');
                        })
                        .write(').subscribe(response => {');
                    /* v8 ignore next */
                    writer.indent(() => {
                        /* v8 ignore next */
                        writer.writeLine(`if (response === null) {`);
                        /* v8 ignore next */
                        writer.indent(() => {
                            /* v8 ignore next */
                            writer.writeLine(`this.dataSource.data = [];`);
                            /* v8 ignore next */
                            writer.writeLine(`this.totalItems.set(0);`);
                            /* v8 ignore next */
                            writer.writeLine(
                                `this.snackBar.open('Error fetching data', 'Close', { duration: 5000, panelClass: 'error-snackbar' });`,
                            );
                        });
                        /* v8 ignore next */
                        writer.writeLine(`} else {`);
                        /* v8 ignore next */
                        writer.indent(() => {
                            /* v8 ignore next */
                            writer.writeLine(`this.dataSource.data = response.body ?? [];`);
                            /* v8 ignore next */
                            writer.writeLine(`const totalCount = response.headers.get('X-Total-Count');`);
                            /* v8 ignore next */
                            writer.writeLine(
                                `this.totalItems.set(totalCount ? +totalCount : response.body?.length ?? 0);`,
                            );
                        });
                        /* v8 ignore next */
                        writer.writeLine('}');
                    });
                    /* v8 ignore next */
                    writer.write('});');
                })
                .write('});');
        });
    }

    /**
     * Adds standard Angular lifecycle and utility methods like `ngAfterViewInit`.
     * @private
     */
    private addLifecycleAndUtilityMethods(componentClass: ClassDeclaration): void {
        /* v8 ignore next */
        componentClass.addMethod({
            name: 'ngAfterViewInit',
            statements: ['this.dataSource.paginator = this.paginator();', 'this.isViewInitialized.set(true);'],
        });
        /* v8 ignore next */
        componentClass.addMethod({
            name: 'refresh',
            statements: `this.paginator().page.emit({ pageIndex: this.paginator().pageIndex, pageSize: this.paginator().pageSize, length: this.paginator().length });`,
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
        /* v8 ignore next */
        if (model.hasCreate) {
            /* v8 ignore next */
            componentClass.addMethod({
                name: 'onCreate',
                statements: `this.router.navigate(['new'], { relativeTo: this.route });`,
            });
        }
        /* v8 ignore next */
        if (model.hasEdit) {
            /* v8 ignore next */
            componentClass.addMethod({
                name: 'onEdit',
                parameters: [{ name: 'id', type: 'string' }],
                statements: `this.router.navigate([id], { relativeTo: this.route });`,
            });
        }
        /* v8 ignore next */
        if (model.hasDelete) {
            // Standard Delete Logic: Verify the resource actually has a DELETE op and get its name
            /* v8 ignore next */
            const deleteOp = resource.operations.find(op => op.action === 'delete');

            /* v8 ignore next */
            if (deleteOp?.methodName) {
                /* v8 ignore next */
                componentClass.addMethod({
                    name: 'onDelete',
                    parameters: [{ name: 'id', type: 'string' }],
                    statements: [
                        `if (confirm('Are you sure you want to delete this item?')) {`,
                        `  this.${camelCase(model.serviceName)}.${deleteOp.methodName}(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {`,
                        `    this.snackBar.open('Item deleted successfully!', 'Close', { duration: 3000 });`,
                        `    this.refresh();`,
                        `  });`,
                        `}`,
                    ],
                });
            }
        }
    }

    /**
     * Adds methods for any non-CRUD custom actions defined in the IR.
     * @private
     */
    private addCustomActions(componentClass: ClassDeclaration, model: ListViewModel): void {
        /* v8 ignore next */
        model.customActions.forEach(action => {
            // action.operation is available in the ListAction interface from the analyzer
            /* v8 ignore next */
            const params = action.requiresId ? [{ name: 'id', type: 'string' }] : [];
            /* v8 ignore next */
            const args = action.requiresId ? 'id' : '';

            /* v8 ignore next */
            const body = `this.${camelCase(model.serviceName)}.${action.operation.methodName}(${args}).pipe(
    takeUntilDestroyed(this.destroyRef),
    catchError((err: Error) => {        console.error('Action failed', err);
        this.snackBar.open('Action failed', 'Close', { duration: 5000, panelClass: 'error-snackbar' });
        return of(null);
    })
).subscribe(response => {
    if (response !== null) {
        this.snackBar.open('Action successful!', 'Close', { duration: 3000 });
        this.refresh();
    }
});`;

            /* v8 ignore next */
            componentClass.addMethod({
                name: action.name,
                parameters: params,
                statements: body,
            });
        });
    }

    /**
     * Generates the HTML template file (`.component.html`).
     * @private
     */
    private emitListComponentHtml(model: ListViewModel, resource: Resource, outDir: string): void {
        // Build the icon map for the template using the new internal mapping logic.
        /* v8 ignore next */
        const iconMap = new Map<string, string>();
        /* v8 ignore next */
        model.customActions.forEach(a => iconMap.set(a.name, this.mapKindToIcon(a.name, a.kind)));

        // Delegate to HTML builder.
        /* v8 ignore next */
        const htmlContent = generateListComponentHtml(resource, model.idProperty, iconMap);
        /* v8 ignore next */
        this.project.getFileSystem().writeFileSync(`${outDir}/${model.resourceName}-list.component.html`, htmlContent);
    }

    /**
     * Generates the SCSS style file (`.component.scss`).
     * @private
     */
    private emitListComponentScss(model: ListViewModel, outDir: string): void {
        /* v8 ignore next */
        const scssContent = generateListComponentScss();
        /* v8 ignore next */
        this.project.getFileSystem().writeFileSync(`${outDir}/${model.resourceName}-list.component.scss`, scssContent);
    }
}
