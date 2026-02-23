import ts from 'typescript';

import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';

import { SwaggerParser } from '@src/core/parser.js';
import { HeadersGenerator } from '@src/generators/shared/headers.generator.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types/index.js';

import { createTestProject } from '../shared/helpers.js';

const specWithHeaders: SwaggerSpec = {
    openapi: '3.2.0',
    info: { title: 'Headers', version: '1.0' },
    paths: {},
    components: {
        headers: {
            TraceId: {
                description: 'Request trace identifier',
                schema: { type: 'string' },
            },
        },
    },
};

describe('Emitter: HeadersGenerator', () => {
    const runGenerator = (spec: SwaggerSpec) => {
        const project = createTestProject();
        const config: GeneratorConfig = { output: '/out', options: {} } as any;
        const parser = new SwaggerParser(spec, config);
        new HeadersGenerator(parser, project).generate('/out');
        return project;
    };

    const compileGeneratedFile = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/headers.ts');
        const code = sourceFile.getText();
        const jsCode = ts.transpile(code, { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS });
        // type-coverage:ignore-next-line
        const moduleHelper = { exports: {} as any };
        // type-coverage:ignore-next-line
        new Function('exports', jsCode)(moduleHelper.exports);
        // type-coverage:ignore-next-line
        return moduleHelper.exports;
    };

    it('should generate registry map for component headers', () => {
        const project = runGenerator(specWithHeaders);
        // type-coverage:ignore-next-line
        const { API_HEADERS } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        expect(API_HEADERS.TraceId).toBeDefined();
        // type-coverage:ignore-next-line
        expect(API_HEADERS.TraceId.description).toBe('Request trace identifier');
    });

    it('should handle specs without headers', () => {
        const emptySpec: SwaggerSpec = {
            openapi: '3.2.0',
            info: { title: 'Empty', version: '1.0' },
            paths: {},
        };
        const project = runGenerator(emptySpec);
        const sourceFile = project.getSourceFileOrThrow('/out/headers.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });
});
