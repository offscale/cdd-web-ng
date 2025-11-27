import * as path from 'node:path';
import { Project, Scope } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../core/constants.js';

export class XmlBuilderGenerator {
    constructor(private project: Project) {}

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, 'utils');
        const filePath = path.join(utilsDir, 'xml-builder.ts');

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
            ],
        });

        const classDeclaration = sourceFile.addClass({
            name: 'XmlBuilder',
            isExported: true,
            docs: ['Utility to serialize objects to XML based on OpenAPI metadata.'],
        });

        classDeclaration.addMethod({
            name: 'serialize',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'data', type: 'any' },
                { name: 'rootTag', type: 'string' },
                { name: 'config', type: 'XmlPropertyConfig', hasQuestionToken: true },
            ],
            returnType: 'string',
            docs: ['Serializes a data object into an XML string.'],
            statements: `
    if (data === undefined) return ''; 
    // Null is passed through to be handled as xsi:nil="true" if it is an element
    return this.buildElement(rootTag, data, config || {}); 
            `,
        });

        classDeclaration.addMethod({
            name: 'buildElement',
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: 'tagName', type: 'string' },
                { name: 'data', type: 'any' },
                { name: 'config', type: 'XmlPropertyConfig' },
            ],
            returnType: 'string',
            statements: `
    // 1. Resolve Name and Prefix
    let name = config.name || tagName; 
    if (config.prefix) { 
        name = \`\${config.prefix}:\${name}\`; 
    } 

    const nodeType = config.nodeType; 
    const isNone = nodeType === 'none'; 

    // 2. Handle Null Value (OAS 3.2 / Appendix G)
    if (data === null) {
        // "Implementations SHOULD handle null values for elements by producing an empty element with xsi:nil='true'."
        // Default nodeType is 'element'
        if (nodeType === 'element' || nodeType === undefined) {
             let attrs = ' xsi:nil="true"';
             // Ensure xsi namespace is available for the nil attribute
             attrs += ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"';
             
             if (config.namespace) { 
                 attrs += config.prefix 
                    ? \` xmlns:\${config.prefix}="\${config.namespace}"\` 
                    : \` xmlns="\${config.namespace}"\`; 
             }
             return \`<\${name}\${attrs} />\`;
        }
        // For attributes, "omit the attribute". For text/cdata, implementation defined (omit empty).
        return '';
    }

    // 3. Handle Arrays
    if (Array.isArray(data)) { 
        const itemConfig = config.items || {}; 
        const isWrapped = config.wrapped || nodeType === 'element'; 

        if (isWrapped && !isNone) { 
             const itemTagName = itemConfig.name || 'item'; 
             const inner = data.map(item => this.buildElement(itemTagName, item, itemConfig)).join(''); 
             let wrapperAttrs = ''; 
             if (config.namespace) { 
                 wrapperAttrs = config.prefix 
                    ? \` xmlns:\${config.prefix}="\${config.namespace}"\` 
                    : \` xmlns="\${config.namespace}"\`; 
             } 
             return \`<\${name}\${wrapperAttrs}>\${inner}</\${name}>\`; 
        } else { 
             return data.map(item => this.buildElement(name, item, itemConfig)).join(''); 
        } 
    } 
    
    // 4. Handle Objects
    if (typeof data === 'object' && !(data instanceof Date)) { 
        let attrs = ''; 
        if (config.namespace) { 
            if (config.prefix) { 
               attrs += \` xmlns:\${config.prefix}="\${config.namespace}"\`; 
            } else { 
               attrs += \` xmlns="\${config.namespace}"\`; 
            } 
        } 

        let children = ''; 
        let textContent = ''; 
        
        Object.keys(data).forEach(key => { 
            const val = data[key]; 
            if (val === undefined) return; 
            
            const propConfig = config.properties?.[key] || {}; 
            const propNodeType = propConfig.nodeType; 
            
            // OAS 3.2 Null Attribute Handling matches "Omit the attribute"
            if (propConfig.attribute || propNodeType === 'attribute') { 
                if (val === null) return; // Skip
                let attrName = propConfig.name || key; 
                if (propConfig.prefix) attrName = \`\${propConfig.prefix}:\${attrName}\`; 
                attrs += \` \${attrName}="\${this.escapeAttribute(String(val))}"\`; 
            } else if (propNodeType === 'text') { 
                if (val === null) return; // Skip
                textContent += this.escapeText(String(val)); 
            } else if (propNodeType === 'cdata') { 
                if (val === null) return; // Skip
                textContent += \`<![CDATA[\${val}]]>\`; 
            } else { 
                // Element recursion (handles null inside)
                children += this.buildElement(key, val, propConfig); 
            } 
        }); 
        
        if (isNone) { 
            return \`\${textContent}\${children}\`; 
        } 
        return \`<\${name}\${attrs}>\${textContent}\${children}</\${name}>\`; 
    } 
    
    // 5. Handle Primitives (Non-null)
    const rawValue = String(data); 
    
    if (nodeType === 'text') return this.escapeText(rawValue); 
    if (nodeType === 'cdata') return \`<![CDATA[\${rawValue}]]>\`; 
    if (isNone) return this.escapeText(rawValue); 

    let primAttrs = ''; 
    if (config.namespace) { 
        primAttrs = config.prefix 
            ? \` xmlns:\${config.prefix}="\${config.namespace}"\` 
            : \` xmlns="\${config.namespace}"\`; 
    } 

    return \`<\${name}\${primAttrs}>\${this.escapeText(rawValue)}</\${name}>\`; 
            `,
        });

        classDeclaration.addMethod({
            name: 'escapeText',
            isStatic: true,
            scope: Scope.Private,
            parameters: [{ name: 'unsafe', type: 'string' }],
            returnType: 'string',
            statements: `return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");`,
        });

        classDeclaration.addMethod({
            name: 'escapeAttribute',
            isStatic: true,
            scope: Scope.Private,
            parameters: [{ name: 'unsafe', type: 'string' }],
            returnType: 'string',
            statements: `return this.escapeText(unsafe).replace(/"/g, "&quot;").replace(/'/g, "&apos;");`,
        });

        sourceFile.formatText();
    }
}
