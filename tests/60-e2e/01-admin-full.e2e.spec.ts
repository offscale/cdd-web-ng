import { describe, it, expect } from 'vitest';
import { Project, ClassDeclaration, SourceFile } from 'ts-morph';
import { runGenerator } from '../shared/helpers.js';
import { coverageSpec, polymorphismSpec } from '../shared/specs.js';

describe('E2E: Admin UI Generation', () => {
    let project: Project;

    // Helper to generate the admin UI and return the project
    const runAdminGen = async (spec: object) => {
        project = await runGenerator(spec, { options: { admin: true, generateServices: true, dateType: 'string', enumStyle: 'enum' } });
        return project;
    };

    describe('Full Admin Generation from `coverageSpec`', () => {
        let listComponent: ClassDeclaration;
        let formComponent: ClassDeclaration;
        let routingFile: SourceFile;

        beforeAll(async () => {
            project = await runAdminGen(coverageSpec);
            listComponent = project.getSourceFileOrThrow('/generated/admin/users/users-list/users-list.component.ts').getClass('UsersListComponent')!;
            formComponent = project.getSourceFileOrThrow('/generated/admin/users/users-form/users-form.component.ts').getClass('UserFormComponent')!;
            routingFile = project.getSourceFileOrThrow('/generated/admin/users/users.routes.ts')!;
        });

        it('should generate a fully-featured list component', () => {
            expect(listComponent).toBeDefined();
            const constructorBody = listComponent.getConstructors()[0].getBodyText() ?? '';
            expect(constructorBody).toContain('this.usersService.getUsers(');
            expect(listComponent.getMethod('onCreate')).toBeDefined();
            expect(listComponent.getMethod('onEdit')).toBeDefined();
            expect(listComponent.getMethod('onDelete')).toBeDefined();
        });

        it('should generate a fully-featured form component', () => {
            expect(formComponent).toBeDefined();
            const initFormBody = formComponent.getMethodOrThrow('initForm').getBodyText()!;
            expect(initFormBody).toContain("'name': this.fb.control(null)");
            expect(initFormBody).not.toContain("'id':"); // Should be excluded as readOnly

            const submitBody = formComponent.getMethodOrThrow('onSubmit').getBodyText()!;
            expect(submitBody).toContain('this.usersService.createUser(finalPayload)');
            expect(submitBody).toContain('this.usersService.updateUser(this.id()!, finalPayload)');
        });

        it('should generate a complete routing file for the resource', () => {
            const routesText = routingFile.getVariableDeclaration('usersRoutes')?.getInitializer()?.getText() ?? '';
            expect(routesText).toContain("path: ''"); // list
            expect(routesText).toContain("path: 'new'"); // create
            expect(routesText).toContain("path: ':id/edit'"); // edit
        });

        it('should generate a master routing file with redirects', () => {
            const masterRoutes = project.getSourceFileOrThrow('/generated/admin/admin.routes.ts').getText();
            expect(masterRoutes).toContain("redirectTo: 'users'");
            expect(masterRoutes).toContain("path: 'logs'");
            expect(masterRoutes).toContain("path: 'publications'");
        });
    });

    describe('Polymorphism E2E', () => {
        it('should correctly generate a dynamic polymorphic form', async () => {
            project = await runAdminGen(polymorphismSpec);
            const formComponent = project.getSourceFileOrThrow('/generated/admin/pets/pets-form/pets-form.component.ts')!.getClass('PetFormComponent')!;
            const html = project.getFileSystem().readFileSync('/generated/admin/pets/pets-form/pets-form.component.html');

            expect(formComponent.getProperty('discriminatorOptions')).toBeDefined();
            expect(formComponent.getMethod('updateFormForPetType')).toBeDefined();

            expect(html).toContain("@if (isPetType('cat'))");
            expect(html).toContain('formGroupName="cat"');
            expect(html).toContain('formControlName="huntingSkill"');

            expect(html).toContain("@if (isPetType('dog'))");
            expect(html).toContain('formGroupName="dog"');
            expect(html).toContain('formControlName="barkingLevel"');
        });
    });
});
