import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { ServiceMethodAnalyzer } from '@src/analysis/service-method-analyzer.js';
import { branchCoverageSpec, coverageSpec, finalCoveragePushSpec } from '../fixtures/coverage.fixture.js';
import { ServiceTestGenerator } from '@src/generators/angular/test/service-test-generator.js';
import { camelCase } from '@src/core/utils/index.js';

/**
 * Propagates op.operationId to op.methodName if missing
 */
function setOperationMethodNames(operations: any[]) {
    for (const op of operations) {
        if (op && op.operationId && !op.methodName) {
            op.methodName = camelCase(op.operationId);
        }
    }
}

describe('Generated Code: Service Test Generators', () => {
    let project: Project;
    let config: GeneratorConfig;

    beforeEach(() => {
        project = new Project({ useInMemoryFileSystem: true });
        config = {
            input: '',
            output: '',
            options: {
                dateType: 'string',
                enumStyle: 'enum',
            },
        };
    });

    /**
     * Setup function that always sets methodName on operations as needed.
     */
    const setupTestGen = (specPart: any) => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test Gen', version: '1.0' },
            paths: {
                '/dummy': { get: { responses: { '204': { description: 'ok' } } } },
                ...specPart.paths,
            },
            components: specPart.components || {},
        };
        const parser = new SwaggerParser(spec as any, config);
        const analyzer = new ServiceMethodAnalyzer(config, parser);
        const testGen = new ServiceTestGenerator(parser, project, config);
        return { parser, analyzer, testGen };
    };

    describe('ServiceTestGenerator', () => {
        it('should generate a basic service test file', () => {
            const { parser, testGen } = setupTestGen(coverageSpec);
            const userOps = parser.operations.filter(op => op.tags?.includes('Users'));

            setOperationMethodNames(userOps);

            // Check that we actually found operations to test
            expect(userOps.length).toBeGreaterThan(0);

            testGen.generateServiceTestFile('users', userOps as any, '/');
            const sourceFile = project.getSourceFileOrThrow('/users.service.spec.ts');
            const classText = sourceFile.getFullText();
            expect(classText).toContain('import { TestBed, fail } from "@angular/core/testing";');
            expect(classText).toContain("describe('UsersService'");
            expect(classText).toContain("it('should be created'");
            expect(classText).toContain('service.getUsers(');
            expect(classText).toContain('expect(response).toEqual(mockResponse)');
        });

        it('should handle primitive request/response types and param refs', () => {
            const { parser, testGen } = setupTestGen(finalCoveragePushSpec);
            const operations = [
                parser.operations.find(o => o.operationId === 'getPrimitive'),
                parser.operations.find(o => o.operationId === 'postPrimitive'),
                parser.operations.find(o => o.operationId === 'getWithPrimitiveParam'),
            ].filter(Boolean);
            setOperationMethodNames(operations as any[]);

            expect(operations.length).toBe(3);

            testGen.generateServiceTestFile('service', operations as any, '/');
            const sourceFile = project.getSourceFileOrThrow('/service.service.spec.ts');
            const text = sourceFile.getFullText();

            // getPrimitive returns number
            expect(text).toContain(`service.getPrimitive().subscribe({`);
            expect(text).toContain('const mockResponse = 123;');

            // postPrimitive takes string body
            expect(text).toContain(`service.postPrimitive(body).subscribe({`);
            // Primitive string body declaration coverage
            expect(text).toContain("const body = 'test-body';");

            expect(text).toContain(`service.getWithPrimitiveParam(id).subscribe({`);
        });

        it('should handle operations with no parameters', () => {
            const { parser, testGen } = setupTestGen(branchCoverageSpec);
            const op = parser.operations.find(op => op.operationId === 'getRoot');
            expect(op).toBeDefined();

            if (!op!.methodName) op!.methodName = camelCase(op!.operationId!);

            testGen.generateServiceTestFile('no-params', [op] as any, '/');
            const sourceFile = project.getSourceFileOrThrow('/noParams.service.spec.ts');
            const text = sourceFile.getFullText();

            expect(text).toContain('service.getRoot().subscribe({');
        });

        it('should handle edge case responses (string, boolean, model arrays) and non-model mixed bodies', () => {
            // Create specialized parser for edge cases covering remaining branches
            const edgeCaseSpec = {
                openapi: '3.0.0',
                info: { title: 'Edge', version: '1' },
                paths: {
                    '/return-string': {
                        get: {
                            operationId: 'returnString',
                            responses: { '200': { content: { 'application/json': { schema: { type: 'string' } } } } },
                        },
                    },
                    '/return-bool': {
                        get: {
                            operationId: 'returnBool',
                            responses: { '200': { content: { 'application/json': { schema: { type: 'boolean' } } } } },
                        },
                    },
                    '/return-model-array': {
                        get: {
                            operationId: 'returnModelArray',
                            responses: {
                                '200': {
                                    content: {
                                        'application/json': {
                                            schema: {
                                                type: 'array',
                                                items: { $ref: '#/components/schemas/TestModel' },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    '/post-generic-object': {
                        post: {
                            operationId: 'postGeneric',
                            requestBody: {
                                content: {
                                    'application/json': {
                                        schema: { type: 'object', properties: { arbitrary: { type: 'string' } } },
                                    },
                                },
                            },
                            responses: { '200': {} },
                        },
                    },
                },
                components: {
                    schemas: {
                        TestModel: { type: 'object', properties: { id: { type: 'integer' } } },
                    },
                },
            };

            const { parser, testGen } = setupTestGen(edgeCaseSpec);
            const ops = parser.operations;
            setOperationMethodNames(ops as any[]);

            testGen.generateServiceTestFile('edge', ops as any, '/');
            const sourceFile = project.getSourceFileOrThrow('/edge.service.spec.ts');
            const text = sourceFile.getFullText();

            // String response
            expect(text).toContain("const mockResponse = 'test-string';");

            // Boolean response
            expect(text).toContain('const mockResponse = true;');

            // Array Model response: explicit array type validation
            // Matches `if (responseType.endsWith('[]'))`
            expect(text).toContain('const mockResponse: TestModel[] = [');

            // Generic Object Body: schema is object but no interface generated -> unknown model
            // Matches `} else if (bodyParam) {` fallback for non-primitive, non-model bodies
            expect(text).toContain("const body = { data: 'test-body' };");
        });

        it('should safe-guard against null operations in internal imports collection method', () => {
            // Directly access private method to test defensive coding branch without crashing public API
            const { testGen } = setupTestGen({ paths: {} });
            // @ts-ignore accessing private method
            const result = testGen.collectModelImports(null);

            expect(result).toBeDefined();
            expect(result.size).toBe(0);
        });

        it('should use parameter example value if provided in spec', () => {
            const exampleSpec = {
                openapi: '3.0.0',
                info: { title: 'Param Example', version: '1.0' },
                paths: {
                    '/example/{id}': {
                        get: {
                            operationId: 'getWithExample',
                            parameters: [
                                {
                                    name: 'id',
                                    in: 'path',
                                    required: true,
                                    schema: { type: 'string' },
                                    example: 'user-123',
                                },
                            ],
                            responses: { '200': {} },
                        },
                    },
                },
            };

            const { parser, testGen } = setupTestGen(exampleSpec);
            const ops = parser.operations;
            setOperationMethodNames(ops as any[]);

            testGen.generateServiceTestFile('example', ops as any, '/');
            const sourceFile = project.getSourceFileOrThrow('/example.service.spec.ts');
            const text = sourceFile.getFullText();

            // Should use 'user-123' instead of generic 'test-id'
            expect(text).toContain("const id = 'user-123';");
        });

        it('should fallback to examples map if example field is missing', () => {
            const examplesSpec = {
                openapi: '3.0.0',
                info: { title: 'Params Examples Map', version: '1.0' },
                paths: {
                    '/examples-map': {
                        get: {
                            operationId: 'getWithExamplesMap',
                            parameters: [
                                {
                                    name: 'status',
                                    in: 'query',
                                    schema: { type: 'string' },
                                    examples: {
                                        active: { value: 'active-status' },
                                        inactive: { value: 'inactive-status' },
                                    },
                                },
                            ],
                            responses: { '200': {} },
                        },
                    },
                },
            };

            const { parser, testGen } = setupTestGen(examplesSpec);
            const ops = parser.operations;
            setOperationMethodNames(ops as any[]);

            testGen.generateServiceTestFile('examples', ops as any, '/');
            const sourceFile = project.getSourceFileOrThrow('/examples.service.spec.ts');
            const text = sourceFile.getFullText();

            // Should use first example 'active-status'
            expect(text).toContain("const status = 'active-status';");
        });

        it('should use OAS 3.2 dataValue from parameter examples', () => {
            const oas32Spec = {
                openapi: '3.2.0',
                info: { title: 'OAS 3.2 Params', version: '1.0' },
                paths: {
                    '/data-val': {
                        get: {
                            operationId: 'getDataVal',
                            parameters: [
                                {
                                    name: 'filter',
                                    in: 'query',
                                    schema: { type: 'string' },
                                    examples: {
                                        valid: {
                                            summary: 'A valid filter',
                                            dataValue: 'active_filter',
                                            serializedValue: 'ignore_me',
                                        },
                                    },
                                },
                            ],
                            responses: { '200': {} },
                        },
                    },
                },
            };

            const { parser, testGen } = setupTestGen(oas32Spec);
            const ops = parser.operations;
            setOperationMethodNames(ops as any[]);

            testGen.generateServiceTestFile('example', ops as any, '/');
            const sourceFile = project.getSourceFileOrThrow('/example.service.spec.ts');
            const text = sourceFile.getFullText();

            // Should use 'active_filter' from dataValue
            expect(text).toContain("const filter = 'active_filter';");
            expect(text).not.toContain('ignore_me');
        });

        it('should generate mock data for model parameters', () => {
            const modelParamSpec = {
                openapi: '3.0.0',
                info: { title: 'Model Param', version: '1.0' },
                paths: {
                    '/with-model': {
                        get: {
                            operationId: 'getWithModel',
                            parameters: [
                                { name: 'filter', in: 'query', schema: { $ref: '#/components/schemas/Filter' } },
                            ],
                            responses: { '200': {} },
                        },
                    },
                },
                components: {
                    schemas: {
                        Filter: { type: 'object', properties: { id: { type: 'string' } } },
                    },
                },
            };

            const { parser, testGen } = setupTestGen(modelParamSpec);
            const ops = parser.operations;
            setOperationMethodNames(ops as any[]);

            testGen.generateServiceTestFile('model', ops as any, '/');
            const sourceFile = project.getSourceFileOrThrow('/model.service.spec.ts');
            const text = sourceFile.getFullText();

            expect(text).toContain('const filter: Filter =');
        });

        it('should cover example extraction branches directly', () => {
            const { parser, testGen } = setupTestGen({ paths: {} });

            // examples map with dataValue/value/serializedValue
            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    examples: { a: { dataValue: 'dv' } },
                }),
            ).toBe("'dv'");

            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    examples: { a: { value: 'val' } },
                }),
            ).toBe("'val'");

            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    examples: { a: { serializedValue: 'ser' } },
                }),
            ).toBe("'ser'");

            const resolveSpy = vi
                .spyOn(parser, 'resolveReference')
                .mockReturnValueOnce({ dataValue: 'rdv' })
                .mockReturnValueOnce({ value: 'rval' })
                .mockReturnValueOnce({ serializedValue: 'rser' });

            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    examples: { a: { $ref: '#/components/examples/Example' } },
                }),
            ).toBe("'rdv'");

            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    examples: { a: { $ref: '#/components/examples/Example' } },
                }),
            ).toBe("'rval'");

            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    examples: { a: { $ref: '#/components/examples/Example' } },
                }),
            ).toBe("'rser'");

            resolveSpy.mockRestore();

            // examples map with empty object (no keys)
            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    examples: {},
                }),
            ).toBeUndefined();

            // examples map object missing known example keys
            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    examples: { a: { note: 'missing' } },
                }),
            ).toBeUndefined();

            const unresolvedSpy = vi.spyOn(parser, 'resolveReference').mockReturnValueOnce(undefined);
            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    examples: { a: { $ref: '#/components/examples/Missing' } },
                }),
            ).toBeUndefined();
            unresolvedSpy.mockRestore();

            // examples map literal value
            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    examples: { a: 'literal' },
                }),
            ).toBe("'literal'");

            // schema-based examples
            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string', dataValue: 'sdv' },
                }),
            ).toBe("'sdv'");

            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string', example: 'sex' },
                }),
            ).toBe("'sex'");

            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string', examples: ['ex1'] },
                }),
            ).toBe("'ex1'");

            // schema $ref should skip schema example branch
            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { $ref: '#/components/schemas/RefType' },
                }),
            ).toBeUndefined();

            // content examples
            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    content: { 'application/json': { example: { a: 1 } } },
                }),
            ).toBe(JSON.stringify({ a: 1 }));

            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    content: {},
                }),
            ).toBeUndefined();

            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    content: { 'application/json': {} },
                }),
            ).toBeUndefined();

            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    content: { 'application/json': { examples: {} } },
                }),
            ).toBeUndefined();

            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    content: { 'application/json': { examples: { a: 'literal' } } },
                }),
            ).toBeUndefined();

            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    content: {
                        'application/json': {
                            examples: { a: { dataValue: 'cdv' } },
                        },
                    },
                }),
            ).toBe("'cdv'");

            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    content: {
                        'application/json': {
                            examples: { a: { value: 42 } },
                        },
                    },
                }),
            ).toBe('42');

            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    content: {
                        'application/json': {
                            examples: { a: { serializedValue: 'cser' } },
                        },
                    },
                }),
            ).toBe("'cser'");
        });

        it('should cover example fallthroughs without value keys', () => {
            const { parser, testGen } = setupTestGen({ paths: {} });

            const resolvedSerialized = Object.create(null) as any;
            resolvedSerialized.serializedValue = 'rser-null';

            const resolveSpy = vi.spyOn(parser, 'resolveReference').mockReturnValueOnce(resolvedSerialized);
            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    examples: { a: { $ref: '#/components/examples/Example' } },
                }),
            ).toBe("'rser-null'");
            resolveSpy.mockRestore();

            const emptyExamples = Object.create(null);
            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    examples: emptyExamples,
                }),
            ).toBeUndefined();

            const contentSerialized = Object.create(null) as any;
            contentSerialized.serializedValue = 'cser-null';
            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    content: {
                        'application/json': {
                            examples: { a: contentSerialized },
                        },
                    },
                }),
            ).toBe("'cser-null'");
        });

        it('should cover serializedValue fallbacks for resolved and content examples', () => {
            const { parser, testGen } = setupTestGen({ paths: {} });

            const resolvedSpy = vi.spyOn(parser, 'resolveReference').mockReturnValueOnce({ serializedValue: 'only' });
            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    examples: { a: { $ref: '#/components/examples/Example' } },
                }),
            ).toBe("'only'");
            resolvedSpy.mockRestore();

            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    content: {
                        'application/json': {
                            examples: { a: { serializedValue: 'only-content' } },
                        },
                    },
                }),
            ).toBe("'only-content'");

            expect(
                (testGen as any).getParameterExampleValue({
                    name: 'p',
                    in: 'query',
                    schema: { type: 'string' },
                    examples: {},
                }),
            ).toBeUndefined();
        });

        it('should handle undefined parameters in internal helpers', () => {
            const { testGen } = setupTestGen({ paths: {} });

            const output = (testGen as any).generateMethodTests([
                {
                    methodName: 'doThing',
                    method: 'GET',
                    path: '/things/{id}',
                    responses: { '200': {} },
                    parameters: undefined,
                },
            ]);

            expect(output.join('\n')).toContain('doThing');

            const imports = (testGen as any).collectModelImports([
                {
                    method: 'GET',
                    path: '/things/{id}',
                    responses: { '200': {} },
                    parameters: undefined,
                },
            ]);

            expect(imports.size).toBe(0);
        });

        it('should handle primitive defaults in generateDefaultPrimitiveValue', () => {
            const { testGen } = setupTestGen({ paths: {} });

            expect((testGen as any).generateDefaultPrimitiveValue({ type: 'integer' })).toBe('123');
            expect((testGen as any).generateDefaultPrimitiveValue({ type: 'boolean' })).toBe('true');
            expect((testGen as any).generateDefaultPrimitiveValue({ type: 'string' })).toBe("'test-value'");
        });

        it('collectModelImports should include response, body, and parameter models', () => {
            const spec = {
                openapi: '3.0.0',
                info: { title: 'Imports', version: '1.0' },
                paths: {
                    '/with-models': {
                        post: {
                            operationId: 'postModels',
                            parameters: [
                                { name: 'filter', in: 'query', schema: { $ref: '#/components/schemas/Filter' } },
                            ],
                            requestBody: {
                                content: {
                                    'application/json': { schema: { $ref: '#/components/schemas/BodyModel' } },
                                },
                            },
                            responses: {
                                '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Resp' } } } },
                            },
                        },
                    },
                },
                components: {
                    schemas: {
                        Filter: { type: 'object', properties: { id: { type: 'string' } } },
                        BodyModel: { type: 'object', properties: { name: { type: 'string' } } },
                        Resp: { type: 'object', properties: { ok: { type: 'boolean' } } },
                    },
                },
            };

            const { parser, testGen } = setupTestGen(spec);
            const imports = (testGen as any).collectModelImports(parser.operations);

            expect(imports.has('Filter')).toBe(true);
            expect(imports.has('BodyModel')).toBe(true);
            expect(imports.has('Resp')).toBe(true);
        });
    });
});
