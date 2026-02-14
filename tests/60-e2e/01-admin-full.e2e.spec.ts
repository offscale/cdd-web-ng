import { beforeAll, describe, expect, it } from 'vitest';
import { ClassDeclaration, Project, SourceFile } from 'ts-morph';
import { runGenerator } from '../shared/helpers.js';
import { coverageSpec, polymorphismSpec } from '../shared/specs.js';

describe('E2E: Admin UI Generation', () => {
    let project: Project;

    // Helper to generate the admin UI and return the project
    const runAdminGen = async (spec: object) => {
        project = await runGenerator(spec, {
            options: {
                admin: true,
                generateServices: true,
                dateType: 'string',
                enumStyle: 'enum',
            } as any,
        });
        return project;
    };

    describe('Full Admin Generation from `coverageSpec`', () => {
        let listComponent: ClassDeclaration;
        let formComponent: ClassDeclaration;
        let routingFile: SourceFile;

        beforeAll(async () => {
            project = await runAdminGen(coverageSpec);
            listComponent = project
                .getSourceFileOrThrow('/generated/admin/users/users-list/users-list.component.ts')
                .getClass('UsersListComponent')!;
            formComponent = project
                .getSourceFileOrThrow('/generated/admin/users/users-form/users-form.component.ts')
                .getClass('UserFormComponent')!;
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

            expect(initFormBody).toContain("'name': new FormControl<string | null>(null)");

            // readOnly properties (like 'id' in coverageSpec) should now be included but disabled
            expect(initFormBody).toContain("'id':");
            expect(initFormBody).toContain("this.form.get('id')?.disable");

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
            const formComponent = project
                .getSourceFileOrThrow('/generated/admin/pets/pets-form/pets-form.component.ts')!
                .getClass('PetFormComponent')!;
            const html = project
                .getFileSystem()
                .readFileSync('/generated/admin/pets/pets-form/pets-form.component.html');

            // Check for generated Option properties
            expect(formComponent.getProperty('petTypeOptions')).toBeDefined();
            expect(formComponent.getMethod('updateFormForPetType')).toBeDefined();

            // Check HTML structural logic
            // Uses isPetType('val') to check the selected type
            expect(html).toContain("@if (isPetType('cat'))");

            // Check usage of specific named wrappers
            expect(html).toContain('formGroupName="cat"');
            expect(html).toContain('formControlName="huntingSkill"');

            expect(html).toContain("@if (isPetType('dog'))");
            expect(html).toContain('formGroupName="dog"');
            expect(html).toContain('formControlName="barkingLevel"');

            expect(html).toContain("@if (isPetType('lizard'))");
            expect(html).toContain('formGroupName="lizard"');
            expect(html).toContain('formControlName="name"'); // from BasePet
            expect(html).not.toContain('formControlName="unsupportedField"');
        });
    });

    describe('Polymorphism E2E with Bad Refs', () => {
        it('should generate a form that gracefully handles unresolvable allOf refs', async () => {
            const specWithBadRef = {
                ...polymorphismSpec,
                paths: {
                    ...polymorphismSpec.paths,
                    '/bad-pets': {
                        post: {
                            tags: ['BadPets'],
                            requestBody: {
                                content: { 'application/json': { schema: { $ref: '#/components/schemas/BadPet' } } },
                            },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
                components: {
                    ...polymorphismSpec.components,
                    schemas: {
                        ...polymorphismSpec.components.schemas,
                        BadPet: {
                            type: 'object',
                            oneOf: [{ $ref: '#/components/schemas/BadCat' }],
                            discriminator: { propertyName: 'petType' },
                            properties: { petType: { type: 'string' } },
                            required: ['petType'],
                        },
                        BadCat: {
                            type: 'object',
                            allOf: [
                                { $ref: '#/components/schemas/BasePet' }, // This one is good
                                { $ref: '#/components/schemas/NonExistentSchema' }, // This one is bad
                            ],
                            properties: { petType: { type: 'string', enum: ['badcat'] } },
                        },
                    },
                },
            };
            project = await runAdminGen(specWithBadRef);
            const html = project
                .getFileSystem()
                .readFileSync('/generated/admin/badPets/badPets-form/badPets-form.component.html');

            expect(html).toBeDefined();
            expect(html).toContain('formControlName="name"');
        });
    });
});
