import * as path from "node:path";
import { Project, Scope } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";

export class XmlBuilderGenerator {
    constructor(private project: Project) {
    }

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, "utils");
        const filePath = path.join(utilsDir, "xml-builder.ts");

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        // Define configuration interfaces
        sourceFile.addInterface({
            name: "XmlPropertyConfig",
            isExported: true,
            properties: [
                { name: "name", type: "string", hasQuestionToken: true }, // Override tag name
                {
                    name: "attribute",
                    type: "boolean",
                    hasQuestionToken: true,
                    docs: ["@deprecated Use nodeType: 'attribute'"]
                },
                {
                    name: "wrapped",
                    type: "boolean",
                    hasQuestionToken: true,
                    docs: ["@deprecated Use nodeType: 'element' on the array schema"]
                },
                {
                    name: "nodeType",
                    type: "'element' | 'attribute' | 'text' | 'cdata' | 'none' | string",
                    hasQuestionToken: true,
                    docs: ["OpenAPI 3.2.0 node type mapping (element, attribute, text, cdata, none)"]
                },
                { name: "properties", type: "Record<string, XmlPropertyConfig>", hasQuestionToken: true }, // Nested
                { name: "items", type: "XmlPropertyConfig", hasQuestionToken: true } // Array Items config
            ]
        });

        const classDeclaration = sourceFile.addClass({
            name: "XmlBuilder",
            isExported: true,
            docs: ["Utility to serialize objects to XML based on OpenAPI metadata."],
        });

        classDeclaration.addMethod({
            name: "serialize",
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: "data", type: "any" },
                { name: "rootTag", type: "string" },
                { name: "config", type: "XmlPropertyConfig", hasQuestionToken: true }
            ],
            returnType: "string",
            docs: ["Serializes a data object into an XML string."],
            statements: `
    if (data === null || data === undefined) return ''; 
    return this.buildElement(rootTag, data, config || {}); 
            `
        });

        // Implements correct nodeType logic including defaults
        classDeclaration.addMethod({
            name: "buildElement",
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: "tagName", type: "string" },
                { name: "data", type: "any" },
                { name: "config", type: "XmlPropertyConfig" }
            ],
            returnType: "string",
            statements: `
    const name = config.name || tagName; 
    const nodeType = config.nodeType; 

    // 1. Handle "none" (Unwrapped logic for arrays/schemas) 
    // If a schema has nodeType: 'none', it does not correspond to a node itself; 
    // its children are included directly under the parent. 
    // However, in this recursive builder, 'none' usually implies we just return the content 
    // without the wrapping tags <name>...</name>. 
    const isNone = nodeType === 'none'; 

    if (Array.isArray(data)) { 
        const itemConfig = config.items || {}; 
        // Wrapped if legacy 'wrapped' is true OR nodeType is 'element' 
        // Per OAS 3.2: Arrays default to 'none' (unwrapped) 
        const isWrapped = config.wrapped || nodeType === 'element'; 

        if (isWrapped && !isNone) { 
             // Wrapped: <Wrapper><Item>Val</Item><Item>Val</Item></Wrapper>
             // The 'name' variable acts as the wrapper tag. 
             // The items need a tag name, derived from itemConfig. 
             const itemTagName = itemConfig.name || 'item'; // default item tag if unspecified
             const inner = data.map(item => this.buildElement(itemTagName, item, itemConfig)).join(''); 
             return \`<\${name}>\${inner}</\${name}>\`; 
        } else { 
             // Unwrapped: <Name>Val</Name><Name>Val</Name> 
             // (if parent called this with 'Name', it repeats 'Name') 
             // OR if the parent is 'none', it just repeats the item elements. 
             return data.map(item => this.buildElement(name, item, itemConfig)).join(''); 
        } 
    } 
    
    if (typeof data === 'object' && data !== null && !(data instanceof Date)) { 
        let attrs = ''; 
        let children = ''; 
        let textContent = ''; 
        
        // If metadata specifies properties, use that order/config. 
        // Otherwise iterate keys. 
        const keys = Object.keys(data); 
        
        keys.forEach(key => { 
            const val = data[key]; 
            if (val === undefined || val === null) return; 
            
            const propConfig = config.properties?.[key] || {}; 
            const propNodeType = propConfig.nodeType; 
            
            if (propConfig.attribute || propNodeType === 'attribute') { 
                const attrName = propConfig.name || key; 
                attrs += \` \${attrName}="\${this.escapeAttribute(String(val))}"\`; 
            } else if (propNodeType === 'text') { 
                textContent += this.escapeText(String(val)); 
            } else if (propNodeType === 'cdata') { 
                textContent += \`<![CDATA[\${val}]]>\`; 
            } else { 
                children += this.buildElement(key, val, propConfig); 
            } 
        }); 
        
        if (isNone) { 
            return \`\${textContent}\${children}\`; 
        } 
        return \`<\${name}\${attrs}>\${textContent}\${children}</\${name}>\`; 
    } 
    
    // Primitives 
    const rawValue = String(data); 
    
    // If the primitive itself is marked as 'text' or 'cdata' (unlikely for top level, but possible in recursion) 
    if (nodeType === 'text') return this.escapeText(rawValue); 
    if (nodeType === 'cdata') return \`<![CDATA[\${rawValue}]]>\`; 
    if (isNone) return this.escapeText(rawValue); 

    return \`<\${name}>\${this.escapeText(rawValue)}</\${name}>\`; 
            `
        });

        classDeclaration.addMethod({
            name: "escapeText",
            isStatic: true,
            scope: Scope.Private,
            parameters: [{ name: "unsafe", type: "string" }],
            returnType: "string",
            statements: `return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");`
        });

        classDeclaration.addMethod({
            name: "escapeAttribute",
            isStatic: true,
            scope: Scope.Private,
            parameters: [{ name: "unsafe", type: "string" }],
            returnType: "string",
            statements: `return this.escapeText(unsafe).replace(/"/g, "&quot;").replace(/'/g, "&apos;");`
        });

        sourceFile.formatText();
    }
}
