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
    });

    describe('Full Resource Generation (Books)', () => {
        let listComponent: ClassDeclaration;
        let formComponent: ClassDeclaration;
        let routingFile: SourceFile;

        beforeAll(() => {
            listComponent = bookStoreProject.getSourceFileOrThrow('/generated/admin/books/books-list/books-list.component.ts').getClassOrThrow('BooksListComponent');
            formComponent = bookStoreProject.getSourceFileOrThrow('/generated/admin/books/books-form/books-form.component.ts').getClassOrThrow('BooksFormComponent');
            routingFile = bookStoreProject.getSourceFileOrThrow('/generated/admin/books/books.routes.ts');
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
            const constructorBody = formComponent.getConstructors()[0].getBodyText()!;
            expect(formComponent.getProperty('id')?.getInitializer()?.getText()).toContain('input<string | null>');
            expect(constructorBody).toContain('effect(() =>');
            expect(constructorBody).toContain('const id = this.id()');
            expect(constructorBody).toContain('this.booksService.getBookById(id).subscribe');
            expect(constructorBody).toContain('this.form.patchValue(entity)'); // Now uses patchValue directly
        });

        it('form component should handle onSubmit with create and update calls correctly', () => {
            const onSubmitBody = formComponent.getMethodOrThrow('onSubmit').getBodyText()!;

            expect(onSubmitBody).toContain('const action$ = this.isEditMode()');
            expect(onSubmitBody).toContain(`? this.${camelCase(resource.name)}Service.update${resource.modelName}(this.id()!, this.form.value)`);
            expect(onSubmitBody).toContain(`: this.${camelCase(resource.name)}Service.create${resource.modelName}(this.form.value);`);
            expect(onSubmitBody).toContain('action$.subscribe(() => this.onCancel());');

            expect(formComponent.getMethod('createItem')).toBeUndefined();
            expect(formComponent.getMethod('updateItem')).toBeUndefined();
        });

        it('routing module should have correct paths', () => {
            const routesVar = routingFile.getVariableDeclarationOrThrow('routes');
            const routesText = routesVar.getInitializerOrThrow().getText();
            expect(routesText).toContain(`path: ''`); // List route
            expect(routesText).toContain(`path: 'create'`); // Create route
            expect(routesText).toContain(`path: 'edit/:id'`); // Edit route
        });
    });

    describe('Master Routing and Edge Cases', () => {
        it('should generate master admin routes with a default redirect', () => {
            const masterRoutesFile = bookStoreProject.getSourceFileOrThrow('/generated/admin/admin.routes.ts');
            const routesText = masterRoutesFile.getVariableDeclarationOrThrow('routes').getInitializerOrThrow().getText();
            expect(routesText).toContain(`path: '', pathMatch: 'full', redirectTo: 'books'`);
            expect(routesText).toContain(`path: 'books', loadChildren: () => import('./books/books.routes')`);
        });

        it('should generate create-only routes correctly (Publishers)', () => {
            const publisherRoutesFile = bookStoreProject.getSourceFileOrThrow('/generated/admin/publishers/publishers.routes.ts');
            const routesText = publisherRoutesFile.getVariableDeclarationOrThrow('routes').getInitializerOrThrow().getText();
            expect(routesText).not.toContain(`path: ''`); // No list route
            expect(routesText).toContain(`path: 'create'`);
            expect(routesText).not.toContain(`path: 'edit/:id'`); // No edit route
        });
    });

    describe('Actions and Read-Only Views', () => {
        it('should generate correct service calls for collection and item actions (Servers)', () => {
            const listComponent = bookStoreProject.getSourceFileOrThrow('/generated/admin/servers/servers-list/servers-list.component.ts').getClassOrThrow('ServersListComponent');
            const listBody = listComponent.getMethodOrThrow('rebootAllServers').getBodyText()!;
            const itemBody = listComponent.getMethodOrThrow('rebootServer').getBodyText()!;

            expect(listBody).toContain('rebootAllServers().subscribe()');
            expect(itemBody).toContain('rebootServer(id).subscribe()');
        });

        it('should generate a read-only view for Logs', () => {
            const logRoutesFile = fullE2EProject.getSourceFileOrThrow('/generated/admin/log/log.routes.ts');
            const logListComponent = fullE2EProject.getSourceFileOrThrow('/generated/admin/log/log-list/log-list.component.ts').getClassOrThrow('LogListComponent');
            const routesText = logRoutesFile.getVariableDeclarationOrThrow('routes').getInitializerOrThrow().getText();

            expect(routesText).toContain(`path: ''`);
            expect(routesText).not.toContain(`'create'`);
            expect(routesText).not.toContain(`'edit/:id'`);

            expect(logListComponent.getMethod('deleteItem')).toBeUndefined();
            expect(logListComponent.getMethod('onCreate')).toBeUndefined();
        });
    });
});
