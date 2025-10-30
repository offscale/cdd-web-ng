// ./tests/service/service-generation.spec.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { Project, IndentationText } from 'ts-morph';
import { generateFromConfig } from '../../src/index.js';
import { GeneratorConfig } from '../../src/core/types.js';
import { fullE2ESpec } from '../admin/specs/test.specs.js';

describe('Integration: Service and Model Generation', () => {
    let project: Project;
    const config: GeneratorConfig = {
        input: '/test.spec.json',  // FIX: Use absolute path
        output: '/generated',      // FIX: Use absolute path
        clientName: 'TestClient',
        options: {
            dateType: 'Date',
            enumStyle: 'enum',
            generateServices: true,
        },
    };
    const specObject = JSON.parse(fullE2ESpec);

    beforeEach(() => {
        project = new Project({
            useInMemoryFileSystem: true,
            manipulationSettings: { indentationText: IndentationText.TwoSpaces },
        });
    });

    it('should generate services, models, and all utility files correctly', async () => {
        await generateFromConfig(config, project, { spec: specObject });

        // Check if primary files exist using absolute paths
        expect(project.getSourceFile('/generated/index.ts')).toBeDefined();
        expect(project.getSourceFile('/generated/models/index.ts')).toBeDefined();
        expect(project.getSourceFile('/generated/services/index.ts')).toBeDefined();
        expect(project.getSourceFile('/generated/providers.ts')).toBeDefined();
        expect(project.getSourceFile('/generated/tokens/index.ts')).toBeDefined();
        expect(project.getSourceFile('/generated/services/users.service.ts')).toBeDefined();

        // Verify model generation
        const modelsFile = project.getSourceFileOrThrow('/generated/models/index.ts');
        expect(modelsFile.getInterface('User')).toBeDefined();
        expect(modelsFile.getInterface('CreateUser')).toBeDefined();
        expect(modelsFile.getInterface('UpdateUser')).toBeDefined();

        // Verify service generation
        const usersServiceFile = project.getSourceFileOrThrow('/generated/services/users.service.ts');
        const serviceClass = usersServiceFile.getClassOrThrow('UsersService');

        // Check for expected methods
        expect(serviceClass.getMethod('getUsers')).toBeDefined();
        expect(serviceClass.getMethod('createUser')).toBeDefined();
        expect(serviceClass.getMethod('getUserById')).toBeDefined();
        expect(serviceClass.getMethod('updateUser')).toBeDefined();
        expect(serviceClass.getMethod('deleteUser')).toBeDefined();

        // Check a method signature
        const getUserByIdMethod = serviceClass.getMethodOrThrow('getUserById');
        const params = getUserByIdMethod.getParameters();
        expect(params.length).toBeGreaterThan(0);
        expect(params[0].getName()).toBe('id');
        expect(params[0].getType().getText()).toBe('string');

        const returnType = getUserByIdMethod.getOverloads()[0].getReturnType().getText();
        expect(returnType).toContain('Observable<');
        expect(returnType).toContain('User>');
    });
});
