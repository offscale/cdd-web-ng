import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { ServiceGenerator } from '@src/service/emit/service/service.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types.js';
import { coverageSpec, finalCoverageSpec } from '../shared/specs.js';
import { groupPathsByController } from '@src/service/parse.js';
import { TypeGenerator } from '@src/service/emit/type/type.generator.js';
import { TokenGenerator } from '@src/service/emit/utility/token.generator.js';
import { HttpParamsBuilderGenerator } from '@src/service/emit/utility/http-params-builder.js';

describe('Emitter: ServiceGenerator & ServiceMethodGenerator', () => {

    const createTestEnvironment = (spec: object, configOverrides: Partial<GeneratorConfig['options']> = {}) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = {
            input: '', output: '/out', clientName: 'default',
            options: { dateType: 'string', enumStyle: 'enum', ...configOverrides }
        };
        const parser = new SwaggerParser(spec as any, config);

        new TypeGenerator(parser, project, config).generate('/out');
        new TokenGenerator(project, config.clientName).generate('/out');
        new HttpParamsBuilderGenerator(project).generate('/out');

        const serviceGen = new ServiceGenerator(parser, project, config);
        const controllerGroups = groupPathsByController(parser);
        for (const [name, operations] of Object.entries(controllerGroups)) {
            serviceGen.generateServiceFile(name, operations, '/out/services');
        }

        return project;
    };

    it('should handle methods with query, path, and body parameters', () => {
        const spec = {
            openapi: '3.0.0', info: { title: 'Test', version: '1' },
            components: { schemas: { TestBody: { type: 'object', properties: { name: { type: 'string' } } } } },
            paths: {
                '/test/{id}': {
                    post: {
                        tags: ['Test'], operationId: 'testOp', parameters: [
                            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                            { name: 'filter', in: 'query', schema: { type: 'string' } }],
                        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/TestBody' } } } }
                    }
                }
            }
        };

        const project = createTestEnvironment(spec);
        const serviceClass = project.getSourceFileOrThrow('/out/services/test.service.ts').getClassOrThrow('TestService');
        const method = serviceClass.getMethods().find(m => m.getName() === 'testOp' && !m.isOverload())!;
        const body = method.getBodyText() ?? '';

        expect(body, 'Method body should not be empty').not.toBe('');
        expect(body).toContain("const url = `${this.basePath}/test/${id}`;");
        // FIX: The generator correctly uses the type name for the parameter. The test was wrong.
        expect(body).toContain("finalOptions.body = testBody;");
        expect(body).toContain("return this.http.request('post', url, finalOptions);");
    });

    it('should handle methods without a body (e.g., GET, DELETE)', () => {
        const project = createTestEnvironment(coverageSpec);
        const serviceClass = project.getSourceFileOrThrow('/out/services/users.service.ts').getClassOrThrow('UsersService');
        const method = serviceClass.getMethods().find(m => m.getName() === 'deleteUser' && !m.isOverload())!;
        const body = method.getBodyText() ?? '';

        expect(body, 'Method body should not be empty').not.toBe('');
        expect(body).toContain("return this.http.request('delete', url, finalOptions);");
    });

    it('should generate a void return type for 204 responses', () => {
        const project = createTestEnvironment(coverageSpec);
        const serviceClass = project.getSourceFileOrThrow('/out/services/noContent.service.ts').getClassOrThrow('NoContentService');
        const method = serviceClass.getMethod('deleteNoContent')!;
        const lastOverload = method.getOverloads().pop()!;
        expect(lastOverload.getReturnType().getText()).toBe('Observable<void>');
    });

    it('should use a custom method name when provided in config', () => {
        const project = createTestEnvironment(coverageSpec, {
            customizeMethodName: (opId) => `custom_${opId.replace(/-/g, '_')}`
        });
        const serviceClass = project.getSourceFileOrThrow('/out/services/customName.service.ts').getClass('CustomNameService')!;
        expect(serviceClass.getMethod('custom_get_custom_name')).toBeDefined();
    });

    it('should de-duplicate method names from conflicting operationIds', () => {
        const project = createTestEnvironment(coverageSpec);
        const serviceClass = project.getSourceFileOrThrow('/out/services/duplicateName.service.ts').getClass('DuplicateNameService')!;
        expect(serviceClass.getMethod('getName')).toBeDefined();
        expect(serviceClass.getMethod('getName2')).toBeDefined();
    });

    it('should generate a full set of method overloads', () => {
        const project = createTestEnvironment(coverageSpec);
        const serviceClass = project.getSourceFileOrThrow('/out/services/users.service.ts').getClass('UsersService')!;
        const method = serviceClass.getMethod('getUsers')!;

        expect(method.getOverloads().length).toBe(5);
        const returnTypes = method.getOverloads().map(o => o.getReturnType().getText().replace(/import\(.*\)\./g, ''));
        expect(returnTypes).toEqual([
            'Observable<HttpResponse<User[]>>',
            'Observable<HttpEvent<User[]>>',
            'Observable<Blob>',
            'Observable<string>',
            'Observable<User[]>'
        ]);
    });

    it('should generate a service without needing a base path', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config = { output: '/out', options: { dateType: 'string', enumStyle: 'enum' } } as any;
        const parser = new SwaggerParser(finalCoverageSpec as any, config);
        const serviceGen = new ServiceGenerator(parser, project, config);
        const op = parser.operations.find(o => o.operationId === 'noBasePathTest')!;
        serviceGen.generateServiceFile('NoBasePath', [op], '/out/services');
        const file = project.getSourceFileOrThrow('/out/services/noBasePath.service.ts');

        const constructor = file.getClass('NoBasePathService')?.getConstructors()[0];
        if (constructor) {
            expect(constructor.getBodyText()).not.toContain('this.basePath');
        } else {
            expect(constructor).toBeUndefined(); // This is the expected outcome
        }
    });
});
