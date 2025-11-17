import '@angular/compiler'; // Make JIT compiler available for HttpParams
import { describe, it, expect } from 'vitest';
import { HttpParams } from '@angular/common/http';
import { HttpParamsBuilderGenerator } from '@src/service/emit/utility/http-params-builder.js';
import { createTestProject } from '../shared/helpers.js';
import { Parameter } from '@src/core/types.js';
import ts from 'typescript';

// We get the generated code and evaluate it to get the class for testing.
function getGeneratedBuilderClass() {
    const project = createTestProject();
    new HttpParamsBuilderGenerator(project).generate('/');
    const sourceFile = project.getSourceFileOrThrow('/utils/http-params-builder.ts');
    const fileContent = sourceFile.getText();

    // 1. Remove imports because they can't be resolved in this context.
    const tsCodeWithoutImports = fileContent.replace(/import .* from ".*";/g, '');

    // 2. Transpile the TypeScript code to JavaScript. We explicitly target CommonJS,
    // as it predictably uses an `exports` object, which seems to be the output format
    // in this test environment regardless of the `module` setting.
    const jsCode = ts.transpile(
        tsCodeWithoutImports,
        { // Provide basic compiler options
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.CommonJS,
        }
    );

    // 3. Evaluate the JS code in a context where `exports` is defined, mimicking a CJS environment.
    const moduleScope = { exports: {} };
    new Function('exports', jsCode)(moduleScope.exports);

    // 4. Return the exported class from our mock module's exports.
    return (moduleScope.exports as any).HttpParamsBuilder;
}

const TestHttpParamsBuilder = getGeneratedBuilderClass();

describe('Utility: HttpParamsBuilder', () => {

    it('should handle null or undefined values by returning original params', () => {
        const param: Parameter = { name: 'id', in: 'query' };
        const initialParams = new HttpParams();
        expect(TestHttpParamsBuilder.serializeQueryParam(initialParams, param, null)).toBe(initialParams);
        expect(TestHttpParamsBuilder.serializeQueryParam(initialParams, param, undefined)).toBe(initialParams);
    });

    it('should serialize a simple primitive using default (form) style', () => {
        const param: Parameter = { name: 'id', in: 'query', schema: { type: 'string' } };
        const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, '123');
        expect(params.toString()).toBe('id=123');
    });

    describe('Style: form', () => {
        it('should serialize array with explode=false (default csv)', () => {
            const param: Parameter = { name: 'ids', in: 'query', style: 'form', explode: false, schema: { type: 'array' } };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, [1, 'test', 3]);
            expect(params.toString()).toBe('ids=1,test,3');
        });

        it('should serialize array with explode=true (repeated param)', () => {
            const param: Parameter = { name: 'ids', in: 'query', style: 'form', explode: true, schema: { type: 'array' } };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, [1, 'test', 3]);
            expect(params.toString()).toBe('ids=1&ids=test&ids=3');
        });

        it('should serialize object with explode=false', () => {
            const param: Parameter = { name: 'color', in: 'query', style: 'form', explode: false, schema: { type: 'object', properties: {} } };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, { R: 100, G: 200 });
            expect(params.toString()).toBe('color=R,100,G,200');
        });

        it('should serialize object with explode=true', () => {
            const param: Parameter = { name: 'color', in: 'query', style: 'form', explode: true, schema: { type: 'object', properties: {} } };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, { R: 100, G: 200 });
            expect(params.toString()).toBe('R=100&G=200');
        });

        it('should handle default explode for arrays (true)', () => {
            const param: Parameter = { name: 'ids', in: 'query', style: 'form', schema: { type: 'array' } };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, [1, 2]);
            expect(params.toString()).toBe('ids=1&ids=2');
        });
    });

    describe('Style: spaceDelimited', () => {
        it('should serialize array with explode=false', () => {
            const param: Parameter = { name: 'ids', in: 'query', style: 'spaceDelimited', explode: false, schema: { type: 'array' } };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, [1, 2, 3]);
            expect(params.toString()).toBe('ids=1%202%203');
        });

        it('should fall back for unsupported explode=true', () => {
            const param: Parameter = { name: 'ids', in: 'query', style: 'spaceDelimited', explode: true, schema: { type: 'array' } };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, [1, 2, 3]);
            // Fallback behavior is repeated param name, same as `form`, `explode=true`
            expect(params.toString()).toBe('ids=1&ids=2&ids=3');
        });
    });

    describe('Style: pipeDelimited', () => {
        it('should serialize array with explode=false', () => {
            const param: Parameter = { name: 'ids', in: 'query', style: 'pipeDelimited', explode: false, schema: { type: 'array' } };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, [1, 2, 3]);
            expect(params.toString()).toBe('ids=1%7C2%7C3');
        });

        it('should fall back for unsupported explode=true', () => {
            const param: Parameter = { name: 'ids', in: 'query', style: 'pipeDelimited', explode: true, schema: { type: 'array' } };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, [1, 2, 3]);
            expect(params.toString()).toBe('ids=1&ids=2&ids=3');
        });
    });

    describe('Style: deepObject', () => {
        it('should serialize an object with explode=true', () => {
            const param: Parameter = { name: 'color', in: 'query', style: 'deepObject', explode: true, schema: { type: 'object', properties: {} } };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, { R: 100, G: 200, B: 150 });
            expect(decodeURIComponent(params.toString())).toBe('color[R]=100&color[G]=200&color[B]=150');
        });

        it('should fall back for unsupported explode=false', () => {
            const param: Parameter = { name: 'color', in: 'query', style: 'deepObject', explode: false, schema: { type: 'object', properties: {} } };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, { R: 100 });
            // Fallback is just the plain value
            expect(params.toString()).toBe('color=%5Bobject%20Object%5D'); // Default toString
        });
    });

    describe('Value Formatting', () => {
        it('should format Date objects as ISO strings', () => {
            const date = new Date('2024-01-01T12:00:00.000Z');
            const param: Parameter = { name: 'timestamp', in: 'query' };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, date);
            expect(params.toString()).toBe('timestamp=2024-01-01T12:00:00.000Z');
        });

        it('should handle nullish values inside arrays and objects', () => {
            const param: Parameter = { name: 'items', in: 'query', style: 'form', explode: true, schema: { type: 'array' } };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, [1, null, 3, undefined]);
            expect(params.toString()).toBe('items=1&items=3');

            const objParam: Parameter = { name: 'meta', in: 'query', style: 'form', explode: true, schema: { type: 'object', properties: {} } };
            const params2 = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), objParam, { a: 1, b: null, c: 3 });
            expect(params2.keys().sort().join('&')).toBe('a&c');
            expect(params2.toString()).toBe('a=1&c=3');
        });
    });
});
