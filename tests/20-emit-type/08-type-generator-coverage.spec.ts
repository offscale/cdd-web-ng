import { describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { TypeGenerator } from '@src/generators/shared/type.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';

describe('Emitter: TypeGenerator (Coverage Edges)', () => {
    it('should cover webhooks, callbacks, links, headers, and composition edge cases', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = { input: '', output: '/out', options: {} };
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Edge', version: '1.0' },
            paths: {
                '/no-opid': {
                    post: {
                        callbacks: {
                            missingCallback: { $ref: '#/components/callbacks/MissingCallback' },
                            inlineCallback: {
                                '{$request.query.url}': {
                                    post: {
                                        requestBody: {
                                            content: {
                                                'application/json': { schema: { type: 'object', properties: { id: { type: 'string' } } } },
                                            },
                                        },
                                    },
                                },
                            },
                            emptyCallback: {
                                '{$request.query.empty}': {
                                    post: {
                                        requestBody: {
                                            content: { 'application/json': {} },
                                        },
                                    },
                                },
                            },
                        },
                        responses: {
                            '200': {
                                headers: {
                                    'X-Missing-Header': { $ref: '#/components/headers/MissingHeader' },
                                    'X-Content-NoSchema': { content: { 'application/json': {} } },
                                    'X-Deprecated': { deprecated: true, schema: { type: 'string' } },
                                },
                            },
                        },
                    },
                },
                '/empty-headers': {
                    get: {
                        operationId: 'emptyHeaders',
                        responses: {
                            '200': {
                                headers: {
                                    'X-Only-Missing': { $ref: '#/components/headers/MissingHeader' },
                                },
                            },
                        },
                    },
                },
            },
            webhooks: {
                webhookNoContent: {
                    post: {
                        requestBody: {
                            content: { 'application/json': {} },
                        },
                    },
                },
                webhookWildcard: {
                    post: {
                        requestBody: {
                            content: { '*/*': {} },
                        },
                    },
                },
            },
            components: {
                schemas: {
                    Dummy: { type: 'object', properties: { id: { type: 'string' } } },
                    Plain: { type: 'object', properties: { name: { type: 'string' } } },
                    Base: { type: 'object', properties: { id: { type: 'string', readOnly: true } } },
                    Composite: {
                        allOf: [
                            { $ref: '#/components/schemas/Base' },
                            { $ref: '#/components/schemas/Plain' },
                            { $ref: '#/components/schemas/' },
                            { $ref: '#/components/schemas/Missing' },
                        ],
                    },
                    EnumWithNumber: { type: 'string', enum: ['1st', 'SECOND'] },
                },
                links: {
                    NoParams: { operationId: 'noop' },
                },
                headers: {},
                callbacks: {},
            },
        };

        const parser = new SwaggerParser(spec as any, config);
        new TypeGenerator(parser, project, config).generate('/out');

        const sourceFile = project.getSourceFileOrThrow('/out/models/index.ts');

        const enumDecl = sourceFile.getEnumOrThrow('EnumWithNumber');
        expect(enumDecl.getMember('_1ST')).toBeDefined();

        const compositeRequest = sourceFile.getInterfaceOrThrow('CompositeRequest');
        expect(compositeRequest.getExtends().some(e => e.getText().includes('BaseRequest'))).toBe(true);

        expect(sourceFile.getInterface('EmptyHeaders200Headers')).toBeUndefined();
        expect(sourceFile.getText()).toContain('X-Deprecated');
        expect(sourceFile.getInterfaces().some(iface => iface.getName().endsWith('InlineCallbackRequest'))).toBe(
            true,
        );
    });
});
