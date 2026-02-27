import ts from 'typescript';

import { describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { SwaggerParser } from '@src/openapi/parse.js';
import { RequestBodiesGenerator } from '@src/openapi/emit_request_bodies.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types/index.js';

import { createTestProject } from '../shared/helpers.js';

const specWithRequestBodies: SwaggerSpec = {
    openapi: '3.2.0',
    info: { title: 'RequestBodies', version: '1.0' },
    paths: {},
    components: {
        requestBodies: {
            CreateUser: {
                description: 'User payload',
                content: {
                    'application/json': {
                        schema: { type: 'object', properties: { name: { type: 'string' } } },
                    },
                },
            },
        },
    },
};

describe('Emitter: RequestBodiesGenerator', () => {
    const runGenerator = (spec: SwaggerSpec) => {
        const project = createTestProject();
        const config: GeneratorConfig = { output: '/out', options: {} } as any;
        const parser = new SwaggerParser(spec, config);
        new RequestBodiesGenerator(parser, project).generate('/out');
        return project;
    };

    const compileGeneratedFile = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/request-bodies.ts');
        const code = sourceFile.getText();
        const jsCode = ts.transpile(code, { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS });
        // type-coverage:ignore-next-line
        const moduleHelper = { exports: {} as any };
        // type-coverage:ignore-next-line
        new Function('exports', jsCode)(moduleHelper.exports);
        // type-coverage:ignore-next-line
        return moduleHelper.exports;
    };

    it('should generate registry map for request bodies', () => {
        const project = runGenerator(specWithRequestBodies);
        // type-coverage:ignore-next-line
        const { API_REQUEST_BODIES } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        expect(API_REQUEST_BODIES.CreateUser).toBeDefined();
        // type-coverage:ignore-next-line
        expect(API_REQUEST_BODIES.CreateUser.description).toBe('User payload');
    });

    it('should handle specs without requestBodies', () => {
        const emptySpec: SwaggerSpec = {
            openapi: '3.2.0',
            info: { title: 'Empty', version: '1.0' },
            paths: {},
        };
        const project = runGenerator(emptySpec);
        const sourceFile = project.getSourceFileOrThrow('/out/request-bodies.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });
});
