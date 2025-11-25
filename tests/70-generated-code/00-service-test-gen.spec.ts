import { beforeEach, describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { ServiceMethodAnalyzer } from '@src/analysis/service-method-analyzer.js';
import { branchCoverageSpec, coverageSpec, finalCoveragePushSpec } from '../fixtures/coverage.fixture.js';
import { ServiceTestGenerator } from "@src/generators/angular/test/service-test-generator.js";
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
                enumStyle: 'enum'
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
                ...specPart.paths
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
            const userOps = parser.operations
                .filter(op => op.tags?.includes('Users'));

            setOperationMethodNames(userOps);

            // Check that we actually found operations to test
            expect(userOps.length).toBeGreaterThan(0);

            testGen.generateServiceTestFile('users', userOps as any, '/');
            const sourceFile = project.getSourceFileOrThrow('/users.service.spec.ts');
            const classText = sourceFile.getFullText();
            expect(classText).toContain('import { TestBed, fail } from "@angular/core/testing";');
            expect(classText).toContain("describe('UsersService'");
            expect(classText).toContain("it('should be created'");
            expect(classText).toContain("service.getUsers(");
            expect(classText).toContain("expect(response).toEqual(mockResponse)");
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
                            responses: { '200': { content: { 'application/json': { schema: { type: 'string' } } } } }
                        }
                    },
                    '/return-bool': {
                        get: {
                            operationId: 'returnBool',
                            responses: { '200': { content: { 'application/json': { schema: { type: 'boolean' } } } } }
                        }
                    },
                    '/return-model-array': {
                        get: {
                            operationId: 'returnModelArray',
                            responses: {
                                '200': {
                                    content: {
                                        'application/json': {
                                            schema: { type: 'array', items: { $ref: '#/components/schemas/TestModel' } }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    '/post-generic-object': {
                        post: {
                            operationId: 'postGeneric',
                            requestBody: {
                                content: {
                                    'application/json': {
                                        schema: { type: 'object', properties: { arbitrary: { type: 'string' } } }
                                    }
                                }
                            },
                            responses: { '200': {} }
                        }
                    }
                },
                components: {
                    schemas: {
                        TestModel: { type: 'object', properties: { id: { type: 'integer' } } }
                    }
                }
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
            expect(text).toContain("const mockResponse = true;");

            // Array Model response: explicit array type validation
            // Matches `if (responseType.endsWith('[]'))`
            expect(text).toContain("const mockResponse: TestModel[] = [");

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
    });
});
