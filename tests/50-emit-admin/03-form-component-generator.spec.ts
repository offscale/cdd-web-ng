import { beforeAll, describe, expect, it } from 'vitest';
import { FormComponentGenerator } from '@src/generators/angular/admin/form-component.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { ClassDeclaration, Project } from 'ts-morph';
import { createTestProject } from '../shared/helpers.js';
import { adminFormSpec, coverageSpec } from '../shared/specs.js';
import { discoverAdminResources } from '@src/service/emit/admin/resource-discovery.js';

describe('Generators (Angular): FormComponentGenerator', () => {
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

        it('should correctly report if custom validators are used', () => {
            const project = createTestProject();
            const parser = new SwaggerParser(adminFormSpec as any, { options: { admin: true } } as any);
            const resource = discoverAdminResources(parser).find(r => r.name === 'widgets')!;
            const formGen = new FormComponentGenerator(project, parser);

            const result = formGen.generate(resource, '/admin');
            // The 'widgets' resource in adminFormSpec uses 'exclusiveMinimum', which requires CustomValidators.
            expect(result.usesCustomValidators).toBe(true);
        });

        it('should generate update-only logic in onSubmit when no create op exists', async () => {
            await run(coverageSpec); // Use a spec with a resource that only has update
            const configsFormClass = project.getSourceFileOrThrow(`/admin/configs/configs-form/configs-form.component.ts`).getClassOrThrow('ConfigFormComponent');
            const submitMethod = configsFormClass.getMethod('onSubmit');
            const body = submitMethod!.getBodyText() ?? '';
            expect(body).toContain(`if (!this.isEditMode())`);
            expect(body).toContain('const action$ = this.configsService.updateConfig(this.id()!, finalPayload);');
            expect(body).not.toContain('const action$ = this.isEditMode()');
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
            expect(html).toContain('formArrayName="arrayObject"');
            expect(html).not.toContain('unknownType'); // Should be skipped
        });

        it('should generate correct HTML error messages for all validators', () => {
            expect(html).toContain("form.get('boundedNumber')?.hasError('max')");
            expect(html).toContain("form.get('boundedNumber')?.hasError('pattern')");
            expect(html).toContain("form.get('boundedArray')?.hasError('minlength')");
        });

        it('should not generate controls for readOnly properties inside nested objects/arrays', () => {
            // Case 1: Nested object (formGroupName="config")
            const configGroupHtml = html.match(/<div[^>]*formGroupName="config"[\s\S]*?<\/div>/)?.[0] ?? '';
            expect(configGroupHtml).toContain('formControlName="key"');
            expect(configGroupHtml).not.toContain('formControlName="readOnlyKey"');

            // Case 2: Array of objects (formArrayName="items")
            const itemsArrayHtml = html.match(/<div[^>]*formArrayName="items"[\s\S]*?<\/div>/)?.[0] ?? '';
            expect(itemsArrayHtml).toContain('formControlName="name"');
            expect(itemsArrayHtml).toContain('formControlName="value"');
            expect(itemsArrayHtml).not.toContain('formControlName="readOnlyVal"');
        });
    });
});
