import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { ServerUrlGenerator } from '@src/generators/shared/server-url.generator.js';
import { createTestProject } from '../shared/helpers.js';
import ts from 'typescript';

describe('Emitter: ServerUrlGenerator', () => {

    const runGenerator = (servers: any[]) => {
        // Passing empty servers [] or [undefined] will likely trigger the parser default logic
        // if we setup the Spec correctly as openapi spec.
        // However, SwaggerParser constructor arguments are tricky when mocked.
        const project = createTestProject();
        const parser = new SwaggerParser({
            openapi: '3.2.0',
            info: { title: 'Test', version: '1.0' },
            paths: {},
            servers
        } as any, { options: {} } as any);

        new ServerUrlGenerator(parser, project).generate('/out');
        return project;
    };

    const compileHelper = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/utils/server-url.ts');
        const startText = sourceFile.getText();
        const jsCode = ts.transpile(startText.replace(/export /g, ''), {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.CommonJS
        });
        const moduleScope = { API_SERVERS: [], getServerUrl: null as any };
        new Function('scope', `
            ${jsCode} 
            scope.API_SERVERS = API_SERVERS; 
            scope.getServerUrl = getServerUrl; 
        `)(moduleScope);
        return moduleScope;
    };

    it('should generate file with default server if no servers are defined (OAS 3.x)', () => {
        const project = runGenerator([]);
        const sourceFile = project.getSourceFile('/out/utils/server-url.ts');
        // Expected behavior changed: Spec parser defaults empty servers to [{ "url": "/" }]
        expect(sourceFile).toBeDefined();
        expect(sourceFile!.getText()).toContain('"url": "/"');
    });

    it('should generate API_SERVERS constant checking OAS 3.2 name property', () => {
        const project = runGenerator([
            { url: 'https://api.example.com', name: 'production', description: 'Production' }
        ]);
        const text = project.getSourceFileOrThrow('/out/utils/server-url.ts').getText();
        expect(text).toContain('export const API_SERVERS: ServerConfiguration[] = [');
        expect(text).toContain('"url": "https://api.example.com"');
        expect(text).toContain('"name": "production"');
    });

    it('should generate logic to substitute simple variables', () => {
        const project = runGenerator([
            {
                url: 'https://{env}.example.com/v1',
                variables: { env: { default: 'dev' } }
            }
        ]);

        const { getServerUrl } = compileHelper(project);

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
                    region: { default: 'us', enum: ['us', 'eu', 'asia'] }
                }
            }
        ]);

        const { getServerUrl } = compileHelper(project);

        // Valid
        expect(getServerUrl(0, { region: 'eu' })).toBe('https://eu.api.com');
        // Invalid
        expect(() => getServerUrl(0, { region: 'mars' })).toThrow(
            'Value "mars" for variable "region" is not in the allowed enum: us, eu, asia'
        );
    });

    it('should generate logic to look up server by name (OAS 3.2)', () => {
        const project = runGenerator([
            { url: 'https://dev.api.com', name: 'dev', description: 'Development' },
            { url: 'https://prod.api.com', name: 'prod', description: 'Production' }
        ]);

        const { getServerUrl } = compileHelper(project);

        expect(getServerUrl('prod')).toBe('https://prod.api.com');
        expect(getServerUrl('dev')).toBe('https://dev.api.com');
    });

    it('should generate logic to look up server by description (Legacy fallback)', () => {
        const project = runGenerator([
            { url: 'https://dev.api.com', description: 'Development' },
            { url: 'https://prod.api.com', description: 'Production' }
        ]);

        const { getServerUrl } = compileHelper(project);

        expect(getServerUrl('Production')).toBe('https://prod.api.com');
        expect(getServerUrl('Development')).toBe('https://dev.api.com');
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
                    base: { default: 'api' }
                }
            }
        ]);
        const { getServerUrl } = compileHelper(project);

        // Defaults
        expect(getServerUrl(0)).toBe('https://localhost:8080/api');
        // Partial override
        expect(getServerUrl(0, { port: '3000', protocol: 'http' })).toBe('http://localhost:3000/api');
    });
});
