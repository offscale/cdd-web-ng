import { describe, expect, it } from 'vitest';
import { ContentEncoderGenerator } from '@src/generators/shared/content-encoder.generator.js';
import { createTestProject } from '../shared/helpers.js';
import ts from 'typescript';

function getContentEncoder() {
    const project = createTestProject();
    new ContentEncoderGenerator(project).generate('/');

    const sourceFile = project.getSourceFileOrThrow('/utils/content-encoder.ts');
    const startText = sourceFile.getText();
    const code = startText.replace(/export /g, '');

    const jsCode = ts.transpile(code, {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.CommonJS,
    });

    // type-coverage:ignore-next-line
    const moduleScope = { exports: {} as any };
    // Fix: Manually attach the class to exports since we stripped the keyword
    const finalCode = `${jsCode}; exports.ContentEncoder = ContentEncoder;`;

    // type-coverage:ignore-next-line
    new Function('exports', finalCode)(moduleScope.exports);
    // type-coverage:ignore-next-line
    return moduleScope.exports.ContentEncoder;
}

describe('Utility: ContentEncoder', () => {
    // type-coverage:ignore-next-line
    const ContentEncoder = getContentEncoder();

    it('should return original data if config or data is null', () => {
        // type-coverage:ignore-next-line
        expect(ContentEncoder.encode(null, {})).toBeNull();
        // type-coverage:ignore-next-line
        expect(ContentEncoder.encode(undefined, {})).toBeUndefined();
        // type-coverage:ignore-next-line
        expect(ContentEncoder.encode({ a: 1 }, null)).toEqual({ a: 1 });
    });

    it('should JSON stringify properties marked with encode: true', () => {
        const data = { id: 1, meta: { version: 1.0 } };
        const config = {
            properties: {
                meta: { encode: true },
            },
        };
        // type-coverage:ignore-next-line
        const result = ContentEncoder.encode(data, config);

        // type-coverage:ignore-next-line
        expect(result.id).toBe(1);
        // type-coverage:ignore-next-line
        expect(typeof result.meta).toBe('string');
        // type-coverage:ignore-next-line
        expect(result.meta).toBe('{"version":1}');
    });

    it('should handle arrays with nested encoding', () => {
        const data = [
            { id: 1, raw: { x: 1 } },
            { id: 2, raw: { x: 2 } },
        ];
        const config = {
            items: {
                // config applies to array items
                properties: {
                    raw: { encode: true },
                },
            },
        };

        // Input to encode is the array itself, so we need a wrapper config if top-level is array
        // Yes, the interface allows `items` at top level
        // type-coverage:ignore-next-line
        const result = ContentEncoder.encode(data, config);

        // type-coverage:ignore-next-line
        expect(result).toBeInstanceOf(Array);
        // type-coverage:ignore-next-line
        expect(result[0].raw).toBe('{"x":1}');
        // type-coverage:ignore-next-line
        expect(result[1].raw).toBe('{"x":2}');
    });

    it('should not re-encode if data is already string', () => {
        const data = { meta: '{"already":"string"}' };
        const config = { properties: { meta: { encode: true } } };
        // type-coverage:ignore-next-line
        const result = ContentEncoder.encode(data, config);
        // type-coverage:ignore-next-line
        expect(result.meta).toBe('{"already":"string"}');
    });

    it('should base64 encode string values when contentEncoding is set', () => {
        const data = { payload: 'hi' };
        const config = { properties: { payload: { contentEncoding: 'base64' } } };
        // type-coverage:ignore-next-line
        const result = ContentEncoder.encode(data, config);
        // type-coverage:ignore-next-line
        expect(result.payload).toBe('aGk=');
    });

    it('should base64url encode byte values without padding', () => {
        const bytes = new Uint8Array([1, 2, 3]);
        const config = { contentEncoding: 'base64url' };
        // type-coverage:ignore-next-line
        const result = ContentEncoder.encode(bytes, config);
        // type-coverage:ignore-next-line
        expect(result).toBe('AQID');
    });
});
