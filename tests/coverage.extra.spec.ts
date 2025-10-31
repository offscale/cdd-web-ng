import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { GeneratorConfig } from '../src/core/types.js';
import { SwaggerParser } from '../src/core/parser.js';
import { emitClientLibrary } from '../src/service/emit/orchestrator.js';
import { FormComponentGenerator } from '../src/service/emit/admin/form-component.generator.js';
import { RoutingGenerator } from '../src/service/emit/admin/routing.generator.js';
import { ServiceMethodGenerator } from '../src/service/emit/service/service-method.generator.ts';
import { TypeGenerator } from '../src/service/emit/type/type.generator.js';
import { MainIndexGenerator } from '../src/service/emit/utility/index.generator.js';
import { ProviderGenerator } from '../src/service/emit/utility/provider.generator.js';
import { AuthInterceptorGenerator } from '../src/service/emit/utility/auth-interceptor.generator.js';
import { mapSchemaToFormControl } from '../src/service/emit/admin/form-control.mapper.js';
import { discoverAdminResources } from '../src/service/emit/admin/resource-discovery.js';

describe('Extra Coverage Tests', () => {

    // --- src/core/utils.ts ---
    // Covering line 77: `singular` function for 'ies' ending.
    it('should correctly singularize words ending in "ies"', async () => {
        const { singular } = await import('../src/core/utils.js');
        expect(singular('parties')).toBe('party');
    });

    // --- src/service/emit/orchestrator.ts ---
    // Covering lines 30, 55-59: generateServices being undefined (falls back to true).
    it('should run service generation when generateServices option is undefined', async () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = {
            input: '', output: '/out',
            options: { dateType: 'string', enumStyle: 'enum', generateServices: undefined } // Test the ?? true logic
        };
        const spec = {
            openapi: '3.0.0', info: { title: 'test', version: '1' }, paths: {},
            components: { securitySchemes: { OAuth2: { type: 'oauth2', flows: {} } } }
        };
        const parser = new SwaggerParser(spec, config);
        await expect(emitClientLibrary('/out', parser, config, project)).resolves.toBeUndefined();
    });

    // --- src/service/emit/admin/form-component.generator.ts ---
    // Covering lines 77, 212, 423, 434: Array of objects with enums, file selection, primitive arrays, slider max attribute.
    it('should handle advanced form generation edge cases', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const formGen = new FormComponentGenerator(project);
        const resource: any = {
            name: 'tests', modelName: 'Test', formProperties: [
                // Covers primitive array template (line 423)
                { name: 'primitiveArray', schema: { type: 'array', items: { type: 'string' } } },
                // Covers array of objects with nested enum (line 77)
                { name: 'enumInArray',
                    schema: {
                        type: 'array',
                        items: { type: 'object', properties: { status: { type: 'string', enum: ['A', 'B'] } } }
                    }
                },
                // Covers slider `max` attribute replacement (line 434)
                { name: 'slider', schema: { type: 'integer', minimum: 0, maximum: 50 } },
                // Covers file selection `if (file)` branch (line 212)
                { name: 'upload', schema: { type: 'string', format: 'binary' } }
            ]
        };
        formGen.generate(resource, '/admin');
        const tsFile = project.getSourceFileOrThrow('/admin/tests/tests-form/tests-form.component.ts');
        const onFileSelected = tsFile.getClass('TestsFormComponent')!.getMethod('onFileSelected');
        // We can assert the if condition is present.
        expect(onFileSelected?.getBodyText()).toContain('if (file)');
    });

    // --- src/service/emit/admin/form-control.mapper.ts ---
    // Covering line 95: Array of non-string/enum/object types.
    it('should return null for array of numbers in form-control.mapper', () => {
        const schema = { type: 'array', items: { type: 'number' } };
        expect(mapSchemaToFormControl('test', schema)).toBeNull();
    });

    // --- src/service/emit/admin/resource-discovery.ts ---
    // Covering lines 81, 98-100, 105, 149, 173: More edge cases in discovery
    it('should handle resource discovery edge cases with inline schemas and fallback logic', () => {
        const spec = {
            paths: {
                // Covers line 149: Model name fallback from response schema
                '/items': { get: { responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } } } } } },
                // Covers lines 98-100: Inline schema property, not a $ref
                '/items/{id}': { patch: { requestBody: { content: { 'application/json': { schema: { properties: { name: { type: 'string' } } } } } } } },
            },
            components: { schemas: { Item: { type: 'object' } } }
        };
        const parser = new SwaggerParser(spec as any, { options: {} } as any);
        const resources = discoverAdminResources(parser);
        const itemResource = resources.find(r => r.name === 'items');
        expect(itemResource?.modelName).toBe('Item');
        expect(itemResource?.formProperties.find(p => p.name === 'name')?.schema.type).toBe('string');
    });

    // --- src/service/emit/admin/routing.generator.ts ---
    // Covering lines 55-57: Master routing with no resources.
    it('should generate master routing with no redirect if no resources exist', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const routeGen = new RoutingGenerator(project);
        routeGen.generateMaster([], '/admin'); // Pass empty array
        const file = project.getSourceFile('/admin/admin.routes.ts');
        expect(file?.getFullText()).not.toContain(`redirectTo`);
    });

    // --- src/service/emit/service/service-method.generator.ts ---
    // Covering line 49: Response type resolving to 'any' becomes 'void'.
    it('should generate "void" return type for an "any" response schema', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const serviceClass = project.createSourceFile('test.ts').addClass('Test');
        const config = { options: { dateType: 'string' } } as any;
        const methodGen = new ServiceMethodGenerator(config);
        const operation: any = {
            method: 'GET', path: '/test', responses: { '200': { content: { 'application/json': { schema: {} } } } } // empty schema -> 'any'
        };
        methodGen.addServiceMethod(serviceClass, operation);
        const returnType = serviceClass.getMethod('getTest')?.getOverloads()[0].getReturnType().getText();
        expect(returnType).toContain('Observable<HttpResponse<void>>');
    });

    // --- src/service/emit/type/type.generator.ts ---
    // Covering lines 123, 127: Fallback to 'any' for empty oneOf/allOf.
    it('should generate "any" for empty oneOf/allOf in type generator', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config = { options: {} } as any;
        const spec = {
            components: { schemas: { EmptyAllOf: { allOf: [] }, EmptyOneOf: { oneOf: [] } } }
        };
        const parser = new SwaggerParser(spec as any, config);
        new TypeGenerator(parser, project, config).generate('/out');
        const fileContent = project.getSourceFileOrThrow('/out/models/index.ts').getFullText();
        expect(fileContent).toContain('export type EmptyAllOf = any;');
        expect(fileContent).toContain('export type EmptyOneOf = any;');
    });

    // --- src/service/emit/utility/auth-interceptor.generator.ts ---
    // Covering line 72: API key in query string.
    it('should generate auth interceptor for api key in query', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const spec = { components: { securitySchemes: { ApiKey: { type: 'apiKey', in: 'query', name: 'key' } } } };
        const parser = new SwaggerParser(spec as any, {} as any);
        new AuthInterceptorGenerator(parser, project).generate('/out');
        const file = project.getSourceFileOrThrow('/out/auth/auth.interceptor.ts').getFullText();
        expect(file).toContain(`req.clone({ setParams: { 'key': this.apiKey } })`);
    });

    // --- src/service/emit/utility/index.generator.ts ---
    // Covering line 86: Main index when generateServices is false.
    it('should generate main index without service exports if disabled', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config = { options: { generateServices: false } } as any;
        const parser = new SwaggerParser({} as any, config);
        new MainIndexGenerator(project, config, parser).generateMainIndex('/out');
        const fileContent = project.getSourceFileOrThrow('/out/index.ts').getFullText();
        expect(fileContent).toContain('export * from "./models";');
        expect(fileContent).not.toContain('export * from "./services";');
    });

    // --- src/service/emit/utility/provider.generator.ts ---
    // Covering lines 60-61, 114: Edge cases with security schemes and undefined interceptors.
    it('should handle provider generation with unsupported security schemes and no custom interceptors', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const spec = { components: { securitySchemes: { OIDC: { type: 'openIdConnect' } } } };
        const config = { clientName: 'Test', options: { generateServices: true } } as any; // No interceptors property
        const parser = new SwaggerParser(spec as any, config);
        new ProviderGenerator(parser, project, []).generate('/out');
        const fileContent = project.getSourceFileOrThrow('/out/providers.ts').getFullText();
        // Covers line 114
        expect(fileContent).toContain("const customInterceptors = config.interceptors?.map(InterceptorClass => new InterceptorClass()) || [];");
        // Covers lines 60-61 (the import block for auth.tokens should NOT be added)
        expect(fileContent).not.toContain('auth.tokens');
    });
});
