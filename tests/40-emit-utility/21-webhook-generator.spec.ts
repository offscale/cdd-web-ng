import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { WebhookGenerator } from '@src/generators/shared/webhook.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types.js';
import ts from 'typescript';

const simpleWebhookSpec: SwaggerSpec = {
    openapi: '3.1.0',
    info: { title: 'Webhook Test', version: '1.0' },
    paths: {},
    webhooks: {
        'newPet': {
            post: {
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    id: { type: 'integer' },
                                    name: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    '200': { description: 'Return a 200 to ack reception' }
                }
            }
        }
    },
    components: { schemas: {} }
};

const refWebhookSpec: SwaggerSpec = {
    openapi: '3.1.0',
    info: { title: 'Ref Webhook Test', version: '1.0' },
    paths: {},
    webhooks: {
        'userDeleted': { $ref: '#/components/pathItems/UserDeletedWebhook' }
    },
    components: {
        pathItems: {
            UserDeletedWebhook: {
                post: {
                    requestBody: {
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/UserEvent' }
                            }
                        }
                    },
                    responses: { '200': {} }
                }
            }
        },
        schemas: {
            UserEvent: {
                type: 'object',
                properties: { userId: { type: 'string' } }
            }
        }
    }
};

describe('Emitter: WebhookGenerator', () => {

    const runGenerator = (spec: SwaggerSpec) => {
        const project = createTestProject();
        const config: GeneratorConfig = {
            output: '/out',
            options: { dateType: 'string', enumStyle: 'enum', generateServices: true }
        } as any;

        const parser = new SwaggerParser(spec, config);
        if (spec.components?.schemas?.UserEvent) {
            parser.schemas.push({ name: 'UserEvent', definition: spec.components.schemas.UserEvent });
        }

        new WebhookGenerator(parser, project).generate('/out');
        return project;
    };

    const compileGeneratedFile = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/webhooks.ts');
        const code = sourceFile.getText();
        const codeNoImports = code.replace(/import .* from .*/g, '');

        const jsCode = ts.transpile(codeNoImports, { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS });
        const moduleHelper = { exports: {} as any };
        new Function('exports', jsCode)(moduleHelper.exports);
        return moduleHelper.exports;
    };

    it('should generate interface for simple webhook payload', () => {
        const project = runGenerator(simpleWebhookSpec);
        const sourceFile = project.getSourceFileOrThrow('/out/webhooks.ts');

        const typeAlias = sourceFile.getTypeAliasOrThrow('NewPetPostPayload');
        expect(typeAlias.isExported()).toBe(true);
        const text = typeAlias.getTypeNode()?.getText();
        expect(text).toContain('id?: number');
        expect(text).toContain('name?: string');
    });

    it('should generate registry constant for webhooks', () => {
        const project = runGenerator(simpleWebhookSpec);
        const { API_WEBHOOKS } = compileGeneratedFile(project);

        expect(API_WEBHOOKS).toHaveLength(1);
        expect(API_WEBHOOKS[0]).toEqual({
            name: 'newPet',
            method: 'POST',
            interfaceName: 'NewPetPostPayload'
        });
    });

    it('should resolve referenced PathItems in webhooks', () => {
        const project = runGenerator(refWebhookSpec);
        const sourceFile = project.getSourceFileOrThrow('/out/webhooks.ts');

        const imports = sourceFile.getImportDeclarations();
        expect(imports.some(i => i.getModuleSpecifierValue() === './models')).toBe(true);

        const typeAlias = sourceFile.getTypeAliasOrThrow('UserDeletedPostPayload');
        expect(typeAlias.getTypeNode()?.getText()).toBe('UserEvent');
    });

    it('should handle empty webhooks safely', () => {
        const emptySpec: SwaggerSpec = {
            openapi: '3.1.0',
            info: { title: 'Empty', version: '1.0' },
            paths: {},
        };
        const project = runGenerator(emptySpec);
        const sourceFile = project.getSourceFileOrThrow('/out/webhooks.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });
});
