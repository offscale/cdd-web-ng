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
                        description: 'ok',
                        content: {
                            'application/json-seq': {
                                itemSchema: {
                                    type: 'object',
                                    properties: { id: { type: 'number' } },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/geo-json-seq': {
            get: {
                operationId: 'getGeoJsonSeq',
                responses: {
                    '200': {
                        description: 'ok',
                        content: {
                            'application/geo+json-seq': {
                                itemSchema: {
                                    type: 'object',
                                    properties: { type: { type: 'string' }, coordinates: { type: 'array' } },
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
                        description: 'ok',
                        content: {
                            'application/jsonl': {
                                schema: {
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
                        description: 'ok',
                        content: {
                            'application/x-ndjson': {
                                schema: { type: 'array', items: { type: 'boolean' } },
                            },
                        },
                    },
                },
            },
        },
        '/custom-json': {
            get: {
                operationId: 'getCustomJson',
                responses: {
                    '200': {
                        description: 'ok',
                        content: {
                            'application/vnd.acme+json': {
                                itemSchema: { type: 'string' },
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

        new TypeGenerator(parser, project, config).generate('/out');

        const methodGen = new ServiceMethodGenerator(config, parser);
        const sourceFile = project.createSourceFile('/out/service.ts');
        const serviceClass = sourceFile.addClass({ name: 'TestService' });
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

        expect(body).toContain(`responseType: 'text'`);
        expect(body).toContain('.pipe(');
        expect(body).toContain('map((response: any) => {');
        expect(body).toContain("response.split('\\x1e')");
        expect(body).toContain('filter((part: string) => part.trim().length > 0)');
        expect(body).toContain('JSON.parse(item)');
    });

    it('should treat structured +json-seq media types as json-seq', () => {
        const { methodGen, serviceClass, parser } = createTestEnv();
        const op = parser.operations.find(o => o.operationId === 'getGeoJsonSeq')!;
        op.methodName = 'getGeoJsonSeq';

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getGeoJsonSeq').getBodyText()!;

        expect(body).toContain(`responseType: 'text'`);
        expect(body).toContain("response.split('\\x1e')");
        expect(body).toContain('JSON.parse(item)');
    });

    it('should generate jsonl parsing logic splitting by Newline', () => {
        const { methodGen, serviceClass, parser } = createTestEnv();
        const op = parser.operations.find(o => o.operationId === 'getJsonLines')!;
        op.methodName = 'getJsonLines';

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getJsonLines').getBodyText()!;

        expect(body).toContain(`responseType: 'text'`);
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

    it('should treat custom JSON media types with itemSchema as json-lines', () => {
        const { methodGen, serviceClass, parser } = createTestEnv();
        const op = parser.operations.find(o => o.operationId === 'getCustomJson')!;
        op.methodName = 'getCustomJson';

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getCustomJson').getBodyText()!;
        expect(body).toContain("response.split('\\n')");
        expect(body).toContain(`responseType: 'text'`);
    });
});
