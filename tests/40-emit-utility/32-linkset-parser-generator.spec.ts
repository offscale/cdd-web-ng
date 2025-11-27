import { describe, expect, it } from 'vitest';
import { LinkSetParserGenerator } from '@src/generators/angular/utils/link-set-parser.generator.js';
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

    const moduleScope = { exports: {} as any };
    const finalCode = `${jsCode}; exports.LinkSetParser = LinkSetParser;`;

    new Function('exports', finalCode)(moduleScope.exports);
    return moduleScope.exports.LinkSetParser;
}

describe('Utility: LinkSetParser', () => {
    const LinkSetParser = getLinkSetParser();

    describe('parseHeader (HTTP Link Header)', () => {
        it('should return empty array for null/empty input', () => {
            expect(LinkSetParser.parseHeader(null)).toEqual([]);
            expect(LinkSetParser.parseHeader('')).toEqual([]);
        });

        it('should parse a single link', () => {
            const header = '<https://api.example.com/next>; rel="next"';
            const result = LinkSetParser.parseHeader(header);
            expect(result).toHaveLength(1);
            expect(result[0].href).toBe('https://api.example.com/next');
            expect(result[0].attributes.rel).toBe('next');
        });

        it('should parse multiple links separated by comma', () => {
            const header = '<https://api.com/next>; rel="next", <https://api.com/prev>; rel="prev"';
            const result = LinkSetParser.parseHeader(header);
            expect(result).toHaveLength(2);
            expect(result[0].attributes.rel).toBe('next');
            expect(result[1].attributes.rel).toBe('prev');
        });

        it('should parse multiple attributes including unquoted boolean flags', () => {
            const header = '</terms>; rel="copyright"; anchor="#foo"; crossorigin';
            const result = LinkSetParser.parseHeader(header);
            expect(result[0].href).toBe('/terms');
            expect(result[0].attributes.rel).toBe('copyright');
            expect(result[0].attributes.anchor).toBe('#foo');
            expect(result[0].attributes.crossorigin).toBe(true);
        });

        it('should handle spaces and quotes around attributes', () => {
            const header = '<http://example.com>; title="Title with spaces"';
            const result = LinkSetParser.parseHeader(header);
            expect(result[0].attributes.title).toBe('Title with spaces');
        });
    });

    describe('parseJson (application/linkset+json)', () => {
        it('should parse a JSON array of link objects (RFC 9264)', () => {
            const json = [
                { href: '/next', rel: 'next' },
                { href: '/prev', rel: 'prev', title: 'Previous' },
            ];
            const result = LinkSetParser.parseJson(json);
            expect(result).toHaveLength(2);
            expect(result[0].href).toBe('/next');
            expect(result[0].attributes.rel).toBe('next');
            expect(result[1].attributes.title).toBe('Previous');
        });

        it('should handle wrapped linkset property', () => {
            const json = { linkset: [{ href: '/a', rel: 'a' }] };
            const result = LinkSetParser.parseJson(json);
            expect(result).toHaveLength(1);
            expect(result[0].href).toBe('/a');
        });

        it('should return empty array for invalid input', () => {
            expect(LinkSetParser.parseJson(null)).toEqual([]);
            expect(LinkSetParser.parseJson({})).toEqual([]);
        });
    });
});
