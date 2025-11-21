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
                { name: "attribute", type: "boolean", hasQuestionToken: true }, // Render as attribute
                { name: "wrapped", type: "boolean", hasQuestionToken: true }, // For arrays: <Wrapper><Item/><Item/></Wrapper>
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
    
    if (Array.isArray(data)) {
        // Handle Array
        let itemsXml = '';
        const itemConfig = config.items || {};
        // The item name defaults to the property name in non-wrapped mode, 
        // or a generic 'item' (or specific config) if needed? 
        // In OAS, 'wrapped: false' means the field name is repeated. 
        // 'wrapped: true' means FieldName > Items.
        
        if (config.wrapped) {
             // Wrapped: <Wrapper><Item>Val</Item><Item>Val</Item></Wrapper>
             const itemTagName = itemConfig.name || 'item';
             const inner = data.map(item => this.buildElement(itemTagName, item, itemConfig)).join('');
             return \`<\${name}>\${inner}</\${name}>\`;
        } else {
             // Unwrapped: <Name>Val</Name><Name>Val</Name>
             // When unwrapped, the 'name' denotes the repeating tag.
             return data.map(item => this.buildElement(name, item, itemConfig)).join('');
        }
    }
    
    if (typeof data === 'object' && data !== null && !(data instanceof Date)) {
        // Handle Object
        let attrs = '';
        let children = '';
        
        // If metadata specifies properties, use that order/config. 
        // Otherwise iterate keys.
        const keys = Object.keys(data);
        
        keys.forEach(key => {
            const val = data[key];
            if (val === undefined || val === null) return;
            
            const propConfig = config.properties?.[key] || {};
            
            if (propConfig.attribute) {
                const attrName = propConfig.name || key;
                attrs += \` \${attrName}="\${this.escapeAttribute(String(val))}"\`;
            } else {
                children += this.buildElement(key, val, propConfig);
            }
        });
        
        return \`<\${name}\${attrs}>\${children}</\${name}>\`;
    }
    
    // Primitives
    return \`<\${name}>\${this.escapeText(String(data))}</\${name}>\`;
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
