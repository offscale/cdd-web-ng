import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { InfoGenerator } from '@src/service/emit/utility/info.generator.js';
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
        const jsCode = ts.transpile(fileContent.replace(/export /g, ''), {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.CommonJS
        });
        const moduleScope = { API_INFO: {} };
        new Function('scope', `
            ${jsCode} 
            scope.API_INFO = API_INFO; 
        `)(moduleScope);
        return moduleScope.API_INFO as any;
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
        const info = compileGeneratedFile(project);

        expect(info.title).toBe('My Test API');
        expect(info.version).toBe('2.0.0-beta');
        expect(info.description).toBe('A description of the API');
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
        const info = compileGeneratedFile(project);

        expect(info.contact).toEqual({
            name: 'Support',
            email: 'support@example.com',
            url: 'https://example.com/support'
        });
        expect(info.license).toEqual({
            name: 'Apache 2.0',
            identifier: 'Apache-2.0'
        });
        expect(info.termsOfService).toBe('https://example.com/terms');
    });

    it('should define the ApiInfo interface in the file', () => {
        const project = runGenerator(emptySpec);
        const sourceFile = project.getSourceFileOrThrow('/out/info.ts');
        const interfaceDecl = sourceFile.getInterfaceOrThrow('ApiInfo');

        expect(interfaceDecl).toBeDefined();
        expect(interfaceDecl.isExported()).toBe(true);
        expect(interfaceDecl.getProperty('title')).toBeDefined();
        expect(interfaceDecl.getProperty('version')).toBeDefined();
        expect(interfaceDecl.getProperty('license')?.hasQuestionToken()).toBe(true);
    });

    it('should work with minimal info object (Swagger 2.0 compatible)', () => {
        const spec = {
            swagger: '2.0',
            info: {
                title: 'Minimal API',
                version: '1.0'
            },
            paths: {}
        };
        const project = runGenerator(spec);
        const info = compileGeneratedFile(project);

        expect(info.title).toBe('Minimal API');
        expect(info.version).toBe('1.0');
        expect(info.description).toBeUndefined();
    });
});
