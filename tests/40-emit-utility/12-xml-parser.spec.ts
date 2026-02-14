import { describe, expect, it } from 'vitest';
import { createTestProject } from '../shared/helpers.js';
import ts from 'typescript';
import { XmlParserGenerator } from '@src/generators/shared/xml-parser.generator.js';

/**
 * Helper to compile and return the XmlParser class from the generated code.
 * Mocks the global DOMParser behavior.
 */
function getXmlParser() {
    const project = createTestProject();
    new XmlParserGenerator(project).generate('/');
    const sourceFile = project.getSourceFileOrThrow('/utils/xml-parser.ts');
    const startText = sourceFile.getText();

    const codeWithoutExports = startText.replace(/export class/g, 'class').replace(/export interface/g, 'interface');

    const jsCode = ts.transpile(codeWithoutExports, {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.CommonJS,
    });

    const moduleScope = { exports: {} as any };

    // Mock DOMParser environment
    const DOMParserMock = class {
        parseFromString(xml: string, _mime: string) {
            return parseXmlSimple(xml);
        }
    };

    global.DOMParser = DOMParserMock as any;

    // Very basic XML parser mock for unit testing traversal logic
    function parseXmlSimple(xml: string) {
        const parserError = { length: 0 }; // No error

        const createTextNode = (text: string) => ({
            nodeType: 3,
            textContent: text,
        });

        const createNode = (
            tagName: string,
            attributes: any,
            children: any[],
            textContent: string | null,
            childNodes?: any[],
        ) => ({
            tagName,
            nodeType: 1,
            attributes,
            children,
            childNodes: childNodes ?? children,
            textContent,
            hasAttribute: (k: string) => k in attributes,
            getAttribute: (k: string) => attributes[k],
            getAttributeNS: (_ns: string, k: string) => attributes[k], // ignore NS for simple mock
            hasAttributeNS: (_ns: string, k: string) => k in attributes,
        });

        // Hardcoded object creation based on expected test inputs
        // Case 1: Simple
        if (xml.includes('<root><val>123</val></root>')) {
            return {
                getElementsByTagName: () => parserError,
                documentElement: createNode('root', {}, [createNode('val', {}, [], '123')], null),
            };
        }
        // Case 2: Attributes
        if (xml.includes('<root id="5">text</root>')) {
            return {
                getElementsByTagName: () => parserError,
                documentElement: createNode('root', { id: '5' }, [], 'text'),
            };
        }
        // Case 3: Wrapped Array
        if (xml.includes('<list><item>A</item><item>B</item></list>')) {
            return {
                getElementsByTagName: () => parserError,
                documentElement: createNode(
                    'root',
                    {},
                    [createNode('list', {}, [createNode('item', {}, [], 'A'), createNode('item', {}, [], 'B')], '')],
                    null,
                ),
            };
        }
        // Case 4: Unwrapped Array
        if (xml.includes('<root><tag>A</tag><tag>B</tag></root>')) {
            return {
                getElementsByTagName: () => parserError,
                documentElement: createNode(
                    'root',
                    {},
                    [createNode('tag', {}, [], 'A'), createNode('tag', {}, [], 'B')],
                    null,
                ),
            };
        }
        // Case 5: PrefixItems with text nodes
        if (xml.includes('<report>start<data>42</data>end</report>')) {
            const dataNode = createNode('data', {}, [], '42');
            return {
                getElementsByTagName: () => parserError,
                documentElement: createNode('report', {}, [dataNode], null, [
                    createTextNode('start'),
                    dataNode,
                    createTextNode('end'),
                ]),
            };
        }
        // Case 5: Null
        if (xml.includes('nil="true"') && xml.includes('empty')) {
            return {
                getElementsByTagName: () => parserError,
                documentElement: createNode('root', {}, [createNode('empty', { nil: 'true' }, [], '')], null),
            };
        }
        // Case 6: NodeType None (Structure Flattening)
        if (xml.includes('<root><child>hidden</child></root>')) {
            return {
                getElementsByTagName: () => parserError,
                documentElement: createNode('root', {}, [createNode('child', {}, [], 'hidden')], null),
            };
        }

        return {
            getElementsByTagName: () => parserError,
            documentElement: createNode('unknown', {}, [], null),
        };
    }

    const finalCode = `${jsCode}\nmoduleScope.exports.XmlParser = XmlParser;`;

    new Function('moduleScope', finalCode)(moduleScope);
    return moduleScope.exports.XmlParser;
}

describe('Utility: XmlParser', () => {
    const XmlParser = getXmlParser();

    it('should parse simple elements based on config', () => {
        const xml = '<root><val>123</val></root>';
        const config = {
            properties: {
                val: { name: 'val' },
            },
        };
        const result = XmlParser.parse(xml, config);
        expect(result.val).toBe('123');
    });

    it('should parse attributes', () => {
        const xml = '<root id="5">text</root>';
        const config = {
            properties: {
                id: { attribute: true },
                content: { nodeType: 'text' },
            },
        };
        const result = XmlParser.parse(xml, config);
        expect(result.id).toBe('5');
        expect(result.content).toBe('text');
    });

    it('should parse wrapped arrays', () => {
        // <root><list><item>A</item><item>B</item></list></root>
        const xml = '<root><list><item>A</item><item>B</item></list></root>';
        const config = {
            properties: {
                myList: {
                    name: 'list',
                    wrapped: true,
                    items: { name: 'item' },
                },
            },
        };
        const result = XmlParser.parse(xml, config);
        expect(result.myList).toEqual(['A', 'B']);
    });

    it('should parse unwrapped arrays', () => {
        // <root><tag>A</tag><tag>B</tag></root>
        const xml = '<root><tag>A</tag><tag>B</tag></root>';
        const config = {
            properties: {
                tags: {
                    name: 'tag',
                    wrapped: false,
                    items: { name: 'tag' }, // Effectively treated as repeated elements matching property name
                },
            },
        };
        const result = XmlParser.parse(xml, config);
        expect(result.tags).toEqual(['A', 'B']);
    });

    it('should parse prefixItems arrays with text nodes in order', () => {
        const xml = '<report>start<data>42</data>end</report>';
        const config = {
            prefixItems: [{ nodeType: 'text' }, { name: 'data' }, { nodeType: 'text' }],
        };
        const result = XmlParser.parse(xml, config);
        expect(result).toEqual(['start', '42', 'end']);
    });

    it('should handle null values (xsi:nil)', () => {
        const xml = '<root><empty nil="true" /></root>';
        const config = {
            properties: {
                empty: { name: 'empty' },
            },
        };
        const result = XmlParser.parse(xml, config);
        expect(result.empty).toBeNull();
    });

    it('should parse composite properties transparently when nodeType is "none"', () => {
        // Structure flattened: wrapper does NOT have a <wrapper> match,
        // but its children (<child>) are expected to be found under <root>
        const xml = '<root><child>hidden</child></root>';
        const config = {
            properties: {
                wrapper: {
                    nodeType: 'none',
                    properties: {
                        child: { name: 'child' },
                    },
                },
            },
        };
        const result = XmlParser.parse(xml, config);
        expect(result.wrapper).toBeDefined();
        expect(result.wrapper.child).toBe('hidden');
    });
});
