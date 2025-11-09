import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { MockDataGenerator } from '@src/service/emit/test/mock-data.generator.js';
import { ServiceTestGenerator } from '@src/service/emit/test/service-test.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types.js';
import { fullCRUD_Users, adminFormSpec } from '../shared/specs.js';
import { createTestProject } from '../shared/helpers.js';
import { groupPathsByController } from '@src/service/parse.js';
import { TypeGenerator } from "../../src/service/emit/type/type.generator.js";

/**
 * @fileoverview
 * Contains tests for the test-generation utilities (`MockDataGenerator` and `ServiceTestGenerator`).
 * These tests validate that the generated mock data and test files are correct and complete,
 * effectively testing the code that writes tests.
 */
describe('Generated Code: Service Test Generators', () => {

    describe('MockDataGenerator', () => {
        const createMockGenerator = (spec: object): MockDataGenerator => {
            const config: GeneratorConfig = { input: '', output: '/out', options: { dateType: 'string', enumStyle: 'enum' } };
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
            const config: GeneratorConfig = { input: '', output: '/out', clientName: 'Api', options: { dateType: 'string', enumStyle: 'enum' } };
            const parser = new SwaggerParser(fullCRUD_Users as any, config);

            // Dependencies for the generator
            new TypeGenerator(parser, project, config).generate('/out');

            const testGenerator = new ServiceTestGenerator(parser, project, config);
            const controllerGroups = groupPathsByController(parser);
            testGenerator.generateServiceTestFile('Users', controllerGroups['Users'], '/out/services');

            const specFile = project.getSourceFileOrThrow('/out/services/users.service.spec.ts');
            const content = specFile.getText();

            // General structure checks
            expect(content).toContain("describe('UsersService', () => {");
            expect(content).toContain("let service: UsersService;");
            expect(content).toContain("let httpMock: HttpTestingController;");
            expect(content).toContain("httpMock.verify();");
            // FIX: Use double quotes to match ts-morph output
            expect(content).toContain('import { User } from "../models";');

            // Check for a specific method test (GET collection)
            expect(content).toContain("describe('getUsers()', () => {");
            expect(content).toContain("it('should return User[] on success', () => {");
            // FIX: The generated mock data is now correctly an array
            expect(content).toContain("const mockResponse: User[] = [");
            expect(content).toContain("service.getUsers().subscribe(response => {");
            expect(content).toContain("const req = httpMock.expectOne(`/api/v1/users`);");
            expect(content).toContain("expect(req.request.method).toBe('GET');");
            expect(content).toContain("req.flush(mockResponse);");

            // Check error handling test
            expect(content).toContain("it('should handle a 404 error', () => {");
            expect(content).toContain("next: () => fail('should have failed with a 404 error'),");
            expect(content).toContain("req.flush('Not Found', { status: 404, statusText: 'Not Found' });");

            // Check method with body and path params (updateUser)
            expect(content).toContain("describe('updateUser()', () => {");
            expect(content).toContain("const user: User ="); // Body mock data
            expect(content).toContain("const id = 'test-id';"); // Path param mock data
            expect(content).toContain("service.updateUser(id, user).subscribe(response => {");
            expect(content).toContain("const req = httpMock.expectOne(`/api/v1/users/${id}`);");
            expect(content).toContain("expect(req.request.method).toBe('PUT');");
            expect(content).toContain("expect(req.request.body).toEqual(user);");
        });
    });
});
