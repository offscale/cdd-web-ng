import { SwaggerParser } from "@src/core/parser.js";
import { discoverAdminResources } from "@src/service/emit/admin/resource-discovery.js";
import { createTestProject } from "./helpers.js";
import { branchCoverageSpec } from "./specs.js";
import { describe, expect, it } from "vitest";
import { Resource } from "@src/core/types.js";
import { ListComponentGenerator } from "@src/generators/angular/admin/list-component.generator.js";
import { FormComponentGenerator } from "@src/generators/angular/admin/form-component.generator.js";

/**
 * @fileoverview
 * This file contains highly specific tests designed to hit branch coverage gaps
 * identified in the istanbul report.
 */
describe('Branch Coverage Specific Tests', () => {

    it('resource-discovery should correctly classify complex custom action names', () => {
        const parser = new SwaggerParser(branchCoverageSpec as any, { options: { admin: true } } as any);
        const resources = discoverAdminResources(parser);
        const resource = resources.find((r: Resource) => r.name === 'multiPath');
        expect(resource).toBeDefined();
        // Should NOT be 'create' just because it's a POST on a collection
        expect(resource!.operations[0].action).toBe('multiPathComplexAction');
    });

    it('list-component-generator should handle a resource with no editable properties', () => {
        const project = createTestProject();
        const parser = new SwaggerParser(branchCoverageSpec as any, { options: { admin: true } } as any);
        const resource = discoverAdminResources(parser).find((r: Resource) => r.name === 'readOnlyResource')!;
        const generator = new ListComponentGenerator(project);
        generator.generate(resource, '/admin');
        const listClass = project.getSourceFileOrThrow('/admin/readOnlyResource/readOnlyResource-list/readOnlyResource-list.component.ts')
            .getClassOrThrow('ReadOnlyResourceListComponent');
        // Asserts that the generator doesn't crash and correctly identifies 'id' as the property
        expect(listClass.getProperty('idProperty')?.getInitializer()?.getText()).toBe(`'id'`);
    });

    it('form-component-generator should generate onSubmit with no actions if no create/update ops', () => {
        const project = createTestProject();
        const parser = new SwaggerParser(branchCoverageSpec as any, { options: { admin: true } } as any);
        const resource = discoverAdminResources(parser).find((r: Resource) => r.name === 'noCreateUpdate')!;
        const generator = new FormComponentGenerator(project, parser);
        // This resource is editable (has DELETE) but has no form actions (create/update)
        generator.generate(resource, '/admin');
        const formClass = project.getSourceFileOrThrow('/admin/noCreateUpdate/noCreateUpdate-form/noCreateUpdate-form.component.ts')
            .getClassOrThrow('NoCreateUpdateFormComponent');
        // The onSubmit method should be empty or non-existent in this case, as there's nothing to submit.
        expect(formClass.getMethod('onSubmit')).toBeUndefined();
    });

    it('form-component-generator should handle ngOnInit for update-only forms without getById', () => {
        const project = createTestProject();
        const parser = new SwaggerParser(branchCoverageSpec as any, { options: { admin: true } } as any);
        const resource = discoverAdminResources(parser).find((r: Resource) => r.name === 'updateOnlyNoGet')!;
        const generator = new FormComponentGenerator(project, parser);

        generator.generate(resource, '/admin');
        const formClass = project.getSourceFileOrThrow('/admin/updateOnlyNoGet/updateOnlyNoGet-form/updateOnlyNoGet-form.component.ts')
            .getClassOrThrow('UpdateOnlyNoGetFormComponent');
        const ngOnInitBody = formClass.getMethod('ngOnInit')?.getBodyText();
        // The `if (getByIdOp)` block should not be present
        expect(ngOnInitBody).not.toContain('subscribe(entity =>');
        // It should still set the ID
        expect(ngOnInitBody).toContain("this.id.set(id);");
    });
});
