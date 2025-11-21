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

    it('should handle attributes via config', () => {
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

    it('should handle wrapped arrays', () => {
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
        // <Root><tags><Tag>a</Tag><Tag>b</Tag></tags></Root>
        expect(xml).toBe('<Root><tags><Tag>a</Tag><Tag>b</Tag></tags></Root>');
    });

    it('should handle unwrapped arrays (default)', () => {
        const data = { tags: ['a', 'b'] };
        const config = {
            properties: { tags: { wrapped: false } }
        };
        const xml = XmlBuilder.serialize(data, 'Root', config);
        // <Root><tags>a</tags><tags>b</tags></Root>
        expect(xml).toBe('<Root><tags>a</tags><tags>b</tags></Root>');
    });

    it('should escape special characters', () => {
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
