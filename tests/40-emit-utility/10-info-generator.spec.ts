import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { InfoGenerator } from '@src/generators/shared/info.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { emptySpec } from '../shared/specs.js';
import ts from 'typescript';

describe('Emitter: InfoGenerator', () => {
    const runGenerator = (spec: object) => {
        const project = createTestProject();
        const parser = new SwaggerParser(spec as any, { options: {} } as any);
        new InfoGenerator(parser, project).generate('/out');
        return project;
    };

    const compileGeneratedFile = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/info.ts');
        const fileContent = sourceFile.getText();
        const jsCode = ts.transpile(fileContent, {
            target: ts.ScriptTarget.ES5,
            module: ts.ModuleKind.CommonJS
        });
        const moduleHelper = { exports: {} as any };
        new Function('exports', jsCode)(moduleHelper.exports);
        return moduleHelper.exports;
    };

    it('should generate info.ts based on the spec', () => {
        const spec = {
            openapi: '3.0.0',
            info: {
                title: 'My Test API',
                version: '2.0.0-beta',
                description: 'A description of the API'
            },
            paths: {}
        };
        const project = runGenerator(spec);
        const { API_INFO } = compileGeneratedFile(project);

        expect(API_INFO.title).toBe('My Test API');
        expect(API_INFO.version).toBe('2.0.0-beta');
        expect(API_INFO.description).toBe('A description of the API');
    });

    it('should generate correct structure for contact and license', () => {
        const spec = {
            openapi: '3.1.0',
            info: {
                title: 'Complex Info API',
                version: '1.0',
                contact: {
                    name: 'Support',
                    email: 'support@example.com',
                    url: 'https://example.com/support'
                },
                license: {
                    name: 'Apache 2.0',
                    identifier: 'Apache-2.0'
                },
                termsOfService: 'https://example.com/terms'
            },
            paths: {}
        };
        const project = runGenerator(spec);
        const { API_INFO } = compileGeneratedFile(project);

        expect(API_INFO.contact).toEqual({
            name: 'Support',
            email: 'support@example.com',
            url: 'https://example.com/support'
        });
        expect(API_INFO.license).toEqual({
            name: 'Apache 2.0',
            identifier: 'Apache-2.0'
        });
        expect(API_INFO.termsOfService).toBe('https://example.com/terms');
    });

    it('should export API tags', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Tagged API', version: '1.0' },
            tags: [
                { name: 'Admin', description: 'Administrative operations' },
                { name: 'Users', externalDocs: { url: 'https://users.doc', description: 'User Guide' } }
            ],
            paths: {}
        };
        const project = runGenerator(spec);
        const { API_TAGS } = compileGeneratedFile(project);

        expect(API_TAGS).toHaveLength(2);
        expect(API_TAGS[0]).toEqual({ name: 'Admin', description: 'Administrative operations' });
        expect(API_TAGS[1].externalDocs.url).toBe('https://users.doc');
    });

    it('should export global External Docs', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Docs API', version: '1.0' },
            externalDocs: {
                description: 'Full Documentation',
                url: 'https://api.docs.com'
            },
            paths: {}
        };
        const project = runGenerator(spec);
        const { API_EXTERNAL_DOCS } = compileGeneratedFile(project);

        expect(API_EXTERNAL_DOCS.url).toBe('https://api.docs.com');
        expect(API_EXTERNAL_DOCS.description).toBe('Full Documentation');
    });

    it('should handle missing optional root metadata', () => {
        const spec = {
            swagger: '2.0',
            info: { title: 'Minimal API', version: '1.0' },
            paths: {}
        };
        const project = runGenerator(spec);
        const { API_TAGS, API_EXTERNAL_DOCS } = compileGeneratedFile(project);

        expect(API_TAGS).toEqual([]);
        expect(API_EXTERNAL_DOCS).toBeUndefined();
    });

    it('should define the ApiInfo and ApiTag interfaces', () => {
        const project = runGenerator(emptySpec);
        const sourceFile = project.getSourceFileOrThrow('/out/info.ts');

        const apiInfo = sourceFile.getInterfaceOrThrow('ApiInfo');
        expect(apiInfo.isExported()).toBe(true);
        expect(apiInfo.getProperty('title')).toBeDefined();

        const apiTag = sourceFile.getInterfaceOrThrow('ApiTag');
        expect(apiTag.isExported()).toBe(true);
        expect(apiTag.getProperty('externalDocs')).toBeDefined();
    });
});
