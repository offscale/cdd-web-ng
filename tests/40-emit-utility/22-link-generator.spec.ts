import { describe, expect, it, vi } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { LinkGenerator } from '@src/generators/shared/link.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types/index.js';
import ts from 'typescript';

const linksSpec: SwaggerSpec = {
    openapi: '3.0.0',
    info: { title: 'Link Test', version: '1.0' },
    paths: {
        '/users/{id}': {
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            get: {
                operationId: 'getUserById',
                responses: {
                    '200': {
                        description: 'User details',
                        links: {
                            GetUserAddress: {
                                operationId: 'getUserAddress',
                                parameters: { userId: '$response.body#/id' },
                                description: 'The address of this user',
                            },
                        },
                    },
                },
            },
        },
        '/users/{id}/address': {
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            get: { operationId: 'getUserAddress', responses: { '200': { description: 'ok' } } },
        },
    },
    components: { schemas: {} },
};

const refLinksSpec: SwaggerSpec = {
    openapi: '3.0.0',
    info: { title: 'Ref Link Test', version: '1.0' },
    paths: {
        '/orders/{id}': {
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            get: {
                operationId: 'getOrder',
                responses: {
                    '200': {
                        description: 'Order',
                        links: {
                            CancelOrder: { $ref: '#/components/links/CancelOrderLink' },
                        },
                    },
                },
            },
        },
    },
    components: {
        links: {
            CancelOrderLink: {
                operationId: 'cancelOrder',
                parameters: { orderId: '$request.path.id' },
            },
        },
        schemas: {},
    },
};

const componentOnlyLinksSpec: SwaggerSpec = {
    openapi: '3.2.0',
    info: { title: 'Component Links Only', version: '1.0' },
    paths: {},
    components: {
        links: {
            NextPage: {
                operationId: 'listThings',
                description: 'Next page link',
            },
        },
    },
};

const componentOperationRefSpec: SwaggerSpec = {
    openapi: '3.2.0',
    info: { title: 'Component OperationRef', version: '1.0' },
    paths: {
        '/target': {
            get: {
                operationId: 'getTarget',
                responses: { '200': { description: 'ok' } },
            },
        },
    },
    components: {
        links: {
            GoTarget: {
                operationRef: '#/paths/~1target/get',
            },
        },
    },
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
                            DeepLink: {
                                operationRef: '#/paths/~1other/get',
                                requestBody: '$request.body',
                                server: { url: 'https://other.com' },
                                // Description and parameters intentionally omitted to hit false branches
                            },
                        },
                    },
                },
            },
        },
        '/other': {
            get: {
                operationId: 'getOther',
                responses: {
                    '200': { description: 'ok' },
                },
            },
        },
    },
    components: {},
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
                    '200': { $ref: '#/components/responses/MissingResponse' },
                },
            },
        },
        '/bad-link': {
            get: {
                operationId: 'getBadLink',
                responses: {
                    '200': {
                        description: 'ok',
                        links: {
                            // Link ref does not exist
                            BrokenLink: { $ref: '#/components/links/MissingLink' },
                        },
                    },
                },
            },
        },
    },
    components: {},
};

const webhookLinkSpec: SwaggerSpec = {
    openapi: '3.2.0',
    info: { title: 'Webhook Link Test', version: '1.0' },
    paths: {
        '/trigger': {
            post: {
                operationId: 'triggerWebhook',
                responses: {
                    '200': {
                        description: 'ok',
                        links: {
                            NotifyWebhook: {
                                operationRef: '#/webhooks/user.created/post',
                            },
                        },
                    },
                },
            },
        },
    },
    webhooks: {
        'user.created': {
            post: {
                operationId: 'handleUserCreated',
                responses: { '200': { description: 'ok' } },
            },
        },
    },
    components: {},
};

const extensionLinksSpec: SwaggerSpec = {
    openapi: '3.2.0',
    info: { title: 'Link Extensions', version: '1.0' },
    paths: {
        '/items/{id}': {
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            get: {
                operationId: 'getItem',
                responses: {
                    '200': {
                        description: 'ok',
                        links: {
                            Next: {
                                operationId: 'getNext',
                                'x-trace': 'keep-me',
                                'x-meta': { level: 1 },
                            },
                        },
                    },
                },
            },
        },
        '/items/{id}/next': {
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            get: { operationId: 'getNext', responses: { '200': { description: 'ok' } } },
        },
    },
    components: {
        links: {
            Paged: {
                operationId: 'listThings',
                'x-note': 'component-link',
            },
        },
        schemas: {},
    },
};

// Spec missing operationId or responses
const sparseSpec: SwaggerSpec = {
    openapi: '3.0.0',
    info: { title: 'Sparse', version: '1.0' },
    paths: {
        '/no-id': {
            get: {
                // Missing operationId
                responses: { '200': { description: 'ok' } },
            },
        },
        // Missing responses (technically invalid OAS but parser handles it)
        '/no-responses': {
            get: {
                operationId: 'actionNoResp',
                responses: { '200': { description: 'ok' } },
            } as any,
        },
    },
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
        // type-coverage:ignore-next-line
        const moduleHelper = { exports: {} as any };
        // type-coverage:ignore-next-line
        new Function('exports', jsCode)(moduleHelper.exports);
        // type-coverage:ignore-next-line
        return moduleHelper.exports;
    };

    it('should generate links registry for inline links (Id, Desc, Params)', () => {
        const project = runGenerator(linksSpec);
        // type-coverage:ignore-next-line
        const { API_LINKS } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        expect(API_LINKS).toBeDefined();
        // type-coverage:ignore-next-line
        expect(API_LINKS['getUserById']).toBeDefined();
        // type-coverage:ignore-next-line
        expect(API_LINKS['getUserById']['200']).toBeDefined();

        // type-coverage:ignore-next-line
        const link = API_LINKS['getUserById']['200']['GetUserAddress'];
        // type-coverage:ignore-next-line
        expect(link).toBeDefined();
        // type-coverage:ignore-next-line
        expect(link.operationId).toBe('getUserAddress');
        // type-coverage:ignore-next-line
        expect(link.description).toBe('The address of this user');
        // type-coverage:ignore-next-line
        expect(link.parameters).toEqual({ userId: '$response.body#/id' });

        // Assert missing fields are truly undefined in the generated object
        // type-coverage:ignore-next-line
        expect(link.operationRef).toBeUndefined();
        // type-coverage:ignore-next-line
        expect(link.requestBody).toBeUndefined();
        // type-coverage:ignore-next-line
        expect(link.server).toBeUndefined();
    });

    it('should emit component links registry when components.links is defined', () => {
        const project = runGenerator(componentOnlyLinksSpec);
        // type-coverage:ignore-next-line
        const { API_COMPONENT_LINKS } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        expect(API_COMPONENT_LINKS).toBeDefined();
        // type-coverage:ignore-next-line
        expect(API_COMPONENT_LINKS.NextPage).toBeDefined();
        // type-coverage:ignore-next-line
        expect(API_COMPONENT_LINKS.NextPage.operationId).toBe('listThings');
        // type-coverage:ignore-next-line
        expect(API_COMPONENT_LINKS.NextPage.description).toBe('Next page link');
    });

    it('should resolve operationRef for component links', () => {
        const project = runGenerator(componentOperationRefSpec);
        // type-coverage:ignore-next-line
        const { API_COMPONENT_LINKS } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        expect(API_COMPONENT_LINKS).toBeDefined();
        // type-coverage:ignore-next-line
        expect(API_COMPONENT_LINKS.GoTarget).toBeDefined();
        // type-coverage:ignore-next-line
        expect(API_COMPONENT_LINKS.GoTarget.operationRef).toBe('#/paths/~1target/get');
        // type-coverage:ignore-next-line
        expect(API_COMPONENT_LINKS.GoTarget.operationId).toBe('getTarget');
    });

    it('should resolve referenced links', () => {
        const project = runGenerator(refLinksSpec);
        // type-coverage:ignore-next-line
        const { API_LINKS } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        const link = API_LINKS['getOrder']['200']['CancelOrder'];
        // type-coverage:ignore-next-line
        expect(link).toBeDefined();
        // type-coverage:ignore-next-line
        expect(link.operationId).toBe('cancelOrder');
        // type-coverage:ignore-next-line
        expect(link.parameters).toEqual({ orderId: '$request.path.id' });
    });

    it('should resolve operationRef to operationId and preserve operationRef, requestBody, server', () => {
        const project = runGenerator(complexLinkSpec);
        // type-coverage:ignore-next-line
        const { API_LINKS } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        const link = API_LINKS['getResource']['200']['DeepLink'];
        // type-coverage:ignore-next-line
        expect(link.operationRef).toBe('#/paths/~1other/get');
        // type-coverage:ignore-next-line
        expect(link.requestBody).toBe('$request.body');
        // type-coverage:ignore-next-line
        expect(link.server).toEqual({ url: 'https://other.com' });

        // Verify omitted fields
        // type-coverage:ignore-next-line
        expect(link.operationId).toBe('getOther');
        // type-coverage:ignore-next-line
        expect(link.description).toBeUndefined();
        // type-coverage:ignore-next-line
        expect(link.parameters).toBeUndefined();
    });

    it('should resolve operationRef that targets webhooks', () => {
        const project = runGenerator(webhookLinkSpec);
        // type-coverage:ignore-next-line
        const { API_LINKS } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        const link = API_LINKS['triggerWebhook']['200']['NotifyWebhook'];
        // type-coverage:ignore-next-line
        expect(link.operationRef).toBe('#/webhooks/user.created/post');
        // type-coverage:ignore-next-line
        expect(link.operationId).toBe('handleUserCreated');
    });

    it('should preserve x- extensions on operation and component links', () => {
        const project = runGenerator(extensionLinksSpec);
        // type-coverage:ignore-next-line
        const { API_LINKS, API_COMPONENT_LINKS } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        const link = API_LINKS['getItem']['200']['Next'];
        // type-coverage:ignore-next-line
        expect(link['x-trace']).toBe('keep-me');
        // type-coverage:ignore-next-line
        expect(link['x-meta']).toEqual({ level: 1 });

        // type-coverage:ignore-next-line
        expect(API_COMPONENT_LINKS.Paged['x-note']).toBe('component-link');
    });

    it('should resolve external operationRef when the target document is cached', () => {
        const entrySpec: SwaggerSpec = {
            openapi: '3.2.0',
            info: { title: 'Entry', version: '1.0' },
            paths: {
                '/entry': {
                    get: {
                        operationId: 'getEntry',
                        responses: {
                            '200': {
                                description: 'ok',
                                links: {
                                    External: {
                                        operationRef: 'other.json#/paths/~1external/get',
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };

        const externalSpec: SwaggerSpec = {
            openapi: '3.2.0',
            info: { title: 'External', version: '1.0' },
            paths: {
                '/external': {
                    get: {
                        operationId: 'getExternal',
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };

        const project = createTestProject();
        const config: GeneratorConfig = { output: '/out', options: {} } as any;
        const entryUri = 'http://api.com/spec.json';
        const externalUri = 'http://api.com/other.json';
        const specCache = new Map<string, SwaggerSpec>([
            [entryUri, entrySpec],
            [externalUri, externalSpec],
        ]);
        const parser = new SwaggerParser(entrySpec, config, specCache, entryUri);
        new LinkGenerator(parser, project).generate('/out');

        // type-coverage:ignore-next-line
        const { API_LINKS } = compileGeneratedFile(project);
        // type-coverage:ignore-next-line
        const link = API_LINKS['getEntry']['200']['External'];
        // type-coverage:ignore-next-line
        expect(link.operationRef).toBe('other.json#/paths/~1external/get');
        // type-coverage:ignore-next-line
        expect(link.operationId).toBe('getExternal');
    });

    it('should ignore operations without identifiers or links', () => {
        // Test sparse spec
        const project = runGenerator(sparseSpec);
        // type-coverage:ignore-next-line
        const { API_LINKS } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        expect(API_LINKS).toBeUndefined();
        const sourceFile = project.getSourceFileOrThrow('/out/links.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });

    it('should handle unresolvable references gracefully', () => {
        // Suppress warning expectation in test output
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const project = runGenerator(brokenRefsSpec);
        // type-coverage:ignore-next-line
        const { API_LINKS } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        expect(API_LINKS).toBeUndefined();
        const sourceFile = project.getSourceFileOrThrow('/out/links.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });

    it('should produce valid module for empty links', () => {
        const spec: SwaggerSpec = {
            openapi: '3.0.0',
            info: { title: 'Empty', version: '1' },
            paths: {},
        };
        const project = runGenerator(spec);
        const sourceFile = project.getSourceFileOrThrow('/out/links.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });
});
