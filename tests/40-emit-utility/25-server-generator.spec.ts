import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { ServerGenerator } from '@src/service/emit/utility/server.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types.js';
import ts from 'typescript';

const multiEnvSpec: SwaggerSpec = {
    openapi: '3.2.0',
    info: { title: 'Server Test', version: '1.0' },
    paths: {},
    servers: [
        { url: 'https://api.production.com/v1', description: 'Production', name: 'prod' },
        { url: 'https://api.staging.com/v1', description: 'Staging', name: 'staging' }
    ]
};

const varSpec: SwaggerSpec = {
    openapi: '3.0.0',
    info: { title: 'Server Var Test', version: '1.0' },
    paths: {},
    servers: [
        {
            url: 'https://{region}.api.com/{version}',
            description: 'Regional',
            variables: {
                region: { default: 'us-east', enum: ['us-east', 'eu-west'] },
                version: { default: 'v1' }
            }
        }
    ]
};

describe('Emitter: ServerGenerator', () => {

    const runGenerator = (spec: SwaggerSpec) => {
        const project = createTestProject();
        const config: GeneratorConfig = { output: '/out', options: {} } as any;
        const parser = new SwaggerParser(spec, config);
        new ServerGenerator(parser, project).generate('/out');
        return project;
    };

    const compileGeneratedFile = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/servers.ts');
        const code = sourceFile.getText();
        const jsCode = ts.transpile(code, { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS });
        // Mock exports
        const moduleHelper = { exports: {} as any };
        new Function('exports', jsCode)(moduleHelper.exports);
        return moduleHelper.exports;
    };

    it('should generate registry for static servers with name (OAS 3.2)', () => {
        const project = runGenerator(multiEnvSpec);
        const { API_SERVERS } = compileGeneratedFile(project);

        expect(API_SERVERS).toHaveLength(2);
        expect(API_SERVERS[0].url).toBe('https://api.production.com/v1');
        expect(API_SERVERS[0].name).toBe('prod');
        expect(API_SERVERS[1].description).toBe('Staging');
        expect(API_SERVERS[1].name).toBe('staging');
    });

    it('should generate utility function to resolve URLs', () => {
        const project = runGenerator(varSpec);
        const { API_SERVERS, buildServerUrl } = compileGeneratedFile(project);

        expect(API_SERVERS[0].variables.region.default).toBe('us-east');

        // Valid usage: Resolve using defaults
        const defaultUrl = buildServerUrl(0);
        expect(defaultUrl).toBe('https://us-east.api.com/v1');

        // Valid usage: Override variable
        const euUrl = buildServerUrl(0, { region: 'eu-west' });
        expect(euUrl).toBe('https://eu-west.api.com/v1');
    });

    it('should fallback gracefully if index not found', () => {
        const project = runGenerator(multiEnvSpec);
        const { buildServerUrl } = compileGeneratedFile(project);

        // Index 99 does not exist, should fallback to 0
        const url = buildServerUrl(99);
        expect(url).toBe('https://api.production.com/v1');
    });

    it('should ignore extra variables not defined in spec', () => {
        const project = runGenerator(varSpec);
        const { buildServerUrl } = compileGeneratedFile(project);

        // 'foo' is not in variables map, should be ignored
        const url = buildServerUrl(0, { foo: 'bar' });
        expect(url).toBe('https://us-east.api.com/v1');
    });

    it('should handle empty servers gracefully', () => {
        const spec: SwaggerSpec = { openapi: '3.0.0', info: { title:'E', version:'1'}, paths: {} };
        const project = runGenerator(spec);
        const { API_SERVERS, buildServerUrl } = compileGeneratedFile(project);

        // Fallback is { url: '/' } if parser doesn't provide one or we default it in generator
        expect(API_SERVERS[0].url).toBe('/');
        expect(buildServerUrl(0)).toBe('/');
    });
});
