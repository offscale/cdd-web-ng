// tests/30-emit-service/00-service-generator.spec.ts

import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { ServiceGenerator } from '@src/service/emit/service/service.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types.js';
import { coverageSpec } from '../shared/specs.js';
import { groupPathsByController } from '@src/service/parse.js';
import { TypeGenerator } from '@src/service/emit/type/type.generator.js';
import { TokenGenerator } from '@src/service/emit/utility/token.generator.js';
import { HttpParamsBuilderGenerator } from '@src/service/emit/utility/http-params-builder.js';

describe('Emitter: ServiceGenerator & ServiceMethodGenerator', () => {

    // This helper creates a complete, valid in-memory environment for testing
    const createTestEnvironment = (spec: object) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = {
            input: '', output: '/out', clientName: 'default',
            options: { dateType: 'string', enumStyle: 'enum' }
        };
        const parser = new SwaggerParser(spec as any, config);

        // --- Run all dependency generators FIRST ---
        new TypeGenerator(parser, project, config).generate('/out');
        new TokenGenerator(project, config.clientName).generate('/out');
        new HttpParamsBuilderGenerator(project).generate('/out');

        // --- Now run the service generator within this complete environment ---
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
});
