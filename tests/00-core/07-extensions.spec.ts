// tests/00-core/07-extensions.spec.ts
import { describe, expect, it } from 'vitest';

import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, InfoObject, ServerObject, TagObject } from '@src/core/types/index.js';
import { extractPaths } from '@src/core/utils/index.js';

/**
 * Tests for the Specification Extensions (`x-*`) feature support.
 * Ensures that extra properties starting with `x-` are correctly preserved through the parser types
 * and utility extractors.
 */
describe('Core: Specification Extensions', () => {
    const config: GeneratorConfig = { input: '', output: '', options: {} };

    const specWithExtensions = {
        openapi: '3.0.0',
        info: {
            title: 'Extensible API',
            version: '1.0.0',
            'x-logo': { url: 'https://example.com/logo.png' },
            'x-internal-id': 12345,
        },
        tags: [
            {
                name: 'User',
                description: 'Operations',
                'x-display-order': 1,
            },
        ],
        servers: [
            {
                url: 'https://api.example.com',
                'x-environment': 'production',
            },
        ],
        paths: {
            '/users': {
                get: {
                    operationId: 'getUsers',
                    'x-query-complexity': 'medium',
                    parameters: [
                        {
                            name: 'limit',
                            in: 'query',
                            schema: { type: 'integer' },
                            'x-custom-validation': 'max-100',
                        },
                    ],
                    responses: {
                        '200': {
                            description: 'ok',
                            'x-response-meta': { cached: true },
                        },
                    },
                },
            },
        },
        components: {
            securitySchemes: {
                ApiKey: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API',
                    'x-provider-name': 'FastAuth',
                },
            },
        },
    };

    it('should allow accessing x- properties on InfoObject types', () => {
        const parser = new SwaggerParser(specWithExtensions as any, config);
        const info: InfoObject = parser.getSpec().info;

        expect(info['x-logo']).toBeDefined();
        // type-coverage:ignore-next-line
        expect((info as any)['x-logo'].url).toBe('https://example.com/logo.png');
        expect(info['x-internal-id']).toBe(12345);
    });

    it('should allow accessing x- properties on TagObject types', () => {
        const parser = new SwaggerParser(specWithExtensions as any, config);
        const tags: TagObject[] = parser.getSpec().tags || [];

        expect(tags.length).toBe(1);
        expect(tags[0]!['x-display-order']).toBe(1);
    });

    it('should allow accessing x- properties on ServerObject types', () => {
        const parser = new SwaggerParser(specWithExtensions as any, config);
        const servers: ServerObject[] = parser.servers || [];

        expect(servers.length).toBe(1);
        expect(servers[0]!['x-environment']).toBe('production');
    });

    it('should allow accessing x- properties on SecurityScheme types', () => {
        const parser = new SwaggerParser(specWithExtensions as any, config);
        const schemes = parser.getSecuritySchemes();

        expect(schemes['ApiKey']).toBeDefined();
        expect(schemes['ApiKey']!['x-provider-name']).toBe('FastAuth');
    });

    it('should propagate operation x- properties to PathInfo via extractPaths', () => {
        const pathInfoList = extractPaths(specWithExtensions.paths as any);
        const op = pathInfoList.find(p => p.path === '/users' && p.method === 'GET');

        expect(op).toBeDefined();
        expect(op!['x-query-complexity']).toBe('medium');
    });

    it('should propagate parameter x- properties via extractPaths', () => {
        const pathInfoList = extractPaths(specWithExtensions.paths as any);
        const op = pathInfoList.find(p => p.path === '/users' && p.method === 'GET');
        const param = op!.parameters!.find(p => p.name === 'limit');

        expect(param).toBeDefined();
        expect((param as any)!['x-custom-validation']).toBe('max-100');
    });
});
