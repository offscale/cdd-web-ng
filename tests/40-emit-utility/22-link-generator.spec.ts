import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { LinkGenerator } from '@src/service/emit/utility/link.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types.js';
import ts from 'typescript';

const linksSpec: SwaggerSpec = {
    openapi: '3.0.0',
    info: { title: 'Link Test', version: '1.0' },
    paths: {
        '/users/{id}': {
            get: {
                operationId: 'getUserById',
                responses: {
                    '200': {
                        description: 'User details',
                        links: {
                            // The link name
                            'GetUserAddress': {
                                operationId: 'getUserAddress',
                                parameters: { userId: '$response.body#/id' },
                                description: 'The address of this user'
                            }
                        }
                    }
                }
            }
        },
        '/users/{id}/address': {
            get: { operationId: 'getUserAddress', responses: { '200': { description: 'ok' } } }
        }
    },
    components: { schemas: {} }
};

const refLinksSpec: SwaggerSpec = {
    openapi: '3.0.0',
    info: { title: 'Ref Link Test', version: '1.0' },
    paths: {
        '/orders/{id}': {
            get: {
                operationId: 'getOrder',
                responses: {
                    '200': {
                        description: 'Order',
                        links: {
                            'CancelOrder': { $ref: '#/components/links/CancelOrderLink' }
                        }
                    }
                }
            }
        }
    },
    components: {
        links: {
            'CancelOrderLink': {
                operationId: 'cancelOrder',
                parameters: { orderId: '$request.path.id' }
            }
        },
        schemas: {}
    }
};

describe('Emitter: LinkGenerator', () => {

    const runGenerator = (spec: SwaggerSpec) => {
        const project = createTestProject();
        const config: GeneratorConfig = { output: '/out', options: {} } as any;
        const parser = new SwaggerParser(spec, config);
        // No extra schema setup needed really, Links extraction is mostly metadata
        new LinkGenerator(parser, project).generate('/out');
        return project;
    };

    const compileGeneratedFile = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/links.ts');
        const code = sourceFile.getText();
        const jsCode = ts.transpile(code, { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS });
        const moduleHelper = { exports: {} as any };
        new Function('exports', jsCode)(moduleHelper.exports);
        return moduleHelper.exports;
    };

    it('should generate links registry for inline links', () => {
        const project = runGenerator(linksSpec);
        const { API_LINKS } = compileGeneratedFile(project);

        // Structure: opId -> code -> linkName -> definition
        expect(API_LINKS).toBeDefined();
        expect(API_LINKS['getUserById']).toBeDefined();
        expect(API_LINKS['getUserById']['200']).toBeDefined();

        const link = API_LINKS['getUserById']['200']['GetUserAddress'];
        expect(link).toBeDefined();
        expect(link.operationId).toBe('getUserAddress');
        expect(link.description).toBe('The address of this user');
        expect(link.parameters).toEqual({ userId: '$response.body#/id' });
    });

    it('should resolve referenced links', () => {
        const project = runGenerator(refLinksSpec);
        const { API_LINKS } = compileGeneratedFile(project);

        const link = API_LINKS['getOrder']['200']['CancelOrder'];
        expect(link).toBeDefined();
        expect(link.operationId).toBe('cancelOrder');
        // The $ref should be resolved, so we see the actual content
        expect(link.parameters).toEqual({ orderId: '$request.path.id' });
    });

    it('should ignore operations without identifiers or links', () => {
        const spec: SwaggerSpec = {
            openapi: '3.0.0',
            info: { title: 'Ignore', version: '1' },
            paths: {
                '/ping': { get: { responses: { '200': { description: 'No opId' } } } },
                '/no-links': { get: { operationId: 'noLinks', responses: { '200': { description: 'Empty' } } } }
            }
        };
        const project = runGenerator(spec);
        const { API_LINKS } = compileGeneratedFile(project);

        // Should contain nothing because no valid links exist
        // Actually, compileGeneratedCode returns {} if file exports empty object?
        // Wait, if file content is "export {}" then API_LINKS is undefined
        expect(API_LINKS).toBeUndefined(); // because export is empty
    });

    it('should produce valid module for empty links', () => {
        const spec: SwaggerSpec = {
            openapi: '3.0.0',
            info: { title: 'Empty', version: '1' },
            paths: {}
        };
        const project = runGenerator(spec);
        const sourceFile = project.getSourceFileOrThrow('/out/links.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });
});
