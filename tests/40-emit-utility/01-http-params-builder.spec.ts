import { describe, expect, it } from 'vitest';
import { HttpParamsBuilderGenerator } from '@src/generators/angular/utils/http-params-builder.generator.js';
import { ContentEncoderGenerator } from '@src/generators/shared/content-encoder.generator.js';
import { createTestProject } from '../shared/helpers.js';
import ts from 'typescript';

/**
 * Mock implementation of Angular's HttpParams for the test context.
 * Mirrors functionality of Angular's HttpParams, including custom encoder support.
 */
class MockHttpParams {
    map = new Map<string, string[]>();
    encoder: any;

    constructor(options?: { fromObject?: any; encoder?: any }) {
        // Mock default encoder behavior: encodeURIComponent
        this.encoder = options?.encoder || {
            encodeKey: (k: string) => encodeURIComponent(k),
            encodeValue: (v: string) => encodeURIComponent(v),
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
    get(key: string) {
        const values = this.map.get(key);
        // Fix: differentiate between missing key and empty value
        if (!values || values.length === 0) return null;
        return values[0];
    }
}

function getBuilderContext() {
    const project = createTestProject();
    new ContentEncoderGenerator(project).generate('/');
    new HttpParamsBuilderGenerator(project).generate('/');
    const sourceFile = project.getSourceFileOrThrow('/utils/http-params-builder.ts');
    const encoderFile = project.getSourceFileOrThrow('/utils/content-encoder.ts');

    // Strip imports so we can evaluate in the test context
    const codeWithoutImports = sourceFile.getText().replace(/import\s+.*from\s+['"].*['"];?/g, '');
    const encoderCodeWithoutImports = encoderFile.getText().replace(/import\s+.*from\s+['"].*['"];?/g, '');

    const jsCode = ts.transpile(codeWithoutImports, {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
    });
    const encoderJsCode = ts.transpile(encoderCodeWithoutImports, {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
    });

    const exportsMock = {};
    const encoderExports: Record<string, any> = {};

    new Function('exports', encoderJsCode)(encoderExports);
    const ContentEncoder = encoderExports.ContentEncoder;
    new Function('exports', 'HttpParams', 'ContentEncoder', jsCode)(exportsMock, MockHttpParams, ContentEncoder);

    return {
        Builder: (exportsMock as any).HttpParamsBuilder,
        ApiParameterCodec: (exportsMock as any).ApiParameterCodec,
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

        it('should encode query delimiters even when allowReserved=true', () => {
            const params = createParams();
            const val = 'a?b#c&d=e+f';
            const res = Builder.serializeQueryParam(params, { name: 'q', allowReserved: true }, val);
            expect(res.get('q')).toBe('a%3Fb%23c%26d%3De%2Bf');
        });

        it('should preserve percent-encoded triples when allowReserved=true', () => {
            const params = createParams();
            const val = 'a%2Fb';
            const res = Builder.serializeQueryParam(params, { name: 'q', allowReserved: true }, val);
            expect(res.get('q')).toBe('a%2Fb');
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
            const res = Builder.serializeQueryParam(
                params,
                {
                    name: 'q',
                    allowReserved: true,
                    serialization: 'json',
                },
                val,
            );

            const encoded = res.get('q');
            expect(encoded).toContain('%7B'); // {
            expect(encoded).toContain('%22'); // "
            expect(encoded).toContain(':'); // : preserved
            expect(encoded).toContain('/'); // / preserved
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

        it('should serialize spaceDelimited objects in query params', () => {
            const params = createParams();
            const res = Builder.serializeQueryParam(
                params,
                { name: 'color', style: 'spaceDelimited', explode: false },
                { R: 100, G: 200 },
            );
            expect(res.get('color')).toBe('R%20100%20G%20200');
        });

        it('should serialize pipeDelimited objects in query params', () => {
            const params = createParams();
            const res = Builder.serializeQueryParam(
                params,
                { name: 'color', style: 'pipeDelimited', explode: false },
                { R: 100, G: 200 },
            );
            expect(res.get('color')).toBe('R%7C100%7CG%7C200');
        });

        it('should serialize tabDelimited arrays with encoded tab', () => {
            const params = createParams();
            const res = Builder.serializeQueryParam(params, { name: 't', style: 'tabDelimited' }, ['a', 'b']);
            expect(res.get('t')).toBe('a%09b');
        });

        it('should apply contentEncoding before query serialization', () => {
            const params = createParams();
            const res = Builder.serializeQueryParam(
                params,
                { name: 'bin', contentEncoderConfig: { contentEncoding: 'base64' } },
                'hi',
            );
            expect(res.get('bin')).toBe('aGk%3D');
        });

        // New OAS 3.2 allowEmptyValue Tests
        it('should emit empty string if allowEmptyValue is true and value is null', () => {
            const params = createParams();
            const res = Builder.serializeQueryParam(params, { name: 'flag', allowEmptyValue: true }, null);
            expect(res.get('flag')).toBe('');
            expect(res.toString()).toBe('flag=');
        });

        it('should emit empty string if allowEmptyValue is true and value is undefined', () => {
            const params = createParams();
            const res = Builder.serializeQueryParam(params, { name: 'flag', allowEmptyValue: true }, undefined);
            expect(res.get('flag')).toBe('');
        });

        it('should emit empty string if allowEmptyValue is true and value is empty string', () => {
            const params = createParams();
            const res = Builder.serializeQueryParam(params, { name: 'flag', allowEmptyValue: true }, '');
            expect(res.get('flag')).toBe('');
        });

        it('should omit parameter if allowEmptyValue is false (default) and value is null', () => {
            const params = createParams();
            const res = Builder.serializeQueryParam(params, { name: 'flag' }, null);
            expect(res.get('flag')).toBeNull();
        });
    });

    describe('serializePathParam', () => {
        it('should encode path delimiters when allowReserved=true', () => {
            const result = Builder.serializePathParam('id', 'a/b?c#d', 'simple', false, true);
            expect(result).toBe('a%2Fb%3Fc%23d');
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
            // Since style='form' (default), commas are separators and should be encoded as per standard practice
            // to avoid ambiguity, unless specifically opting out.
            // OAS 3.0 examples for style=form, explode=false show "id=5,6".
            // But for cookies, comma is special.
            // The implementation uses %2C for form style.
            expect(res).toBe('color=blue%2Cblack');
        });

        it('should serialize Object with explode=true (Keyless properties)', () => {
            // Spec Example: R=100; G=200 (Parameter name is omitted for object props)
            const obj = { R: 100, G: 200 };
            const res = Builder.serializeCookieParam('color', obj, 'form', true);
            expect(res).toBe('R=100; G=200');
        });

        it('should serialize Object with explode=false (Flattened matching form)', () => {
            // Spec Example: color=R,100,G,200
            const obj = { R: 100, G: 200 };
            const res = Builder.serializeCookieParam('color', obj, 'form', false);
            // style=form -> encoded delimiter %2C
            expect(res).toBe('color=R%2C100%2CG%2C200');
        });

        it('should handle style="cookie" by NOT percent-encoding values (OAS 3.2)', () => {
            const val = 'hello world!';
            // form style -> percent encoded: hello%20world! (encodeURIComponent leaves !)
            expect(Builder.serializeCookieParam('msg', val, 'form', true)).toBe('msg=hello%20world!');
            // cookie style -> raw: hello world!
            expect(Builder.serializeCookieParam('msg', val, 'cookie', true)).toBe('msg=hello world!');
        });

        it('should allow reserved characters if allowReserved=true via encodeReserved', () => {
            const val = 'a/b+c';
            // allowReserved=true -> / and + are preserved
            expect(Builder.serializeCookieParam('path', val, 'form', true, true)).toBe('path=a/b+c');
            // standard form (allowReserved=false) -> percent encoded
            expect(Builder.serializeCookieParam('path', val, 'form', true, false)).toBe('path=a%2Fb%2Bc');
        });

        it('should handle JSON serialization override', () => {
            const obj = { foo: 'bar' };
            const res = Builder.serializeCookieParam('data', obj, 'form', true, false, 'json');
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
