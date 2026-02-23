import ts from 'typescript';

import { describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { SwaggerParser } from '@src/core/parser.js';
import { TagGenerator } from '@src/generators/shared/tag.generator.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types/index.js';

import { createTestProject } from '../shared/helpers.js';

const tagsSpec: SwaggerSpec = {
    openapi: '3.2.0',
    info: { title: 'Tags Test', version: '1.0' },
    paths: {},
    tags: [
        {
            name: 'Pet',
            summary: 'Pet Operations',
            description: 'Everything about your Pets',
            kind: 'resource',
            'x-audience': 'internal',
            externalDocs: {
                description: 'Find out more',
                url: 'http://swagger.io',
            },
        } as any,
        {
            name: 'Store',
            description: 'Access to Petstore orders',
            parent: 'Pet',
        } as any,
    ],
};

describe('Emitter: TagGenerator', () => {
    const runGenerator = (spec: SwaggerSpec) => {
        const project = createTestProject();
        const config: GeneratorConfig = { output: '/out', options: {} } as any;
        const parser = new SwaggerParser(spec, config);
        new TagGenerator(parser, project).generate('/out');
        return project;
    };

    const compileGeneratedFile = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/tags.ts');
        const code = sourceFile.getText();
        const jsCode = ts.transpile(code, { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS });
        // type-coverage:ignore-next-line
        const moduleHelper = { exports: {} as any };
        // type-coverage:ignore-next-line
        new Function('exports', jsCode)(moduleHelper.exports);
        // type-coverage:ignore-next-line
        return moduleHelper.exports;
    };

    it('should generate registry array for tags including OAS 3.2 fields', () => {
        const project = runGenerator(tagsSpec);
        // type-coverage:ignore-next-line
        const { API_TAGS } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        expect(API_TAGS).toHaveLength(2);
        // type-coverage:ignore-next-line
        expect(API_TAGS[0].name).toBe('Pet');
        // type-coverage:ignore-next-line
        expect(API_TAGS[0].summary).toBe('Pet Operations');
        // type-coverage:ignore-next-line
        expect(API_TAGS[0].kind).toBe('resource');
        // type-coverage:ignore-next-line
        expect(API_TAGS[0]['x-audience']).toBe('internal');
        // type-coverage:ignore-next-line
        expect(API_TAGS[0].externalDocs.url).toBe('http://swagger.io');
    });

    it('should generate lookup map handling parent field', () => {
        const project = runGenerator(tagsSpec);
        // type-coverage:ignore-next-line
        const { API_TAGS_MAP } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        expect(API_TAGS_MAP['Store']).toBeDefined();
        // type-coverage:ignore-next-line
        expect(API_TAGS_MAP['Store'].description).toContain('orders');
        // type-coverage:ignore-next-line
        expect(API_TAGS_MAP['Store'].parent).toBe('Pet');

        // type-coverage:ignore-next-line
        expect(API_TAGS_MAP['Pet'].name).toBe('Pet');
    });

    it('should handle specs without tags', () => {
        const emptySpec: SwaggerSpec = {
            openapi: '3.0.0',
            info: { title: 'NoTags', version: '1.0' },
            paths: {},
        };
        const project = runGenerator(emptySpec);
        const sourceFile = project.getSourceFileOrThrow('/out/tags.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });

    it('should handle empty tags array', () => {
        const emptyArraySpec: SwaggerSpec = {
            openapi: '3.0.0',
            info: { title: 'EmptyTags', version: '1.0' },
            paths: {},
            tags: [],
        };
        const project = runGenerator(emptyArraySpec);
        const sourceFile = project.getSourceFileOrThrow('/out/tags.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });

    it('should omit description when not provided', () => {
        const minimalSpec: SwaggerSpec = {
            openapi: '3.2.0',
            info: { title: 'MinimalTags', version: '1.0' },
            paths: {},
            tags: [{ name: 'Minimal' } as any],
        };
        const project = runGenerator(minimalSpec);
        // type-coverage:ignore-next-line
        const { API_TAGS } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        expect(API_TAGS).toHaveLength(1);
        // type-coverage:ignore-next-line
        expect(API_TAGS[0].description).toBeUndefined();
    });
});
