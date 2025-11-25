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
                                            schema: {
                                                type: 'object',
                                                properties: {
                                                    timestamp: { type: 'string', format: 'date-time' },
                                                    data: { type: 'string' }
                                                }
                                            }
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
    components: {
        schemas: {}
    }
};

const refCallbackSpec: SwaggerSpec = {
    openapi: '3.0.0',
    info: { title: 'Ref Callback Test', version: '1.0' },
    paths: {
        '/hook': {
            post: {
                callbacks: {
                    'myWebhook': { $ref: '#/components/callbacks/MyCallback' }
                },
                responses: {}
            }
        }
    },
    components: {
        callbacks: {
            'MyCallback': {
                'http://notification-server.com': {
                    post: {
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/EventPayload' }
                                }
                            }
                        },
                        responses: { '200': {} }
                    }
                }
            }
        },
        schemas: {
            EventPayload: {
                type: 'object',
                properties: { id: { type: 'string' } }
            }
        }
    }
};

describe('Emitter: CallbackGenerator', () => {

    const runGenerator = (spec: SwaggerSpec) => {
        const project = createTestProject();
        const config: GeneratorConfig = {
            output: '/out',
            options: { dateType: 'string', enumStyle: 'enum', generateServices: true }
        } as any;

        const parser = new SwaggerParser(spec, config);
        parser.schemas.push({
            name: 'EventPayload',
            definition: (spec.components?.schemas?.EventPayload as SwaggerDefinition) || {}
        });
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

        const structure = typeAlias.getTypeNode()?.getText();
        expect(structure).toContain('timestamp?: string');
        expect(structure).toContain('data?: string');
    });

    it('should generate registry constant', () => {
        const project = runGenerator(mockSpec);
        const { API_CALLBACKS } = compileGeneratedFile(project);

        expect(API_CALLBACKS).toHaveLength(1);
        expect(API_CALLBACKS[0]).toEqual({
            name: 'onDataUpdate',
            method: 'POST',
            interfaceName: 'OnDataUpdatePostPayload'
        });
    });

    it('should resolve referenced callbacks and Models', () => {
        const project = runGenerator(refCallbackSpec);
        const sourceFile = project.getSourceFileOrThrow('/out/callbacks.ts');

        const imports = sourceFile.getImportDeclarations();
        expect(imports.some(i => i.getModuleSpecifierValue() === './models')).toBe(true);

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
