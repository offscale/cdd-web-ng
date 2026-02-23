import ts from 'typescript';

import { describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { SwaggerParser } from '@src/core/parser.js';
import { ResponsesGenerator } from '@src/generators/shared/responses.generator.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types/index.js';

import { createTestProject } from '../shared/helpers.js';

const specWithResponses: SwaggerSpec = {
    openapi: '3.2.0',
    info: { title: 'Responses', version: '1.0' },
    paths: {},
    components: {
        responses: {
            NotFound: {
                description: 'Not found',
                content: {
                    'application/json': {
                        schema: { type: 'object', properties: { message: { type: 'string' } } },
                    },
                },
            },
        },
    },
};

describe('Emitter: ResponsesGenerator', () => {
    const runGenerator = (spec: SwaggerSpec) => {
        const project = createTestProject();
        const config: GeneratorConfig = { output: '/out', options: {} } as any;
        const parser = new SwaggerParser(spec, config);
        new ResponsesGenerator(parser, project).generate('/out');
        return project;
    };

    const compileGeneratedFile = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/responses.ts');
        const code = sourceFile.getText();
        const jsCode = ts.transpile(code, { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS });
        // type-coverage:ignore-next-line
        const moduleHelper = { exports: {} as any };
        // type-coverage:ignore-next-line
        new Function('exports', jsCode)(moduleHelper.exports);
        // type-coverage:ignore-next-line
        return moduleHelper.exports;
    };

    it('should generate registry map for responses', () => {
        const project = runGenerator(specWithResponses);
        // type-coverage:ignore-next-line
        const { API_RESPONSES } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        expect(API_RESPONSES.NotFound).toBeDefined();
        // type-coverage:ignore-next-line
        expect(API_RESPONSES.NotFound.description).toBe('Not found');
    });

    it('should handle specs without responses', () => {
        const emptySpec: SwaggerSpec = {
            openapi: '3.2.0',
            info: { title: 'Empty', version: '1.0' },
            paths: {},
        };
        const project = runGenerator(emptySpec);
        const sourceFile = project.getSourceFileOrThrow('/out/responses.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });
});
