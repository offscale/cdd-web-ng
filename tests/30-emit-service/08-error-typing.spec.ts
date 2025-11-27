import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { ServiceMethodGenerator } from '@src/generators/angular/service/service-method.generator.js';
import { TypeGenerator } from '@src/generators/shared/type.generator.js';
import { ServiceGenerator } from '@src/generators/angular/service/service.generator.js';

const errorTypingSpec = {
    openapi: '3.0.0',
    info: { title: 'Error Typing Test', version: '1.0' },
    paths: {
        '/users/{id}': {
            get: {
                operationId: 'getUser',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    '200': {
                        description: 'Success',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: { name: { type: 'string' } },
                                },
                            },
                        },
                    },
                    '404': {
                        description: 'Not Found',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundError' } } },
                    },
                    '500': {
                        description: 'Server Error',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/ServerError' } } },
                    },
                },
            },
        },
        '/delete/{id}': {
            delete: {
                operationId: 'deleteItem',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    '204': { description: 'Deleted' },
                    '400': {
                        description: 'Bad Request',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: { msg: { type: 'string' } },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    components: {
        schemas: {
            NotFoundError: { type: 'object', properties: { code: { type: 'integer' }, message: { type: 'string' } } },
            ServerError: { type: 'object', properties: { traceId: { type: 'string' } } },
        },
    },
};

describe('Emitter: Error Typing Support', () => {
    const createTestEnv = () => {
        const config: GeneratorConfig = {
            input: '',
            output: '/out',
            clientName: 'TestClient',
            options: { dateType: 'string', enumStyle: 'enum' },
        };
        const project = new Project({ useInMemoryFileSystem: true });
        const parser = new SwaggerParser(errorTypingSpec as any, config);

        // Generate models first so TypeGenerator behavior is present (names are known)
        new TypeGenerator(parser, project, config).generate('/out');

        return { parser, project, config };
    };

    it('should generate GetUserError type alias exporting the union of error reference types', () => {
        const { parser, project, config } = createTestEnv();
        const gen = new ServiceMethodGenerator(config, parser);
        const sourceFile = project.createSourceFile('/out/test.service.ts', '', { overwrite: true });
        const cls = sourceFile.addClass({ name: 'TestService' });

        const op = parser.operations.find(o => o.operationId === 'getUser')!;
        op.methodName = 'getUser';

        gen.addServiceMethod(cls, op);

        const typeAlias = sourceFile.getTypeAlias('GetUserError');
        expect(typeAlias).toBeDefined();
        expect(typeAlias!.isExported()).toBe(true);
        // Should be union of NotFoundError | ServerError
        const typeText = typeAlias!.getTypeNode()!.getText();
        expect(typeText).toContain('NotFoundError');
        expect(typeText).toContain('ServerError');
        expect(typeText).toContain('|');
    });

    it('should add @throws JSDoc to the service method', () => {
        const { parser, project, config } = createTestEnv();
        const gen = new ServiceMethodGenerator(config, parser);
        const sourceFile = project.createSourceFile('/out/test.service.ts', '', { overwrite: true });
        const cls = sourceFile.addClass({ name: 'TestService' });

        const op = parser.operations.find(o => o.operationId === 'getUser')!;
        op.methodName = 'getUser';

        gen.addServiceMethod(cls, op);

        const method = cls.getMethodOrThrow('getUser');
        const docs = method
            .getJsDocs()
            .map(d => d.getInnerText())
            .join('\n');
        expect(docs).toContain('@throws {GetUserError}');
    });

    it('should handle inline error schemas by generating specific structural types (or aliases if generated)', () => {
        const { parser, project, config } = createTestEnv();
        // For inline error schema in /delete/{id} -> 400
        // TypeScript converter generates structural type "{ msg?: string }"

        const gen = new ServiceMethodGenerator(config, parser);
        const sourceFile = project.createSourceFile('/out/test.service.ts', '', { overwrite: true });
        const cls = sourceFile.addClass({ name: 'TestService' });

        const op = parser.operations.find(o => o.operationId === 'deleteItem')!;
        op.methodName = 'deleteItem';

        gen.addServiceMethod(cls, op);

        const typeAlias = sourceFile.getTypeAlias('DeleteItemError');
        expect(typeAlias).toBeDefined();
        const text = typeAlias!.getTypeNode()!.getText();
        // { msg?: string }
        expect(text).toContain('msg?: string');
    });

    it('should properly import error models in the service file via ServiceGenerator', () => {
        const { parser, project, config } = createTestEnv();
        const serviceGen = new ServiceGenerator(parser, project, config);

        // We need to simulate the group path logic or just pass the ops for the controller
        const ops = parser.operations;
        // ensure methodName set
        ops.forEach(op => {
            if (!op.methodName && op.operationId) op.methodName = op.operationId;
        });

        serviceGen.generateServiceFile('users', ops, '/out/services');

        const sourceFile = project.getSourceFileOrThrow('/out/services/users.service.ts');
        const namedImports = sourceFile
            .getImportDeclaration(d => d.getModuleSpecifierValue().includes('models'))!
            .getNamedImports();
        const names = namedImports.map(n => n.getName());

        // Should include NotFoundError and ServerError because they are used in error response types
        expect(names).toContain('NotFoundError');
        expect(names).toContain('ServerError');
    });
});
