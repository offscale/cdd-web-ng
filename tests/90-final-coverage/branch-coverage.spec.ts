import { describe, expect, it, vi } from 'vitest';
import { SwaggerParser } from '@src/core/parser.js';
import { createTestProject, runGeneratorWithConfig } from '../shared/helpers.js';
import { branchCoverageSpec, coverageSpec } from '../shared/specs.js';
import { Resource } from '@src/core/types.js';
import { discoverAdminResources } from '@src/service/emit/admin/resource-discovery.js';
import { ListComponentGenerator } from "@src/generators/angular/admin/list-component.generator.js";
import { AdminGenerator } from "@src/generators/angular/admin/admin.generator.js";

describe('Final Branch Coverage Tests', () => {

    it('resource-discovery should use "Default" for root path', () => {
        const parser = new SwaggerParser(branchCoverageSpec as any, { options: { admin: true } } as any);
        const resources = discoverAdminResources(parser);
        const resource = resources.find((r: Resource) => r.name === 'default');
        expect(resource).toBeDefined();
        expect(resource!.operations[0].operationId).toBe('getRoot');
    });

    it('resource-discovery getModelName should use fallback when no schema is present', () => {
        const parser = new SwaggerParser(branchCoverageSpec as any, { options: { admin: true } } as any);
        const resources = discoverAdminResources(parser);
        const resource = resources.find((r: Resource) => r.name === 'noSchemaResource');
        expect(resource).toBeDefined();
        expect(resource!.modelName).toBe('NoSchemaResource');
    });

    it('resource-discovery should correctly classify complex custom action names', () => {
        const parser = new SwaggerParser(branchCoverageSpec as any, { options: { admin: true } } as any);
        const resources = discoverAdminResources(parser);
        const resource = resources.find((r: Resource) => r.name === 'multiPath');
        expect(resource).toBeDefined();
        expect(resource!.operations[0].action).toBe('multiPathComplexAction');
    });

    it('resource-discovery should not classify a custom action "addItem" as "create"', () => {
        const parser = new SwaggerParser(branchCoverageSpec as any, { options: { admin: true } } as any);
        const resources = discoverAdminResources(parser);
        const widgetResource = resources.find((r: Resource) => r.name === 'widgets')!;
        const addItemOp = widgetResource.operations.find(op => op.operationId === 'addItemToWidget')!;
        // This is a crucial test to ensure the "create" heuristic is not too greedy.
        expect(addItemOp.action).not.toBe('create');
        expect(addItemOp.action).toBe('addItemToWidget');
    });

    it('list-component-generator should handle a resource with only read-only properties', () => {
        const project = createTestProject();
        const parser = new SwaggerParser(branchCoverageSpec as any, { options: { admin: true } } as any);
        const resource = discoverAdminResources(parser).find((r: Resource) => r.name === 'readOnlyResource')!;
        const generator = new ListComponentGenerator(project);
        generator.generate(resource, '/admin');
        const listClass = project
            .getSourceFileOrThrow('/admin/readOnlyResource/readOnlyResource-list/readOnlyResource-list.component.ts')
            .getClassOrThrow('ReadOnlyResourceListComponent');
        expect(listClass.getProperty('idProperty')?.getInitializer()?.getText()).toBe(`'id'`);
    });

    it('form-component-generator should not generate onSubmit if no create/update ops exist', async () => {
        const project = await runGeneratorWithConfig(branchCoverageSpec, { admin: true, generateServices: true });
        const formFile = project.getSourceFile(
            '/generated/admin/noCreateUpdate/noCreateUpdate-form/noCreateUpdate-form.component.ts',
        );
        const onSubmitMethod = formFile?.getClass('NoCreateUpdateFormComponent')?.getMethod('onSubmit');
        expect(onSubmitMethod).toBeUndefined();
    });

    it('form-component-generator should handle ngOnInit for update-only forms without getById', async () => {
        const project = await runGeneratorWithConfig(branchCoverageSpec, { admin: true, generateServices: true });
        const formFile = project.getSourceFileOrThrow(
            '/generated/admin/updateOnlyNoGet/updateOnlyNoGet-form/updateOnlyNoGet-form.component.ts',
        );
        const ngOnInitBody = formFile
            .getClassOrThrow('UpdateOnlyNoGetFormComponent')
            .getMethod('ngOnInit')
            ?.getBodyText();
        expect(ngOnInitBody).not.toContain('subscribe(entity =>');
        expect(ngOnInitBody).toContain('this.id.set(id);');
    });

    it('html builders should handle readonly discriminator properties', async () => {
        const project = await runGeneratorWithConfig(branchCoverageSpec, { admin: true, generateServices: true });
        const html = project
            .getFileSystem()
            .readFileSync(
                '/generated/admin/polyReadonlyDiscriminator/polyReadonlyDiscriminator-form/polyReadonlyDiscriminator-form.component.html',
            );
        expect(html).not.toContain('formControlName="petType"');
        expect(html).toContain('formControlName="name"');
    });

    it('orchestrator should call admin test generator when enabled', async () => {
        const generateSpy = vi.spyOn(AdminGenerator.prototype, 'generate');
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {
        });

        await runGeneratorWithConfig(coverageSpec, { admin: true, generateAdminTests: true });

        expect(generateSpy).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test generation for admin UI is stubbed.'));

        generateSpy.mockRestore();
        consoleSpy.mockRestore();
    });
});
