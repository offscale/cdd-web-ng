import { describe, expect, it } from 'vitest';
import { HttpParamsBuilderGenerator } from '@src/service/emit/utility/http-params-builder.js';
import { createTestProject } from '../shared/helpers.js';
import ts from 'typescript';

/**
 * Mock implementation of Angular's HttpParams for the test context.
 * Mirrors functionality of Angular's HttpParams, including custom encoder support.
 */
class MockHttpParams {
    map = new Map<string, string[]>();
    encoder: any;

    constructor(options?: { fromObject?: any, encoder?: any }) {
        // Mock default encoder behavior: encodeURIComponent
        this.encoder = options?.encoder || {
            encodeKey: (k: string) => encodeURIComponent(k),
            encodeValue: (v: string) => encodeURIComponent(v)
        };

        if (options?.fromObject) {
            Object.entries(options.fromObject).forEach(([k, v]) => {
                this.map.set(k, [String(v)]);
            });
        }
    }

    append(key: string, value: string) {
        const clone = new MockHttpParams({ encoder: this.encoder });
        clone.map = new Map(this.map);

        // Simulation:
        const encodedKey = this.encoder.encodeKey(key);
        const encodedValue = this.encoder.encodeValue(value);

        const current = clone.map.get(encodedKey) || [];
        clone.map.set(encodedKey, [...current, encodedValue]);
        return clone;
    }

    toString() {
        const parts: string[] = [];
        this.map.forEach((vals, key) => {
            vals.forEach(v => parts.push(`${key}=${v}`));
        });
        return parts.join('&');
    }

    // Helper to check raw map content (simulating what's sent on wire)
    get(key: string) { return this.map.get(key)?.[0] || null; }
}

function getBuilderContext() {
    const project = createTestProject();
    new HttpParamsBuilderGenerator(project).generate('/');
    const sourceFile = project.getSourceFileOrThrow('/utils/http-params-builder.ts');

    // Strip imports so we can evaluate in the test context
    const codeWithoutImports = sourceFile.getText().replace(/import\s+.*from\s+['"].*['"];?/g, '');

    const jsCode = ts.transpile(codeWithoutImports, {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS
    });

    const exportsMock = {};

    new Function('exports', 'HttpParams', jsCode)(exportsMock, MockHttpParams);

    return {
        Builder: (exportsMock as any).HttpParamsBuilder,
        ApiParameterCodec: (exportsMock as any).ApiParameterCodec
    };
}

describe('Utility: HttpParamsBuilder', () => {
    const { Builder, ApiParameterCodec } = getBuilderContext();

    // Helper to create params with the custom Identity Codec
    const createParams = () => new MockHttpParams({ encoder: new ApiParameterCodec() });

    describe('serializeQueryParam', () => {
        it('should serialize simple primitives without encoding if standard (wrapper handles it)', () => {
            const params = createParams();
            const res = Builder.serializeQueryParam(params, { name: 'q' }, 'foo');
            expect(res.get('q')).toBe('foo');
        });

        it('should use standard encoding behavior by default (allowReserved=false)', () => {
            const params = createParams();
            const res = Builder.serializeQueryParam(params, { name: 'q' }, 'a/b');
            expect(res.get('q')).toBe('a%2Fb');
        });

        it('should NOT encode reserved characters when allowReserved=true', () => {
            const params = createParams();
            const val = 'foo/bar:baz';
            const res = Builder.serializeQueryParam(params, { name: 'q', allowReserved: true }, val);
            expect(res.get('q')).toBe('foo/bar:baz');
        });

        it('should still encode unsafe characters when allowReserved=true', () => {
            const params = createParams();
            const val = 'foo bar'; // Space is unsafe
            const res = Builder.serializeQueryParam(params, { name: 'q', allowReserved: true }, val);
            expect(res.get('q')).toBe('foo%20bar');
        });

        it('should handle JSON serialization with allowReserved=true', () => {
            const params = createParams();
            const val = { id: 'a/b' };
            const res = Builder.serializeQueryParam(params, { name: 'q', allowReserved: true, serialization: 'json' }, val);

            const encoded = res.get('q');
            expect(encoded).toContain('%7B'); // {
            expect(encoded).toContain('%22'); // "
            expect(encoded).toContain(':');   // : preserved
            expect(encoded).toContain('/');   // / preserved
        });

        it('should serialize form style arrays (explode=true)', () => {
            const params = createParams();
            const res = Builder.serializeQueryParam(params, { name: 'ids', style: 'form', explode: true }, [3, 4]);
            expect(res.toString()).toBe('ids=3&ids=4');
        });

        it('should serialize pipeDelimited arrays with encoded pipe', () => {
            const params = createParams();
            const res = Builder.serializeQueryParam(params, { name: 'p', style: 'pipeDelimited' }, ['a', 'b']);
            expect(res.get('p')).toBe('a%7Cb');
        });
    });

    describe('serializeCookieParam (OAS 3.2 Strict Compliance)', () => {
        it('should serialize primitive values', () => {
            expect(Builder.serializeCookieParam('id', 5)).toBe('id=5');
            expect(Builder.serializeCookieParam('token', 'abc')).toBe('token=abc');
        });

        it('should serialize Array with explode=true (Multiple cookies, same name)', () => {
            // Spec Example: color=blue; color=black
            const res = Builder.serializeCookieParam('color', ['blue', 'black'], 'form', true);
            expect(res).toBe('color=blue; color=black');
        });

        it('should serialize Array with explode=false (Comma separated)', () => {
            // Spec Example: color=blue,black
            const res = Builder.serializeCookieParam('color', ['blue', 'black'], 'form', false);
            expect(res).toBe('color=blue,black');
        });

        it('should serialize Object with explode=true (Keyless properties)', () => {
            // Spec Example: R=100; G=200 (Parameter name is omitted)
            const obj = { R: 100, G: 200 };
            const res = Builder.serializeCookieParam('color', obj, 'form', true);
            expect(res).toBe('R=100; G=200');
        });

        it('should serialize Object with explode=false (Flattened matching form)', () => {
            // Spec Example: color=R,100,G,200
            const obj = { R: 100, G: 200 };
            const res = Builder.serializeCookieParam('color', obj, 'form', false);
            // The implementation encodes the value part, so commas become %2C if the encoder runs
            // In the implementation provided: return `\${key}=\${encodeURIComponent(flat)}`;
            // "R,100,G,200" -> "color=R%2C100%2CG%2C200"
            expect(res).toBe('color=R%2C100%2CG%2C200');
        });

        it('should handle JSON serialization override', () => {
            const obj = { foo: 'bar' };
            const res = Builder.serializeCookieParam('data', obj, 'form', true, 'json');
            expect(res).toContain('data=%7B'); // URL encoded JSON
        });
    });

    describe('ApiParameterCodec', () => {
        const codec = new ApiParameterCodec();

        it('should pass through strings without encoding', () => {
            expect(codec.encodeValue('a/b')).toBe('a/b');
            expect(codec.encodeKey('key!')).toBe('key!');
        });

        it('should decode using decodeURIComponent', () => {
            expect(codec.decodeValue('a%2Fb')).toBe('a/b');
        });
    });
});
