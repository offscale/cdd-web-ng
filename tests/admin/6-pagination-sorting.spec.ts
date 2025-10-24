// ./tests/admin/6-pagination-sorting.spec.ts

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
    });

    it('should add MatPaginator and MatSort modules to component imports', () => {
        const componentDecorator = listClass.getDecoratorOrThrow('Component');
        // FIX: Check the raw text of the decorator instead of trying to parse it
        const decoratorText = componentDecorator.getText();
        expect(decoratorText).toContain('imports: [MatPaginatorModule, MatSortModule]');
    });

    it('should generate mat-paginator and matSort directive in the HTML', () => {
        expect(html).toContain('<mat-paginator');
        expect(html).toContain('<table mat-table matSort');
    });

    it('should generate @ViewChild properties for the paginator and sorter', () => {
        const paginatorProp = listClass.getProperty('paginator');
        const sortProp = listClass.getProperty('sorter');

        expect(paginatorProp).toBeDefined();
        expect(paginatorProp?.getDecorator('ViewChild')?.getArguments()[0].getText()).toBe('MatPaginator');

        expect(sortProp).toBeDefined();
        expect(sortProp?.getDecorator('ViewChild')?.getArguments()[0].getText()).toBe('MatSort');
    });

    it('should implement ngAfterViewInit with merge logic to handle events', () => {
        const ngAfterViewInitMethod = listClass.getMethod('ngAfterViewInit');
        expect(ngAfterViewInitMethod).toBeDefined();
        const methodBody = ngAfterViewInitMethod?.getBodyText() ?? '';
        expect(methodBody).toContain('merge(this.sorter.sortChange, this.paginator.page)');
        expect(methodBody).toContain('.subscribe(() => this.loadData())');
    });

    it('should update loadData to pass pagination and sorting params to the service', () => {
        const loadDataMethod = listClass.getMethodOrThrow('loadData');
        const methodBody = loadDataMethod.getBodyText() ?? '';
        expect(methodBody).toContain('this.productsService.getProducts({');
        // FIX: Allow for optional chaining with `?.`
        expect(methodBody).toMatch(/_page:\s*this\.paginator\?\.pageIndex\s*\+\s*1/);
        expect(methodBody).toMatch(/_limit:\s*this\.paginator\?\.pageSize/);
        expect(methodBody).toMatch(/_sort:\s*this\.sorter\?\.active/);
        expect(methodBody).toMatch(/_order:\s*this\.sorter\?\.direction/);
    });

    it('should parse the X-Total-Count header from the response', () => {
        const loadDataMethod = listClass.getMethodOrThrow('loadData');
        // FIX: The logic is now directly in the method body, so check that instead.
        const methodBody = loadDataMethod.getBodyText() ?? '';
        expect(methodBody).toContain(`observe: 'response'`);
        expect(methodBody).toContain(`const totalCount = response.headers.get('X-Total-Count');`);
        expect(methodBody).toContain('this.totalItems = totalCount ? +totalCount : 0;');
    });
});
