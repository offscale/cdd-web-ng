import { describe, expect, it, vi } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { LinkGenerator } from '@src/generators/shared/link.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { GeneratorConfig, SwaggerSpec } from "@src/core/types/index.js";
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

// Spec to cover all fields (operationRef, requestBody, server) and missing fields logic
const complexLinkSpec: SwaggerSpec = {
    openapi: '3.0.0',
    info: { title: 'Complex Link Test', version: '1.0' },
    paths: {
        '/resource': {
            get: {
                operationId: 'getResource',
                responses: {
                    '200': {
                        description: 'ok',
                        links: {
                            'DeepLink': {
                                operationRef: '#/paths/~1other/get',
                                requestBody: '$request.body',
                                server: { url: 'https://other.com' }
                                // Description and parameters intentionally omitted to hit false branches
                            }
                        }
                    }
                }
            }
        }
    },
    components: {}
};

// Spec with broken references to test graceful failure
const brokenRefsSpec: SwaggerSpec = {
    openapi: '3.0.0',
    info: { title: 'Broken Refs', version: '1.0' },
    paths: {
        '/bad-response': {
            get: {
                operationId: 'getBadResponse',
                responses: {
                    // Response ref does not exist
                    '200': { $ref: '#/components/responses/MissingResponse' }
                }
            }
        },
        '/bad-link': {
            get: {
                operationId: 'getBadLink',
                responses: {
                    '200': {
                        description: 'ok',
                        links: {
                            // Link ref does not exist
                            'BrokenLink': { $ref: '#/components/links/MissingLink' }
                        }
                    }
                }
            }
        }
    },
    components: {}
};

// Spec missing operationId or responses
const sparseSpec: SwaggerSpec = {
    openapi: '3.0.0',
    info: { title: 'Sparse', version: '1.0' },
    paths: {
        '/no-id': {
            get: {
                // Missing operationId
                responses: { '200': { description: 'ok' } }
            }
        },
        // Missing responses (technically invalid OAS but parser handles it)
        '/no-responses': {
            get: {
                operationId: 'actionNoResp'
            } as any
        }
    }
};

describe('Emitter: LinkGenerator', () => {

    const runGenerator = (spec: SwaggerSpec) => {
        const project = createTestProject();
        const config: GeneratorConfig = { output: '/out', options: {} } as any;
        const parser = new SwaggerParser(spec, config);
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

    it('should generate links registry for inline links (Id, Desc, Params)', () => {
        const project = runGenerator(linksSpec);
        const { API_LINKS } = compileGeneratedFile(project);

        expect(API_LINKS).toBeDefined();
        expect(API_LINKS['getUserById']).toBeDefined();
        expect(API_LINKS['getUserById']['200']).toBeDefined();

        const link = API_LINKS['getUserById']['200']['GetUserAddress'];
        expect(link).toBeDefined();
        expect(link.operationId).toBe('getUserAddress');
        expect(link.description).toBe('The address of this user');
        expect(link.parameters).toEqual({ userId: '$response.body#/id' });

        // Assert missing fields are truly undefined in the generated object
        expect(link.operationRef).toBeUndefined();
        expect(link.requestBody).toBeUndefined();
        expect(link.server).toBeUndefined();
    });

    it('should resolve referenced links', () => {
        const project = runGenerator(refLinksSpec);
        const { API_LINKS } = compileGeneratedFile(project);

        const link = API_LINKS['getOrder']['200']['CancelOrder'];
        expect(link).toBeDefined();
        expect(link.operationId).toBe('cancelOrder');
        expect(link.parameters).toEqual({ orderId: '$request.path.id' });
    });

    it('should copy all Link fields including operationRef, requestBody, server', () => {
        const project = runGenerator(complexLinkSpec);
        const { API_LINKS } = compileGeneratedFile(project);

        const link = API_LINKS['getResource']['200']['DeepLink'];
        expect(link.operationRef).toBe('#/paths/~1other/get');
        expect(link.requestBody).toBe('$request.body');
        expect(link.server).toEqual({ url: 'https://other.com' });

        // Verify omitted fields
        expect(link.operationId).toBeUndefined();
        expect(link.description).toBeUndefined();
        expect(link.parameters).toBeUndefined();
    });

    it('should ignore operations without identifiers or links', () => {
        // Test sparse spec
        const project = runGenerator(sparseSpec);
        const { API_LINKS } = compileGeneratedFile(project);

        expect(API_LINKS).toBeUndefined();
        const sourceFile = project.getSourceFileOrThrow('/out/links.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });

    it('should handle unresolvable references gracefully', () => {
        // Suppress warning expectation in test output
        vi.spyOn(console, 'warn').mockImplementation(() => {
        });
        const project = runGenerator(brokenRefsSpec);
        const { API_LINKS } = compileGeneratedFile(project);

        expect(API_LINKS).toBeUndefined();
        const sourceFile = project.getSourceFileOrThrow('/out/links.ts');
        expect(sourceFile.getText()).toContain('export { };');
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
