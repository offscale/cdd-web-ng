import { describe, it, expect } from 'vitest';
import { FormComponentGenerator } from '../../src/service/emit/admin/form-component.generator.js';
import { SwaggerParser } from '../../src/core/parser.js';
import { Project, ClassDeclaration } from 'ts-morph';
import { createTestProject } from '../shared/helpers.js';
import { adminFormSpec, polymorphismSpec } from '../shared/specs.js';
import { discoverAdminResources } from '../../src/service/emit/admin/resource-discovery.js';

describe('Admin: FormComponentGenerator', () => {
    let project: Project;
    let parser: SwaggerParser;

    const run = async (spec: object) => {
        project = createTestProject();
        parser = new SwaggerParser(spec as any, { options: { admin: true } } as any);
        const resources = discoverAdminResources(parser);
        const formGen = new FormComponentGenerator(project, parser);

        for (const resource of resources) {
            if (resource.isEditable) {
                formGen.generate(resource, '/admin');
            }
        }
    };

    describe('Standard Form Generation', () => {
        let formClass: ClassDeclaration;
        let html: string;

        beforeAll(async () => {
            await run(adminFormSpec);
            const resource = discoverAdminResources(parser).find(r => r.name === 'widgets')!;
            formClass = project.getSourceFileOrThrow(`/admin/${resource.name}/${resource.name}-form/${resource.name}-form.component.ts`).getClassOrThrow('WidgetFormComponent');
            html = project.getFileSystem().readFileSync(`/admin/${resource.name}/${resource.name}-form/${resource.name}-form.component.html`);
        });

        it('should generate correct files', () => {
            expect(formClass).toBeDefined();
            expect(html).toBeDefined();
            expect(project.getFileSystem().readFileSync(`/admin/widgets/widgets-form/widgets-form.component.scss`)).toBeDefined();
        });

        it('should generate properties for all enums', () => {
            expect(formClass.getProperty('StatusOptions')).toBeDefined();
            expect(formClass.getProperty('PriorityOptions')).toBeDefined();
            expect(formClass.getProperty('CategoriesOptions')).toBeDefined();
        });

        it('should generate form array helpers', () => {
            expect(formClass.getGetAccessor('itemsArray')).toBeDefined();
            expect(formClass.getMethod('addItem')).toBeDefined();
        });

        it('should generate file handling methods', () => {
            expect(formClass.getMethod('onFileSelected')).toBeDefined();
        });

        it('should generate patch logic for complex types', () => {
            const patchMethod = formClass.getMethodOrThrow('patchForm');
            expect(patchMethod.getBodyText()).toContain('entity.items.forEach');
        });

        it('should generate create-only logic in onSubmit when no update op exists', () => {
            const submitMethod = formClass.getMethod('onSubmit');
            const body = submitMethod!.getBodyText() ?? '';
            // This spec has no update operation, so it should NOT have the ternary
            expect(body).not.toContain('const action$ = this.isEditMode()');
            expect(body).toContain('const action$ = this.widgetsService.postWidgets(finalPayload);');
        });
    });

    describe('Polymorphism Form Generation', () => {
        let formClass: ClassDeclaration;

        beforeAll(async () => {
            await run(polymorphismSpec);
            const resource = discoverAdminResources(parser).find(r => r.name === 'pets')!;
            formClass = project.getSourceFileOrThrow(`/admin/${resource.name}/${resource.name}-form/${resource.name}-form.component.ts`).getClassOrThrow('PetFormComponent');
        }, 15000);

        it('should generate discriminator properties and an effect', () => {
            expect(formClass.getProperty('discriminatorOptions')).toBeDefined();
            const constructorBody = formClass.getConstructors()[0]?.getBodyText() ?? '';
            expect(constructorBody).toContain('effect(() => {');
        });

        it('should generate methods to update form, check type, and get payload', () => {
            expect(formClass.getMethod('updateFormForPetType')).toBeDefined();
            expect(formClass.getMethod('isPetType')).toBeDefined();
            expect(formClass.getMethod('getPayload')).toBeDefined();
        });

        it('should generate type guard helpers for patching', () => {
            expect(formClass.getMethod('isCat')).toBeDefined();
            expect(formClass.getMethod('isDog')).toBeDefined();
        });
    });

    it('should handle array of primitives without crashing', async () => {
        await run(adminFormSpec);
        const html = project.getFileSystem().readFileSync('/admin/widgets/widgets-form/widgets-form.component.html');
        expect(html).toContain('formControlName="primitiveArray"');
        expect(html).toContain('mat-chip-grid');
    });
});
