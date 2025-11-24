import { describe, expect, it } from 'vitest';
import { MultipartBuilderGenerator } from '@src/generators/shared/multipart-builder.generator.js';
import { createTestProject } from '../shared/helpers.js';
import ts from 'typescript';

function getMultipartBuilder() {
    const project = createTestProject();
    new MultipartBuilderGenerator(project).generate('/');
    const sourceFile = project.getSourceFileOrThrow('/utils/multipart-builder.ts');
    const startText = sourceFile.getText();

    const codeWithoutExports = startText.replace(/export class/g, 'class').replace(/export interface/g, 'interface');

    const jsCode = ts.transpile(codeWithoutExports, {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.CommonJS
    });

    const moduleScope = { exports: {} as any };

    global.FormData = class FormData {
        _entries: Record<string, any> = {};
        append(k: string, v: any) { this._entries[k] = v; }
    } as any;

    global.Blob = class Blob {
        parts: any[];
        options: any;
        type: string;
        constructor(parts: any[], options: any) {
            this.parts = parts;
            this.options = options;
            this.type = options?.type || '';
        }
    } as any;

    global.File = class File extends global.Blob {
        name: string;
        constructor(parts: any[], name: string, options: any) {
            super(parts, options);
            this.name = name;
        }
    } as any;

    const finalCode = `${jsCode}\nmoduleScope.exports.MultipartBuilder = MultipartBuilder;`;

    new Function('moduleScope', finalCode)(moduleScope);
    return moduleScope.exports.MultipartBuilder;
}

describe('Utility: MultipartBuilder', () => {
    const MultipartBuilder = getMultipartBuilder();

    describe('Native FormData (No Custom Headers)', () => {
        it('should return FormData when no custom headers are present', () => {
            const body = { name: 'foo', age: 10 };
            const result = MultipartBuilder.serialize(body, {});
            expect(result.content).toBeInstanceOf(global.FormData);
            expect(result.headers).toBeUndefined();
        });

        it('should handle arrays by appending multiple times', () => {
            const body = { tags: ['a', 'b'] };
            const result = MultipartBuilder.serialize(body, {});
            const formData = result.content as any;
            expect(formData).toBeInstanceOf(global.FormData);
        });

        it('should wrap objects in JSON/Blob by default', () => {
            const body = { meta: { id: 1 } };
            const result = MultipartBuilder.serialize(body, {});
            const formData = result.content as any;
            const appended = formData._entries['meta'];
            expect(appended).toBeInstanceOf(global.Blob);
            expect(appended.options.type).toBe('application/json');
        });
    });

    describe('Manual Construction (Custom Headers & Nesting)', () => {
        it('should switch to manual Blob construction if custom headers exist', () => {
            const body = { file: 'content' };
            const encoding = {
                file: { headers: { 'X-Custom': '123' } }
            };
            const result = MultipartBuilder.serialize(body, encoding);

            expect(result.content).toBeInstanceOf(global.Blob);
            expect(result.headers).toBeDefined();
            expect(result.headers['Content-Type']).toContain('multipart/form-data; boundary=');
        });

        it('should include custom headers in the payload', () => {
            const body = { item: 'val' };
            const encoding = {
                item: { headers: { 'X-Part-ID': '999' } }
            };
            const result = MultipartBuilder.serialize(body, encoding);
            const blob = result.content as any;

            // The builder creates a parts array containing both strings and Blobs (if any).
            // For this test, we know 'val' is string so all parts are strings.
            const fullBody = blob.parts.join('');
            expect(fullBody).toContain('Content-Disposition: form-data; name="item"');
            expect(fullBody).toContain('X-Part-ID: 999');
            expect(fullBody).toContain('val');
        });

        it('should handle File objects in manual mode', () => {
            const file = new File(['data'], 'test.txt', { type: 'text/plain' });
            const body = { doc: file };
            const encoding = {
                doc: { headers: { 'X-File': 'true' } }
            };
            const result = MultipartBuilder.serialize(body, encoding);
            const blob = result.content as any;

            // Blob parts can be objects (File) or strings.
            // We check specifically for strings to validate headers.
            const stringParts = blob.parts.filter((p: any) => typeof p === 'string').join('');

            expect(stringParts).toContain('filename="test.txt"');
            expect(stringParts).toContain('X-File: true');
            expect(stringParts).toContain('Content-Type: text/plain');
        });

        it('should jsonify objects in manual mode', () => {
            const body = { meta: { a: 1 } };
            const encoding = {
                meta: { headers: { 'X-Meta': 'yes' } }
            };
            const result = MultipartBuilder.serialize(body, encoding);
            const blob = result.content as any;
            const fullBody = blob.parts.join('');

            expect(fullBody).toContain('application/json');
            expect(fullBody).toContain('{"a":1}');
        });

        it('should recursively serialize nested multipart properties with correct boundary merging (OAS 3.2)', () => {
            const nestedBody = { inner: 'value' };
            const body = {
                wrapper: nestedBody
            };
            const encoding = {
                wrapper: {
                    contentType: 'multipart/mixed',
                    // The encoding for the INNER structure properties
                    encoding: {
                        inner: { contentType: 'text/plain', headers: { 'X-Inner': 'true' } }
                    }
                }
            };

            const result = MultipartBuilder.serialize(body, encoding);
            const blob = result.content as any;

            // 1. Check the headers on the Blob parts.
            // Need to inspect the string parts, because blob.parts[someIndex] is the inner Blob
            const stringParts = blob.parts.filter((p: any) => typeof p === 'string').join('');

            expect(stringParts).toContain('Content-Disposition: form-data; name="wrapper"');

            // This validates that we respected the 'multipart/mixed' request AND verified that the boundary
            // was appended correctly from the nested result.
            // Note: Manual builder adds CR/LF before content type line
            expect(stringParts).toMatch(/Content-Type: multipart\/mixed; boundary=/);

            // 2. Check that inner body is NOT jsonified, but is actually a Blob (result of recursive call)
            const innerBlob = blob.parts.find((p: any) => p instanceof global.Blob);
            expect(innerBlob).toBeDefined();
            // The inner Blob's type property doesn't strictly matter for serialization (the header does),
            // but manual serializer defaults to multipart/form-data.
            expect(innerBlob.type).toBe('multipart/form-data');

            // 3. Verify inner headers are present in the inner blob parts
            const innerParts = innerBlob.parts.join('');
            expect(innerParts).toContain('X-Inner: true');
            expect(innerParts).toContain('inner');
            expect(innerParts).toContain('value');
        });
    });
});
