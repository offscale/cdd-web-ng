import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { ServerUrlGenerator } from '@src/generators/shared/server-url.generator.js';
import { createTestProject } from '../shared/helpers.js';
import ts from 'typescript';

describe('Emitter: ServerUrlGenerator', () => {
    const runGenerator = (servers: any[]) => {
        const project = createTestProject();
        const parser = new SwaggerParser(
            {
                openapi: '3.2.0',
                info: { title: 'Test', version: '1.0' },
                paths: {},
                servers,
            } as any,
            { options: {} } as any,
        );

        new ServerUrlGenerator(parser, project).generate('/out');
        return project;
    };

    const compileHelper = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/utils/server-url.ts');
        const startText = sourceFile.getText();
        const jsCode = ts.transpile(startText.replace(/export /g, ''), {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.CommonJS,
        });
        const moduleScope = { API_SERVERS: [], getServerUrl: null as any, resolveServerUrl: null as any };
        new Function(
            'scope',
            `
            ${jsCode} 
            scope.API_SERVERS = API_SERVERS; 
            scope.getServerUrl = getServerUrl; 
            scope.resolveServerUrl = resolveServerUrl;
        `,
        )(moduleScope);
        return moduleScope;
    };

    it('should generate file with default server if no servers are defined (OAS 3.x)', () => {
        const project = runGenerator([]);
        const sourceFile = project.getSourceFile('/out/utils/server-url.ts');
        expect(sourceFile).toBeDefined();
        expect(sourceFile!.getText()).toContain('"url": "/"');
    });

    it('should generate API_SERVERS constant checking OAS 3.2 name property', () => {
        const project = runGenerator([
            { url: 'https://api.example.com', name: 'production', description: 'Production' },
        ]);
        const text = project.getSourceFileOrThrow('/out/utils/server-url.ts').getText();
        expect(text).toContain('export const API_SERVERS: ServerConfiguration[] = [');
        // Resolution updates URLs to be absolute and normalized (trailing slash for domains)
        expect(text).toContain('"url": "https://api.example.com/"');
        expect(text).toContain('"name": "production"');
    });

    it('should preserve x- extensions and allow them in server metadata types', () => {
        const project = runGenerator([
            {
                url: 'https://api.example.com',
                name: 'prod',
                'x-server': 'alpha',
                variables: {
                    env: {
                        default: 'dev',
                        'x-var': 'meta',
                    },
                },
            },
        ]);

        const { API_SERVERS } = compileHelper(project);
        expect(API_SERVERS[0]['x-server']).toBe('alpha');
        expect(API_SERVERS[0].variables?.env['x-var']).toBe('meta');

        const sourceFile = project.getSourceFileOrThrow('/out/utils/server-url.ts');
        expect(sourceFile.getInterfaceOrThrow('ServerConfiguration').getIndexSignatures().length).toBe(1);
        expect(sourceFile.getInterfaceOrThrow('ServerVariable').getIndexSignatures().length).toBe(1);
    });

    it('should generate logic to substitute simple variables', () => {
        const project = runGenerator([
            {
                url: 'https://{env}.example.com/v1',
                variables: { env: { default: 'dev' } },
            },
        ]);

        const { getServerUrl } = compileHelper(project);

        // Template URLs starting with { are NOT resolved/normalized by parser, ensuring variables are preserved
        // but URLs like https://{var} are resolved by URL() constructor which encodes {}.
        // The parser decodes them back.
        // Trailing slash is added to the *pathless* root of the resolved URL by standard URL normalization.
        // https://{env}.example.com/v1 -> path is /v1, no trailing slash added to root.

        // Use default
        expect(getServerUrl(0)).toBe('https://dev.example.com/v1');
        // Override
        expect(getServerUrl(0, { env: 'prod' })).toBe('https://prod.example.com/v1');
    });

    it('should throw error if variable value is not in enum', () => {
        const project = runGenerator([
            {
                url: 'https://{region}.api.com',
                variables: {
                    region: { default: 'us', enum: ['us', 'eu', 'asia'] },
                },
            },
        ]);

        const { getServerUrl } = compileHelper(project);

        // Valid - Note: URL normalization adds trailing slash to the template base
        // e.g., https://{region}.api.com/
        expect(getServerUrl(0, { region: 'eu' })).toBe('https://eu.api.com/');
        // Invalid
        expect(() => getServerUrl(0, { region: 'mars' })).toThrow(
            'Value "mars" for variable "region" is not in the allowed enum: us, eu, asia',
        );
    });

    it('should generate logic to look up server by name (OAS 3.2)', () => {
        const project = runGenerator([
            { url: 'https://dev.api.com', name: 'dev', description: 'Development' },
            { url: 'https://prod.api.com', name: 'prod', description: 'Production' },
        ]);

        const { getServerUrl } = compileHelper(project);

        // Expect trailing slashes due to URL normalization
        expect(getServerUrl('prod')).toBe('https://prod.api.com/');
        expect(getServerUrl('dev')).toBe('https://dev.api.com/');
    });

    it('should resolve server URLs from a custom server list', () => {
        const project = runGenerator([{ url: 'https://global.api.com', name: 'global' }]);

        const { resolveServerUrl } = compileHelper(project);
        const customServers = [
            { url: 'https://custom.api.com', name: 'custom' },
            { url: 'https://alt.api.com', description: 'Alternative' },
        ];

        expect(resolveServerUrl(customServers, 'custom')).toBe('https://custom.api.com');
        expect(resolveServerUrl(customServers, 'Alternative')).toBe('https://alt.api.com');
    });

    it('should generate logic to look up server by description (Legacy fallback)', () => {
        const project = runGenerator([
            { url: 'https://dev.api.com', description: 'Development' },
            { url: 'https://prod.api.com', description: 'Production' },
        ]);

        const { getServerUrl } = compileHelper(project);

        expect(getServerUrl('Production')).toBe('https://prod.api.com/');
        expect(getServerUrl('Development')).toBe('https://dev.api.com/');
    });

    it('should throw error if server is not found', () => {
        const project = runGenerator([{ url: '/' }]);
        const { getServerUrl } = compileHelper(project);
        expect(() => getServerUrl(99)).toThrow('Server not found: 99');
        expect(() => getServerUrl('Unknown')).toThrow('Server not found: Unknown');
    });

    it('should handle multiple variables', () => {
        const project = runGenerator([
            {
                url: '{protocol}://{host}:{port}/{base}',
                variables: {
                    protocol: { default: 'https' },
                    host: { default: 'localhost' },
                    port: { default: '8080' },
                    base: { default: 'api' },
                },
            },
        ]);
        const { getServerUrl } = compileHelper(project);

        // Use Defaults. Note: Parser skips resolution for URLs starting with {
        // So no normalization occurs.
        expect(getServerUrl(0)).toBe('https://localhost:8080/api');
        // Partial override
        expect(getServerUrl(0, { port: '3000', protocol: 'http' })).toBe('http://localhost:3000/api');
    });

    it('should fall back to default server when parser.servers is undefined', () => {
        const project = createTestProject();
        const parser = new SwaggerParser(
            {
                openapi: '3.2.0',
                info: { title: 'No Servers', version: '1.0' },
                paths: {},
            } as any,
            { options: {} } as any,
        );
        // Force undefined to exercise defensive fallback path
        (parser as any).servers = undefined;

        new ServerUrlGenerator(parser, project).generate('/out');
        const sourceFile = project.getSourceFileOrThrow('/out/utils/server-url.ts');
        expect(sourceFile.getText()).toContain('"url": "/"');
    });
});
