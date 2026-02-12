import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { DocumentMetaGenerator } from '@src/generators/shared/document-meta.generator.js';
import { createTestProject } from '../shared/helpers.js';
import ts from 'typescript';

describe('Emitter: DocumentMetaGenerator', () => {
    const runGenerator = (spec: object) => {
        const project = createTestProject();
        const parser = new SwaggerParser(spec as any, { options: {} } as any);
        new DocumentMetaGenerator(parser, project).generate('/out');
        return project;
    };

    const compileGeneratedFile = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/document.ts');
        const fileContent = sourceFile.getText();
        const jsCode = ts.transpile(fileContent, {
            target: ts.ScriptTarget.ES5,
            module: ts.ModuleKind.CommonJS,
        });
        const moduleHelper = { exports: {} as any };
        new Function('exports', jsCode)(moduleHelper.exports);
        return moduleHelper.exports;
    };

    it('should emit API_DOCUMENT_META with document-level fields', () => {
        const spec = {
            openapi: '3.2.0',
            $self: 'https://example.com/openapi',
            jsonSchemaDialect: 'https://example.com/dialect',
            info: { title: 'Doc Meta', version: '1.0' },
            paths: {},
        };
        const project = runGenerator(spec);
        const { API_DOCUMENT_META } = compileGeneratedFile(project);

        expect(API_DOCUMENT_META.openapi).toBe('3.2.0');
        expect(API_DOCUMENT_META.$self).toBe('https://example.com/openapi');
        expect(API_DOCUMENT_META.jsonSchemaDialect).toBe('https://example.com/dialect');
    });

    it('should omit unset fields for swagger specs', () => {
        const spec = {
            swagger: '2.0',
            info: { title: 'Swagger Meta', version: '1.0' },
            paths: {},
        };
        const project = runGenerator(spec);
        const { API_DOCUMENT_META } = compileGeneratedFile(project);

        expect(API_DOCUMENT_META.swagger).toBe('2.0');
        expect(API_DOCUMENT_META.openapi).toBeUndefined();
        expect(API_DOCUMENT_META.jsonSchemaDialect).toBeUndefined();
    });
});
