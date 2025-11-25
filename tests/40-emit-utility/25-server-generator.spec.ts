import ts from 'typescript';

import { describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { SwaggerParser } from '@src/core/parser.js';
import { ServerGenerator } from '@src/generators/shared/server.generator.js';
import { SwaggerSpec } from "@src/core/types/index.js";

import { createTestProject } from '../shared/helpers.js';

const multiEnvSpec: SwaggerSpec = {
    openapi: '3.2.0',
    info: { title: 'Server Test', version: '1.0' },
    paths: {},
    servers: [
        { url: 'https://api.production.com/v1', description: 'Production', name: 'prod' },
        { url: 'https://api.staging.com/v1', description: 'Staging', name: 'staging' }
    ]
} as any;

describe('Emitter: ServerGenerator', () => {

    const runGenerator = (spec: SwaggerSpec) => {
        const project = createTestProject();
        const parser = new SwaggerParser(spec, { options: {} } as any);
        new ServerGenerator(parser, project).generate('/out');
        return project;
    };

    const compileGeneratedFile = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/servers.ts');
        const code = sourceFile.getText();
        const jsCode = ts.transpile(code, { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS });
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

    it('should handle empty servers gracefully', () => {
        const spec: SwaggerSpec = {
            openapi: '3.0.0',
            info: { title: 'E', version: '1' },
            paths: {},
            servers: []
        } as any;
        const project = runGenerator(spec);
        const sourceFile = project.getSourceFileOrThrow('/out/servers.ts');

        // This is the fix: use a regex to tolerate different spacing.
        expect(sourceFile.getText()).toMatch(/export\s*{\s*};/);

        const vars = sourceFile.getVariableStatements();
        expect(vars.length).toBe(0);
    });

    it('should handle undefined parser.servers array (defensive fallback coverage)', () => {
        const project = createTestProject();
        // Mock parser structure to force undefined servers, hitting the fallback branch `|| []`
        const parser = {
            servers: undefined
        } as unknown as SwaggerParser;

        new ServerGenerator(parser, project).generate('/out');

        const sourceFile = project.getSourceFileOrThrow('/out/servers.ts');
        expect(sourceFile.getText()).toMatch(/export\s*{\s*};/);
        const vars = sourceFile.getVariableStatements();
        expect(vars.length).toBe(0);
    });
});
