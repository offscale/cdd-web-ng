import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/openapi/parse.js';
import { InfoGenerator } from '@src/openapi/emit_info.js';
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
            module: ts.ModuleKind.CommonJS,
        });
        // type-coverage:ignore-next-line
        const moduleHelper = { exports: {} as any };
        // type-coverage:ignore-next-line
        new Function('exports', jsCode)(moduleHelper.exports);
        // type-coverage:ignore-next-line
        return moduleHelper.exports;
    };

    it('should generate info.ts based on the spec', () => {
        const spec = {
            openapi: '3.0.0',
            info: {
                title: 'My Test API',
                version: '2.0.0-beta',
                description: 'A description of the API',
            },
            paths: {},
        };
        const project = runGenerator(spec);
        // type-coverage:ignore-next-line
        const { API_INFO } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        expect(API_INFO.title).toBe('My Test API');
        // type-coverage:ignore-next-line
        expect(API_INFO.version).toBe('2.0.0-beta');
        // type-coverage:ignore-next-line
        expect(API_INFO.description).toBe('A description of the API');
    });

    it('should include summary field (OAS 3.1 feature)', () => {
        const spec = {
            openapi: '3.1.0',
            info: {
                title: 'Summary API',
                version: '1.0',
                summary: 'A short summary of the API.',
            },
            paths: {},
        };
        const project = runGenerator(spec);

        // Check type definition
        const sourceFile = project.getSourceFileOrThrow('/out/info.ts');
        const apiInfoInterface = sourceFile.getInterfaceOrThrow('ApiInfo');
        const summaryProp = apiInfoInterface.getProperty('summary');
        expect(summaryProp).toBeDefined();

        // Check runtime value
        // type-coverage:ignore-next-line
        const { API_INFO } = compileGeneratedFile(project);
        // type-coverage:ignore-next-line
        expect(API_INFO.summary).toBe('A short summary of the API.');
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
                    url: 'https://example.com/support',
                },
                license: {
                    name: 'Apache 2.0',
                    identifier: 'Apache-2.0',
                },
                termsOfService: 'https://example.com/terms',
            },
            paths: {},
        };
        const project = runGenerator(spec);
        // type-coverage:ignore-next-line
        const { API_INFO } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        expect(API_INFO.contact).toEqual({
            name: 'Support',
            email: 'support@example.com',
            url: 'https://example.com/support',
        });
        // type-coverage:ignore-next-line
        expect(API_INFO.license).toEqual({
            name: 'Apache 2.0',
            identifier: 'Apache-2.0',
        });
        // type-coverage:ignore-next-line
        expect(API_INFO.termsOfService).toBe('https://example.com/terms');
    });

    it('should export API tags including summary (OAS 3.x)', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Tagged API', version: '1.0' },
            tags: [
                { name: 'Admin', description: 'Administrative operations', summary: 'Admin Stuff' },
                { name: 'Users', externalDocs: { url: 'https://users.doc', description: 'User Guide' } },
            ],
            paths: {},
        };
        const project = runGenerator(spec);
        // type-coverage:ignore-next-line
        const { API_TAGS } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        expect(API_TAGS).toHaveLength(2);
        // type-coverage:ignore-next-line
        expect(API_TAGS[0]).toEqual({
            name: 'Admin',
            description: 'Administrative operations',
            summary: 'Admin Stuff',
        });
        // type-coverage:ignore-next-line
        expect(API_TAGS[1].externalDocs.url).toBe('https://users.doc');
    });

    it('should export global External Docs', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Docs API', version: '1.0' },
            externalDocs: {
                description: 'Full Documentation',
                url: 'https://api.docs.com',
            },
            paths: {},
        };
        const project = runGenerator(spec);
        // type-coverage:ignore-next-line
        const { API_EXTERNAL_DOCS } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        expect(API_EXTERNAL_DOCS.url).toBe('https://api.docs.com');
        // type-coverage:ignore-next-line
        expect(API_EXTERNAL_DOCS.description).toBe('Full Documentation');
    });

    it('should preserve x- extensions and allow them in metadata types', () => {
        const spec = {
            openapi: '3.2.0',
            info: {
                title: 'Extensions API',
                version: '1.0',
                'x-info': true,
                contact: {
                    name: 'Support',
                    'x-contact': 123,
                },
                license: {
                    name: 'MIT',
                    'x-license': 'meta',
                },
            },
            tags: [{ name: 'beta', 'x-tag': 'flag' }],
            externalDocs: {
                url: 'https://example.com/docs',
                'x-doc': 'extra',
            },
            paths: {},
        };
        const project = runGenerator(spec);
        // type-coverage:ignore-next-line
        const { API_INFO, API_TAGS, API_EXTERNAL_DOCS } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        expect(API_INFO['x-info']).toBe(true);
        // type-coverage:ignore-next-line
        expect(API_INFO.contact['x-contact']).toBe(123);
        // type-coverage:ignore-next-line
        expect(API_INFO.license['x-license']).toBe('meta');
        // type-coverage:ignore-next-line
        expect(API_TAGS[0]['x-tag']).toBe('flag');
        // type-coverage:ignore-next-line
        expect(API_EXTERNAL_DOCS['x-doc']).toBe('extra');

        const sourceFile = project.getSourceFileOrThrow('/out/info.ts');
        expect(sourceFile.getInterfaceOrThrow('ApiInfo').getIndexSignatures().length).toBe(1);
        expect(sourceFile.getInterfaceOrThrow('ApiTag').getIndexSignatures().length).toBe(1);
        expect(sourceFile.getInterfaceOrThrow('ApiContact').getIndexSignatures().length).toBe(1);
        expect(sourceFile.getInterfaceOrThrow('ApiLicense').getIndexSignatures().length).toBe(1);
        expect(sourceFile.getInterfaceOrThrow('ApiExternalDocs').getIndexSignatures().length).toBe(1);
    });

    it('should handle missing optional root metadata (Swagger 2.0 compatibility)', () => {
        const spec = {
            swagger: '2.0',
            info: { title: 'Minimal API', version: '1.0' },
            paths: {},
        };
        const project = runGenerator(spec);
        // type-coverage:ignore-next-line
        const { API_INFO, API_TAGS, API_EXTERNAL_DOCS } = compileGeneratedFile(project);

        // Swagger 2.0 does not have summary, it should be undefined, matching optional interface prop
        // type-coverage:ignore-next-line
        expect(API_INFO.summary).toBeUndefined();
        // type-coverage:ignore-next-line
        expect(API_TAGS).toEqual([]);
        // type-coverage:ignore-next-line
        expect(API_EXTERNAL_DOCS).toBeUndefined();
    });

    it('should define the ApiInfo and ApiTag interfaces', () => {
        const project = runGenerator(emptySpec);
        const sourceFile = project.getSourceFileOrThrow('/out/info.ts');

        const apiInfo = sourceFile.getInterfaceOrThrow('ApiInfo');
        expect(apiInfo.isExported()).toBe(true);
        expect(apiInfo.getProperty('title')).toBeDefined();
        expect(apiInfo.getProperty('summary')).toBeDefined(); // Explicit check for Interface generation

        const apiTag = sourceFile.getInterfaceOrThrow('ApiTag');
        expect(apiTag.isExported()).toBe(true);
        expect(apiTag.getProperty('externalDocs')).toBeDefined();
        expect(apiTag.getProperty('summary')).toBeDefined();
    });

    it('should fall back to empty info object if parser info is missing', () => {
        const project = createTestProject();
        const parser = new SwaggerParser(emptySpec as any, { options: {} } as any);
        // Simulate a defensive fallback scenario after validation
        // type-coverage:ignore-next-line
        (parser as any).spec.info = undefined;

        new InfoGenerator(parser, project).generate('/out');
        // type-coverage:ignore-next-line
        const { API_INFO } = compileGeneratedFile(project);

        // type-coverage:ignore-next-line
        expect(API_INFO).toEqual({});
    });
});
