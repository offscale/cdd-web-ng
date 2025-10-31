import { describe, it, expect, vi } from 'vitest';
import { Project, IndentationText } from 'ts-morph';
import { getTypeScriptType, extractPaths, singular } from '../src/core/utils.js';
import { GeneratorConfig } from '../src/core/types.js';
import { SwaggerParser } from '../src/core/parser.js';
import { emitClientLibrary } from '../src/service/emit/orchestrator.js';
import { FormComponentGenerator } from '../src/service/emit/admin/form-component.generator.js';
import { RoutingGenerator } from '../src/service/emit/admin/routing.generator.js';
import { ServiceMethodGenerator } from '../src/service/emit/service/service-method.generator.ts';
import { ServiceGenerator } from '../src/service/emit/service/service.generator.js';
import { MainIndexGenerator } from '../src/service/emit/utility/index.generator.js';
import { mapSchemaToFormControl } from "../src/service/emit/admin/form-control.mapper";
import { discoverAdminResources } from "../src/service/emit/admin/resource-discovery";
import { TypeGenerator } from "../src/service/emit/type/type.generator";
import { ProviderGenerator } from "../src/service/emit/utility/provider.generator";

describe('Extra Coverage Tests', () => {

    // --- src/core/utils.ts ---
    // Covering line 77: `singular` function for 'ies' ending.
    it('should correctly singularize words ending in "ies"', () => {
        expect(singular('parties')).toBe('party');
    });

    // --- src/service/emit/orchestrator.ts ---
    // Covering lines 30, 55-59: `generateServices` being explicitly true and OAuth helper getting called.
    it('should generate services and OAuth helper when security scheme is present', async () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = {
            input: '', output: '/out',
            options: { generateServices: true, dateType: 'string', enumStyle: 'enum' }
        };
        const spec = {
            openapi: '3.0.0', info: { title: 'test', version: '1' }, paths: {},
            components: { securitySchemes: { OAuth2: { type: 'oauth2', flows: {} } } }
        };
        const parser = new SwaggerParser(spec, config);
        // We just need to ensure this doesn't throw and runs through the logic paths.
        await expect(emitClientLibrary('/out', parser, config, project)).resolves.toBeUndefined();
    });

    // --- src/service/emit/admin/form-component.generator.ts ---
    // Covering lines 77, 212, 423, 434: Edge cases in form generation.
    it('should handle complex form generation edge cases', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const formGen = new FormComponentGenerator(project);
        const resource: any = {
            name: 'tests', modelName: 'Test', formProperties: [
                { name: 'primitiveArray', schema: { type: 'array', items: { type: 'string' }, uniqueItems: true, minItems: 1 } },
                { name: 'poly', schema: { type: 'string', discriminator: { propertyName: 'type' }, oneOf: [{properties: {type: {enum:['A']}}}] } }
            ]
        };
        // This covers discriminator logic and primitive arrays with validators.
        expect(() => formGen.generate(resource, '/admin')).not.toThrow();
    });

    // --- src/service/emit/admin/form-control.mapper.ts ---
    // Covering line 95: Array of non-objects
    it('should return null for array of non-objects in form-control.mapper', () => {
        const schema = { type: 'array', items: { type: 'number' } };
        expect(mapSchemaToFormControl('test', schema)).toBeNull();
    });

    // --- src/service/emit/admin/resource-discovery.ts ---
    // Covering lines 81, 98-100, 105, 149, 172: More edge cases in discovery
    it('should handle resource discovery edge cases', async () => {
        const { discoverAdminResources } = await import('../src/service/emit/admin/resource-discovery.js');
        const spec = {
            paths: {
                '/items': { get: { responses: { '200': { content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } } } } },
                '/items/{id}': { patch: { operationId: 'partialUpdate' } }, // No tag, should be grouped with '/items'
                '/action-only': { post: { operationId: 'doAction', responses: { '200': {} } } }
            }
        };
        const parser = new SwaggerParser(spec as any, { options: {} } as any);
        const resources = discoverAdminResources(parser);

        expect(resources.length).toBe(2);
        const itemsResource = resources.find(r => r.name === 'items');
        expect(itemsResource).toBeDefined();
        expect(itemsResource?.operations.length).toBe(2);

        // **CRITICAL FIX**: Assert that the action is correctly classified as 'update',
        // and that this classified operation retains its original operationId.
        const updateOperation = itemsResource?.operations.find(o => o.action === 'update');
        expect(updateOperation).toBeDefined();
        expect(updateOperation?.operationId).toBe('partialUpdate');
    });

    // --- src/service/emit/admin/routing.generator.ts ---
    // Covering lines 55-57: Master routing with no list-able resources.
    it('should generate master routing with a fallback redirect', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const routeGen = new RoutingGenerator(project);
        const resources: any = [{ name: 'tests', operations: [{ action: 'create' }] }];
        routeGen.generateMaster(resources, '/admin');
        const file = project.getSourceFile('/admin/admin.routes.ts');
        expect(file?.getFullText()).toContain(`redirectTo: 'tests'`);
    });

    // --- src/service/emit/service/service-method.generator.ts ---
    // Covering lines 49, 60: Edge cases for response and request body types.
    it('should handle getResponseType and getMethodParameters with missing schemas', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const serviceClass = project.createSourceFile('test.ts').addClass('Test');
        const config = { options: { dateType: 'string' } } as any;
        const methodGen = new ServiceMethodGenerator(config);
        const operation: any = {
            method: 'POST', path: '/test',
            responses: { '200': {} }, // No schema
            requestBody: { content: { 'application/json': {} } } // No schema
        };
        methodGen.addServiceMethod(serviceClass, operation);
        const method = serviceClass.getMethod('postTest');
        expect(method).toBeDefined();
        // Return type falls back to void
        expect(method?.getOverloads()[0].getReturnType().getText()).toContain('Observable<HttpResponse<void>>');
        // Body type falls back to any
        expect(method?.getParameters().find(p => p.getName() === 'body')?.getType().getText()).toBe('any');
    });

    // --- src/service/emit/service/service.generator.ts ---
    // Covering line 35: Duplicate method name error.
    it('should throw error on duplicate method names', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config = { options: {} } as any;
        const parser = new SwaggerParser({} as any, config);
        const serviceGen = new ServiceGenerator(parser, project, config);
        const operations: any = [
            { method: 'GET', path: '/test', operationId: 'myMethod' },
            { method: 'POST', path: '/test', operationId: 'myMethod' },
        ];
        expect(() => serviceGen.generateServiceFile('Test', operations, '/out')).toThrow('Duplicate method names found');
    });

    // --- src/service/emit/type/type.generator.ts ---
    // Covering lines 53-56, 123, 127: Enum generation and type resolution fallbacks.
    it('should handle type generation edge cases', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config = { options: { enumStyle: 'enum' } } as any;
        const spec = {
            components: {
                schemas: {
                    ComplexEnum: { enum: ['value-a', 'value/b'] },
                    AnyOfTest: { anyOf: [{ type: 'string' }] },
                    AllOfTest: { allOf: [{ type: 'number' }] }
                }
            }
        };
        const parser = new SwaggerParser(spec as any, config);
        const typeGen = new TypeGenerator(parser, project, config);
        typeGen.generate('/out');
        const fileContent = project.getSourceFileOrThrow('/out/models/index.ts').getFullText();
        expect(fileContent).toContain('export enum ComplexEnum');
        expect(fileContent).toContain('ValueA = "value-a"');
        expect(fileContent).toContain('ValueB = "value/b"');
        expect(fileContent).toContain('export type AnyOfTest = string;');
        expect(fileContent).toContain('export type AllOfTest = number;');
    });

    // --- src/service/emit/utility/auth-interceptor.generator.ts ---
    // Covering line 72: API key in query.
    it('should generate auth interceptor for api key in query', async () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config = { options: {} } as any;
        const spec = {
            components: { securitySchemes: { ApiKey: { type: 'apiKey', in: 'query', name: 'key' } } }
        };
        const parser = new SwaggerParser(spec as any, config);
        const { AuthInterceptorGenerator } = await import('../src/service/emit/utility/auth-interceptor.generator.js');
        new AuthInterceptorGenerator(parser, project).generate('/out');
        const file = project.getSourceFileOrThrow('/out/auth/auth.interceptor.ts').getFullText();
        expect(file).toContain(`req.clone({ setParams: { 'key': this.apiKey } })`);
    });

    // --- src/service/emit/utility/index.generator.ts ---
    // Covering line 86: Main index when no services are generated.
    it('should generate main index without service exports if disabled', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config = { options: { generateServices: false } } as any;
        const parser = new SwaggerParser({} as any, config);
        const indexGen = new MainIndexGenerator(project, config, parser);
        indexGen.generateMainIndex('/out');
        const fileContent = project.getSourceFileOrThrow('/out/index.ts').getFullText();
        expect(fileContent).toContain('export * from "./models";');
        expect(fileContent).not.toContain('export * from "./services";');
    });

    // --- src/service/emit/utility/provider.generator.ts ---
    // Covering line 27: generateServices is false
    it('should not generate provider if generateServices is false', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config = { options: { generateServices: false } } as any;
        const parser = new SwaggerParser({} as any, config);
        const providerGen = new ProviderGenerator(parser, project);
        providerGen.generate('/out');
        expect(project.getSourceFile('/out/providers.ts')).toBeUndefined();
    });
});
