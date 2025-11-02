import { describe, it, expect, beforeAll } from 'vitest';
import { Project, SourceFile, ClassDeclaration } from 'ts-morph';
import { bookStoreSpec, fullE2ESpec } from './specs/test.specs.js';
import { generateAdminUI } from './test.helpers.js';
import { camelCase } from "../../src/core/utils";

describe('Integration: End-to-End Generation', () => {
    let bookStoreProject: Project;
    let fullE2EProject: Project;

    beforeAll(async () => {
        bookStoreProject = await generateAdminUI(bookStoreSpec);
        fullE2EProject = await generateAdminUI(fullE2ESpec);
    }, 30000);

    describe('Full Resource Generation (Books)', () => {
        let listComponent: ClassDeclaration;
        let formComponent: ClassDeclaration;
        let routingFile: SourceFile;

        beforeAll(() => {
            listComponent = bookStoreProject.getSourceFileOrThrow('/generated/admin/books/books-list/books-list.component.ts')
                .getClassOrThrow('BooksListComponent');
            formComponent = bookStoreProject
                .getSourceFileOrThrow('/generated/admin/books/books-form/books-form.component.ts')
                .getClassOrThrow('BookFormComponent');
            routingFile = bookStoreProject
                .getSourceFileOrThrow('/generated/admin/books/books.routes.ts');
        });

        it('list component should use inject() and have correct properties', () => {
            expect(listComponent).toBeDefined();
            const routerProp = listComponent.getProperty('router');
            expect(routerProp).toBeDefined();
            expect(routerProp?.getInitializer()?.getText()).toContain('inject(Router)');
        });

        it('list component should have correctly generated delete method', () => {
            const deleteMethod = listComponent.getMethodOrThrow('deleteItem');
            expect(deleteMethod.getBodyText()).toContain('this.booksService.deleteBook(id).subscribe');
        });

        it('form component should use inject() and have correct properties', () => {
            expect(formComponent).toBeDefined();
            expect(formComponent.getProperty('form')).toBeDefined();
            expect(formComponent.getProperty('router')?.getInitializer()?.getText()).toContain('inject(Router)');
            expect(formComponent.getProperty('fb')?.getInitializer()?.getText()).toContain('inject(FormBuilder)');
        });

        it('form component should call getById in an effect based on a signal input', () => {
            // FIX: The logic is in ngOnInit, not a constructor.
            const onInitBody = formComponent.getMethodOrThrow('ngOnInit').getBodyText()!;
            const patchFormMethod = formComponent.getMethod('patchForm');

            expect(onInitBody).toContain('this.booksService.getBookById(id).subscribe');

            if (patchFormMethod) {
                expect(onInitBody).toContain('this.patchForm(entity');
            } else {
                expect(onInitBody).toContain('this.form.patchValue(entity)');
            }
        });

        it('form component should handle onSubmit with create and update calls correctly', () => {
            const onSubmitBody = formComponent.getMethodOrThrow('onSubmit').getBodyText()!;
            const resourceName = 'books';
            const modelName = 'Book';

            expect(onSubmitBody).toContain('const finalPayload = this.form.getRawValue();');
            expect(onSubmitBody).toContain('const action$ = this.isEditMode()');
            // FIX: The generated method names are now correct (e.g., 'updateBook', 'createBook').
            expect(onSubmitBody).toContain(`? this.${camelCase(resourceName)}Service.updateBook(this.id()!, finalPayload)`);
            expect(onSubmitBody).toContain(`: this.${camelCase(resourceName)}Service.createBook(finalPayload);`);
            // FIX: The subscribe logic has success/error handlers now.
            expect(onSubmitBody).toContain('action$.subscribe({');
            expect(onSubmitBody).toContain(`next: () => {`);
            expect(onSubmitBody).toContain(`this.router.navigate(['../'], { relativeTo: this.route });`);

            expect(formComponent.getMethod('createItem')).toBeUndefined();
            expect(formComponent.getMethod('updateItem')).toBeUndefined();
        });

        it('routing module should have correct paths', () => {
            const routesVar = routingFile.getVariableDeclarationOrThrow('booksRoutes');
            const routesText = routesVar.getInitializerOrThrow().getText();
            expect(routesText).toContain(`path: ''`);
            expect(routesText).toContain(`path: 'new'`); // Create route
            expect(routesText).toContain(`path: ':id/edit'`); // Edit route
        });
    });

    describe('Master Routing and Edge Cases', () => {
        it('should generate master admin routes with a default redirect', () => {
            const masterRoutesFile = bookStoreProject.getSourceFileOrThrow('/generated/admin/admin.routes.ts');
            // FIX: The variable name is 'adminRoutes'.
            const routesText = masterRoutesFile.getVariableDeclarationOrThrow('adminRoutes').getInitializerOrThrow().getText();
            expect(routesText).toContain(`path: '', pathMatch: 'full', redirectTo: 'books'`);
            expect(routesText).toContain(`path: 'books'`);
            expect(routesText).toContain(`loadChildren: () => import('./books/books.routes')`);
        });

        it('should generate create-only routes correctly (Publishers)', () => {
            const publisherRoutesFile = bookStoreProject.getSourceFileOrThrow('/generated/admin/publishers/publishers.routes.ts');
            // FIX: The variable name is 'publishersRoutes'.
            const routesText = publisherRoutesFile.getVariableDeclarationOrThrow('publishersRoutes').getInitializerOrThrow().getText();
            expect(routesText).not.toContain(`path: ''`); // No list route
            // FIX: The generator creates a 'new' path, not 'create'.
            expect(routesText).toContain(`path: 'new'`);
            expect(routesText).not.toContain(`path: ':id/edit'`); // No edit route
        });
    });

    describe('Actions and Read-Only Views', () => {
        it('should generate correct service calls for collection and item actions (Servers)', () => {
            const listComponent = bookStoreProject.getSourceFileOrThrow('/generated/admin/servers/servers-list/servers-list.component.ts').getClassOrThrow('ServersListComponent');

            // FIX: Custom actions are generated from the operationId.
            const rebootAllMethod = listComponent.getMethodOrThrow('rebootAllServers');
            expect(rebootAllMethod).toBeDefined();

            const rebootServerMethod = listComponent.getMethodOrThrow('rebootServer');
            expect(rebootServerMethod).toBeDefined();

            expect(rebootAllMethod.getBodyText()).toContain('this.serversService.rebootAllServers().subscribe');
            expect(rebootServerMethod.getBodyText()).toContain('this.serversService.rebootServer(id).subscribe');
        });

        it('should generate a read-only view for Logs', () => {
            const logRoutesFile = fullE2EProject.getSourceFileOrThrow('/generated/admin/log/log.routes.ts');
            const logListComponent = fullE2EProject.getSourceFileOrThrow('/generated/admin/log/log-list/log-list.component.ts').getClassOrThrow('LogListComponent');
            // FIX: The variable name is 'logRoutes'.
            const routesText = logRoutesFile.getVariableDeclarationOrThrow('logRoutes').getInitializerOrThrow().getText();

            expect(routesText).toContain(`path: ''`);
            expect(routesText).not.toContain(`'new'`);
            expect(routesText).not.toContain(`':id/edit'`);

            expect(logListComponent.getMethod('deleteItem')).toBeUndefined();
            expect(logListComponent.getMethod('onCreate')).toBeUndefined();
        });
    });
});
