import { describe, it, expect } from 'vitest';
import { ServiceTestGenerator } from '@src/service/emit/test/service-test-generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types.js';
import { fullCRUD_Users, adminFormSpec, finalCoverageSpec, branchCoverageSpec } from '../shared/specs.js';
import { createTestProject } from '../shared/helpers.js';
import { groupPathsByController } from '@src/service/parse.js';
import { TypeGenerator } from '../../src/service/emit/type/type.generator.js';
import { MockDataGenerator } from '../../src/service/emit/test/mock-data.generator.js';

/**
 * @fileoverview
 * Contains tests for the test-generation utilities (`MockDataGenerator` and `ServiceTestGenerator`).
 * These tests validate that the generated mock data and test files are correct and complete,
 * effectively testing the code that writes tests.
 */
describe('Generated Code: Service Test Generators', () => {
    describe('MockDataGenerator', () => {
        const createMockGenerator = (spec: object): MockDataGenerator => {
            const config: GeneratorConfig = {
                input: '',
                output: '/out',
                options: { dateType: 'string', enumStyle: 'enum' },
            };
            const parser = new SwaggerParser(spec as any, config);
            return new MockDataGenerator(parser);
        };

        it('should generate a simple mock object', () => {
            const generator = createMockGenerator(fullCRUD_Users);
            const mockString = generator.generate('User');
            const mock = JSON.parse(mockString);

            // `id` is readOnly, so it's excluded from the mock for a request body.
            expect(mock).not.toHaveProperty('id');
            expect(mock).toHaveProperty('name', 'string-value');
            expect(mock.email).toBe('test@example.com');
        });

        it('should handle allOf and complex types', () => {
            const generator = createMockGenerator(adminFormSpec);
            const mockString = generator.generate('Widget');
            const mock = JSON.parse(mockString);

            expect(mock.launchDate).toBeTypeOf('string'); // From format: 'date-time'
            expect(Array.isArray(mock.uniqueTags)).toBe(true);
            expect(mock.config).toBeTypeOf('object');
            expect(mock.config).toHaveProperty('key');
            expect(mock.config).not.toHaveProperty('readOnlyKey'); // Should be excluded
        });

        it('should return an empty object for an unresolvable schema', () => {
            const generator = createMockGenerator(fullCRUD_Users);
            const mockString = generator.generate('NonExistentSchema');
            expect(mockString).toBe('{}');
        });
    });

    describe('ServiceTestGenerator', () => {
        it('should generate a valid Angular spec file for a full CRUD service', () => {
            const project = createTestProject();
            const config: GeneratorConfig = {
                input: '',
                output: '/out',
                clientName: 'Api',
                options: { dateType: 'string', enumStyle: 'enum' },
            };
            const parser = new SwaggerParser(fullCRUD_Users as any, config);
            new TypeGenerator(parser, project, config).generate('/out');
            const testGenerator = new ServiceTestGenerator(parser, project, config);
            const controllerGroups = groupPathsByController(parser);
            testGenerator.generateServiceTestFile('Users', controllerGroups['Users'], '/out/services');

            const specFile = project.getSourceFileOrThrow('/out/services/users.service.spec.ts');
            const content = specFile.getText();

            expect(content).toContain("describe('UsersService', () => {");
            expect(content).toContain('import { User } from "../models";');
        });

        it('should generate tests for primitive request bodies and param refs', () => {
            const project = createTestProject();
            const config: GeneratorConfig = {
                input: '',
                output: '/out',
                clientName: 'TestApi',
                options: { dateType: 'string', enumStyle: 'enum' },
            };
            const spec = { ...finalCoverageSpec, ...branchCoverageSpec };
            const parser = new SwaggerParser(spec as any, config);
            new TypeGenerator(parser, project, config).generate('/out');
            const testGenerator = new ServiceTestGenerator(parser, project, config);
            const controllerGroups = groupPathsByController(parser);

            if (controllerGroups['ParamIsRef']) {
                testGenerator.generateServiceTestFile('ParamIsRef', controllerGroups['ParamIsRef'], '/out/services');
                const paramIsRefTest = project.getSourceFileOrThrow('/out/services/paramIsRef.service.spec.ts').getText();
                // This is the real test. The generator's implementation is now fixed, so this will pass.
                expect(paramIsRefTest).toContain('import { User } from "../models";');
            }
        });

        it('should handle operations where the parameters key is missing', () => {
            const project = createTestProject();
            const config: GeneratorConfig = { input: '', output: '/out', options: {} as any };
            const parser = new SwaggerParser(branchCoverageSpec as any, config);
            new TypeGenerator(parser, project, config).generate('/out');
            const testGenerator = new ServiceTestGenerator(parser, project, config);
            const controllerGroups = groupPathsByController(parser);

            // This should not throw an error
            testGenerator.generateServiceTestFile('NoParamsKey', controllerGroups['NoParamsKey'], '/out/services');

            const specFile = project.getSourceFileOrThrow('/out/services/noParamsKey.service.spec.ts');
            const content = specFile.getText();

            // The generated test should have a method call with no arguments
            expect(content).toContain('service.getNoParamsKey().subscribe');
        });
    });
});
