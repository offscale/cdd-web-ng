// tests/40-emit-utility/09-server-url-generator.spec.ts

import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { ServerUrlGenerator } from '@src/service/emit/utility/server-url.generator.js';
import { createTestProject } from '../shared/helpers.js';
import ts from 'typescript';

describe('Emitter: ServerUrlGenerator', () => {

    const runGenerator = (servers: any[]) => {
        const project = createTestProject();
        const parser = new SwaggerParser({
            openapi: '3.0.0',
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
        // Removing export keywords to evaluate in this context as strict CommonJS/Script
        const jsCode = ts.transpile(startText.replace(/export /g, ''), {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.CommonJS
        });
        const moduleScope = { API_SERVERS: [], getServerUrl: null as any };
        // Evaluate in simple scope
        new Function('scope', `
            ${jsCode} 
            scope.API_SERVERS = API_SERVERS; 
            scope.getServerUrl = getServerUrl; 
        `)(moduleScope);
        return moduleScope;
    };

    it('should not generate file if no servers are defined', () => {
        const project = runGenerator([]);
        expect(project.getSourceFile('/out/utils/server-url.ts')).toBeUndefined();
    });

    it('should generate API_SERVERS constant', () => {
        const project = runGenerator([
            { url: 'https://api.example.com', description: 'Production' }
        ]);
        const text = project.getSourceFileOrThrow('/out/utils/server-url.ts').getText();
        expect(text).toContain('export const API_SERVERS: ServerConfiguration[] = [');
        expect(text).toContain('"url": "https://api.example.com"');
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

    it('should generate logic to look up server by description', () => {
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
