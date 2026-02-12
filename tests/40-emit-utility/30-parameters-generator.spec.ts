import ts from 'typescript';

import { describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { SwaggerParser } from '@src/core/parser.js';
import { ParametersGenerator } from '@src/generators/shared/parameters.generator.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types/index.js';

import { createTestProject } from '../shared/helpers.js';

const specWithParameters: SwaggerSpec = {
    openapi: '3.2.0',
    info: { title: 'Parameters', version: '1.0' },
    paths: {},
    components: {
        parameters: {
            LimitParam: {
                name: 'limit',
                in: 'query',
                schema: { type: 'integer', format: 'int32' },
            },
        },
    },
};

describe('Emitter: ParametersGenerator', () => {
    const runGenerator = (spec: SwaggerSpec) => {
        const project = createTestProject();
        const config: GeneratorConfig = { output: '/out', options: {} } as any;
        const parser = new SwaggerParser(spec, config);
        new ParametersGenerator(parser, project).generate('/out');
        return project;
    };

    const compileGeneratedFile = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/parameters.ts');
        const code = sourceFile.getText();
        const jsCode = ts.transpile(code, { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS });
        const moduleHelper = { exports: {} as any };
        new Function('exports', jsCode)(moduleHelper.exports);
        return moduleHelper.exports;
    };

    it('should generate registry map for parameters', () => {
        const project = runGenerator(specWithParameters);
        const { API_PARAMETERS } = compileGeneratedFile(project);

        expect(API_PARAMETERS.LimitParam).toBeDefined();
        expect(API_PARAMETERS.LimitParam.name).toBe('limit');
        expect(API_PARAMETERS.LimitParam.in).toBe('query');
    });

    it('should handle specs without parameters', () => {
        const emptySpec: SwaggerSpec = {
            openapi: '3.2.0',
            info: { title: 'Empty', version: '1.0' },
            paths: {},
        };
        const project = runGenerator(emptySpec);
        const sourceFile = project.getSourceFileOrThrow('/out/parameters.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });
});
