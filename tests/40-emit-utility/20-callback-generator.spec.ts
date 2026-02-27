import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/openapi/parse.js';
import { CallbackGenerator } from '@src/functions/emit_callback.js';
import { createTestProject } from '../shared/helpers.js';
import { GeneratorConfig, SwaggerDefinition, SwaggerSpec } from '@src/core/types/index.js';
import ts from 'typescript';

const mockSpec: SwaggerSpec = {
    openapi: '3.0.0',
    info: { title: 'Callback Test', version: '1.0' },
    paths: {
        '/subscribe': {
            post: {
                operationId: 'subscribe',
                responses: { '200': { description: 'ok' } },
                callbacks: {
                    onDataUpdate: {
                        '{$request.query.callbackUrl}': {
                            post: {
                                requestBody: {
                                    content: {
                                        'application/json': {
                                            schema: { type: 'object', properties: { timestamp: { type: 'string' } } },
                                        },
                                    },
                                },
                                responses: { '200': { description: 'acknowledged' } },
                            },
                        },
                    },
                },
            },
        },
    },
    components: { schemas: {} },
};

const refCallbackSpec: SwaggerSpec = {
    openapi: '3.0.0',
    info: { title: 'Ref Callback Test', version: '1.0' },
    paths: {
        '/hook': {
            post: {
                callbacks: {
                    myWebhook: { $ref: '#/components/callbacks/MyCallback' },
                    // This invalid one hits the 'resolved' check failure branch
                    brokenWebhook: { $ref: '#/components/callbacks/BrokenCallback' },
                },
                responses: { '200': { description: 'ok' } },
            },
        },
    },
    components: {
        callbacks: {
            MyCallback: {
                'http://target.com?hook={$request.body#/id}': {
                    post: {
                        requestBody: {
                            content: { 'application/json': { schema: { $ref: '#/components/schemas/EventPayload' } } },
                        },
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        },
        schemas: { EventPayload: { type: 'object', properties: { id: { type: 'string' } } } },
    },
};

const refRequestBodyCallbackSpec: SwaggerSpec = {
    openapi: '3.2.0',
    info: { title: 'Ref Body Callback Test', version: '1.0' },
    paths: {
        '/notify': {
            post: {
                callbacks: {
                    onEvent: {
                        '{$request.body#/callbackUrl}': {
                            post: {
                                requestBody: { $ref: '#/components/requestBodies/EventBody' },
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
        requestBodies: {
            EventBody: {
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/EventPayload' },
                    },
                },
            },
        },
        schemas: {
            EventPayload: { type: 'object', properties: { id: { type: 'string' } } },
        },
    },
};

describe('Emitter: CallbackGenerator', () => {
    const runGenerator = (spec: SwaggerSpec) => {
        const project = createTestProject();
        const config: GeneratorConfig = { output: '/out', options: { dateType: 'string', enumStyle: 'enum' } } as any;
        const parser = new SwaggerParser(spec, config);
        if (spec.components?.schemas?.EventPayload) {
            parser.schemas.push({
                name: 'EventPayload',
                definition: spec.components.schemas.EventPayload as SwaggerDefinition,
            });
        }
        new CallbackGenerator(parser, project).generate('/out');
        return project;
    };

    const compileGeneratedFile = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/callbacks.ts');
        const code = sourceFile.getText();
        const jsCode = ts.transpile(code, { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS });
        // type-coverage:ignore-next-line
        const moduleHelper = { exports: {} as any };
        // type-coverage:ignore-next-line
        new Function('exports', jsCode)(moduleHelper.exports);
        // type-coverage:ignore-next-line
        return moduleHelper.exports;
    };

    it('should generate interfaces for inline callbacks', () => {
        const project = runGenerator(mockSpec);
        const sourceFile = project.getSourceFileOrThrow('/out/callbacks.ts');
        const typeAlias = sourceFile.getTypeAliasOrThrow('OnDataUpdatePostPayload');
        expect(typeAlias.isExported()).toBe(true);
    });

    it('should generate registry constant ignoring invalid refs', () => {
        const project = runGenerator(refCallbackSpec);
        // type-coverage:ignore-next-line
        const { API_CALLBACKS } = compileGeneratedFile(project);

        // Should contain operation callback and component callback
        // type-coverage:ignore-next-line
        expect(API_CALLBACKS).toHaveLength(2);
        // type-coverage:ignore-next-line
        const opCallback = API_CALLBACKS.find((c: any) => c.name === 'myWebhook');
        // type-coverage:ignore-next-line
        const componentCallback = API_CALLBACKS.find((c: any) => c.name === 'MyCallback');

        // type-coverage:ignore-next-line
        expect(opCallback).toBeDefined();
        // type-coverage:ignore-next-line
        expect(opCallback?.scope).toBe('operation');
        // type-coverage:ignore-next-line
        expect(opCallback?.expression).toBe('http://target.com?hook={$request.body#/id}');
        // type-coverage:ignore-next-line
        expect(opCallback?.pathItem?.post?.requestBody?.content?.['application/json']).toBeDefined();
        // type-coverage:ignore-next-line
        expect(opCallback?.pathItem?.post?.responses?.['200']).toBeDefined();

        // type-coverage:ignore-next-line
        expect(componentCallback).toBeDefined();
        // type-coverage:ignore-next-line
        expect(componentCallback?.scope).toBe('component');

        // Should NOT contain brokenWebhook because it resolves to undefined
        // type-coverage:ignore-next-line
        const broken = API_CALLBACKS.find((c: any) => c.name === 'brokenWebhook');
        // type-coverage:ignore-next-line
        expect(broken).toBeUndefined();
    });

    it('should resolve referenced callbacks and Models', () => {
        const project = runGenerator(refCallbackSpec);
        const sourceFile = project.getSourceFileOrThrow('/out/callbacks.ts');
        const typeAlias = sourceFile.getTypeAliasOrThrow('MyWebhookPostPayload');
        expect(typeAlias.getTypeNode()?.getText()).toBe('EventPayload');
    });

    it('should resolve requestBody $ref inside callbacks', () => {
        const project = runGenerator(refRequestBodyCallbackSpec);
        const sourceFile = project.getSourceFileOrThrow('/out/callbacks.ts');
        const typeAlias = sourceFile.getTypeAliasOrThrow('OnEventPostPayload');
        expect(typeAlias.getTypeNode()?.getText()).toBe('EventPayload');
    });

    it('should handle callbacks with inline request bodies', () => {
        const spec: SwaggerSpec = {
            openapi: '3.0.0',
            info: { title: 'Callback Missing Responses', version: '1.0' },
            paths: {
                '/notify': {
                    post: {
                        operationId: 'notify',
                        callbacks: {
                            onNotify: {
                                '{$request.query.url}': {
                                    post: {
                                        requestBody: {
                                            content: {
                                                'application/json': {
                                                    schema: { type: 'object', properties: { id: { type: 'string' } } },
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
        };
        const project = runGenerator(spec);
        const sourceFile = project.getSourceFileOrThrow('/out/callbacks.ts');
        expect(sourceFile.getText()).toContain('API_CALLBACKS');
    });

    it('should handle empty callbacks safely with empty module export', () => {
        const emptySpec: SwaggerSpec = { openapi: '3.0.0', info: { title: 'E', version: '1' }, paths: {} };
        const project = runGenerator(emptySpec);
        const sourceFile = project.getSourceFileOrThrow('/out/callbacks.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });
});
