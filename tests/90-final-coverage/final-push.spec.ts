import { describe, it, expect, vi } from 'vitest';

import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, PathInfo } from '@src/core/types.js';
import { discoverAdminResources } from '@src/service/emit/admin/resource-discovery.js';
import { groupPathsByController } from '@src/service/parse.js';
import { ServiceTestGenerator } from '@src/generators/angular/test/service-test-generator.js';
import { TypeGenerator } from '@src/service/emit/type/type.generator.js';
import { finalCoveragePushSpec } from '../shared/final-coverage.models.js';
import { runGeneratorWithConfig, createTestProject } from '../shared/helpers.js';
import { MainIndexGenerator } from '@src/generators/angular/utils/index.generator.js';
import { finalCoverageSpec } from "../fixtures/coverage.fixture.js";

/**
 * Validates edge cases and final coverage gaps identified during the 'final push' of the project.
 * These tests ensure that specific refactoring nuances and less common OpenAPI structures are handled correctly.
 */
describe('Final Coverage Push', () => {

    /**
     * Helper to create a parser instance with default 'angular' framework config.
     * @param spec The OpenAPI specification object to parse.
     */
    const createParser = (spec: object = finalCoveragePushSpec): SwaggerParser => {
        const config: GeneratorConfig = { output: '/out', options: { admin: true, framework: 'angular' } } as any;
        return new SwaggerParser(spec as any, config);
    };

    /**
     * Verifies that the parser properly warns when encountering external file references
     * that it cannot resolve (since we are mocking the FS/HTTP layer here).
     */
    it('core/parser should warn on external refs', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const parser = createParser();
        parser.resolveReference('external.json#/User');
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unresolved external file reference'));
        warnSpy.mockRestore();
    });

    /**
     * Ensures that when no security schemes are present in the spec,
     * the orchestrator skips creating authentication utility files.
     */
    it('orchestrator should run without auth generation for a spec with no security', async () => {
        const project = await runGeneratorWithConfig({ ...finalCoveragePushSpec, components: {} }, { framework: 'angular', generateServices: true });
        expect(project.getSourceFile('/generated/auth/auth.interceptor.ts')).toBeUndefined();
        expect(project.getSourceFile('/generated/auth/auth.tokens.ts')).toBeUndefined();
    });

    /**
     * Tests the resource discovery logic used by the Admin UI generator.
     * Specifically checks polymorphic schemas where the discriminator property exists in a sub-schema (via OneOf)
     * rather than openly on the base schema.
     */
    it('resource-discovery should handle polymorphic schemas where discriminator prop is not in base', () => {
        const resources = discoverAdminResources(createParser());
        const resource = resources.find(r => r.name === 'poly')!;

        const polyProp = resource.formProperties.find(p => p.name === 'type');
        expect(polyProp).toBeDefined();
        expect(polyProp?.schema.oneOf).toBeDefined();
        expect(polyProp?.schema.discriminator).toBeDefined();
    });

    /**
     * Ensures that inline schemas within operation definitions are named correctly
     * (usually PascalCase of the property name) during resource discovery.
     */
    it('resource-discovery should correctly identify model name for inline schemas', () => {
        const resources = discoverAdminResources(createParser());
        const resource = resources.find(r => r.name === 'inlineModel')!;
        expect(resource.modelName).toBe('InlineModel');
    });

    /**
     * Verifies that the service method generator correctly serializes
     * 'application/x-www-form-urlencoded' request bodies even when no parameters
     * are explicitly defined in the body schema (sent as empty object/empty body).
     */
    it('service/emit/service-method.generator should handle edge cases', async () => {
        const project = await runGeneratorWithConfig(finalCoveragePushSpec, { framework: 'angular' });
        const urlencodedFile = project.getSourceFileOrThrow('/generated/services/urlencodedNoParams.service.ts');
        const urlencodedMethod = urlencodedFile.getClassOrThrow('UrlencodedNoParamsService').getMethodOrThrow('postUrlencodedNoParams');
        const body = urlencodedMethod.getBodyText();
        expect(body).toContain('HttpParamsBuilder.serializeUrlEncodedBody(body, {});');
        expect(body).toContain('return this.http.post(url, formBody, requestOptions as any);');
    });

    /**
     * Ensures the MainIndexGenerator respects the `generateServices: false` flag
     * and does not attempt to export from a non-existent `./services` directory.
     */
    it('service/emit/utility/index.generator should handle missing services dir', () => {
        const project = createTestProject();
        const config: GeneratorConfig = { output: '/', options: { framework: 'angular', generateServices: false } } as any;
        const parser = new SwaggerParser(finalCoverageSpec as any, config);
        // Run with generateServices: false, so the services dir isn't created.
        new MainIndexGenerator(project, parser.config, parser).generateMainIndex('/');
        const content = project.getSourceFileOrThrow('/index.ts').getText();
        expect(content).not.toContain('export * from "./services"');
    });

    /**
     * Tests that form components generated for polymorphic types containing ONLY primitive values
     * do not attempt to create nested FormGroups, which would be invalid for primitives.
     */
    it('form-component-generator should handle oneOf with ONLY primitive types', async () => {
        const project = await runGeneratorWithConfig(finalCoveragePushSpec, { framework: 'angular', admin: true, generateServices: true });

        const formClass = project
            .getSourceFileOrThrow('/generated/admin/polyWithOnlyPrimitives/polyWithOnlyPrimitives-form/polyWithOnlyPrimitives-form.component.ts')
            .getClassOrThrow('PolyWithOnlyPrimitivesFormComponent');

        const updateMethod = formClass.getMethod('updateFormForPetType');
        expect(updateMethod).toBeDefined();
        // Should NOT contain logic to add a sub-form group because the sub-type is primitive.
        expect(updateMethod!.getBodyText()).not.toContain('this.form.addControl');
    });

    /**
     * Critical test for the ServiceTestGenerator.
     * Verifies it can generate valid Angular unit tests for operations involving:
     * 1. Primitive return types (string/number vs Objects).
     * 2. Primitive request bodies.
     * 3. Path parameters.
     */
    it('service-test-generator should handle primitive request/response types and param refs', () => {
        const project = createTestProject();
        const parser = createParser();
        const config = { input: '', output: '/out', options: { framework: 'angular', dateType: 'string', enumStyle: 'enum' } };

        // Generate types first so the test generator sees them
        new TypeGenerator(parser, project, config as any).generate('/out');

        const testGen = new ServiceTestGenerator(parser, project, config as any);
        const ops = Object.values(groupPathsByController(parser)).flat();

        // Filter for specific test operations defined in finalCoveragePushSpec with tag 'ServiceTests'
        const serviceTestOps = ops.filter((op: PathInfo): op is PathInfo => !!op.tags?.includes('ServiceTests'));

        testGen.generateServiceTestFile('ServiceTests', serviceTestOps, '/');

        const testFileContent = project.getSourceFileOrThrow('/serviceTests.service.spec.ts').getText();

        // Check GET primitive
        expect(testFileContent).toContain("describe('getPrimitive()'");
        expect(testFileContent).toContain("service.getPrimitive().subscribe(response => expect(response).toEqual(mockResponse));");

        // Check POST primitive body
        expect(testFileContent).toContain("describe('postPrimitive()'");
        expect(testFileContent).toContain("const body = 'test-body';");
        expect(testFileContent).toContain("service.postPrimitive(body).subscribe(");
        expect(testFileContent).toContain("expect(req.request.body).toEqual(body);");

        // Check Path Param handling
        expect(testFileContent).toContain("const req = httpMock.expectOne(`/api/v1/primitive-param/${id}`);");
        expect(testFileContent).toContain("const id = 'test-id';");
    });
});
