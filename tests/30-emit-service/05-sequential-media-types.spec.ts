import { describe, expect, it } from 'vitest';
import { Project, Scope } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { ServiceMethodGenerator } from '@src/generators/angular/service/service-method.generator.js';
import { TypeGenerator } from '@src/generators/shared/type.generator.js';

const sequentialSpec = {
    openapi: '3.0.0',
    info: { title: 'Sequential Test', version: '1.0' },
    paths: {
        '/json-seq': {
            get: {
                operationId: 'getJsonSeq',
                responses: {
                    '200': {
                        content: {
                            'application/json-seq': {
                                itemSchema: {
                                    // OAS 3.2 specific
                                    type: 'object',
                                    properties: { id: { type: 'number' } },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/json-lines': {
            get: {
                operationId: 'getJsonLines',
                responses: {
                    '200': {
                        content: {
                            'application/jsonl': {
                                // Common alias for ndjson
                                schema: {
                                    // Standard array schema usage
                                    type: 'array',
                                    items: { type: 'string' },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/ndjson': {
            get: {
                operationId: 'getNdJson',
                responses: {
                    '200': {
                        content: {
                            'application/x-ndjson': {
                                schema: { type: 'array', items: { type: 'boolean' } },
                            },
                        },
                    },
                },
            },
        },
    },
    components: {},
};

describe('Emitter: ServiceMethodGenerator (Sequential Media Types)', () => {
    const createTestEnv = () => {
        const config: GeneratorConfig = { input: '', output: '/out', options: { dateType: 'Date', enumStyle: 'enum' } };
        const project = new Project({ useInMemoryFileSystem: true });
        const parser = new SwaggerParser(sequentialSpec as any, config);

        // Pre-generate types
        new TypeGenerator(parser, project, config).generate('/out');

        const methodGen = new ServiceMethodGenerator(config, parser);
        const sourceFile = project.createSourceFile('/out/service.ts');
        const serviceClass = sourceFile.addClass({ name: 'TestService' });
        // Mock the http property
        serviceClass.addProperty({ name: 'http', scope: Scope.Private, isReadonly: true, type: 'any' });
        serviceClass.addProperty({
            name: 'basePath',
            scope: Scope.Private,
            isReadonly: true,
            type: 'string',
            initializer: "''",
        });
        serviceClass.addMethod({
            name: 'createContextWithClientId',
            scope: Scope.Private,
            returnType: 'any',
            statements: 'return {};',
        });

        return { methodGen, serviceClass, parser };
    };

    it('should generate json-seq parsing logic splitting by Record Separator (0x1E)', () => {
        const { methodGen, serviceClass, parser } = createTestEnv();
        const op = parser.operations.find(o => o.operationId === 'getJsonSeq')!;
        op.methodName = 'getJsonSeq';

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getJsonSeq').getBodyText()!;

        // Ensure forced responseType: 'text'
        expect(body).toContain(`responseType: 'text'`);
        // Ensure pipe map exists
        expect(body).toContain('.pipe(');
        expect(body).toContain('map(response => {');
        // Check splitter
        expect(body).toContain("response.split('\\x1e')");
        // Check filter and parse
        expect(body).toContain('filter(part => part.trim().length > 0)');
        expect(body).toContain('JSON.parse(item)');
    });

    it('should generate jsonl parsing logic splitting by Newline', () => {
        const { methodGen, serviceClass, parser } = createTestEnv();
        const op = parser.operations.find(o => o.operationId === 'getJsonLines')!;
        op.methodName = 'getJsonLines';

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getJsonLines').getBodyText()!;

        expect(body).toContain(`responseType: 'text'`);
        // Check newlines splitter
        expect(body).toContain("response.split('\\n')");
        expect(body).toContain('JSON.parse(item)');
    });

    it('should treat application/x-ndjson as json-lines', () => {
        const { methodGen, serviceClass, parser } = createTestEnv();
        const op = parser.operations.find(o => o.operationId === 'getNdJson')!;
        op.methodName = 'getNdJson';

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getNdJson').getBodyText()!;

        expect(body).toContain("response.split('\\n')");
    });
});
