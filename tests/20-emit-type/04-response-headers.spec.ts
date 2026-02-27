import { describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { TypeGenerator } from '@src/classes/emit.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { GeneratorConfig } from '@src/core/types/index.js';

const headerSpec = {
    openapi: '3.0.0',
    info: { title: 'Header API', version: '1.0' },
    paths: {
        '/users': {
            get: {
                operationId: 'getUsers',
                responses: {
                    '200': {
                        description: 'List of users',
                        headers: {
                            'X-Total-Count': {
                                description: 'Total number of items',
                                schema: { type: 'integer' },
                            },
                            'X-Rate-Limit': {
                                schema: { type: 'integer' },
                            },
                            'X-Complex-Header': {
                                description: 'Header defined via content map',
                                content: {
                                    'application/json': {
                                        schema: { type: 'object', properties: { id: { type: 'string' } } },
                                    },
                                },
                            },
                            'X-Old-Header': {
                                description: 'An old header',
                                schema: { type: 'string' },
                                deprecated: true,
                            },
                            Link: {
                                schema: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
    },
    components: {
        schemas: {
            Dummy: { type: 'object', properties: { id: { type: 'string' } } },
        },
    },
};

describe('Emitter: Response Header Type Generation', () => {
    // type-coverage:ignore-next-line
    const runGenerator = (spec: any) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = { input: '', output: '/out', options: { enumStyle: 'enum' } };
        const parser = new SwaggerParser(spec, config);
        new TypeGenerator(parser, project, config).generate('/out');
        return project.getSourceFileOrThrow('/out/models/index.ts');
    };

    it('should generate interface for response headers', () => {
        const sourceFile = runGenerator(headerSpec);

        const interfaceName = 'GetUsers200Headers';
        const headersInterface = sourceFile.getInterfaceOrThrow(interfaceName);

        expect(headersInterface).toBeDefined();
        expect(headersInterface.isExported()).toBe(true);

        const rateLimit = headersInterface.getPropertyOrThrow("'X-Rate-Limit'");
        expect(rateLimit.getType().getText()).toBe('number');

        const totalCount = headersInterface.getPropertyOrThrow("'X-Total-Count'");
        expect(totalCount.getJsDocs()[0].getDescription().trim()).toBe('Total number of items');
    });

    it('should handle headers defined via content map (OAS 3.x)', () => {
        const sourceFile = runGenerator(headerSpec);
        const headersInterface = sourceFile.getInterfaceOrThrow('GetUsers200Headers');

        // X-Complex-Header is defined via content: { 'application/json': { schema: { type: object, properties: { id: string } } } }
        const complexHeader = headersInterface.getPropertyOrThrow("'X-Complex-Header'");

        // Verify generated type matches the schema inside the content map
        // { id?: string }
        const typeText = complexHeader.getType().getText();
        expect(typeText).toContain('{ id?: string; }'); // or just check for structure
        expect(complexHeader.getJsDocs()[0].getDescription().trim()).toBe('Header defined via content map');
    });

    it('should include @deprecated tag for deprecated headers', () => {
        const sourceFile = runGenerator(headerSpec);
        const headersInterface = sourceFile.getInterfaceOrThrow('GetUsers200Headers');

        const oldHeader = headersInterface.getPropertyOrThrow("'X-Old-Header'");
        const doc = oldHeader.getJsDocs()[0].getText();

        expect(doc).toContain('An old header');
        expect(doc).toContain('@deprecated');
    });

    it('should fallback to operation method+path naming if operationId is missing', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Header API', version: '1.0' },
            paths: {
                '/items': {
                    head: {
                        responses: {
                            '200': {
                                description: 'ok',
                                headers: { 'X-Length': { schema: { type: 'integer' } } },
                            },
                        },
                    },
                },
            },
        };
        const sourceFile = runGenerator(spec);
        // Name should be HeadItems200Headers
        expect(sourceFile.getInterface('HeadItems200Headers')).toBeDefined();
    });

    it('should support Swagger 2.0 header definitions', () => {
        const spec = {
            swagger: '2.0',
            info: { title: 'Legacy API', version: '1.0' },
            paths: {
                '/legacy': {
                    get: {
                        responses: {
                            '200': {
                                description: 'ok',
                                headers: {
                                    'X-Legacy': { type: 'string', description: 'Legacy Header' },
                                },
                            },
                        },
                    },
                },
            },
        };
        const sourceFile = runGenerator(spec);
        const headersInterface = sourceFile.getInterfaceOrThrow('GetLegacy200Headers');
        expect(headersInterface.getProperty("'X-Legacy'")?.getType().getText()).toBe('string');
    });

    it('should model Set-Cookie as a string array', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Cookie API', version: '1.0' },
            paths: {
                '/cookies': {
                    get: {
                        operationId: 'getCookies',
                        responses: {
                            '200': {
                                description: 'ok',
                                headers: {
                                    'Set-Cookie': { schema: { type: 'string' } },
                                },
                            },
                        },
                    },
                },
            },
        };
        const sourceFile = runGenerator(spec);
        const headersInterface = sourceFile.getInterfaceOrThrow('GetCookies200Headers');
        expect(headersInterface.getProperty("'Set-Cookie'")?.getType().getText()).toBe('string[]');
    });

    it('should ignore Content-Type response headers', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Content-Type API', version: '1.0' },
            paths: {
                '/content': {
                    get: {
                        operationId: 'getContent',
                        responses: {
                            '200': {
                                description: 'ok',
                                headers: {
                                    'Content-Type': { schema: { type: 'string' } },
                                    'X-Status': { schema: { type: 'string' } },
                                },
                            },
                        },
                    },
                },
            },
        };
        const sourceFile = runGenerator(spec);
        const headersInterface = sourceFile.getInterfaceOrThrow('GetContent200Headers');
        expect(headersInterface.getProperty("'Content-Type'")).toBeUndefined();
        expect(headersInterface.getProperty("'X-Status'")).toBeDefined();
    });
});
