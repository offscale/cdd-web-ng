import * as path from 'node:path';
import { Project, Scope } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';

export class XmlParserGenerator {
    constructor(private project: Project) {}

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, 'utils');
        const filePath = path.join(utilsDir, 'xml-parser.ts');

        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addInterface({
            name: 'XmlPropertyConfig',
            isExported: true,
            properties: [
                { name: 'name', type: 'string', hasQuestionToken: true },
                { name: 'prefix', type: 'string', hasQuestionToken: true },
                { name: 'namespace', type: 'string', hasQuestionToken: true },
                { name: 'attribute', type: 'boolean', hasQuestionToken: true },
                { name: 'wrapped', type: 'boolean', hasQuestionToken: true },
                {
                    name: 'nodeType',
                    type: "'element' | 'attribute' | 'text' | 'cdata' | 'none' | string",
                    hasQuestionToken: true,
                },
                { name: 'properties', type: 'Record<string, XmlPropertyConfig>', hasQuestionToken: true },
                { name: 'items', type: 'XmlPropertyConfig', hasQuestionToken: true },
                { name: 'prefixItems', type: 'XmlPropertyConfig[]', hasQuestionToken: true },
            ],
        });

        const classDeclaration = sourceFile.addClass({
            name: 'XmlParser',
            isExported: true,
            docs: [
                'Utility to parse XML responses into typed objects based on OpenAPI metadata (including prefixItems ordering).',
            ],
        });

        classDeclaration.addMethod({
            name: 'parse',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'xml', type: 'string' },
                { name: 'config', type: 'XmlPropertyConfig', hasQuestionToken: true },
            ],
            returnType: 'any',
            statements: `
        if (!xml) return null; 
        const parser = new DOMParser(); 
        const doc = parser.parseFromString(xml, "text/xml"); 
        
        const parserError = doc.getElementsByTagName("parsererror"); 
        if (parserError.length > 0) { 
            console.error('XML Parsing Error', parserError[0].textContent); 
            return null; 
        } 

        const root = doc.documentElement; 
        return this.parseNode(root, config || {});`,
        });

        classDeclaration.addMethod({
            name: 'parseNode',
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: 'node', type: 'Element' },
                { name: 'config', type: 'XmlPropertyConfig' },
            ],
            returnType: 'any',
            statements: `
        if (node.hasAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'nil') && 
            node.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'nil') === 'true') { 
            return null; 
        } 

        const prefixItems = Array.isArray(config.prefixItems) ? config.prefixItems : undefined; 
        if (prefixItems && prefixItems.length > 0) { 
            const nodes = this.collectArrayNodes(node); 
            const result: any[] = []; 
            let cursor = 0; 

            for (let i = 0; i < prefixItems.length; i++) { 
                const cfg = prefixItems[i] || {}; 
                const child = nodes[cursor]; 
                if (!child) { 
                    result.push(undefined); 
                    continue; 
                } 
                result.push(this.parseArrayNode(child, cfg)); 
                cursor++; 
            } 

            if (config.items) { 
                const itemsConfig = config.items || {}; 
                for (; cursor < nodes.length; cursor++) { 
                    const child = nodes[cursor]; 
                    if (child.nodeType === 1 && itemsConfig.name && !this.nodeMatchesName(child as Element, itemsConfig.name)) { 
                        continue; 
                    } 
                    result.push(this.parseArrayNode(child, itemsConfig)); 
                } 
            } 
            return result; 
        } 

        if (config.items || config.wrapped) { 
            const itemsConfig = config.items || {}; 
            const itemName = itemsConfig.name; 
            
            const result: any[] = []; 
            const children = node.children; 
            
            for (let i = 0; i < children.length; i++) { 
                const child = children[i]; 
                if (!itemName || this.nodeMatchesName(child, itemName)) { 
                    result.push(this.parseNode(child, itemsConfig)); 
                } 
            } 
            return result; 
        } 

        if (config.properties) { 
            const result: any = {}; 
            
            Object.entries(config.properties).forEach(([key, propConfig]) => { 
                const nodeType = propConfig.nodeType; 
                
                // OAS 3.2 Support: nodeType 'none' implies the property uses the current node 
                // context directly, essentially flattening the structure (e.g. for composition or $ref naming). 
                if (nodeType === 'none') { 
                    result[key] = this.parseNode(node, propConfig); 
                    return; 
                } 

                if (propConfig.attribute || nodeType === 'attribute') { 
                    const attrName = propConfig.name || key; 
                    if (node.hasAttribute(attrName)) { 
                        result[key] = node.getAttribute(attrName); 
                    } 
                    return; 
                } 

                if (nodeType === 'text' || nodeType === 'cdata') { 
                    result[key] = node.textContent; 
                    return; 
                } 

                const childTagName = propConfig.name || key; 
                
                if (propConfig.items && !propConfig.wrapped && propConfig.nodeType !== 'element') { 
                     const items: any[] = []; 
                     const children = node.children; 
                     for(let i=0; i<children.length; i++) { 
                         if (this.nodeMatchesName(children[i], childTagName)) { 
                             items.push(this.parseNode(children[i], propConfig.items || {})); 
                         } 
                     } 
                     result[key] = items; 
                     return; 
                } 

                const child = this.findChild(node, childTagName); 
                if (child) { 
                    result[key] = this.parseNode(child, propConfig); 
                } 
            }); 
            return result; 
        } 

        return node.textContent;`,
        });

        classDeclaration.addMethod({
            name: 'collectArrayNodes',
            isStatic: true,
            scope: Scope.Private,
            parameters: [{ name: 'node', type: 'Element' }],
            returnType: 'ChildNode[]',
            statements: `
        const nodes = Array.from(node.childNodes);
        return nodes.filter(child => {
            if (child.nodeType === 1) return true; // Element
            if (child.nodeType === 3 || child.nodeType === 4) {
                return (child.textContent || '').trim().length > 0;
            }
            return false;
        });`,
        });

        classDeclaration.addMethod({
            name: 'parseArrayNode',
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: 'node', type: 'ChildNode' },
                { name: 'config', type: 'XmlPropertyConfig' },
            ],
            returnType: 'any',
            statements: `
        if (node.nodeType === 3 || node.nodeType === 4) { 
            return node.textContent ?? ''; 
        } 
        return this.parseNode(node as Element, config);`,
        });

        classDeclaration.addMethod({
            name: 'nodeMatchesName',
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: 'node', type: 'Element' },
                { name: 'name', type: 'string' },
            ],
            returnType: 'boolean',
            statements: `
        const local = node.tagName.split(':').pop() || node.tagName; 
        return local === name || node.tagName === name;`,
        });

        classDeclaration.addMethod({
            name: 'findChild',
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: 'parent', type: 'Element' },
                { name: 'tagName', type: 'string' },
            ],
            returnType: 'Element | undefined',
            statements: `
        const children = parent.children; 
        for (let i = 0; i < children.length; i++) { 
            if (this.nodeMatchesName(children[i], tagName)) { 
                return children[i]; 
            } 
        } 
        return undefined;`,
        });

        sourceFile.formatText();
    }
}
