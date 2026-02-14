import { describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { TypeGenerator } from '@src/generators/shared/type.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';

const callbackSpec = {
    openapi: '3.0.0',
    info: { title: 'Callback API', version: '1.0' },
    paths: {
        '/subscribe': {
            post: {
                operationId: 'subscribeOperation',
                requestBody: {
                    content: {
                        'application/json': {
                            schema: { type: 'object', properties: { callbackUrl: { type: 'string' } } },
                        },
                    },
                },
                callbacks: {
                    onData: {
                        '{$request.body#/callbackUrl}': {
                            post: {
                                requestBody: {
                                    content: {
                                        'application/json': {
                                            schema: {
                                                type: 'object',
                                                properties: {
                                                    timestamp: { type: 'string', format: 'date-time' },
                                                    data: { type: 'string' },
                                                },
                                            },
                                        },
                                    },
                                },
                                responses: { '200': { description: 'OK' } },
                            },
                        },
                    },
                },
                responses: { '201': { description: 'Subscription created' } },
            },
        },
        '/complex-callback': {
            post: {
                operationId: 'doComplex',
                callbacks: {
                    myEvent: {
                        '{$request.body#/url}': {
                            post: {
                                requestBody: {
                                    content: {
                                        'application/json': {
                                            schema: { $ref: '#/components/schemas/ComplexPayload' },
                                        },
                                    },
                                },
                                responses: { '200': { description: 'ok' } },
                            },
                        },
                    },
                },
                responses: { '200': { description: 'ok' } },
            },
        },
    },
    components: {
        schemas: {
            ComplexPayload: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    status: { type: 'string' },
                },
            },
        },
    },
};

describe('Emitter: TypeGenerator (Callbacks)', () => {
    const runGenerator = (spec: any, options: any = {}) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = { input: '', output: '/out', options: { enumStyle: 'enum', ...options } };
        const parser = new SwaggerParser(spec, config);
        new TypeGenerator(parser, project, config).generate('/out');
        const sourceFile = project.getSourceFileOrThrow('/out/models/index.ts');
        return sourceFile;
    };

    it('should generate a request interface for a callback operation', () => {
        const sourceFile = runGenerator(callbackSpec);
        const interfaceName = 'SubscribeOperationOnDataRequest';
        const model = sourceFile.getInterfaceOrThrow(interfaceName);

        expect(model).toBeDefined();
        expect(model.isExported()).toBe(true);
        expect(model.getProperty('timestamp')).toBeDefined();
        expect(model.getProperty('data')).toBeDefined();
    });

    it('should reuse existing schemas referenced in callbacks', () => {
        const sourceFile = runGenerator(callbackSpec);
        // The name is composed of OperationId + CallbackName + Request
        // doComplex + MyEvent + Request
        const interfaceName = 'DoComplexMyEventRequest';
        const typeAlias = sourceFile.getTypeAlias(interfaceName);

        expect(typeAlias).toBeDefined();
        // The type alias should point to ComplexPayload (or check that the type is ComplexPayload)
        // Note: Type aliases to interfaces are usually generated as `type X = Y;`
        expect(typeAlias?.getTypeNode()?.getText()).toBe('ComplexPayload');

        // Verify ComplexPayload exists too
        expect(sourceFile.getInterface('ComplexPayload')).toBeDefined();
    });
});
