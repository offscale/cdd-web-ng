import { describe, expect, it } from 'vitest';
import { ServiceTestGenerator } from '@src/service/emit/test/service-test-generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types.js';
import { adminFormSpec, branchCoverageSpec, finalCoverageSpec, fullCRUD_Users } from '../shared/specs.js';
import { createTestProject } from '../shared/helpers.js';
import { groupPathsByController } from '@src/service/parse.js';
import { TypeGenerator } from '@src/service/emit/type/type.generator.js';
import { MockDataGenerator } from "@src/service/emit/test/mock-data.generator.js";

/**
 * @fileoverview
 * Contains tests for the test-generation utilities (`MockDataGenerator` and `ServiceTestGenerator`).
 * These tests validate that the generated mock data and test files are correct and complete,
 * effectively testing the code that writes tests.
 */
describe('Generated Code: Service Test Generators', () => {
    const ensureValid = (spec: any) => ({
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0' },
        ...spec
    });

    describe('MockDataGenerator', () => {
        const createMockGenerator = (spec: object): MockDataGenerator => {
            const config: GeneratorConfig = {
                input: '',
                output: '/out',
                options: { dateType: 'string', enumStyle: 'enum' },
            };
            // Patch validation
            const parser = new SwaggerParser(ensureValid(spec), config);
            return new MockDataGenerator(parser);
        };

        it('should generate a simple mock object', () => {
            const generator = createMockGenerator(fullCRUD_Users);
            const mockString = generator.generate('User');
            const mock = JSON.parse(mockString);

            expect(mock).not.toHaveProperty('id');
            expect(mock).toHaveProperty('name', 'string-value');
            expect(mock.email).toBe('test@example.com');
        });

        it('should handle allOf and complex types', () => {
            const generator = createMockGenerator(adminFormSpec);
            const mockString = generator.generate('Widget');
            const mock = JSON.parse(mockString);

            expect(mock.launchDate).toBeTypeOf('string');
            expect(Array.isArray(mock.uniqueTags)).toBe(true);
            expect(mock.config).toBeTypeOf('object');
            expect(mock.config).toHaveProperty('key');
            expect(mock.config).not.toHaveProperty('readOnlyKey');
        });

        it('should return an empty object for an unresolvable schema', () => {
            const generator = createMockGenerator(fullCRUD_Users);
            const mockString = generator.generate('NonExistentSchema');
            expect(mockString).toBe('{}');
        });
    });

    describe('ServiceTestGenerator', () => {
        const setupTestGen = (spec: object) => {
            const project = createTestProject();
            const config: GeneratorConfig = {
                input: '',
                output: '/out',
                clientName: 'Api',
                options: { dateType: 'string', enumStyle: 'enum' },
            };
            // Patch validation
            const parser = new SwaggerParser(ensureValid(spec), config);
            new TypeGenerator(parser, project, config).generate('/out');
            const testGenerator = new ServiceTestGenerator(parser, project, config);
            const controllerGroups = groupPathsByController(parser);
            return { testGenerator, controllerGroups, project, parser };
        };

        it('should generate a valid Angular spec file for a full CRUD service', () => {
            const { testGenerator, controllerGroups, project } = setupTestGen(fullCRUD_Users);
            testGenerator.generateServiceTestFile('Users', controllerGroups['Users'], '/out/services');

            const specFile = project.getSourceFileOrThrow('/out/services/users.service.spec.ts');
            const content = specFile.getText();

            expect(content).toContain("describe('UsersService', () => {");
            expect(content).toContain('import { User } from "../models";');
        });

        it('should generate tests for primitive request bodies and param refs', () => {
            const spec = { ...finalCoverageSpec, ...branchCoverageSpec };
            const { testGenerator, controllerGroups, project } = setupTestGen(spec);

            if (controllerGroups['ParamIsRef']) {
                testGenerator.generateServiceTestFile('ParamIsRef', controllerGroups['ParamIsRef'], '/out/services');
                const paramIsRefTest = project.getSourceFileOrThrow('/out/services/paramIsRef.service.spec.ts').getText();
                expect(paramIsRefTest).toContain('import { User } from "../models";');
            }
        });

        it('should handle operations where the parameters key is missing', () => {
            const { testGenerator, controllerGroups, project } = setupTestGen(branchCoverageSpec);
            testGenerator.generateServiceTestFile('NoParamsKey', controllerGroups['NoParamsKey'], '/out/services');

            const specFile = project.getSourceFileOrThrow('/out/services/noParamsKey.service.spec.ts');
            const content = specFile.getText();

            expect(content).toContain('service.getNoParamsKey().subscribe');
        });

        it('collectModelImports should return an empty set if operations are undefined', () => {
            const { parser } = setupTestGen(fullCRUD_Users);
            // We only need the generator instance to call the private method, project doesn't matter here.
            const testGenerator = new ServiceTestGenerator(parser, createTestProject(), {} as any);

            // This directly calls the private method with undefined to hit the uncovered branch.
            // We cast to `any` to bypass TypeScript's type checking for the test.
            const result = (testGenerator as any).collectModelImports(undefined);

            expect(result).toBeInstanceOf(Set);
            expect(result.size).toBe(0);
        });

        it('should handle inline object request body when generating tests', () => {
            const spec = {
                ...fullCRUD_Users,
                paths: {
                    '/inline': {
                        post: {
                            tags: ['Inline'],
                            operationId: 'postInline',
                            requestBody: {
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: { data: { type: 'string' } }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            };
            const { testGenerator, controllerGroups, project } = setupTestGen(spec);
            testGenerator.generateServiceTestFile('Inline', controllerGroups['Inline'], '/out/services');
            const specFile = project.getSourceFileOrThrow('/out/services/inline.service.spec.ts');
            expect(specFile.getText()).toContain("const body = { data: 'test-body' };");
        });

        it('should generate tests for operation with no request body', () => {
            const spec = {
                paths: {
                    '/no-body': {
                        post: { // POST with no request body
                            tags: ['NoBody'],
                            operationId: 'postNoBody',
                            responses: { '204': {} }
                        }
                    }
                }
            };
            const { testGenerator, controllerGroups, project } = setupTestGen(spec);
            testGenerator.generateServiceTestFile('NoBody', controllerGroups['NoBody'], '/out/services');
            const specFile = project.getSourceFileOrThrow('/out/services/noBody.service.spec.ts');
            const content = specFile.getText();

            // This covers the branch where bodyParam is null
            expect(content).toContain('service.postNoBody().subscribe');
            expect(content).not.toContain('const body =');
        });

        it('should generate test for parameter with an unresolvable ref', () => {
            const spec = {
                paths: {
                    '/bad-param-ref': {
                        get: {
                            tags: ['BadParam'],
                            operationId: 'getBadParam',
                            parameters: [{ name: 'bad', in: 'query', schema: { $ref: '#/c/s/nonexistent' } }],
                            responses: { '204': {} }
                        }
                    }
                }
            };
            const { testGenerator, controllerGroups, project } = setupTestGen(spec);
            testGenerator.generateServiceTestFile('BadParam', controllerGroups['BadParam'], '/out/services');
            const specFile = project.getSourceFileOrThrow('/out/services/badParam.service.spec.ts');
            const content = specFile.getText();

            // This covers the branch where resolvedSchema is undefined
            expect(content).toContain("const bad = 'test-bad';"); // It should fall back to string generation
        });
    });
});
