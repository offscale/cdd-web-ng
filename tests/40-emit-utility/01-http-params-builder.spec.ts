import '@angular/compiler'; // Make JIT compiler available for HttpParams
import { describe, expect, it } from 'vitest';
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
            const param: Parameter = {
                name: 'ids',
                in: 'query',
                style: 'form',
                explode: false,
                schema: { type: 'array' }
            };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, [1, 'test', 3]);
            expect(params.toString()).toBe('ids=1,test,3');
        });

        it('should serialize array with explode=true (repeated param)', () => {
            const param: Parameter = {
                name: 'ids',
                in: 'query',
                style: 'form',
                explode: true,
                schema: { type: 'array' }
            };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, [1, 'test', 3]);
            expect(params.toString()).toBe('ids=1&ids=test&ids=3');
        });

        it('should serialize object with explode=false', () => {
            const param: Parameter = {
                name: 'color',
                in: 'query',
                style: 'form',
                explode: false,
                schema: { type: 'object', properties: {} }
            };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, { R: 100, G: 200 });
            expect(params.toString()).toBe('color=R,100,G,200');
        });

        it('should serialize object with explode=true', () => {
            const param: Parameter = {
                name: 'color',
                in: 'query',
                style: 'form',
                explode: true,
                schema: { type: 'object', properties: {} }
            };
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
            const param: Parameter = {
                name: 'ids',
                in: 'query',
                style: 'spaceDelimited',
                explode: false,
                schema: { type: 'array' }
            };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, [1, 2, 3]);
            expect(params.toString()).toBe('ids=1%202%203');
        });

        it('should fall back for unsupported explode=true', () => {
            const param: Parameter = {
                name: 'ids',
                in: 'query',
                style: 'spaceDelimited',
                explode: true,
                schema: { type: 'array' }
            };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, [1, 2, 3]);
            // Fallback behavior is repeated param name, same as `form`, `explode=true`
            expect(params.toString()).toBe('ids=1&ids=2&ids=3');
        });
    });

    describe('Style: pipeDelimited', () => {
        it('should serialize array with explode=false', () => {
            const param: Parameter = {
                name: 'ids',
                in: 'query',
                style: 'pipeDelimited',
                explode: false,
                schema: { type: 'array' }
            };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, [1, 2, 3]);
            expect(params.toString()).toBe('ids=1%7C2%7C3');
        });

        it('should fall back for unsupported explode=true', () => {
            const param: Parameter = {
                name: 'ids',
                in: 'query',
                style: 'pipeDelimited',
                explode: true,
                schema: { type: 'array' }
            };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, [1, 2, 3]);
            expect(params.toString()).toBe('ids=1&ids=2&ids=3');
        });
    });

    describe('Style: deepObject', () => {
        it('should serialize an object with explode=true', () => {
            const param: Parameter = {
                name: 'color',
                in: 'query',
                style: 'deepObject',
                explode: true,
                schema: { type: 'object', properties: {} }
            };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, {
                R: 100,
                G: 200,
                B: 150
            });
            expect(decodeURIComponent(params.toString())).toBe('color[R]=100&color[G]=200&color[B]=150');
        });

        it('should serialize an object with nested array values correctly', () => {
            // "Values for the parameters are serialized by extracting the properties... The behavior for nested objects or arrays is undefined."
            // Current workaround: flatten arrays by repeating keys
            const param: Parameter = {
                name: 'filter',
                in: 'query',
                style: 'deepObject',
                explode: true,
                schema: { type: 'object', properties: {} }
            };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, { ids: [1, 2] });
            // Expected: filter[ids]=1&filter[ids]=2
            expect(decodeURIComponent(params.toString())).toBe('filter[ids]=1&filter[ids]=2');
        });

        it('should fall back for unsupported explode=false', () => {
            const param: Parameter = {
                name: 'color',
                in: 'query',
                style: 'deepObject',
                explode: false,
                schema: { type: 'object', properties: {} }
            };
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
            const param: Parameter = {
                name: 'items',
                in: 'query',
                style: 'form',
                explode: true,
                schema: { type: 'array' }
            };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, [1, null, 3, undefined]);
            expect(params.toString()).toBe('items=1&items=3');

            const objParam: Parameter = {
                name: 'meta',
                in: 'query',
                style: 'form',
                explode: true,
                schema: { type: 'object', properties: {} }
            };
            const params2 = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), objParam, {
                a: 1,
                b: null,
                c: 3
            });
            expect(params2.keys().sort().join('&')).toBe('a&c');
            expect(params2.toString()).toBe('a=1&c=3');
        });
    });

    describe('Strict Content JSON Serialization (Mutation Testing)', () => {

        it('should serialize Query Param as JSON if content type is application/json', () => {
            const param: Parameter = {
                name: 'filter',
                in: 'query',
                content: { 'application/json': { schema: { type: 'object' } } }
            };
            const val = { a: 1, b: 'text' };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, val);
            expect(params.toString()).toBe('filter=%7B%22a%22:1,%22b%22:%22text%22%7D'); // encoded {"a":1,"b":"text"}
        });

        it('should serialize Path Param as JSON if hinted', () => {
            const val = { id: 123 };
            // name, value, style, explode, allowReserved, serializationType
            const res = TestHttpParamsBuilder.serializePathParam('id', val, 'simple', false, false, 'json');
            expect(res).toBe('%7B%22id%22%3A123%7D'); // encoded {"id":123}
        });

        it('should serialize Header Param as JSON if hinted', () => {
            const val = { key: 'value' };
            const res = TestHttpParamsBuilder.serializeHeaderParam('X-Meta', val, false, 'json');
            expect(res).toBe('{"key":"value"}');
        });

        it('should serialize Cookie Param as JSON if hinted', () => {
            const val = { sess: 99 };
            // name, value, style, explode, serializationType
            const res = TestHttpParamsBuilder.serializeCookieParam('Session', val, 'form', false, 'json');
            expect(res).toBe('Session=%7B%22sess%22%3A99%7D');
        });
    });

    describe('Style: deepObject', () => {
        it('should serialize an object with explode=true', () => {
            const param: Parameter = {
                name: 'color',
                in: 'query',
                style: 'deepObject',
                explode: true,
                schema: { type: 'object', properties: {} }
            };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, {
                R: 100,
                G: 200,
                B: 150
            });
            expect(decodeURIComponent(params.toString())).toBe('color[R]=100&color[G]=200&color[B]=150');
        });

        it('should serialize an object with nested array values correctly', () => {
            // "Values for the parameters are serialized by extracting the properties... The behavior for nested objects or arrays is undefined."
            // Current workaround: flatten arrays by repeating keys
            const param: Parameter = {
                name: 'filter',
                in: 'query',
                style: 'deepObject',
                explode: true,
                schema: { type: 'object', properties: {} }
            };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, { ids: [1, 2] });
            // Expected: filter[ids]=1&filter[ids]=2
            expect(decodeURIComponent(params.toString())).toBe('filter[ids]=1&filter[ids]=2');
        });

        it('should fall back for unsupported explode=false', () => {
            const param: Parameter = {
                name: 'color',
                in: 'query',
                style: 'deepObject',
                explode: false,
                schema: { type: 'object', properties: {} }
            };
            const params = TestHttpParamsBuilder.serializeQueryParam(new HttpParams(), param, { R: 100 });
            // Fallback is just the plain value
            expect(params.toString()).toBe('color=%5Bobject%20Object%5D'); // Default toString
        });
    });

    // ... (rest of existing tests)
    describe('Path Parameters (serializePathParam)', () => {
        it('should return empty string for null/undefined', () => {
            expect(TestHttpParamsBuilder.serializePathParam('p', null, 'simple', false)).toBe('');
        });

        it('should encode standard characters by default (allowReserved=false)', () => {
            const val = 'a/b?c';
            // default simple style = full encode
            expect(TestHttpParamsBuilder.serializePathParam('p', val, 'simple', false, false)).toBe('a%2Fb%3Fc');
        });

        it('should NOT encode reserved characters when allowReserved=true', () => {
            const val = 'a/b?c';
            // Should keep / and ?
            expect(TestHttpParamsBuilder.serializePathParam('p', val, 'simple', false, true)).toBe('a/b?c');
        });

        it('should still encode unsafe characters even when allowReserved=true', () => {
            const val = 'a/b space';
            // space is unsafe, / is reserved.
            expect(TestHttpParamsBuilder.serializePathParam('p', val, 'simple', false, true)).toBe('a/b%20space');
        });

        // Style: simple
        it('simple (default): primitive', () => {
            expect(TestHttpParamsBuilder.serializePathParam('id', 5, 'simple', false)).toBe('5');
        });
        it('simple: array', () => {
            expect(TestHttpParamsBuilder.serializePathParam('id', [3, 4, 5], 'simple', false)).toBe('3,4,5');
        });
        it('simple: object (explode=false)', () => {
            expect(TestHttpParamsBuilder.serializePathParam('id', {
                role: 'admin',
                name: 'test'
            }, 'simple', false)).toBe('role,admin,name,test');
        });
        it('simple: object (explode=true)', () => {
            expect(TestHttpParamsBuilder.serializePathParam('id', {
                role: 'admin',
                name: 'test'
            }, 'simple', true)).toBe('role=admin,name=test');
        });

        // Style: label
        it('label: primitive', () => {
            expect(TestHttpParamsBuilder.serializePathParam('id', 5, 'label', false)).toBe('.5');
        });
        it('label: array (explode=false)', () => {
            expect(TestHttpParamsBuilder.serializePathParam('id', [3, 4, 5], 'label', false)).toBe('.3,4,5');
        });
        it('label: array (explode=true)', () => {
            expect(TestHttpParamsBuilder.serializePathParam('id', [3, 4, 5], 'label', true)).toBe('.3.4.5');
        });
        it('label: object (explode=false)', () => {
            expect(TestHttpParamsBuilder.serializePathParam('id', { role: 'admin' }, 'label', false)).toBe('.role,admin');
        });
        it('label: object (explode=true)', () => {
            expect(TestHttpParamsBuilder.serializePathParam('id', { role: 'admin' }, 'label', true)).toBe('.role=admin');
        });

        // Style: matrix
        it('matrix: primitive', () => {
            expect(TestHttpParamsBuilder.serializePathParam('id', 5, 'matrix', false)).toBe(';id=5');
        });
        it('matrix: array (explode=false)', () => {
            expect(TestHttpParamsBuilder.serializePathParam('id', [3, 4], 'matrix', false)).toBe(';id=3,4');
        });
        it('matrix: array (explode=true)', () => {
            expect(TestHttpParamsBuilder.serializePathParam('id', [3, 4], 'matrix', true)).toBe(';id=3;id=4');
        });
        it('matrix: object (explode=false)', () => {
            expect(TestHttpParamsBuilder.serializePathParam('id', { role: 'admin' }, 'matrix', false)).toBe(';id=role,admin');
        });
        it('matrix: object (explode=true)', () => {
            expect(TestHttpParamsBuilder.serializePathParam('id', {
                role: 'admin',
                b: 2
            }, 'matrix', true)).toBe(';role=admin;b=2');
        });
    });

    describe('Cookie Parameters (serializeCookieParam)', () => {
        it('should return empty string for null/undefined', () => {
            expect(TestHttpParamsBuilder.serializeCookieParam('c', null, 'form', true)).toBe('');
        });

        it('default style (form): primitive', () => {
            expect(TestHttpParamsBuilder.serializeCookieParam('id', 5, 'form', true)).toBe('id=5');
        });

        it('form: array (explode=true)', () => {
            expect(TestHttpParamsBuilder.serializeCookieParam('id', [5, 6], 'form', true)).toBe('id=5; id=6');
        });

        it('form: array (explode=false)', () => {
            expect(TestHttpParamsBuilder.serializeCookieParam('id', [5, 6], 'form', false)).toBe('id=5,6');
        });

        it('form: object (explode=true)', () => {
            expect(TestHttpParamsBuilder.serializeCookieParam('id', { a: 1, b: 2 }, 'form', true)).toBe('a=1; b=2');
        });

        it('form: object (explode=false)', () => {
            expect(TestHttpParamsBuilder.serializeCookieParam('id', { a: 1, b: 2 }, 'form', false)).toBe('id=a,1,b,2');
        });
    });

    describe('Header Parameters (serializeHeaderParam)', () => {
        it('should return empty string for null/undefined', () => {
            expect(TestHttpParamsBuilder.serializeHeaderParam('h', null, false)).toBe('');
        });

        it('primitive value', () => {
            expect(TestHttpParamsBuilder.serializeHeaderParam('X-ID', 123, false)).toBe('123');
            expect(TestHttpParamsBuilder.serializeHeaderParam('X-ID', 'abc', false)).toBe('abc');
        });

        it('array value (csv)', () => {
            expect(TestHttpParamsBuilder.serializeHeaderParam('X-List', [1, 2, 3], false)).toBe('1,2,3');
            expect(TestHttpParamsBuilder.serializeHeaderParam('X-List', [1, 2, 3], true)).toBe('1,2,3');
        });

        it('object value (explode=false)', () => {
            const val = { a: 1, b: 2 };
            expect(TestHttpParamsBuilder.serializeHeaderParam('X-Obj', val, false)).toBe('a,1,b,2');
        });

        it('object value (explode=true)', () => {
            const val = { a: 1, b: 2 };
            expect(TestHttpParamsBuilder.serializeHeaderParam('X-Obj', val, true)).toBe('a=1,b=2');
        });
    });
});
