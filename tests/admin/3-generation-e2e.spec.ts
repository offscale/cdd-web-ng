/**
 * @fileoverview
 * This test suite provides end-to-end validation of the admin UI generation process.
 * It moves beyond individual controls and structures to verify that complete, functional
 * component sets (list, form, routing) are generated correctly for various resource types.
 * It checks for proper class structure, service method calls, routing configuration,
 * and the handling of different resource patterns like CRUD, create-only, and read-only.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Project, IndentationText, SourceFile, ClassDeclaration, ScriptTarget, ModuleKind } from 'ts-morph';
import { generateFromConfig } from '../../src/index.js';
import { GeneratorConfig } from '../../src/core/types.js';
import { bookStoreSpec, fullE2ESpec } from './specs/test.specs.js';

/**
 * A helper function to run the generator on a given spec and return the ts-morph `Project` instance.
 * @param specString The OpenAPI specification as a JSON string.
 * @returns A promise that resolves to the `Project` instance containing all generated files.
 */
async function generateProject(specString: string): Promise<Project> {
    const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: { indentationText: IndentationText.TwoSpaces },
    compilerOptions: {
        target: ScriptTarget.ESNext,
        module: ModuleKind.ESNext,
        moduleResolution: 99, // NodeNext
        lib: ["ES2022", "DOM"],
        strict: true,
        esModuleInterop: true,
        allowArbitraryExtensions: true, // Crucial for `.js` imports in NodeNext
        resolveJsonModule: true
    }
});

    const config: GeneratorConfig = {
        input: 'spec.json',
        output: './generated',
        options: {
            dateType: 'string',
            enumStyle: 'enum',
            generateServices: true,
            admin: true
        }
    };

    project.createSourceFile('./spec.json', specString);
    await generateFromConfig(config, project);
    return project;
}

/**
 * Main test suite for end-to-end admin UI generation.
 */
describe('Integration: End-to-End Generation', () => {
    let bookStoreProject: Project;
    let fullE2EProject: Project;

    /**
     * Runs the code generator for two different specs before all tests to have the
     * results available for various test cases.
     */
    beforeAll(async () => {
        bookStoreProject = await generateProject(bookStoreSpec);
        fullE2EProject = await generateProject(fullE2ESpec);
    });

    /**
     * Test suite for a full CRUD resource ('Books').
     */
    describe('Full Resource Generation (Books)', () => {
        let listComponent: ClassDeclaration;
        let formComponent: ClassDeclaration;
        let routingFile: SourceFile;

        beforeAll(() => {
            listComponent = bookStoreProject.getSourceFileOrThrow('generated/admin/books/books-list/books-list.component.ts').getClassOrThrow('BooksListComponent');
            formComponent = bookStoreProject.getSourceFileOrThrow('generated/admin/books/books-form/books-form.component.ts').getClassOrThrow('BooksFormComponent');
            routingFile = bookStoreProject.getSourceFileOrThrow('generated/admin/books/books.routes.ts');
        });

        it('list component should have correct imports and class structure', () => {
            expect(listComponent).toBeDefined();
            expect(listComponent.getImplements().some(i => i.getText().includes('OnInit'))).toBe(true);
            expect(listComponent.getProperty('booksService')).toBeDefined();
            expect(listComponent.getProperty('router')).toBeDefined();
        });

        it('list component should have correctly generated delete method', () => {
            const deleteMethod = listComponent.getMethodOrThrow('deleteItem');
            expect(deleteMethod.getBodyText()).toContain('this.booksService.deleteBook(id).subscribe');
        });

        it('form component should have correct imports and class structure', () => {
            expect(formComponent).toBeDefined();
            expect(formComponent.getProperty('form')).toBeDefined();
            expect(formComponent.getProperty('route')).toBeDefined();
            expect(formComponent.getProperty('booksService')).toBeDefined();
        });

        it('form component should call getById with correct casting in its effect', () => {
            const constructorBody = formComponent.getConstructors()[0].getBodyText();
            // Check that the service call to get the entity by its ID is present
            expect(constructorBody).toContain('this.booksService.getBookById(id)');
            // Check that received data is cast to the correct type for `patchForm`
            expect(constructorBody).toContain('this.patchForm(entity as Book)');
        });

        it('form component should handle onSubmit with create and update calls correctly', () => {
            const onSubmitBody = formComponent.getMethodOrThrow('onSubmit').getBodyText();
            expect(onSubmitBody).toContain('this.isEditMode() ? this.updateItem() : this.createItem()');

            const createMethodBody = formComponent.getMethodOrThrow('createItem').getBodyText();
            expect(createMethodBody).toContain('this.booksService.createBook(this.form.value)');

            const updateMethodBody = formComponent.getMethodOrThrow('updateItem').getBodyText();
            expect(updateMethodBody).toContain('this.booksService.updateBook(this.id(), this.form.value)');
        });

        it('routing module should have correct paths', () => {
            const routesVar = routingFile.getVariableDeclarationOrThrow('routes');
            const routesText = routesVar.getInitializerOrThrow().getText();
            expect(routesText).toContain(`path: ''`); // List route
            expect(routesText).toContain(`path: 'create'`); // Create route
            expect(routesText).toContain(`path: 'edit/:id'`); // Edit route
        });
    });

    /**
     * Test suite for the master routing file and edge cases like create-only resources.
     */
    describe('Master Routing and Edge Cases', () => {
        it('should generate master admin routes with a default redirect', () => {
            const masterRoutesFile = bookStoreProject.getSourceFileOrThrow('generated/admin/admin.routes.ts');
            const routesText = masterRoutesFile.getVariableDeclarationOrThrow('routes').getInitializerOrThrow().getText();
            expect(routesText).toContain(`path: '', pathMatch: 'full', redirectTo: 'books'`);
            expect(routesText).toContain(`path: 'books', loadChildren: () => import('./books/books.routes')`);
        });

        it('should generate create-only routes correctly (Publishers)', () => {
            const publisherRoutesFile = bookStoreProject.getSourceFileOrThrow('generated/admin/publishers/publishers.routes.ts');
            const routesText = publisherRoutesFile.getVariableDeclarationOrThrow('routes').getInitializerOrThrow().getText();
            expect(routesText).not.toContain(`path: ''`); // No list route
            expect(routesText).toContain(`path: 'create'`);
            expect(routesText).not.toContain(`path: 'edit/:id'`); // No edit route
        });
    });

    /**
     * Test suite for custom actions and read-only views.
     */
    describe('Actions and Read-Only Views', () => {
        it('should generate correct service calls for collection and item actions (Servers)', () => {
            const listComponent = bookStoreProject.getSourceFileOrThrow('generated/admin/servers/servers-list/servers-list.component.ts').getClassOrThrow('ServersListComponent');
            const listBody = listComponent.getMethodOrThrow('rebootAllServers').getBodyText();
            const itemBody = listComponent.getMethodOrThrow('rebootServer').getBodyText();

            expect(listBody).toContain('this.serversService.rebootAllServers()');
            expect(itemBody).toContain('this.serversService.rebootServer(id)');
        });

        it('should generate a read-only view for Logs', () => {
            const logRoutesFile = fullE2EProject.getSourceFileOrThrow('generated/admin/log/log.routes.ts');
            const logListComponent = fullE2EProject.getSourceFileOrThrow('generated/admin/log/log-list/log-list.component.ts');
            const routesText = logRoutesFile.getVariableDeclarationOrThrow('routes').getInitializerOrThrow().getText();

            // Should only have a list view
            expect(routesText).toContain(`path: ''`);
            expect(routesText).not.toContain(`path: 'create'`);
            expect(routesText).not.toContain(`path: 'edit/:id'`);

            // List component should not have create/edit/delete functionality
            expect(logListComponent.getMethod('deleteItem')).toBeUndefined();
            expect(logListComponent.getMethod('createItem')).toBeUndefined();
        });
    });
});
