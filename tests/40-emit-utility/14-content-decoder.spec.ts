import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { ContentDecoderGenerator } from '@src/openapi/emit_content_decoder.js';
import { createTestProject } from '../shared/helpers.js';

function getContentDecoder() {
    const project = createTestProject();
    new ContentDecoderGenerator(project).generate('/');

    const sourceFile = project.getSourceFileOrThrow('/utils/content-decoder.ts');
    const code = sourceFile.getText().replace(/import\s+.*from\s+['"].*['"];?/g, '');

    const jsCode = ts.transpile(code, {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.CommonJS,
    });

    // type-coverage:ignore-next-line
    const moduleScope = { exports: {} as any };
    const finalCode = `const XmlParser = { parse: (xml) => ({ xml }) }; ${jsCode}; exports.ContentDecoder = ContentDecoder;`;

    // type-coverage:ignore-next-line
    new Function('exports', finalCode)(moduleScope.exports);
    // type-coverage:ignore-next-line
    return moduleScope.exports.ContentDecoder;
}

describe('Utility: ContentDecoder', () => {
    // type-coverage:ignore-next-line
    const ContentDecoder = getContentDecoder();

    it('should decode base64 strings to Uint8Array', () => {
        // type-coverage:ignore-next-line
        const result = ContentDecoder.decode('AQID', { contentEncoding: 'base64' });
        // type-coverage:ignore-next-line
        expect(result).toBeInstanceOf(Uint8Array);
        expect(Array.from(result)).toEqual([1, 2, 3]);
    });

    it('should decode base64url and parse JSON when decode is enabled', () => {
        const payload = JSON.stringify({ a: 1 });
        const base64 = Buffer.from(payload, 'utf-8').toString('base64');
        const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

        // type-coverage:ignore-next-line
        const result = ContentDecoder.decode(base64url, { contentEncoding: 'base64url', decode: true });
        // type-coverage:ignore-next-line
        expect(result).toEqual({ a: 1 });
    });
});
