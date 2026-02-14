import { describe, expect, it } from 'vitest';
import ts from 'typescript';

import { ParameterSerializerGenerator } from '@src/generators/shared/parameter-serializer.generator.js';
import { ContentEncoderGenerator } from '@src/generators/shared/content-encoder.generator.js';
import { createTestProject } from '../shared/helpers.js';

function getSerializerContext() {
    const project = createTestProject();
    new ContentEncoderGenerator(project).generate('/');
    new ParameterSerializerGenerator(project).generate('/');
    const sourceFile = project.getSourceFileOrThrow('/utils/parameter-serializer.ts');
    const encoderFile = project.getSourceFileOrThrow('/utils/content-encoder.ts');

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

    const exportsMock: Record<string, any> = {};
    const encoderExports: Record<string, any> = {};
    new Function('exports', encoderJsCode)(encoderExports);
    const ContentEncoder = encoderExports.ContentEncoder;
    new Function('exports', 'ContentEncoder', jsCode)(exportsMock, ContentEncoder);

    return {
        ParameterSerializer: (exportsMock as any).ParameterSerializer,
    };
}

describe('Utility: ParameterSerializer', () => {
    const { ParameterSerializer } = getSerializerContext();

    it('should serialize x-www-form-urlencoded querystring payloads with encoding', () => {
        const result = ParameterSerializer.serializeRawQuerystring(
            { foo: 'a b', bar: 'c+d' },
            undefined,
            'application/x-www-form-urlencoded',
        );
        expect(result).toBe('foo=a+b&bar=c%2Bd');
    });

    it('should honor per-property encoding hints for x-www-form-urlencoded querystring payloads', () => {
        const result = ParameterSerializer.serializeRawQuerystring(
            { tags: ['a', 'b'] },
            undefined,
            'application/x-www-form-urlencoded',
            { tags: { style: 'pipeDelimited', explode: false } },
        );
        expect(result).toBe('tags=a%7Cb');
    });

    it('should percent-encode non-form querystring payloads when contentType is provided', () => {
        const result = ParameterSerializer.serializeRawQuerystring(
            '<tag>Hello World</tag>',
            undefined,
            'application/xml',
        );
        expect(result).toBe('%3Ctag%3EHello%20World%3C%2Ftag%3E');
    });

    it('should percent-encode text/plain querystring payloads', () => {
        const result = ParameterSerializer.serializeRawQuerystring('hello world', undefined, 'text/plain');
        expect(result).toBe('hello%20world');
    });

    it('should honor contentType serialization for urlencoded bodies', () => {
        const result = ParameterSerializer.serializeUrlEncodedBody(
            { meta: { a: 1 }, note: 'hi' },
            { meta: { contentType: 'application/json' } },
        );
        expect(result).toEqual([
            { key: 'meta', value: '%7B%22a%22%3A1%7D' },
            { key: 'note', value: 'hi' },
        ]);
    });

    it('should support nested encoding maps for urlencoded bodies', () => {
        const result = ParameterSerializer.serializeUrlEncodedBody(
            { meta: { a: 1, b: 2 } },
            { meta: { encoding: { a: { contentType: 'text/plain' }, b: { contentType: 'text/plain' } } } },
        );
        expect(result).toEqual([{ key: 'meta', value: 'a%3D1%26b%3D2' }]);
    });

    it('should serialize spaceDelimited objects in query params', () => {
        const result = ParameterSerializer.serializeQueryParam(
            { name: 'color', style: 'spaceDelimited', explode: false },
            { R: 100, G: 200, B: 150 },
        );
        expect(result).toEqual([{ key: 'color', value: 'R%20100%20G%20200%20B%20150' }]);
    });

    it('should serialize content-based form-urlencoded query params as a single encoded value', () => {
        const result = ParameterSerializer.serializeQueryParam(
            { name: 'filter', contentType: 'application/x-www-form-urlencoded' },
            { a: 1, b: 2 },
        );
        expect(result).toEqual([{ key: 'filter', value: 'a%3D1%26b%3D2' }]);
    });

    it('should serialize header params using form-urlencoded contentType when provided', () => {
        const result = ParameterSerializer.serializeHeaderParam(
            { a: 'x', b: 'y' },
            false,
            undefined,
            'application/x-www-form-urlencoded',
        );
        expect(result).toBe('a=x&b=y');
    });

    it('should keep RFC6570 comma delimiters for form arrays', () => {
        const result = ParameterSerializer.serializeQueryParam({ name: 'color', style: 'form', explode: false }, [
            'blue',
            'black',
        ]);
        expect(result).toEqual([{ key: 'color', value: 'blue,black' }]);
    });

    it('should keep RFC6570 comma delimiters for form objects', () => {
        const result = ParameterSerializer.serializeQueryParam(
            { name: 'color', style: 'form', explode: false },
            { R: 100, G: 200 },
        );
        expect(result).toEqual([{ key: 'color', value: 'R,100,G,200' }]);
    });

    it('should preserve percent-encoded triples when allowReserved is true for query params', () => {
        const result = ParameterSerializer.serializeQueryParam(
            { name: 'q', style: 'form', explode: false, allowReserved: true },
            'a%2Fb',
        );
        expect(result).toEqual([{ key: 'q', value: 'a%2Fb' }]);
    });

    it('should encode query delimiters when allowReserved is true for query params', () => {
        const result = ParameterSerializer.serializeQueryParam(
            { name: 'q', style: 'form', explode: false, allowReserved: true },
            'a?b#c&d=e+f',
        );
        expect(result).toEqual([{ key: 'q', value: 'a%3Fb%23c%26d%3De%2Bf' }]);
    });

    it('should serialize pipeDelimited objects in query params', () => {
        const result = ParameterSerializer.serializeQueryParam(
            { name: 'color', style: 'pipeDelimited', explode: false },
            { R: 100, G: 200, B: 150 },
        );
        expect(result).toEqual([{ key: 'color', value: 'R%7C100%7CG%7C200%7CB%7C150' }]);
    });

    it('should serialize tabDelimited arrays in query params', () => {
        const result = ParameterSerializer.serializeQueryParam({ name: 'ids', style: 'tabDelimited', explode: false }, [
            'a',
            'b',
        ]);
        expect(result).toEqual([{ key: 'ids', value: 'a%09b' }]);
    });

    it('should keep cookie form delimiters unescaped', () => {
        const result = ParameterSerializer.serializeCookieParam('color', ['blue', 'black'], 'form', false);
        expect(result).toBe('color=blue,black');
    });

    it('should preserve percent-encoded triples when allowReserved is true for path params', () => {
        const result = ParameterSerializer.serializePathParam('id', 'a%2Fb', 'simple', false, true);
        expect(result).toBe('a%2Fb');
    });

    it('should keep "/" "?" "#" percent-encoded in path params with allowReserved', () => {
        const result = ParameterSerializer.serializePathParam('id', 'a/b?c#d', 'simple', false, true);
        expect(result).toBe('a%2Fb%3Fc%23d');
    });

    it('should apply contentEncoding for query params before serialization', () => {
        const result = ParameterSerializer.serializeQueryParam(
            { name: 'bin', contentEncoderConfig: { contentEncoding: 'base64' } },
            'hi',
        );
        expect(result).toEqual([{ key: 'bin', value: 'aGk%3D' }]);
    });

    it('should apply contentEncoding for path params before encoding', () => {
        const result = ParameterSerializer.serializePathParam('id', 'hi', 'simple', false, false, undefined, {
            contentEncoding: 'base64',
        });
        expect(result).toBe('aGk%3D');
    });

    it('should apply contentEncoding for header params without percent-encoding', () => {
        const result = ParameterSerializer.serializeHeaderParam('hi', false, undefined, undefined, undefined, {
            contentEncoding: 'base64',
        });
        expect(result).toBe('aGk=');
    });
});
