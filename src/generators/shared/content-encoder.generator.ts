import * as path from 'node:path';
import { Project, Scope } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../core/constants.js';

export class ContentEncoderGenerator {
    constructor(private project: Project) {}

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, 'utils');
        const filePath = path.join(utilsDir, 'content-encoder.ts');

        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addInterface({
            name: 'ContentEncoderConfig',
            isExported: true,
            properties: [
                { name: 'encode', type: 'boolean', hasQuestionToken: true, docs: ['If true, stringify the value.'] },
                {
                    name: 'contentEncoding',
                    type: "'base64' | 'base64url' | string",
                    hasQuestionToken: true,
                    docs: ['If set, encodes the value using base64 or base64url (OAS contentEncoding).'],
                },
                { name: 'properties', type: 'Record<string, ContentEncoderConfig>', hasQuestionToken: true },
                { name: 'items', type: 'ContentEncoderConfig', hasQuestionToken: true },
            ],
        });

        const classDeclaration = sourceFile.addClass({
            name: 'ContentEncoder',
            isExported: true,
            docs: [
                'Utility to auto-encode content into strings (e.g. JSON.stringify) based on OAS 3.1 contentMediaType.',
            ],
        });

        classDeclaration.addMethod({
            name: 'stringToBytes',
            isStatic: true,
            scope: Scope.Private,
            parameters: [{ name: 'input', type: 'string' }],
            returnType: 'Uint8Array',
            statements: `
        if (typeof TextEncoder !== 'undefined') {
            return new TextEncoder().encode(input);
        }
        if (typeof Buffer !== 'undefined') {
            return Uint8Array.from(Buffer.from(input, 'utf-8'));
        }
        const out = new Uint8Array(input.length);
        for (let i = 0; i < input.length; i++) {
            out[i] = input.charCodeAt(i);
        }
        return out;`,
        });

        classDeclaration.addMethod({
            name: 'bytesToBase64',
            isStatic: true,
            scope: Scope.Private,
            parameters: [{ name: 'bytes', type: 'Uint8Array' }],
            returnType: 'string',
            statements: `
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(bytes).toString('base64');
        }
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);`,
        });

        classDeclaration.addMethod({
            name: 'applyContentEncoding',
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: 'value', type: 'any' },
                { name: 'encoding', type: 'string' },
            ],
            returnType: 'any',
            docs: ['Applies base64/base64url encoding to string or binary values.'],
            statements: `
        if (value === null || value === undefined) return value;

        const normalized = String(encoding || '').toLowerCase();
        const urlSafe = normalized === 'base64url';
        if (normalized !== 'base64' && normalized !== 'base64url') return value;

        let bytes: Uint8Array | null = null;
        if (value instanceof Uint8Array) {
            bytes = value;
        } else if (value instanceof ArrayBuffer) {
            bytes = new Uint8Array(value);
        } else if (typeof value === 'string') {
            bytes = this.stringToBytes(value);
        } else {
            return value;
        }

        let encoded = this.bytesToBase64(bytes);
        if (urlSafe) {
            encoded = encoded.replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
        }
        return encoded;`,
        });

        classDeclaration.addMethod({
            name: 'encode',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'data', type: 'any' },
                { name: 'config', type: 'ContentEncoderConfig', hasQuestionToken: true },
            ],
            returnType: 'any',
            statements: `
        if (data === null || data === undefined || !config) { 
            return data; 
        } 

        // 1. Auto-encode to string
        let current = data;
        if (config.encode && typeof current !== 'string') { 
            try { 
                current = JSON.stringify(current);
            } catch (e) { 
                console.warn('Failed to encode content', e); 
            } 
        }

        if (config.contentEncoding) {
            const encoded = this.applyContentEncoding(current, config.contentEncoding);
            if (typeof encoded === 'string') {
                return encoded;
            }
        }

        if (config.encode && typeof current === 'string') {
            return current;
        }

        // 2. Arrays
        if (Array.isArray(current) && config.items) { 
            return current.map(item => this.encode(item, config.items)); 
        } 

        // 3. Objects
        if (typeof current === 'object') { 
            if (config.properties) { 
                // Shallow copy to avoid mutating original data if used elsewhere
                const result = { ...current }; 
                Object.keys(config.properties).forEach(key => { 
                    if (Object.prototype.hasOwnProperty.call(current, key)) { 
                        result[key] = this.encode((current as any)[key], config.properties![key]); 
                    } 
                }); 
                return result; 
            } 
        } 

        return current;`,
        });

        sourceFile.formatText();
    }
}
