import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { TagGenerator } from '@src/service/emit/utility/tag.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types.js';
import ts from 'typescript';

// Cast to any to support new 3.2 properties in test mock without strict type errors if core types aren't updated in the test context first
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
            externalDocs: {
                description: 'Find out more',
                url: 'http://swagger.io'
            }
        } as any,
        {
            name: 'Store',
            description: 'Access to Petstore orders',
            parent: 'Pet' // OAS 3.2 Nested tag
        } as any
    ]
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
        const moduleHelper = { exports: {} as any };
        new Function('exports', jsCode)(moduleHelper.exports);
        return moduleHelper.exports;
    };

    it('should generate registry array for tags including OAS 3.2 fields', () => {
        const project = runGenerator(tagsSpec);
        const { API_TAGS } = compileGeneratedFile(project);

        expect(API_TAGS).toHaveLength(2);
        expect(API_TAGS[0].name).toBe('Pet');
        expect(API_TAGS[0].summary).toBe('Pet Operations');
        expect(API_TAGS[0].kind).toBe('resource');
        expect(API_TAGS[0].externalDocs.url).toBe('http://swagger.io');
    });

    it('should generate lookup map handling parent field', () => {
        const project = runGenerator(tagsSpec);
        const { API_TAGS_MAP } = compileGeneratedFile(project);

        expect(API_TAGS_MAP['Store']).toBeDefined();
        expect(API_TAGS_MAP['Store'].description).toContain('orders');
        expect(API_TAGS_MAP['Store'].parent).toBe('Pet');

        // Verify order/integrity matches array
        expect(API_TAGS_MAP['Pet'].name).toBe('Pet');
    });

    it('should handle specs without tags', () => {
        const emptySpec: SwaggerSpec = {
            openapi: '3.0.0',
            info: { title: 'NoTags', version: '1.0' },
            paths: {}
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
            tags: []
        };
        const project = runGenerator(emptyArraySpec);
        const sourceFile = project.getSourceFileOrThrow('/out/tags.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });
});
