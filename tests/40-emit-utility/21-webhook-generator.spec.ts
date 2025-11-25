import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { WebhookGenerator } from '@src/generators/shared/webhook.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { GeneratorConfig, SwaggerSpec } from "@src/core/types/index.js";
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
                                properties: { id: { type: 'integer' } }
                            }
                        }
                    }
                },
                responses: { '200': { description: 'ok' } }
            }
        }
    },
    components: { schemas: {} }
};

const validAndInvalidWebhooksSpec: SwaggerSpec = {
    openapi: '3.1.0',
    info: { title: 'Mixed Webhook Test', version: '1.0' },
    paths: {},
    webhooks: {
        'validHook': { $ref: '#/components/pathItems/ValidWebhook' },
        'invalidHook': { $ref: '#/components/pathItems/MissingWebhook' }
    },
    components: {
        pathItems: {
            ValidWebhook: {
                post: {
                    requestBody: { content: { 'application/json': { schema: { type: 'string' } } } },
                    responses: { '200': {} }
                }
            }
        }
    }
};

// New spec to force model imports from webhook payloads (covers conditional import generation)
const webhookWithModelSpec: SwaggerSpec = {
    openapi: '3.1.0',
    info: { title: 'Webhook Model', version: '1.0' },
    paths: {},
    webhooks: {
        'petCreated': {
            post: {
                requestBody: {
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } }
                },
                responses: { '200': {} }
            }
        }
    },
    components: {
        schemas: {
            Pet: { type: 'object', properties: { name: { type: 'string' } } }
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
        new WebhookGenerator(parser, project).generate('/out');
        return project;
    };

    const compileGeneratedFile = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/webhooks.ts');
        // Remove imports so we can transpile in isolation without file dependencies for the registry check
        const code = sourceFile.getText().replace(/import .* from .*/g, '');
        const jsCode = ts.transpile(code, { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS });
        const moduleHelper = { exports: {} as any };
        new Function('exports', jsCode)(moduleHelper.exports);
        return moduleHelper.exports;
    };

    it('should generate interface for simple webhook payload', () => {
        const project = runGenerator(simpleWebhookSpec);
        const sourceFile = project.getSourceFileOrThrow('/out/webhooks.ts');
        const typeAlias = sourceFile.getTypeAliasOrThrow('NewPetPostPayload');
        expect(typeAlias.isExported()).toBe(true);
        expect(typeAlias.getTypeNode()?.getText()).toContain('id?: number');

        // Should NOT import models because payload is inline structure
        const imports = sourceFile.getImportDeclarations();
        expect(imports.length).toBe(0);
    });

    it('should generate registry skipping invalid hooks', () => {
        const project = runGenerator(validAndInvalidWebhooksSpec);
        const { API_WEBHOOKS } = compileGeneratedFile(project);

        expect(API_WEBHOOKS).toHaveLength(1);
        expect(API_WEBHOOKS[0].name).toBe('validHook');

        const invalid = API_WEBHOOKS.find((w: any) => w.name === 'invalidHook');
        expect(invalid).toBeUndefined();
    });

    it('should import models when webhook payload references a schema', () => {
        const project = runGenerator(webhookWithModelSpec);
        const sourceFile = project.getSourceFileOrThrow('/out/webhooks.ts');

        // Verify Import is generated
        const imp = sourceFile.getImportDeclaration(i => i.getModuleSpecifierValue() === './models');
        expect(imp).toBeDefined();
        expect(imp?.getNamedImports().map(n => n.getName())).toContain('Pet');

        // Verify Payload Type uses the model ref
        const typeAlias = sourceFile.getTypeAliasOrThrow('PetCreatedPostPayload');
        expect(typeAlias.getTypeNode()?.getText()).toBe('Pet');
    });

    it('should handle empty webhooks safely', () => {
        const emptySpec: SwaggerSpec = { openapi: '3.1.0', info: { title: 'Empty', version: '1.0' }, paths: {} };
        const project = runGenerator(emptySpec);
        const sourceFile = project.getSourceFileOrThrow('/out/webhooks.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });
});
