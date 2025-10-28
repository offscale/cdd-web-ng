import { describe, it, expect, beforeEach } from 'vitest';
import { Project, IndentationText, ClassDeclaration, SourceFile } from 'ts-morph'; // Added ClassDeclaration and SourceFile
import { generateFromConfig } from '../../src/index.js';
import { GeneratorConfig } from '../../src/core/types.js';
import { fullE2ESpec } from '../admin/specs/test.specs.js';

describe('Integration: Service and Model Generation', () => {
    let project: Project;
    const config: GeneratorConfig = {
        input: '/test.spec.json',
        output: '/generated',
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

        // Check if primary files exist
        expect(project.getSourceFile('/generated/index.ts')).toBeDefined();
        const modelsFile = project.getSourceFileOrThrow('/generated/models/index.ts');
        expect(modelsFile).toBeDefined();
        expect(project.getSourceFile('/generated/services/index.ts')).toBeDefined();
        expect(project.getSourceFile('/generated/providers.ts')).toBeDefined();
        expect(project.getSourceFile('/generated/tokens/index.ts')).toBeDefined();
        const usersServiceFile = project.getSourceFileOrThrow('/generated/services/users.service.ts');
        expect(usersServiceFile).toBeDefined();

        // Verify model generation
        expect(modelsFile.getInterface('User')).toBeDefined();
        expect(modelsFile.getInterface('CreateUser')).toBeDefined();
        expect(modelsFile.getInterface('UpdateUser')).toBeDefined();

        // Verify service generation
        const serviceClass = usersServiceFile.getClassOrThrow('UsersService');

        // Check for expected methods
        expect(serviceClass.getMethod('getUsers')).toBeDefined();
        expect(serviceClass.getMethod('createUser')).toBeDefined();
        const getUserByIdMethod = serviceClass.getMethodOrThrow('getUserById');
        const updateUserMethod = serviceClass.getMethodOrThrow('updateUser');
        expect(serviceClass.getMethod('deleteUser')).toBeDefined();

        // Check getUserById method signature
        const getUserParams = getUserByIdMethod.getParameters();
        expect(getUserParams.length).toBeGreaterThan(0);
        expect(getUserParams[0].getName()).toBe('id');
        expect(getUserParams[0].getType().getText(usersServiceFile)).toBe('string');

        // Check updateUser method signature
        const updateUserParams = updateUserMethod.getParameters();
        expect(updateUserParams.length).toBeGreaterThan(0);
        expect(updateUserParams[0].getName()).toBe('body');
        expect(updateUserParams[0].getType().getText(usersServiceFile)).toBe('UpdateUser');
        expect(updateUserParams[1].getName()).toBe('id');
        expect(updateUserParams[1].getType().getText(usersServiceFile)).toBe('string');

        // Check the return type of a method
        const firstOverload = getUserByIdMethod.getOverloads()[0];
        const returnType = firstOverload.getReturnType().getText(usersServiceFile);
        expect(returnType).toBe('Observable<User>');
    });
});
