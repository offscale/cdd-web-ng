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
import { HttpParamsBuilderGenerator } from '@src/service/emit/utility/http-params-builder.js';

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

        // The generator now correctly creates a synthetic property
        // to hold the oneOf/discriminator info. The test validates this.
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

        const formClass = project
            .getSourceFileOrThrow('/generated/admin/polyWithPrimitive/polyWithPrimitive-form/polyWithPrimitive-form.component.ts')
            .getClassOrThrow('PolyWithPrimitiveFormComponent');

        const updateMethod = formClass.getMethod('updateFormForPetType');
        expect(updateMethod).toBeDefined();
        // The method body should be empty as there are no sub-forms to create for primitives
        expect(updateMethod!.getBodyText()).not.toContain('this.form.addControl');
    });

    it('html-builders should handle unsupported form controls and delete-only actions', async () => {
        const project = await runGeneratorWithConfig(finalCoveragePushSpec, { admin: true, generateServices: true });
        const formHtml = project
            .getFileSystem()
            .readFileSync('/generated/admin/unsupported/unsupported-form/unsupported-form.component.html');
        // Verifies the file input control is generated
        expect(formHtml).toContain(`onFileSelected($event, 'myFile')`);
        // Verifies that buildFormControl returning null inside a group does not crash the generator
        expect(formHtml).not.toContain('formControlName="unsupportedField"');

        const listHtml = project
            .getFileSystem()
            .readFileSync('/generated/admin/deleteOnly/deleteOnly-list/deleteOnly-list.component.html');
        expect(listHtml).toContain('onDelete(row[idProperty])');
        expect(listHtml).not.toContain('onEdit(row[idProperty])');
    });

    it('service-method-generator should handle complex cases', () => {
        const project = createTestProject();
        const parser = createParser();
        const serviceClass = project.createSourceFile('tmp.ts').addClass('Tmp');
        // Add required dependencies for method body generation
        serviceClass.addProperty({ name: 'http', isReadonly: true, type: 'any' });
        serviceClass.addProperty({ name: 'basePath', isReadonly: true, type: 'string' });
        serviceClass.addMethod({ name: 'createContextWithClientId', returnType: 'any' });
        new HttpParamsBuilderGenerator(project).generate('/');

        const methodGen = new ServiceMethodGenerator({ options: {} } as any, parser);
        const ops = Object.values(groupPathsByController(parser)).flat();

        // Case: requestBody.content exists, but has no schema inside.
        const op1 = ops.find(o => o.operationId === 'getContentNoSchema')!;
        op1.responses = {}; // Ensure fallback to request body for return type
        methodGen.addServiceMethod(serviceClass, op1);
        const method1 = serviceClass.getMethodOrThrow(op1.methodName!);
        expect(method1.getOverloads()[0].getReturnType().getText()).toBe('Observable<any>');
        expect(method1.getParameters().find(p => p.getName() === 'body')?.getType().getText()).toBe('unknown');

        // Case: All parameters are required, so observe: 'response' options should not be optional.
        const op2 = ops.find(o => o.operationId === 'getOnlyRequired')!;
        methodGen.addServiceMethod(serviceClass, op2);
        const method2 = serviceClass.getMethodOrThrow(op2.methodName!);
        const optionsParam = method2.getOverloads()[1].getParameters().find(p => p.getName() === 'options')!;
        expect(optionsParam.hasQuestionToken()).toBe(false);
    });

    it('service-test-generator should handle primitive request/response types and param refs', () => {
        const project = createTestProject();
        const parser = createParser();
        const config = { input: '', output: '/out', options: { dateType: 'string', enumStyle: 'enum' } };
        new TypeGenerator(parser, project, config as any).generate('/out');
        const testGen = new ServiceTestGenerator(parser, project, config as any);
        const ops = Object.values(groupPathsByController(parser)).flat();
        const serviceTestOps = ops.filter(op => op.tags?.includes('ServiceTests'));

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
    });
});
