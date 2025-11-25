import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { CallbackGenerator } from '@src/generators/shared/callback.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { GeneratorConfig, SwaggerDefinition, SwaggerSpec } from "@src/core/types/index.js";
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
                    'onDataUpdate': {
                        '{$request.query.callbackUrl}': {
                            post: {
                                requestBody: {
                                    content: {
                                        'application/json': {
                                            schema: { type: 'object', properties: { timestamp: { type: 'string' } } }
                                        }
                                    }
                                },
                                responses: { '200': { description: 'acknowledged' } }
                            }
                        }
                    }
                }
            }
        }
    },
    components: { schemas: {} }
};

const refCallbackSpec: SwaggerSpec = {
    openapi: '3.0.0',
    info: { title: 'Ref Callback Test', version: '1.0' },
    paths: {
        '/hook': {
            post: {
                callbacks: {
                    'myWebhook': { $ref: '#/components/callbacks/MyCallback' },
                    // This invalid one hits the 'resolved' check failure branch
                    'brokenWebhook': { $ref: '#/components/callbacks/BrokenCallback' }
                },
                responses: {}
            }
        }
    },
    components: {
        callbacks: {
            'MyCallback': {
                'http://target.com': {
                    post: {
                        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/EventPayload' } } } },
                        responses: { '200': {} }
                    }
                }
            }
        },
        schemas: { EventPayload: { type: 'object', properties: { id: { type: 'string' } } } }
    }
};

describe('Emitter: CallbackGenerator', () => {

    const runGenerator = (spec: SwaggerSpec) => {
        const project = createTestProject();
        const config: GeneratorConfig = { output: '/out', options: { dateType: 'string', enumStyle: 'enum' } } as any;
        const parser = new SwaggerParser(spec, config);
        if (spec.components?.schemas?.EventPayload) {
            parser.schemas.push({
                name: 'EventPayload',
                definition: spec.components.schemas.EventPayload as SwaggerDefinition
            });
        }
        new CallbackGenerator(parser, project).generate('/out');
        return project;
    };

    const compileGeneratedFile = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/callbacks.ts');
        const code = sourceFile.getText();
        const jsCode = ts.transpile(code, { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS });
        const moduleHelper = { exports: {} as any };
        new Function('exports', jsCode)(moduleHelper.exports);
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
        const { API_CALLBACKS } = compileGeneratedFile(project);

        // Should contain MyCallback
        expect(API_CALLBACKS).toHaveLength(1);
        expect(API_CALLBACKS[0].name).toBe('myWebhook');

        // Should NOT contain brokenWebhook because it resolves to undefined
        const broken = API_CALLBACKS.find((c: any) => c.name === 'brokenWebhook');
        expect(broken).toBeUndefined();
    });

    it('should resolve referenced callbacks and Models', () => {
        const project = runGenerator(refCallbackSpec);
        const sourceFile = project.getSourceFileOrThrow('/out/callbacks.ts');
        const typeAlias = sourceFile.getTypeAliasOrThrow('MyWebhookPostPayload');
        expect(typeAlias.getTypeNode()?.getText()).toBe('EventPayload');
    });

    it('should handle empty callbacks safely with empty module export', () => {
        const emptySpec: SwaggerSpec = { openapi: '3.0.0', info: { title: 'E', version: '1' }, paths: {} };
        const project = runGenerator(emptySpec);
        const sourceFile = project.getSourceFileOrThrow('/out/callbacks.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });
});
