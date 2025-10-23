// ./tests/admin/6-pagination-sorting.spec.ts

import { describe, it, expect, beforeAll } from 'vitest';
import { Project, SourceFile, ClassDeclaration } from 'ts-morph';
import { paginationSpec } from './specs/test.specs.js';
import { generateAdminUI } from './test.helpers.js';

/**
 * Main test suite for verifying the generation of pagination and sorting features.
 */
describe('Integration: Pagination and Sorting Generation', () => {
    let tsFile: SourceFile;
    let html: string;
    let listClass: ClassDeclaration;

    /**
     * Runs the code generator once before all tests in this suite.
     */
    beforeAll(async () => {
        const project = await generateAdminUI(paginationSpec);
        tsFile = project.getSourceFileOrThrow('/generated/admin/products/products-list/products-list.component.ts');
        html = project.getFileSystem().readFileSync('/generated/admin/products/products-list/products-list.component.html');
        listClass = tsFile.getClassOrThrow('ProductsListComponent');
    });

    /**
     * Verifies that the component's standalone `imports` array includes `MatPaginatorModule` and `MatSortModule`.
     */
    it('should add MatPaginator and MatSort modules to component imports', () => {
        const componentDecorator = listClass.getDecoratorOrThrow('Component');
        const importsProperty = componentDecorator.getArguments()[0]
            .asKindOrThrow('ObjectLiteralExpression')
            .getPropertyOrThrow('imports')
            .asKindOrThrow('PropertyAssignment');

        const importsText = importsProperty.getInitializerOrThrow().getText();
        expect(importsText).toContain('MatPaginatorModule');
        expect(importsText).toContain('MatSortModule');
    });

    /**
     * Verifies that the `<mat-paginator>` component and the `matSort` directive are present in the HTML template.
     */
    it('should generate mat-paginator and matSort directive in the HTML', () => {
        expect(html).toContain('<mat-paginator');
        expect(html).toContain('<table mat-table matSort');
    });

    /**
     * Verifies that `@ViewChild` decorators are generated in the component class to get references
     * to the `MatPaginator` and `MatSort` instances.
     */
    it('should generate @ViewChild properties for the paginator and sorter', () => {
        const paginatorProp = listClass.getProperty('paginator');
        const sortProp = listClass.getProperty('sorter');

        expect(paginatorProp).toBeDefined();
        expect(paginatorProp?.getDecorator('ViewChild')?.getArguments()[0].getText()).toBe('MatPaginator');

        expect(sortProp).toBeDefined();
        expect(sortProp?.getDecorator('ViewChild')?.getArguments()[0].getText()).toBe('MatSort');
    });

    /**
     * Verifies that the `ngAfterViewInit` lifecycle hook is implemented and contains the `merge`
     * logic to subscribe to both paginator and sort events, triggering a data reload.
     */
    it('should implement ngAfterViewInit with merge logic to handle events', () => {
        const ngAfterViewInitMethod = listClass.getMethod('ngAfterViewInit');
        expect(ngAfterViewInitMethod).toBeDefined();

        const methodBody = ngAfterViewInitMethod?.getBodyText() ?? '';
        expect(methodBody).toContain('merge(this.sorter.sortChange, this.paginator.page)');
        expect(methodBody).toContain('.subscribe(() => this.loadData())');
    });

    /**
     * Verifies that the main data loading method (`loadData`) is updated to pass the current
     * pagination and sorting state to the service method.
     */
    it('should update loadData to pass pagination and sorting params to the service', () => {
        const loadDataMethod = listClass.getMethodOrThrow('loadData');
        const methodBody = loadDataMethod.getBodyText() ?? '';

        expect(methodBody).toContain('this.productsService.getProducts({');
        expect(methodBody).toContain('_page: this.paginator.pageIndex + 1');
        expect(methodBody).toContain('_limit: this.paginator.pageSize');
        expect(methodBody).toContain('_sort: this.sorter.active');
        expect(methodBody).toContain('_order: this.sorter.direction');
    });

    /**
     * Verifies that the `loadData` method includes logic to parse the `X-Total-Count` header
     * from the HTTP response to update the paginator's total length.
     */
    it('should parse the X-Total-Count header from the response', () => {
        const loadDataMethod = listClass.getMethodOrThrow('loadData');
        const methodBody = loadDataMethod.getBodyText() ?? '';
        const subscribeBlock = loadDataMethod.getDescendants().find(d => d.getText() === '.subscribe((response) => {');
        const subscribeBody = subscribeBlock?.getParentIfKind('ArrowFunction')?.getBodyText() ?? '';

        expect(subscribeBody).toContain('observe: \'response\'');
        expect(subscribeBody).toContain(`const totalCount = response.headers.get('X-Total-Count');`);
        expect(subscribeBody).toContain('this.totalItems = totalCount ? +totalCount : 0;');
    });
});
