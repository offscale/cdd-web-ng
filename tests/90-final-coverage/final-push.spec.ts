import { describe, it, expect, vi } from 'vitest';

import { SwaggerParser } from '@src/core/parser.js';
import { extractPaths } from '@src/core/utils.js';
import { GeneratorConfig } from '@src/core/types.js';
import { discoverAdminResources } from '@src/service/emit/admin/resource-discovery.js';
import { ServiceMethodGenerator } from '@src/service/emit/service/service-method.generator.js';
import { groupPathsByController } from '@src/service/parse.js';
import { ServiceTestGenerator } from '@src/service/emit/test/service-test-generator.js';
import { TypeGenerator } from '@src/service/emit/type/type.generator.js';
import { finalCoveragePushSpec } from '../shared/final-coverage.models.js';
import { runGeneratorWithConfig, createTestProject } from '../shared/helpers.js';

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

    it('core/utils should handle Swagger 2.0 responses with no schema', () => {
        const spec = {
            swagger: '2.0',
            paths: {
                '/test': { get: { responses: { '200': { description: 'ok' } } } },
            },
        };
        const paths = extractPaths(spec.paths as any);
        expect(paths[0].responses!['200'].content).toBeUndefined();
    });

    it('orchestrator should run without auth generation for a spec with no security', async () => {
        const project = await runGeneratorWithConfig({ ...finalCoveragePushSpec, components: {} }, { generateServices: true });
        expect(project.getSourceFile('/generated/auth/auth.interceptor.ts')).toBeUndefined();
        expect(project.getSourceFile('/generated/auth/auth.tokens.ts')).toBeUndefined();
    });

    it('resource-discovery should handle polymorphic schemas where discriminator prop is not in base', () => {
        const resources = discoverAdminResources(createParser());
        const resource = resources.find(r => r.name === 'poly')!;

        // THE DEFINITIVE FIX: The generator now correctly creates a synthetic property
        // to hold the oneOf/discriminator info. The test must validate this new, correct behavior.
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

    it('form-component-generator should handle oneOf with primitive types', async () => {
        const project = await runGeneratorWithConfig(finalCoveragePushSpec, { admin: true, generateServices: true });

        // THE FIX: Update the path to match the new, unambiguous resource name 'polyWithPrimitive'.
        const formClass = project
            .getSourceFileOrThrow('/generated/admin/polyWithPrimitive/polyWithPrimitive-form/polyWithPrimitive-form.component.ts')
            .getClassOrThrow('PolyWithPrimitiveFormComponent');

        const updateMethod = formClass.getMethod('updateFormForPetType');
        expect(updateMethod).toBeDefined();
        expect(updateMethod!.getBodyText()).not.toContain('this.form.addControl');
    });

    it('html-builders should handle unsupported form controls and delete-only actions', async () => {
        const project = await runGeneratorWithConfig(finalCoveragePushSpec, { admin: true, generateServices: true });
        const formHtml = project
            .getFileSystem()
            .readFileSync('/generated/admin/unsupported/unsupported-form/unsupported-form.component.html');
        expect(formHtml).toContain(`onFileSelected($event, 'myFile')`);

        // The fix in `discoverAdminResources` now correctly identifies the GET as a list operation,
        // so the list component will be generated.
        const listHtml = project
            .getFileSystem()
            .readFileSync('/generated/admin/deleteOnly/deleteOnly-list/deleteOnly-list.component.html');
        expect(listHtml).toContain('onDelete(row[idProperty])');
        expect(listHtml).not.toContain('onEdit(row[idProperty])');
    });

    it('service-method-generator should handle content-no-schema and only-required-params', () => {
        const project = createTestProject();
        const parser = createParser();
        const serviceClass = project.createSourceFile('tmp.ts').addClass('Tmp');
        const methodGen = new ServiceMethodGenerator({ options: {} } as any, parser);
        const ops = Object.values(groupPathsByController(parser)).flat();

        const op1 = ops.find(o => o.operationId === 'getContentNoSchema')!;
        methodGen.addServiceMethod(serviceClass, op1);
        const method1 = serviceClass.getMethodOrThrow(op1.methodName!);
        expect(method1.getOverloads()[0].getReturnType().getText()).toBe('Observable<any>');

        const op2 = ops.find(o => o.operationId === 'getOnlyRequired')!;
        methodGen.addServiceMethod(serviceClass, op2);
        const method2 = serviceClass.getMethodOrThrow(op2.methodName!);
        const optionsParam = method2.getOverloads()[1].getParameters().find(p => p.getName() === 'options')!;
        expect(optionsParam.hasQuestionToken()).toBe(false);
    });

    it('service-test-generator should handle primitive request/response types', () => {
        const project = createTestProject();
        const parser = createParser();
        const config = { input: '', output: '/out', options: { dateType: 'string', enumStyle: 'enum' } };
        new TypeGenerator(parser, project, config as any).generate('/out');
        // This line will now work.
        const testGen = new ServiceTestGenerator(parser, project, config as any);
        const ops = Object.values(groupPathsByController(parser)).flat();
        const serviceTestOps = ops.filter(op => op.tags?.includes('ServiceTests'));

        testGen.generateServiceTestFile('ServiceTests', serviceTestOps, '/');

        const testFileContent = project.getSourceFileOrThrow('/serviceTests.service.spec.ts').getText();

        expect(testFileContent).toContain("service.getPrimitive().subscribe(response => expect(response).toEqual(mockResponse));");
        expect(testFileContent).toContain("const body = 'test-body';");
        expect(testFileContent).toContain("service.postPrimitive(body).subscribe(");
    });
});
