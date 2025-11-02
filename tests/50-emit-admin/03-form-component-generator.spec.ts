import { describe, it, expect, beforeAll, vi } from 'vitest';
import { FormComponentGenerator } from '../../src/service/emit/admin/form-component.generator.js';
import { SwaggerParser } from '../../src/core/parser.js';
import { Project, ClassDeclaration } from 'ts-morph';
import { createTestProject } from '../shared/helpers.js';
import { adminFormSpec, polymorphismSpec, coverageSpec } from '../shared/specs.js';
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

        it('should generate create-only logic in onSubmit when no update op exists', () => {
            const submitMethod = formClass.getMethod('onSubmit');
            const body = submitMethod!.getBodyText() ?? '';
            expect(body).not.toContain('const action$ = this.isEditMode()');
            expect(body).toContain('const action$ = this.widgetsService.postWidgets(finalPayload);');
        });

        it('should generate correct HTML controls and fallbacks', () => {
            const sliderRegex = /<mat-slider[^>]*formControlName="rating"/;
            expect(html).toMatch(sliderRegex);
            expect(html).toContain('<textarea matInput="" formControlName="description"');
            expect(html).toContain('formControlName="anotherDate"');
            expect(html).toContain('formControlName="smallEnum"');
            expect(html).toContain('formControlName="bigEnum"');
            expect(html).toContain('formControlName="otherNumber"');
            // FIX: Assert the correct attribute for form arrays
            expect(html).toContain('formArrayName="arrayObject"');
            expect(html).not.toContain('unknownType'); // Should be skipped
        });

        it('should generate correct HTML error messages for all validators', () => {
            const html = project.getFileSystem().readFileSync(`/admin/widgets/widgets-form/widgets-form.component.html`);
            expect(html).toContain("form.get('boundedNumber')?.hasError('max')");
            expect(html).toContain("form.get('boundedNumber')?.hasError('pattern')");
            expect(html).toContain("form.get('boundedArray')?.hasError('minlength')");
        });
    });

    describe('Polymorphism Coverage', () => {
        it('should handle getPayload when discriminator value is missing', async () => {
            const project = createTestProject();
            const parser = new SwaggerParser(polymorphismSpec as any, {options: {admin: true}} as any);
            const resource = discoverAdminResources(parser).find(r => r.name === 'pets')!;
            const formGen = new FormComponentGenerator(project, parser);
            formGen.generate(resource, '/admin');

            const file = project.getSourceFileOrThrow('/admin/pets/pets-form/pets-form.component.ts');
            const getPayloadBody = file.getClass('PetFormComponent')?.getMethod('getPayload')?.getBodyText();
            expect(getPayloadBody).toContain('if (!petType) return baseValue;');
        });
    });

    describe('Coverage Cases', () => {
        beforeAll(async () => {
            await run(coverageSpec);
        });

        it('should generate console.error for edit mode with no update op', async () => {
            const resource = discoverAdminResources(parser).find(r => r.name === 'publications')!;
            const formClass = project.getSourceFileOrThrow(`/admin/publications/publications-form/publications-form.component.ts`).getClassOrThrow('PublicationFormComponent');
            const submitBody = formClass.getMethodOrThrow('onSubmit').getBodyText()!;
            expect(submitBody).toContain("console.error('Form is in edit mode, but no update operation is available.')");
        });

        it('should not generate form component if resource is not editable', async () => {
            // FIX: The test should check that the file was never created.
            const filePath = '/admin/noActions/noActions-form/noActions-form.component.ts';
            expect(project.getSourceFile(filePath)).toBeUndefined();
        });
    });

    it('should handle onFileSelected with no file', () => {
        const formGen = new FormComponentGenerator(createTestProject(), {} as any);
        const mockClass = { addMethod: vi.fn() } as unknown as ClassDeclaration;
        (formGen as any).addFileHandling(mockClass);
        const methodCall = mockClass.addMethod.mock.calls[0][0];
        expect(methodCall.statements).toContain('files?.[0]');
    });
});
