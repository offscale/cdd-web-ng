import * as path from 'node:path';
import { Project, Scope } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';

export class ContentDecoderGenerator {
    /* v8 ignore next */
    constructor(private project: Project) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const utilsDir = path.join(outputDir, 'utils');
        /* v8 ignore next */
        const filePath = path.join(utilsDir, 'content-decoder.ts');

        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        // Add XmlParser import for XML decoding support
        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: './xml-parser',
            namedImports: ['XmlParser'],
        });

        /* v8 ignore next */
        sourceFile.addInterface({
            name: 'ContentDecoderConfig',
            isExported: true,
            properties: [
                {
                    name: 'decode',
                    type: "'json' | 'xml' | boolean",
                    hasQuestionToken: true,
                    docs: ["If set, parse the string value. 'xml' uses XmlParser, 'json' or true uses JSON.parse."],
                },
                {
                    name: 'contentEncoding',
                    type: "'base64' | 'base64url' | string",
                    hasQuestionToken: true,
                    docs: ['If set, decodes base64/base64url strings to Uint8Array or string for parsing.'],
                },
                {
                    name: 'xmlConfig',
                    type: 'string | number | boolean | object | undefined | null',
                    hasQuestionToken: true,
                    docs: ["Configuration for XmlParser when decode is 'xml'."],
                },
                { name: 'properties', type: 'Record<string, ContentDecoderConfig>', hasQuestionToken: true },
                { name: 'items', type: 'ContentDecoderConfig', hasQuestionToken: true },
            ],
        });

        /* v8 ignore next */
        const classDeclaration = sourceFile.addClass({
            name: 'ContentDecoder',
            isExported: true,
            docs: [
                'Utility to auto-decode encoded content strings (e.g. JSON or XML embedded in string) based on OAS 3.1 contentSchema.',
            ],
        });

        /* v8 ignore next */
        classDeclaration.addMethod({
            name: 'base64ToBytes',
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: 'input', type: 'string' },
                { name: 'urlSafe', type: 'boolean', hasQuestionToken: true },
            ],
            returnType: 'Uint8Array',
            statements: `
        let normalized = input;
        if (urlSafe) {
            normalized = normalized.replace(/-/g, '+').replace(/_/g, '/');
            const pad = normalized.length % 4;
            if (pad === 2) normalized += '==';
            else if (pad === 3) normalized += '=';
        }

        if (typeof (globalThis as string | number | boolean | object | undefined | null).Buffer !== 'undefined') {
            return Uint8Array.from((globalThis as string | number | boolean | object | undefined | null).Buffer.from(normalized, 'base64'));
        }
        const binary = atob(normalized);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;`,
        });

        /* v8 ignore next */
        classDeclaration.addMethod({
            name: 'bytesToString',
            isStatic: true,
            scope: Scope.Private,
            parameters: [{ name: 'bytes', type: 'Uint8Array' }],
            returnType: 'string',
            statements: `
        if (typeof TextDecoder !== 'undefined') {
            return new TextDecoder().decode(bytes);
        }
        if (typeof (globalThis as string | number | boolean | object | undefined | null).Buffer !== 'undefined') {
            return (globalThis as string | number | boolean | object | undefined | null).Buffer.from(bytes).toString('utf-8');
        }
        let result = '';
        for (let i = 0; i < bytes.length; i++) {
            result += String.fromCharCode(bytes[i]);
        }
        return result;`,
        });

        /* v8 ignore next */
        classDeclaration.addMethod({
            name: 'decode',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'data', type: 'string | number | boolean | object | undefined | null' },
                { name: 'config', type: 'ContentDecoderConfig', hasQuestionToken: true },
            ],
            returnType: 'string | number | boolean | object | undefined | null',
            statements: `
        if (data === null || data === undefined || !config) {
            return data;
        }

        let current = data;
        if (config.contentEncoding && typeof current === 'string') {
            const urlSafe = String(config.contentEncoding).toLowerCase() === 'base64url';
            const bytes = this.base64ToBytes(current, urlSafe);
            if (config.decode) {
                current = this.bytesToString(bytes);
            } else {
                return bytes;
            }
        }

        // 1. Auto-decode string
        if (config.decode && typeof current === 'string') {
            try {
                if (config.decode === 'xml') {
                    // Use XmlParser for XML content
                    return XmlParser.parse(current, config.xmlConfig || {});
                }

                // Default to JSON parsing
                const parsed = JSON.parse(current);
                // If parsed, we might need to recurse into the parsed structure if deeper config exists
                // (though typically contentSchema is a boundary condition).
                // If properties/items exist in config, apply them to the parsed result.
                if (config.properties || config.items) {
                    return this.decode(parsed, { ...config, decode: false });
                }
                return parsed;
            } catch (e) {
                console.warn('Failed to decode contentSchema string', e);
                return current;
            }
        }

        // 2. Arrays
        if (Array.isArray(current) && config.items) {
            return current.map(item => this.decode(item, config.items));
        }

        // 3. Objects
        if (typeof current === 'object') {
            if (config.properties) {
                const result = { ...current };
                Object.keys(config.properties).forEach(key => {
                    if (Object.prototype.hasOwnProperty.call(current, key)) {
                        result[key] = this.decode((current as string | number | boolean | object | undefined | null)[key], config.properties![key]);
                    }
                });
                return result;
            }
        }

        return current;`,
        });

        /* v8 ignore next */
        sourceFile.formatText();
    }
}
