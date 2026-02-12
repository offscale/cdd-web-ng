import ts from 'typescript';

import { describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { SwaggerParser } from '@src/core/parser.js';
import { ExamplesGenerator } from '@src/generators/shared/examples.generator.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types/index.js';

import { createTestProject } from '../shared/helpers.js';

const examplesSpec: SwaggerSpec = {
    openapi: '3.2.0',
    info: { title: 'Examples', version: '1.0' },
    paths: {},
    components: {
        examples: {
            ExampleOne: {
                summary: 'Example',
                dataValue: { foo: 'bar' },
            },
            ExampleTwo: {
                serializedValue: '{"hello":"world"}',
            },
        },
    },
};

describe('Emitter: ExamplesGenerator', () => {
    const runGenerator = (spec: SwaggerSpec) => {
        const project = createTestProject();
        const config: GeneratorConfig = { output: '/out', options: {} } as any;
        const parser = new SwaggerParser(spec, config);
        new ExamplesGenerator(parser, project).generate('/out');
        return project;
    };

    const compileGeneratedFile = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/examples.ts');
        const code = sourceFile.getText();
        const jsCode = ts.transpile(code, { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS });
        const moduleHelper = { exports: {} as any };
        new Function('exports', jsCode)(moduleHelper.exports);
        return moduleHelper.exports;
    };

    it('should generate registry map for examples', () => {
        const project = runGenerator(examplesSpec);
        const { API_EXAMPLES } = compileGeneratedFile(project);

        expect(API_EXAMPLES.ExampleOne.summary).toBe('Example');
        expect(API_EXAMPLES.ExampleOne.dataValue.foo).toBe('bar');
        expect(API_EXAMPLES.ExampleTwo.serializedValue).toContain('world');
    });

    it('should handle specs without examples', () => {
        const emptySpec: SwaggerSpec = {
            openapi: '3.2.0',
            info: { title: 'Empty', version: '1.0' },
            paths: {},
        };
        const project = runGenerator(emptySpec);
        const sourceFile = project.getSourceFileOrThrow('/out/examples.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });
});
