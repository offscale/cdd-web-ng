import { describe, expect, it } from 'vitest';
import { LinkSetParserGenerator } from '@src/vendors/angular/utils/link-set-parser.generator.js';
import { createTestProject } from '../shared/helpers.js';
import ts from 'typescript';

function getLinkSetParser() {
    const project = createTestProject();
    new LinkSetParserGenerator(project).generate('/');

    const sourceFile = project.getSourceFileOrThrow('/utils/linkset-parser.ts');
    const startText = sourceFile.getText();
    const code = startText.replace(/export /g, '');

    const jsCode = ts.transpile(code, {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.CommonJS,
    });

    // type-coverage:ignore-next-line
    const moduleScope = { exports: {} as any };
    const finalCode = `${jsCode}; exports.LinkSetParser = LinkSetParser;`;

    // type-coverage:ignore-next-line
    new Function('exports', finalCode)(moduleScope.exports);
    // type-coverage:ignore-next-line
    return moduleScope.exports.LinkSetParser;
}

describe('Utility: LinkSetParser', () => {
    // type-coverage:ignore-next-line
    const LinkSetParser = getLinkSetParser();

    describe('parseHeader (HTTP Link Header)', () => {
        it('should return empty array for null/empty input', () => {
            // type-coverage:ignore-next-line
            expect(LinkSetParser.parseHeader(null)).toEqual([]);
            // type-coverage:ignore-next-line
            expect(LinkSetParser.parseHeader('')).toEqual([]);
        });

        it('should parse a single link', () => {
            const header = '<https://api.example.com/next>; rel="next"';
            // type-coverage:ignore-next-line
            const result = LinkSetParser.parseHeader(header);
            // type-coverage:ignore-next-line
            expect(result).toHaveLength(1);
            // type-coverage:ignore-next-line
            expect(result[0].href).toBe('https://api.example.com/next');
            // type-coverage:ignore-next-line
            expect(result[0].attributes.rel).toBe('next');
        });

        it('should parse multiple links separated by comma', () => {
            const header = '<https://api.com/next>; rel="next", <https://api.com/prev>; rel="prev"';
            // type-coverage:ignore-next-line
            const result = LinkSetParser.parseHeader(header);
            // type-coverage:ignore-next-line
            expect(result).toHaveLength(2);
            // type-coverage:ignore-next-line
            expect(result[0].attributes.rel).toBe('next');
            // type-coverage:ignore-next-line
            expect(result[1].attributes.rel).toBe('prev');
        });

        it('should parse multiple attributes including unquoted boolean flags', () => {
            const header = '</terms>; rel="copyright"; anchor="#foo"; crossorigin';
            // type-coverage:ignore-next-line
            const result = LinkSetParser.parseHeader(header);
            // type-coverage:ignore-next-line
            expect(result[0].href).toBe('/terms');
            // type-coverage:ignore-next-line
            expect(result[0].attributes.rel).toBe('copyright');
            // type-coverage:ignore-next-line
            expect(result[0].attributes.anchor).toBe('#foo');
            // type-coverage:ignore-next-line
            expect(result[0].attributes.crossorigin).toBe(true);
        });

        it('should handle spaces and quotes around attributes', () => {
            const header = '<http://example.com>; title="Title with spaces"';
            // type-coverage:ignore-next-line
            const result = LinkSetParser.parseHeader(header);
            // type-coverage:ignore-next-line
            expect(result[0].attributes.title).toBe('Title with spaces');
        });
    });

    describe('parseJson (application/linkset+json)', () => {
        it('should parse a JSON array of link objects (RFC 9264)', () => {
            const json = [
                { href: '/next', rel: 'next' },
                { href: '/prev', rel: 'prev', title: 'Previous' },
            ];
            // type-coverage:ignore-next-line
            const result = LinkSetParser.parseJson(json);
            // type-coverage:ignore-next-line
            expect(result).toHaveLength(2);
            // type-coverage:ignore-next-line
            expect(result[0].href).toBe('/next');
            // type-coverage:ignore-next-line
            expect(result[0].attributes.rel).toBe('next');
            // type-coverage:ignore-next-line
            expect(result[1].attributes.title).toBe('Previous');
        });

        it('should handle wrapped linkset property', () => {
            const json = { linkset: [{ href: '/a', rel: 'a' }] };
            // type-coverage:ignore-next-line
            const result = LinkSetParser.parseJson(json);
            // type-coverage:ignore-next-line
            expect(result).toHaveLength(1);
            // type-coverage:ignore-next-line
            expect(result[0].href).toBe('/a');
        });

        it('should return empty array for invalid input', () => {
            // type-coverage:ignore-next-line
            expect(LinkSetParser.parseJson(null)).toEqual([]);
            // type-coverage:ignore-next-line
            expect(LinkSetParser.parseJson({})).toEqual([]);
        });
    });
});
