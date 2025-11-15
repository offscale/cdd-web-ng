import { describe, it, expect, vi } from 'vitest';

import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, PathInfo } from '@src/core/types.js';
import { discoverAdminResources } from '@src/service/emit/admin/resource-discovery.js';
import { groupPathsByController } from '@src/service/parse.js';
import { ServiceTestGenerator } from '@src/service/emit/test/service-test-generator.js';
import { TypeGenerator } from '@src/service/emit/type/type.generator.js';
import { finalCoveragePushSpec } from '../shared/final-coverage.models.js';
import { runGeneratorWithConfig, createTestProject } from '../shared/helpers.js';
import { MainIndexGenerator } from '@src/service/emit/utility/index.generator.js';

describe('Final Coverage Push', () => {

    const createParser = (spec: object = finalCoveragePushSpec): SwaggerParser => {
        const config: GeneratorConfig = { output: '/out', options: { admin: true } } as any;
        return new SwaggerParser(spec as any, config);
    };

    it('core/parser should warn on external refs', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const parser = createParser();
        parser.resolveReference('external.json#/User');
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unsupported external or non-root reference'));
        warnSpy.mockRestore();
    });

    it('orchestrator should run without auth generation for a spec with no security', async () => {
        const project = await runGeneratorWithConfig({ ...finalCoveragePushSpec, components: {} }, { generateServices: true });
        expect(project.getSourceFile('/generated/auth/auth.interceptor.ts')).toBeUndefined();
        expect(project.getSourceFile('/generated/auth/auth.tokens.ts')).toBeUndefined();
    });

    it('resource-discovery should handle polymorphic schemas where discriminator prop is not in base', () => {
        const resources = discoverAdminResources(createParser());
        const resource = resources.find(r => r.name === 'poly')!;

        // This tests the `else` block for creating a synthetic property for the discriminator.
        const polyProp = resource.formProperties.find(p => p.name === 'type');
        expect(polyProp).toBeDefined();
        expect(polyProp?.schema.oneOf).toBeDefined();
        expect(polyProp?.schema.discriminator).toBeDefined();
    });

    it('resource-discovery should correctly identify model name for inline schemas', () => {
        const resources = discoverAdminResources(createParser());
        const resource = resources.find(r => r.name === 'inlineModel')!;
        expect(resource.modelName).toBe('InlineModel');
    });

    it('service/emit/service-method.generator should handle edge cases', async () => {
        const project = await runGeneratorWithConfig(finalCoveragePushSpec, {});
        const urlencodedFile = project.getSourceFileOrThrow('/generated/services/urlencodedNoParams.service.ts');
        const urlencodedMethod = urlencodedFile.getClassOrThrow('UrlencodedNoParamsService').getMethodOrThrow('postUrlencodedNoParams');
        // The generator correctly creates a `body` parameter from the requestBody, even if empty.
        expect(urlencodedMethod.getBodyText()).toContain('return this.http.post(url, body, requestOptions as any);');
    });

    it('service/emit/utility/index.generator should handle missing services dir', () => {
        const project = createTestProject();
        const config: GeneratorConfig = { output: '/', options: { generateServices: false } } as any;
        const parser = new SwaggerParser(finalCoveragePushSpec as any, config);
        // Run with generateServices: false, so the services dir isn't created.
        new MainIndexGenerator(project, parser.config, parser).generateMainIndex('/');
        const content = project.getSourceFileOrThrow('/index.ts').getText();
        expect(content).not.toContain('export * from "./services"');
    });

    it('form-component-generator should handle oneOf with ONLY primitive types', async () => {
        const project = await runGeneratorWithConfig(finalCoveragePushSpec, { admin: true, generateServices: true });

        const formClass = project
            .getSourceFileOrThrow('/generated/admin/polyWithOnlyPrimitives/polyWithOnlyPrimitives-form/polyWithOnlyPrimitives-form.component.ts')
            .getClassOrThrow('PolyWithOnlyPrimitivesFormComponent');

        const updateMethod = formClass.getMethod('updateFormForPetType');
        expect(updateMethod).toBeDefined();
        // Because all `oneOf` types are primitive, no sub-forms are needed, and the method
        // body should not contain logic to add controls.
        expect(updateMethod!.getBodyText()).not.toContain('this.form.addControl');
    });

    it('service-test-generator should handle primitive request/response types and param refs', () => {
        const project = createTestProject();
        const parser = createParser();
        const config = { input: '', output: '/out', options: { dateType: 'string', enumStyle: 'enum' } };
        new TypeGenerator(parser, project, config as any).generate('/out');
        const testGen = new ServiceTestGenerator(parser, project, config as any);
        const ops = Object.values(groupPathsByController(parser)).flat();
        const serviceTestOps = ops.filter((op: PathInfo): op is PathInfo => !!op.tags?.includes('ServiceTests'));

        testGen.generateServiceTestFile('ServiceTests', serviceTestOps, '/');

        const testFileContent = project.getSourceFileOrThrow('/serviceTests.service.spec.ts').getText();

        // Primitive Response
        expect(testFileContent).toContain("describe('getPrimitive()'");
        expect(testFileContent).toContain("service.getPrimitive().subscribe(response => expect(response).toEqual(mockResponse));");

        // Primitive Request Body
        expect(testFileContent).toContain("describe('postPrimitive()'");
        expect(testFileContent).toContain("const body = 'test-body';");
        expect(testFileContent).toContain("service.postPrimitive(body).subscribe(");
        expect(testFileContent).toContain("expect(req.request.body).toEqual(body);");

        // Non-model param in test
        expect(testFileContent).toContain("const req = httpMock.expectOne(`/api/v1/primitive-param/${id}`);");
        expect(testFileContent).toContain("const id = 'test-id';");
    });
});
