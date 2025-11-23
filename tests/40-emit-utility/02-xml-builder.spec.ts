import { describe, it, expect } from 'vitest';
import { XmlBuilderGenerator } from '@src/service/emit/utility/xml-builder.generator.js';
import { createTestProject } from '../shared/helpers.js';
import ts from 'typescript';

function getXmlBuilder() {
    const project = createTestProject();
    new XmlBuilderGenerator(project).generate('/');
    const sourceFile = project.getSourceFileOrThrow('/utils/xml-builder.ts');
    const jsCode = ts.transpile(sourceFile.getText(), {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.CommonJS
    });
    const moduleScope = { exports: {} };
    new Function('exports', jsCode)(moduleScope.exports);
    return (moduleScope.exports as any).XmlBuilder;
}

describe('Utility: XmlBuilder', () => {
    const XmlBuilder = getXmlBuilder();

    describe('Standard (Legacy) Behavior', () => {
        it('should serialize simple primitives', () => {
            expect(XmlBuilder.serialize(123, 'id')).toBe('<id>123</id>');
            expect(XmlBuilder.serialize('foo', 'name')).toBe('<name>foo</name>');
            expect(XmlBuilder.serialize(true, 'active')).toBe('<active>true</active>');
        });

        it('should serialize objects', () => {
            const data = { id: 1, name: 'Item' };
            const xml = XmlBuilder.serialize(data, 'Entity');
            expect(xml).toBe('<Entity><id>1</id><name>Item</name></Entity>');
        });

        it('should handle attributes via legacy config', () => {
            const data = { id: 5, val: 'test' };
            const config = {
                properties: {
                    id: { attribute: true }
                }
            };
            const xml = XmlBuilder.serialize(data, 'Item', config);
            expect(xml).toBe('<Item id="5"><val>test</val></Item>');
        });

        it('should handle custom tag names', () => {
            const data = { simple: 'val' };
            const config = {
                properties: {
                    simple: { name: 'complex' }
                }
            };
            const xml = XmlBuilder.serialize(data, 'Root', config);
            expect(xml).toBe('<Root><complex>val</complex></Root>');
        });

        it('should handle wrapped arrays (legacy)', () => {
            const data = { tags: ['a', 'b'] };
            const config = {
                properties: {
                    tags: {
                        wrapped: true,
                        items: { name: 'Tag' }
                    }
                }
            };
            const xml = XmlBuilder.serialize(data, 'Root', config);
            expect(xml).toBe('<Root><tags><Tag>a</Tag><Tag>b</Tag></tags></Root>');
        });

        it('should handle unwrapped arrays (default)', () => {
            const data = { tags: ['a', 'b'] };
            const config = {
                properties: { tags: { wrapped: false } }
            };
            const xml = XmlBuilder.serialize(data, 'Root', config);
            expect(xml).toBe('<Root><tags>a</tags><tags>b</tags></Root>');
        });
    });

    describe('OAS 3.2 nodeType Support', () => {
        it('should handle nodeType: "attribute"', () => {
            const data = { id: 99, content: 'stuff' };
            const config = {
                properties: {
                    id: { nodeType: 'attribute' }
                }
            };
            const xml = XmlBuilder.serialize(data, 'Node', config);
            expect(xml).toBe('<Node id="99"><content>stuff</content></Node>');
        });

        it('should handle nodeType: "element" on arrays (Wrapping)', () => {
            // Equivalent to wrapped: true
            const data = { list: [1, 2] };
            const config = {
                properties: {
                    list: {
                        nodeType: 'element',
                        items: { name: 'item' }
                    }
                }
            };
            const xml = XmlBuilder.serialize(data, 'Root', config);
            expect(xml).toBe('<Root><list><item>1</item><item>2</item></list></Root>');
        });

        it('should handle nodeType: "none" (Unwrapping/Grouping)', () => {
            // If a property is "none", it has no tag, its children (or text) are direct children of parent
            const data = {
                meta: { version: '1.0', author: 'me' }
            };
            const config = {
                properties: {
                    meta: { nodeType: 'none' }
                }
            };
            // Expect meta's children to appear directly in Root, not wrapped in <meta>
            const xml = XmlBuilder.serialize(data, 'Root', config);
            expect(xml).toBe('<Root><version>1.0</version><author>me</author></Root>');
        });

        it('should handle nodeType: "text" (Inner Text)', () => {
            const data = {
                attr: 'attrVal',
                content: 'This is text content'
            };
            const config = {
                properties: {
                    attr: { nodeType: 'attribute' },
                    content: { nodeType: 'text' }
                }
            };
            const xml = XmlBuilder.serialize(data, 'Element', config);
            expect(xml).toBe('<Element attr="attrVal">This is text content</Element>');
        });

        it('should handle nodeType: "cdata"', () => {
            const data = {
                html: '<html><body></body></html>'
            };
            const config = {
                properties: {
                    html: { nodeType: 'cdata' }
                }
            };
            // Per OAS 3.2, if nodeType is cdata, it represents a CDATA section node.
            // It is inserted directly into the parent without a wrapper tag named after the property.
            const xml = XmlBuilder.serialize(data, 'Doc', config);
            expect(xml).toBe('<Doc><![CDATA[<html><body></body></html>]]></Doc>');
        });

        it('should handle nodeType: "cdata" combined with "none" to inject raw CDATA', () => {
            // OAS Use case: Referenced Element With CDATA
            const data = {
                raw: '<html></html>'
            };
            const config = {
                properties: {
                    raw: { nodeType: 'cdata' }
                }
            };
            const xml = XmlBuilder.serialize(data, 'Doc', config);
            expect(xml).toBe('<Doc><![CDATA[<html></html>]]></Doc>');
        });
    });

    describe('Escaping', () => {
        it('should escape special characters in text', () => {
            const data = { text: '<&>' };
            const xml = XmlBuilder.serialize(data, 'R');
            expect(xml).toBe('<R><text>&lt;&amp;&gt;</text></R>');
        });

        it('should escape attributes', () => {
            const data = { attr: '"quotes"' };
            const config = { properties: { attr: { attribute: true } } };
            const xml = XmlBuilder.serialize(data, 'R', config);
            expect(xml).toBe('<R attr="&quot;quotes&quot;"></R>');
        });
    });

    describe('Namespaces and Prefixes (OAS 3.2)', () => {
        it('should apply default namespace to root element', () => {
            const data = { id: 1 };
            const config = {
                namespace: 'http://example.com/schema',
                name: 'Root'
            };
            const xml = XmlBuilder.serialize(data, 'Root', config);
            expect(xml).toBe('<Root xmlns="http://example.com/schema"><id>1</id></Root>');
        });

        it('should apply prefix and namespace to root element', () => {
            const data = { id: 1 };
            const config = {
                namespace: 'http://example.com/schema',
                prefix: 'ex',
                name: 'Root'
            };
            const xml = XmlBuilder.serialize(data, 'Root', config);
            expect(xml).toBe('<ex:Root xmlns:ex="http://example.com/schema"><id>1</id></ex:Root>');
        });

        it('should apply prefix to nested elements', () => {
            const data = {
                nested: { val: 'test' }
            };
            const config = {
                properties: {
                    nested: {
                        prefix: 'ns',
                        name: 'Nested'
                    }
                }
            };
            // Note: namespace is not declared here, just prefix used in tag name
            const xml = XmlBuilder.serialize(data, 'Root', config);
            expect(xml).toBe('<Root><ns:Nested><val>test</val></ns:Nested></Root>');
        });

        it('should apply prefix to attributes', () => {
            const data = { id: 123 };
            const config = {
                properties: {
                    id: {
                        attribute: true,
                        prefix: 'xsi'
                    }
                }
            };
            const xml = XmlBuilder.serialize(data, 'Item', config);
            expect(xml).toBe('<Item xsi:id="123"></Item>');
        });

        it('should apply namespaces to wrapped array elements', () => {
            const data = { items: [1, 2] };
            const config = {
                properties: {
                    items: {
                        wrapped: true,
                        prefix: 'list',
                        namespace: 'http://lists.com',
                        items: { name: 'i' }
                    }
                }
            };
            const xml = XmlBuilder.serialize(data, 'Root', config);
            // The wrapper gets the namespace definition
            expect(xml).toBe('<Root><list:items xmlns:list="http://lists.com"><i>1</i><i>2</i></list:items></Root>');
        });
    });
});
