import ts from 'typescript';

import { describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { SwaggerParser } from '@src/core/parser.js';
import { PathItemsGenerator } from '@src/generators/shared/path-items.generator.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types/index.js';

import { createTestProject } from '../shared/helpers.js';

const specWithPathItems: SwaggerSpec = {
    openapi: '3.2.0',
    info: { title: 'PathItems', version: '1.0' },
    paths: {},
    components: {
        pathItems: {
            Ping: {
                get: {
                    operationId: 'ping',
                    responses: { '200': { description: 'pong' } },
                },
            },
        },
    },
};

describe('Emitter: PathItemsGenerator', () => {
    const runGenerator = (spec: SwaggerSpec) => {
        const project = createTestProject();
        const config: GeneratorConfig = { output: '/out', options: {} } as any;
        const parser = new SwaggerParser(spec, config);
        new PathItemsGenerator(parser, project).generate('/out');
        return project;
    };

    const compileGeneratedFile = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/path-items.ts');
        const code = sourceFile.getText();
        const jsCode = ts.transpile(code, { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS });
        // type-coverage:ignore-next-line
        const moduleHelper = { exports: {} as any };
        // type-coverage:ignore-next-line
        new Function('exports', jsCode)(moduleHelper.exports);
        // type-coverage:ignore-next-line
        return moduleHelper.exports;
    };

    it('should generate registry map for path items', () => {
        const project = runGenerator(specWithPathItems);
        // type-coverage:ignore-next-line
        const { API_PATH_ITEMS } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        expect(API_PATH_ITEMS.Ping).toBeDefined();
        // type-coverage:ignore-next-line
        expect(API_PATH_ITEMS.Ping.get.operationId).toBe('ping');
    });

    it('should handle specs without pathItems', () => {
        const emptySpec: SwaggerSpec = {
            openapi: '3.2.0',
            info: { title: 'Empty', version: '1.0' },
            paths: {},
        };
        const project = runGenerator(emptySpec);
        const sourceFile = project.getSourceFileOrThrow('/out/path-items.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });
});
