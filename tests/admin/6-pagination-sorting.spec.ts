import { describe, it, expect, beforeAll } from 'vitest';
import { Project, SourceFile, ClassDeclaration } from 'ts-morph';
import { paginationSpec } from './specs/test.specs.js';
import { generateAdminUI } from './test.helpers.js';

describe('Integration: Pagination and Sorting Generation', () => {
    let tsFile: SourceFile;
    let html: string;
    let listClass: ClassDeclaration;

    beforeAll(async () => {
        const project = await generateAdminUI(paginationSpec);
        tsFile = project.getSourceFileOrThrow('/generated/admin/products/products-list/products-list.component.ts');
        html = project.getFileSystem().readFileSync('/generated/admin/products/products-list/products-list.component.html');
        listClass = tsFile.getClassOrThrow('ProductsListComponent');
    }, 30000);

    it('should add necessary modules to component imports', () => {
        const componentDecorator = listClass.getDecoratorOrThrow('Component');
        const decoratorText = componentDecorator.getText();
        expect(decoratorText).toContain('imports: [');
        expect(decoratorText).toContain('MatPaginatorModule');
        expect(decoratorText).toContain('MatSortModule');
        expect(decoratorText).toContain('MatTableModule');
        expect(decoratorText).toContain('MatProgressBarModule');
    });

    it('should generate mat-paginator and matSort directive in the HTML', () => {
        expect(html).toContain('<mat-paginator');
        expect(html).toMatch(/<table\s+mat-table[^>]+matSort/);
    });

    it('should generate signal-based viewChild properties for the paginator and sorter', () => {
        const paginatorProp = listClass.getProperty('paginator');
        const sortProp = listClass.getProperty('sorter');

        expect(paginatorProp).toBeDefined();
        expect(paginatorProp?.getInitializer()?.getText()).toContain('viewChild.required(MatPaginator)');

        expect(sortProp).toBeDefined();
        expect(sortProp?.getInitializer()?.getText()).toContain('viewChild.required(MatSort)');
    });

    it('should use an effect with merge and switchMap logic to handle events and data loading', () => {
        const constructor = listClass.getConstructors()[0];
        expect(constructor).toBeDefined();
        const constructorBody = constructor.getBodyText() ?? '';

        expect(constructorBody).toContain('effect((onCleanup) =>');
        expect(constructorBody).toContain('onCleanup(() => sub.unsubscribe());');

        // Check for the overall structure
        expect(constructorBody).toContain('merge(sorter.sortChange, paginator.page');
        expect(constructorBody).toContain('startWith({})');
        expect(constructorBody).toContain('switchMap(() => {');
        expect(constructorBody).toContain(').subscribe(data => this.dataSource.set(data));');

        // Check that it calls the service with correct params
        expect(constructorBody).toContain('this.productsService.getProducts(');
        expect(constructorBody).not.toContain('this.productsService.getProducts({');

        // Check for the presence of the correct arguments in the call
        expect(constructorBody).toContain('paginator.pageIndex + 1');
        expect(constructorBody).toContain('paginator.pageSize');
        expect(constructorBody).toContain('sorter.active');
        expect(constructorBody).toContain('sorter.direction');
        expect(constructorBody).toContain(`'response'`);

        // Check that it processes the response correctly
        expect(constructorBody).toContain('map(response => {');
        expect(constructorBody).toContain('this.isLoading.set(false);');
        expect(constructorBody).toContain(`const totalCount = response.headers.get('X-Total-Count');`);
        expect(constructorBody).toContain('this.totalItems.set(totalCount ? +totalCount : 0);');
        expect(constructorBody).toContain('return response.body ?? [];');
    });
});
