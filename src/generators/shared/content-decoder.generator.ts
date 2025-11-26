import * as path from "node:path";
import { Project, Scope } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../core/constants.js";

export class ContentDecoderGenerator {
    constructor(private project: Project) {
    }

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, "utils");
        const filePath = path.join(utilsDir, "content-decoder.ts");

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        // Add XmlParser import for XML decoding support
        sourceFile.addImportDeclaration({
            moduleSpecifier: "./xml-parser",
            namedImports: ["XmlParser"]
        });

        sourceFile.addInterface({
            name: "ContentDecoderConfig",
            isExported: true,
            properties: [
                {
                    name: "decode",
                    type: "'json' | 'xml' | boolean",
                    hasQuestionToken: true,
                    docs: ["If set, parse the string value. 'xml' uses XmlParser, 'json' or true uses JSON.parse."]
                },
                {
                    name: "xmlConfig",
                    type: "any",
                    hasQuestionToken: true,
                    docs: ["Configuration for XmlParser when decode is 'xml'."]
                },
                { name: "properties", type: "Record<string, ContentDecoderConfig>", hasQuestionToken: true },
                { name: "items", type: "ContentDecoderConfig", hasQuestionToken: true }
            ]
        });

        const classDeclaration = sourceFile.addClass({
            name: "ContentDecoder",
            isExported: true,
            docs: ["Utility to auto-decode encoded content strings (e.g. JSON or XML embedded in string) based on OAS 3.1 contentSchema."],
        });

        classDeclaration.addMethod({
            name: "decode",
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: "data", type: "any" },
                { name: "config", type: "ContentDecoderConfig", hasQuestionToken: true }
            ],
            returnType: "any",
            statements: `
        if (data === null || data === undefined || !config) {
            return data;
        }

        // 1. Auto-decode string
        if (config.decode && typeof data === 'string') {
            try {
                if (config.decode === 'xml') {
                    // Use XmlParser for XML content
                    return XmlParser.parse(data, config.xmlConfig || {});
                }

                // Default to JSON parsing
                const parsed = JSON.parse(data);
                // If parsed, we might need to recurse into the parsed structure if deeper config exists
                // (though typically contentSchema is a boundary condition).
                // If properties/items exist in config, apply them to the parsed result.
                if (config.properties || config.items) {
                    return this.decode(parsed, { ...config, decode: false });
                }
                return parsed;
            } catch (e) {
                console.warn('Failed to decode contentSchema string', e);
                return data;
            }
        }

        // 2. Arrays
        if (Array.isArray(data) && config.items) {
            return data.map(item => this.decode(item, config.items));
        }

        // 3. Objects
        if (typeof data === 'object') {
            if (config.properties) {
                const result = { ...data };
                Object.keys(config.properties).forEach(key => {
                    if (Object.prototype.hasOwnProperty.call(data, key)) {
                        result[key] = this.decode(data[key], config.properties![key]);
                    }
                });
                return result;
            }
        }

        return data;`
        });

        sourceFile.formatText();
    }
}
