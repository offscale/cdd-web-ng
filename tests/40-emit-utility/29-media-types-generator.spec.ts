import ts from 'typescript';

import { describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { SwaggerParser } from '@src/openapi/parse.js';
import { MediaTypesGenerator } from '@src/openapi/emit_media_types.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types/index.js';

import { createTestProject } from '../shared/helpers.js';

const mediaTypesSpec: SwaggerSpec = {
    openapi: '3.2.0',
    info: { title: 'MediaTypes', version: '1.0' },
    paths: {},
    components: {
        mediaTypes: {
            EventStream: {
                schema: { type: 'string' },
            },
            JsonLines: {
                itemSchema: { type: 'object', properties: { id: { type: 'string' } } },
            },
        },
    },
};

describe('Emitter: MediaTypesGenerator', () => {
    const runGenerator = (spec: SwaggerSpec) => {
        const project = createTestProject();
        const config: GeneratorConfig = { output: '/out', options: {} } as any;
        const parser = new SwaggerParser(spec, config);
        new MediaTypesGenerator(parser, project).generate('/out');
        return project;
    };

    const compileGeneratedFile = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/media-types.ts');
        const code = sourceFile.getText();
        const jsCode = ts.transpile(code, { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS });
        // type-coverage:ignore-next-line
        const moduleHelper = { exports: {} as any };
        // type-coverage:ignore-next-line
        new Function('exports', jsCode)(moduleHelper.exports);
        // type-coverage:ignore-next-line
        return moduleHelper.exports;
    };

    it('should generate registry map for media types', () => {
        const project = runGenerator(mediaTypesSpec);
        // type-coverage:ignore-next-line
        const { API_MEDIA_TYPES } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        expect(API_MEDIA_TYPES.EventStream.schema.type).toBe('string');
        // type-coverage:ignore-next-line
        expect(API_MEDIA_TYPES.JsonLines.itemSchema.type).toBe('object');
    });

    it('should handle specs without mediaTypes', () => {
        const emptySpec: SwaggerSpec = {
            openapi: '3.2.0',
            info: { title: 'Empty', version: '1.0' },
            paths: {},
        };
        const project = runGenerator(emptySpec);
        const sourceFile = project.getSourceFileOrThrow('/out/media-types.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });
});
