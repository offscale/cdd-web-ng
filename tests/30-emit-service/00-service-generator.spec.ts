// tests/30-emit-service/00-service-generator.spec.ts

import { describe, it, expect } from 'vitest';
import { Project, Scope } from 'ts-morph';
import { ServiceGenerator } from '@src/service/emit/service/service.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types.js';
import { coverageSpec } from '../shared/specs.js';
import { groupPathsByController } from '@src/service/parse.js';
import { TypeGenerator } from '@src/service/emit/type/type.generator.js';
import { TokenGenerator } from '@src/service/emit/utility/token.generator.js';
import { HttpParamsBuilderGenerator } from '@src/service/emit/utility/http-params-builder.js';

describe('Emitter: ServiceGenerator', () => {

    const createTestEnvironment = (spec: object, configOverrides: Partial<GeneratorConfig['options']> = {}) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = {
            input: '', output: '/out', clientName: 'default',
            options: { dateType: 'string', enumStyle: 'enum', ...configOverrides }
        };
        const parser = new SwaggerParser(spec as any, config);

        // Pre-generate dependencies
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
        const project = createTestEnvironment(coverageSpec);
        const serviceClass = project.getSourceFileOrThrow('/out/services/users.service.ts').getClassOrThrow('UsersService');
        const method = serviceClass.getMethods().find(m => m.getName() === 'updateUser' && !m.isOverload())!;
        const body = method.getBodyText() ?? '';

        expect(body).toContain("const url = `${this.basePath}/users/${id}`;");
        expect(body).toContain("finalOptions.body = user;");
        expect(body).toContain("return this.http.request('put', url, finalOptions);");
    });

    it('should generate a void return type for 204 responses', () => {
        const project = createTestEnvironment(coverageSpec);
        const serviceClass = project.getSourceFileOrThrow('/out/services/noContent.service.ts').getClassOrThrow('NoContentService');
        const method = serviceClass.getMethodOrThrow('deleteNoContent');
        const lastOverload = method.getOverloads().pop()!;
        expect(lastOverload.getReturnType().getText()).toBe('Observable<void>');
    });

    it('should use a custom method name when provided in config', () => {
        const project = createTestEnvironment(coverageSpec, {
            customizeMethodName: (opId) => `custom_${opId.replace(/-/g, '_')}`
        });
        const serviceFile = project.getSourceFileOrThrow('/out/services/customName.service.ts');
        const serviceClass = serviceFile.getClassOrThrow('CustomNameService');
        expect(serviceClass.getMethod('custom_get_custom_name')).toBeDefined();
    });

    it('should de-duplicate method names from conflicting operationIds', () => {
        const project = createTestEnvironment(coverageSpec);
        const serviceFile = project.getSourceFileOrThrow('/out/services/duplicateName.service.ts');
        const serviceClass = serviceFile.getClassOrThrow('DuplicateNameService');
        expect(serviceClass.getMethod('getName')).toBeDefined();
        expect(serviceClass.getMethod('getName2')).toBeDefined();
    });

    it('should not add primitive array types to model imports', () => {
        const project = createTestEnvironment(coverageSpec);
        const serviceFile = project.getSourceFileOrThrow('/out/services/stringArray.service.ts');
        const importDecl = serviceFile.getImportDeclaration(d => d.getModuleSpecifierValue() === '../models');
        const namedImports = importDecl!.getNamedImports().map(ni => ni.getName());
        // Should only have RequestOptions, not 'string' or other primitives.
        expect(namedImports).toEqual(['RequestOptions']);
    });

    it('should generate a correct create-context method', () => {
        const project = createTestEnvironment(coverageSpec);
        const serviceClass = project.getSourceFileOrThrow('/out/services/users.service.ts').getClassOrThrow('UsersService');
        const method = serviceClass.getMethodOrThrow('createContextWithClientId');
        expect(method.getScope()).toBe(Scope.Private);
        const body = method.getBodyText() ?? '';
        expect(body).toContain(`return context.set(this.clientContextToken, 'default');`);
    });
});
