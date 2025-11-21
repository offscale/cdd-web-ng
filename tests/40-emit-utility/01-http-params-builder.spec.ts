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

    // 2. Transpile the TypeScript code to JavaScript.
    const jsCode = ts.transpile(
        tsCodeWithoutImports,
        {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.CommonJS,
        }
    );

    // 3. Evaluate the JS code in a context where `exports` is defined.
    const moduleScope = { exports: {} };
    new Function('exports', 'HttpParams', jsCode)(moduleScope.exports, HttpParams);

    // 4. Return the exported class.
    return (moduleScope.exports as any).HttpParamsBuilder;
}

const TestHttpParamsBuilder = getGeneratedBuilderClass();

describe('Utility: HttpParamsBuilder', () => {

    describe('serializeQueryParam', () => {
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

        it('should serialize query param as JSON when content is application/json', () => {
            const param: Parameter = {
                name: 'filter',
                in: 'query',
                content: { 'application/json': { schema: { type: 'object' } } }
            };
            const val = { name: 'foo', items: [1, 2] };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, val);
            expect(params.get('filter')).toBe(JSON.stringify(val));
        });

        describe('Style: form', () => {
            it('should serialize array with explode=false (csv)', () => {
                const param: Parameter = { name: 'ids', in: 'query', style: 'form', explode: false, schema: { type: 'array' } };
                const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, [1, 'test', 3]);
                expect(params.toString()).toBe('ids=1,test,3');
            });

            it('should serialize array with explode=true (repeated param)', () => {
                const param: Parameter = { name: 'ids', in: 'query', style: 'form', explode: true, schema: { type: 'array' } };
                const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, [1, 'test', 3]);
                expect(params.toString()).toBe('ids=1&ids=test&ids=3');
            });

            it('should serialize object with explode=false (csv: key,val)', () => {
                const param: Parameter = { name: 'obj', in: 'query', style: 'form', explode: false, schema: { type: 'object' } };
                const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, { role: 'admin', active: true });
                expect(params.toString()).toBe('obj=role,admin,active,true');
            });

            it('should serialize object with explode=true (key=val)', () => {
                const param: Parameter = { name: 'obj', in: 'query', style: 'form', explode: true, schema: { type: 'object' } };
                const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, { role: 'admin', active: true });
                expect(params.toString()).toBe('role=admin&active=true');
            });
        });

        describe('Style: spaceDelimited', () => {
            it('should serialize array with explode=false (ssv)', () => {
                const param: Parameter = { name: 'ids', in: 'query', style: 'spaceDelimited', explode: false, schema: { type: 'array' } };
                const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, [1, 2]);
                expect(params.toString()).toBe('ids=1%202'); // 1 2 encoded
            });
        });

        describe('Style: pipeDelimited', () => {
            it('should serialize array with explode=false (psv)', () => {
                const param: Parameter = { name: 'ids', in: 'query', style: 'pipeDelimited', explode: false, schema: { type: 'array' } };
                const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, [1, 2]);
                expect(params.toString()).toBe('ids=1%7C2'); // 1|2 encoded
            });
        });

        describe('Style: deepObject', () => {
            it('should serialize object with explode=true', () => {
                const param: Parameter = { name: 'user', in: 'query', style: 'deepObject', explode: true, schema: { type: 'object' } };
                const val = { id: 1, metadata: { role: 'admin' } };
                const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, val);
                // verify both encoded parts are present
                // user[id] -> user%5Bid%5D
                expect(params.toString()).toContain('user%5Bid%5D=1');
                // user[metadata][role] -> user%5Bmetadata%5D%5Brole%5D
                expect(params.toString()).toContain('user%5Bmetadata%5D%5Brole%5D=admin');
            });
        });
    });

    describe('serializePathParam', () => {
        it('should handle JSON serialization hint', () => {
            const result = TestHttpParamsBuilder.serializePathParam('id', { a: 1 }, 'simple', false, false, 'json');
            expect(result).toBe('%7B%22a%22%3A1%7D'); // encoded JSON
        });

        describe('Style: simple', () => {
            it('should serialize array explode=false (csv)', () => {
                expect(TestHttpParamsBuilder.serializePathParam('id', [1, 2], 'simple', false)).toBe('1,2');
            });
            it('should serialize object explode=false (csv)', () => {
                expect(TestHttpParamsBuilder.serializePathParam('id', {a:1, b:2}, 'simple', false)).toBe('a,1,b,2');
            });
            it('should serialize object explode=true (k=v)', () => {
                expect(TestHttpParamsBuilder.serializePathParam('id', {a:1, b:2}, 'simple', true)).toBe('a=1,b=2');
            });
        });

        describe('Style: label', () => {
            it('should serialize primitive (prefix .)', () => {
                expect(TestHttpParamsBuilder.serializePathParam('id', 5, 'label', false)).toBe('.5');
            });
            it('should serialize array explode=false (prefix ., delimiter ,)', () => {
                expect(TestHttpParamsBuilder.serializePathParam('id', [1, 2], 'label', false)).toBe('.1,2');
            });
            it('should serialize array explode=true (prefix ., delimiter .)', () => {
                expect(TestHttpParamsBuilder.serializePathParam('id', [1, 2], 'label', true)).toBe('.1.2');
            });
            it('should serialize object explode=false (prefix .)', () => {
                expect(TestHttpParamsBuilder.serializePathParam('id', {a:1}, 'label', false)).toBe('.a,1');
            });
            it('should serialize object explode=true (prefix ., delimiter .)', () => {
                expect(TestHttpParamsBuilder.serializePathParam('id', {a:1,b:2}, 'label', true)).toBe('.a=1.b=2');
            });
        });

        describe('Style: matrix', () => {
            it('should serialize primitive (prefix ;name=val)', () => {
                expect(TestHttpParamsBuilder.serializePathParam('id', 5, 'matrix', false)).toBe(';id=5');
            });
            it('should serialize array explode=false', () => {
                expect(TestHttpParamsBuilder.serializePathParam('id', [1, 2], 'matrix', false)).toBe(';id=1,2');
            });
            it('should serialize array explode=true', () => {
                expect(TestHttpParamsBuilder.serializePathParam('id', [1, 2], 'matrix', true)).toBe(';id=1;id=2');
            });
            it('should serialize object explode=false', () => {
                expect(TestHttpParamsBuilder.serializePathParam('id', {a:1}, 'matrix', false)).toBe(';id=a,1');
            });
            it('should serialize object explode=true', () => {
                // explode object in matrix: ;key=val;key=val
                expect(TestHttpParamsBuilder.serializePathParam('id', {a:1, b:2}, 'matrix', true)).toBe(';a=1;b=2');
            });
        });
    });

    describe('serializeHeaderParam', () => {
        it('should serialize primitive', () => {
            expect(TestHttpParamsBuilder.serializeHeaderParam('X-ID', 123, false)).toBe('123');
        });
        it('should serialize array (csv)', () => {
            expect(TestHttpParamsBuilder.serializeHeaderParam('X-List', [1, 2], false)).toBe('1,2');
        });
        it('should serialize object explode=false (csv)', () => {
            expect(TestHttpParamsBuilder.serializeHeaderParam('X-Obj', {a:1, b:2}, false)).toBe('a,1,b,2');
        });
        it('should serialize object explode=true (csv key=val)', () => {
            expect(TestHttpParamsBuilder.serializeHeaderParam('X-Obj', {a:1, b:2}, true)).toBe('a=1,b=2');
        });
        it('should handle JSON serialization hint', () => {
            const res = TestHttpParamsBuilder.serializeHeaderParam('X-Meta', {a:1}, false, 'json');
            expect(res).toBe('{"a":1}');
        });
    });

    describe('serializeCookieParam', () => {
        it('should serialize primitive', () => {
            expect(TestHttpParamsBuilder.serializeCookieParam('id', 123, 'form', false)).toBe('id=123');
        });
        it('should serialize object explode=false (flat)', () => {
            expect(TestHttpParamsBuilder.serializeCookieParam('id', {a:1,b:2}, 'form', false)).toBe('id=a,1,b,2');
        });
        it('should serialize object explode=true', () => {
            // This technically creates multiple cookies or a specifically formatted string depending on implementation
            // Implementation generated: k=v; k=v
            expect(TestHttpParamsBuilder.serializeCookieParam('id', {a:1,b:2}, 'form', true)).toBe('a=1; b=2');
        });
        it('should handle JSON serialization hint', () => {
            const res = TestHttpParamsBuilder.serializeCookieParam('id', {a:1}, 'form', false, 'json');
            expect(res).toBe(`id=${encodeURIComponent(JSON.stringify({a:1}))}`);
        });
    });

    describe('serializeUrlEncodedBody', () => {
        it('should serialize simple object', () => {
            const body = { name: 'test', age: 20 };
            const params = TestHttpParamsBuilder.serializeUrlEncodedBody(body, {});
            expect(params.toString()).toBe('name=test&age=20');
        });

        it('should respect encoding overrides (explode=false for array)', () => {
            const body = { tags: ['a', 'b'] };
            const encodings = { tags: { style: 'form', explode: false } };
            const params = TestHttpParamsBuilder.serializeUrlEncodedBody(body, encodings);
            expect(params.toString()).toBe('tags=a,b');
        });

        it('should ignore null/undefined fields', () => {
            const body = { a: 1, b: null, c: undefined };
            const params = TestHttpParamsBuilder.serializeUrlEncodedBody(body, {});
            expect(params.toString()).toBe('a=1');
        });
    });
});
