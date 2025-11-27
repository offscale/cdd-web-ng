import * as path from 'node:path';
import { Project, Scope } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../core/constants.js';

/**
 * Generates the `utils/multipart-builder.ts` file.
 * Pure TS class to build multipart/form-data and multipart/mixed payloads using Browser APIs (FormData/Blob).
 */
export class MultipartBuilderGenerator {
    constructor(private project: Project) {}

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, 'utils');
        const filePath = path.join(utilsDir, 'multipart-builder.ts');

        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addInterface({
            name: 'EncodingConfig',
            isExported: true,
            properties: [
                { name: 'contentType', type: 'string', hasQuestionToken: true },
                { name: 'headers', type: 'Record<string, string>', hasQuestionToken: true },
                { name: 'style', type: 'string', hasQuestionToken: true },
                { name: 'explode', type: 'boolean', hasQuestionToken: true },
                { name: 'encoding', type: 'Record<string, EncodingConfig>', hasQuestionToken: true },
            ],
        });

        // OAS 3.2 Multipart Configuration
        sourceFile.addInterface({
            name: 'MultipartConfig',
            isExported: true,
            properties: [
                { name: 'mediaType', type: 'string', hasQuestionToken: true },
                { name: 'encoding', type: 'Record<string, EncodingConfig>', hasQuestionToken: true },
                { name: 'prefixEncoding', type: 'EncodingConfig[]', hasQuestionToken: true },
                { name: 'itemEncoding', type: 'EncodingConfig', hasQuestionToken: true },
            ],
        });

        sourceFile.addInterface({
            name: 'MultipartResult',
            isExported: true,
            properties: [
                { name: 'content', type: 'FormData | Blob' },
                { name: 'headers', type: 'Record<string, string>', hasQuestionToken: true },
            ],
        });

        const classDeclaration = sourceFile.addClass({
            name: 'MultipartBuilder',
            isExported: true,
            docs: [
                'Utility to build multipart payloads (form-data, mixed, byteranges) with support for OAS 3.2 Array bodies.',
            ],
        });

        classDeclaration.addMethod({
            name: 'serialize',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'body', type: 'any' },
                // Supports both Legacy Map (Record) and New Config Object
                {
                    name: 'configInput',
                    type: 'MultipartConfig | Record<string, EncodingConfig>',
                    hasQuestionToken: true,
                    initializer: '{}',
                },
            ],
            returnType: 'MultipartResult',
            statements: `
        if (body === null || body === undefined) {
            return { content: new FormData() };
        }

        // Normalization: Unify input into MultipartConfig structure
        // Using type guard-like check to detect if input is a config object or a legacy map
        const isConfigObject = configInput && 
            ('encoding' in configInput || 'prefixEncoding' in configInput || 'itemEncoding' in configInput || 'mediaType' in configInput);
            
        const config: MultipartConfig = isConfigObject 
            ? (configInput as MultipartConfig) 
            : { encoding: configInput as Record<string, EncodingConfig> };

        if (Array.isArray(body)) {
            // OAS 3.2: Arrays imply positional parts (often multipart/mixed) or simply multiple values without keys.
            // standard FormData cannot represent this without keys, so we default to Manual Blob construction.
            return this.serializeArrayManual(body, config);
        }

        // Check if we can use native FormData or need Manual Blob
        const encodingMap = config.encoding || {};
        const requiresManual = !!config.mediaType || Object.values(encodingMap).some(c => 
            (!!c.headers && Object.keys(c.headers).length > 0) || 
            (!!c.contentType && c.contentType.startsWith('multipart/'))
        );

        if (requiresManual) {
            return this.serializeObjectManual(body, config);
        }

        return this.serializeNative(body, encodingMap);`,
        });

        classDeclaration.addMethod({
            name: 'serializeNative',
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: 'body', type: 'any' },
                { name: 'encodings', type: 'Record<string, EncodingConfig>' },
            ],
            returnType: 'MultipartResult',
            statements: `
        const formData = new FormData();

        Object.entries(body).forEach(([key, value]) => {
            if (value === undefined || value === null) return;

            const config = encodings[key] || {};
            const contentType = config.contentType;

            if (Array.isArray(value)) {
                value.forEach(v => this.appendFormData(formData, key, v, contentType));
            } else {
                this.appendFormData(formData, key, value, contentType);
            }
        });

        return { content: formData };`,
        });

        classDeclaration.addMethod({
            name: 'appendFormData',
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: 'formData', type: 'FormData' },
                { name: 'key', type: 'string' },
                { name: 'value', type: 'any' },
                { name: 'contentType', type: 'string', hasQuestionToken: true },
            ],
            statements: `
        if (value instanceof Blob || value instanceof File) {
            if (value instanceof File) {
                formData.append(key, value, value.name);
            } else {
                formData.append(key, value);
            }
        } else if (contentType === 'application/json' || typeof value === 'object') {
            const blob = new Blob([JSON.stringify(value)], { type: 'application/json' });
            formData.append(key, blob);
        } else {
            formData.append(key, String(value));
        }`,
        });

        classDeclaration.addMethod({
            name: 'serializeObjectManual',
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: 'body', type: 'any' },
                { name: 'config', type: 'MultipartConfig' },
            ],
            returnType: 'MultipartResult',
            statements: `
        const boundary = this.generateBoundary();
        const parts: (string | Blob)[] = [];
        const crlf = '\\r\\n';
        
        const encodings = config.encoding || {};

        Object.entries(body).forEach(([key, value]) => {
            if (value === undefined || value === null) return;

            const values = Array.isArray(value) ? value : [value];
            const itemConfig = encodings[key] || {};

            values.forEach(v => {
                // For Object-based multipart, Content-Disposition is required with a name
                const disp = \`Content-Disposition: form-data; name="\${key}"\`;
                this.appendPart(parts, v, itemConfig, boundary, disp);
            });
        });

        parts.push('--' + boundary + '--' + crlf);

        const mediaType = config.mediaType || 'multipart/form-data';
        const blob = new Blob(parts, { type: mediaType });
        
        return { 
            content: blob, 
            headers: { 'Content-Type': \`\${mediaType}; boundary=\${boundary}\` } 
        };`,
        });

        classDeclaration.addMethod({
            name: 'serializeArrayManual',
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: 'body', type: 'any[]' },
                { name: 'config', type: 'MultipartConfig' },
            ],
            returnType: 'MultipartResult',
            statements: `
        const boundary = this.generateBoundary();
        const parts: (string | Blob)[] = [];
        const crlf = '\\r\\n';

        body.forEach((item, index) => {
            if (item === undefined || item === null) return;

            // Determine config: prefixEncoding position matches index, fallback to itemEncoding
            let itemConfig: EncodingConfig = {};
            if (config.prefixEncoding && index < config.prefixEncoding.length) {
                itemConfig = config.prefixEncoding[index];
            } else if (config.itemEncoding) {
                itemConfig = config.itemEncoding;
            }

            // For Array-based multipart (mixed), Content-Disposition is usually NOT sent, or sent without name.
            this.appendPart(parts, item, itemConfig, boundary, undefined);
        });

        parts.push('--' + boundary + '--' + crlf);

        // Default to multipart/mixed for arrays unless specified
        const forcedType = config.mediaType || 'multipart/mixed';

        const blob = new Blob(parts, { type: forcedType });
        
        return { 
            content: blob, 
            headers: { 'Content-Type': \`\${forcedType}; boundary=\${boundary}\` } 
        };`,
        });

        // Helper method to reduce duplication between Object and Array handling
        classDeclaration.addMethod({
            name: 'appendPart',
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: 'parts', type: '(string | Blob)[]' },
                { name: 'value', type: 'any' },
                { name: 'config', type: 'EncodingConfig' },
                { name: 'boundary', type: 'string' },
                { name: 'defaultDisposition', type: 'string', hasQuestionToken: true },
            ],
            statements: `
        const crlf = '\\r\\n';
        let headersStr = '';

        // 1. Content-Disposition
        // Check if headers overrides it
        let disposition = defaultDisposition;
        
        if (value instanceof File && disposition) {
            disposition += \`; filename="\${value.name}"\`;
        } else if (value instanceof Blob && disposition) {
            disposition += \`; filename="blob"\`;
        }

        if (config.headers) {
            Object.entries(config.headers).forEach(([hKey, hVal]) => {
                if (hKey.toLowerCase() === 'content-disposition') {
                    disposition = hVal; // Override
                } else {
                    headersStr += \`\${hKey}: \${hVal}\${crlf}\`;
                }
            });
        }

        if (disposition) {
            headersStr = \`Content-Disposition: \${disposition}\${crlf}\` + headersStr;
        }

        // 2. Content-Type
        let partContentType = config.contentType;
        if (!partContentType) {
            if (value instanceof Blob) partContentType = value.type || "application/octet-stream";
            else if (typeof value === 'object') partContentType = 'application/json';
            else partContentType = 'text/plain';
        }

        // 3. Value Serialization & Nested Multipart
        let payload: string | Blob = value;

        if (partContentType && partContentType.includes('multipart')) {
            // Recurse!
            // Check if we have nested Map-based config
            const nestedConfig = config.encoding ? { encoding: config.encoding } : {};
            
            // We simple pass the inner config we have.
            // Note: we ignore mediaType for nested, allowing default or inferred
            const nestedResult = (Array.isArray(value)) 
                ? this.serializeArrayManual(value, config as any) 
                : this.serializeObjectManual(value, config.encoding ? { encoding: config.encoding } : {});
                
            payload = nestedResult.content;
            
            // Extract boundary from nested result to set content type correctly
            if (nestedResult.headers && nestedResult.headers['Content-Type']) {
                const boundaryMatch = nestedResult.headers['Content-Type'].match(/boundary=(.+)$/);
                const nestedBoundary = boundaryMatch ? boundaryMatch[1] : null;
                
                if (nestedBoundary) {
                    if (config.contentType) {
                        const baseType = config.contentType.split(';')[0];
                        partContentType = \`\${baseType}; boundary=\${nestedBoundary}\`;
                    } else {
                        partContentType = nestedResult.headers['Content-Type'];
                    }
                }
            }
        } else if (typeof value === 'object' && !(value instanceof Blob)) {
            payload = JSON.stringify(value);
        }

        if (partContentType) {
            headersStr += \`Content-Type: \${partContentType}\${crlf}\`;
        }

        parts.push('--' + boundary + crlf + headersStr + crlf);
        parts.push(payload);
        parts.push(crlf);
            `,
        });

        classDeclaration.addMethod({
            name: 'generateBoundary',
            isStatic: true,
            scope: Scope.Private,
            returnType: 'string',
            statements: `return '----' + Math.random().toString(36).substring(2);`,
        });

        sourceFile.formatText();
    }
}
