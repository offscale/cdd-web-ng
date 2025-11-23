import { describe, expect, it } from 'vitest';
import { HttpParamsBuilderGenerator } from '@src/service/emit/utility/http-params-builder.js';
import { createTestProject } from '../shared/helpers.js';
import ts from 'typescript';

/**
 * Mock implementation of Angular's HttpParams for the test context.
 */
class MockHttpParams {
    map = new Map<string, string[]>();
    constructor(options?: { fromObject: any }) {
        if (options?.fromObject) {
            Object.entries(options.fromObject).forEach(([k, v]) => {
                this.map.set(k, [String(v)]);
            });
        }
    }
    append(key: string, value: string) {
        const clone = new MockHttpParams();
        clone.map = new Map(this.map);
        const current = clone.map.get(key) || [];
        clone.map.set(key, [...current, value]);
        return clone;
    }
    toString() {
        const parts: string[] = [];
        this.map.forEach((vals, key) => {
            vals.forEach(v => parts.push(`${key}=${v}`));
        });
        return parts.join('&');
    }
    get(key: string) { return this.map.get(key)?.[0] || null; }
    getAll(key: string) { return this.map.get(key) || null; }
}

function getBuilder() {
    const project = createTestProject();
    new HttpParamsBuilderGenerator(project).generate('/');
    const sourceFile = project.getSourceFileOrThrow('/utils/http-params-builder.ts');

    const codeWithoutImports = sourceFile.getText().replace(/import\s+.*from\s+['"].*['"];?/g, '');

    const jsCode = ts.transpile(codeWithoutImports, {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS
    });

    const exportsMock = {};

    new Function('exports', 'HttpParams', jsCode)(exportsMock, MockHttpParams);

    return (exportsMock as any).HttpParamsBuilder;
}

describe('Utility: HttpParamsBuilder', () => {
    const Builder = getBuilder();

    describe('serializePathParam', () => {
        it('should serialize simple primitive path params', () => {
            const res = Builder.serializePathParam('id', 5);
            expect(res).toBe('5');
        });

        it('should serialize simple array path params', () => {
            const res = Builder.serializePathParam('id', [3, 4, 5]);
            expect(res).toBe('3,4,5');
        });

        it('should serialize object path params (simple, explode=false)', () => {
            const val = { role: 'admin', firstName: 'Alex' };
            const res = Builder.serializePathParam('id', val, 'simple', false);
            expect(res).toBe('role,admin,firstName,Alex');
        });

        it('should serialize object path params (simple, explode=true)', () => {
            const val = { role: 'admin', firstName: 'Alex' };
            const res = Builder.serializePathParam('id', val, 'simple', true);
            expect(res).toBe('role=admin,firstName=Alex');
        });

        it('should handle reserved characters correctly when allowReserved=false', () => {
            const res = Builder.serializePathParam('path', 'Hello/World');
            expect(res).toBe('Hello%2FWorld');
        });

        it('should handle reserved characters correctly when allowReserved=true', () => {
            const res = Builder.serializePathParam('path', 'Hello/World', 'simple', false, true);
            expect(res).toBe('Hello/World');
        });

        it('should handle complicated reserved string allowReserved=true', () => {
            const complex = 'user@domain.com:8080/api?q=value#hash';
            const res = Builder.serializePathParam('url', complex, 'simple', false, true);
            expect(res).toBe(complex);
        });

        it('should serialize with label style', () => {
            const res = Builder.serializePathParam('id', 5, 'label');
            expect(res).toBe('.5');
        });

        it('should serialize path param as JSON when requested', () => {
            const val = { a: 1 };
            const res = Builder.serializePathParam('filter', val, 'simple', false, false, 'json');
            expect(res).toBe(encodeURIComponent(JSON.stringify(val)));
        });

        it('should serialize array path param (matrix style, explode=false)', () => {
            const res = Builder.serializePathParam('id', [1, 2], 'matrix', false);
            expect(res).toBe(';id=1,2');
        });
    });

    describe('serializeQueryParam', () => {
        it('should serialize simple primitives', () => {
            const params = new MockHttpParams();
            const res = Builder.serializeQueryParam(params, { name: 'q' }, 'foo');
            expect(res.get('q')).toBe('foo');
        });

        it('should serialize query param as JSON when content is application/json (via config)', () => {
            const param = { name: 'filter', serialization: 'json' };
            const val = { name: 'foo', items: [1, 2] };
            const params = Builder.serializeQueryParam(new MockHttpParams(), param, val);
            expect(params.get('filter')).toBe(JSON.stringify(val));
        });

        it('should serialize query param as JSON when encoding content type is application/json', () => {
            const param = { name: 'filter', contentType: 'application/json' };
            const val = { key: 'val' };
            const params = Builder.serializeQueryParam(new MockHttpParams(), param, val);
            expect(params.get('filter')).toBe(JSON.stringify(val));
        });

        it('should serialize form style arrays (explode=true)', () => {
            const params = new MockHttpParams();
            const res = Builder.serializeQueryParam(params, { name: 'ids', style: 'form', explode: true }, [3, 4]);
            expect(res.toString()).toBe('ids=3&ids=4');
        });

        it('should serialize form style arrays (explode=false)', () => {
            const params = new MockHttpParams();
            const res = Builder.serializeQueryParam(params, { name: 'ids', style: 'form', explode: false }, [3, 4]);
            expect(res.toString()).toBe('ids=3,4');
        });

        it('should serialize deepObject style', () => {
            const params = new MockHttpParams();
            const val = { role: 'admin', name: 'alex' };
            const res = Builder.serializeQueryParam(params, { name: 'id', style: 'deepObject', explode: true }, val);
            const str = res.toString();
            expect(str).toContain('id[role]=admin');
            expect(str).toContain('id[name]=alex');
        });

        it('should serialize deepObject style with nested objects', () => {
            const params = new MockHttpParams();
            const val = { id: 1, metadata: { role: 'admin' } };
            const res = Builder.serializeQueryParam(params, { name: 'user', style: 'deepObject' }, val);
            const str = res.toString();
            expect(str).toContain('user[id]=1');
            expect(str).toContain('user[metadata][role]=admin');
        });

        it('should serialize pipeDelimited arrays', () => {
            const params = new MockHttpParams();
            const res = Builder.serializeQueryParam(params, { name: 'p', style: 'pipeDelimited' }, ['a', 'b']);
            expect(res.get('p')).toBe('a|b');
        });

        it('should include empty value with equals sign when allowEmptyValue is true (Angular default)', () => {
            // Note: Angular's HttpParams always appends '=', so ?param=
            // The test confirms we pass the empty string value, not null/undefined
            const params = new MockHttpParams();
            const res = Builder.serializeQueryParam(params, { name: 'flag', allowEmptyValue: true }, '');
            expect(res.toString()).toBe('flag=');
        });
    });

    describe('serializeCookieParam', () => {
        it('should serialize object explode=true as individual key-value pairs separated by ; ', () => {
            const res = Builder.serializeCookieParam('id', {a:1,b:2}, 'form', true);
            expect(res).toBe('a=1; b=2');
        });
    });

    describe('serializeRawQuerystring', () => {
        it('should handle JSON serialization', () => {
            const obj = { id: 1, name: 'foo' };
            const expected = encodeURIComponent(JSON.stringify(obj));
            expect(Builder.serializeRawQuerystring(obj, 'json')).toBe(expected);
        });
    });

    describe('serializeUrlEncodedBody', () => {
        it('should serialize object to HttpParams using encodings', () => {
            const body = { tags: ['x', 'y'], scope: 'all' };
            const encodings = { tags: { style: 'spaceDelimited' } };
            const res = Builder.serializeUrlEncodedBody(body, encodings);
            expect(res.get('tags')).toBe('x y');
            expect(res.get('scope')).toBe('all');
        });

        it('should serialize object property as JSON when contentType is application/json', () => {
            const body = { metadata: { key: 'val' } };
            const encodings = { metadata: { contentType: 'application/json' } };
            const res = Builder.serializeUrlEncodedBody(body, encodings);
            expect(res.get('metadata')).toBe('{"key":"val"}');
        });
    });
});
