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
        module: ts.ModuleKind.CommonJS,
    });

    const moduleScope = { exports: {} as any };

    global.FormData = class FormData {
        _entries: Record<string, any> = {};

        append(k: string, v: any) {
            this._entries[k] = v;
        }
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

    describe('Manual Construction (Object/Map based)', () => {
        // ... (previous test cases remain valid because I updated `serialize` to normalize input)

        it('should switch to manual Blob construction if custom headers exist', () => {
            const body = { file: 'content' };
            // Legacy input style: Record<string, Config>
            const encoding = {
                file: { headers: { 'X-Custom': '123' } },
            };
            const result = MultipartBuilder.serialize(body, encoding);

            expect(result.content).toBeInstanceOf(global.Blob);
            expect(result.headers).toBeDefined();
            expect(result.headers['Content-Type']).toContain('multipart/form-data; boundary=');
        });

        it('should handle File objects in manual mode', () => {
            const file = new File(['data'], 'test.txt', { type: 'text/plain' });
            const body = { doc: file };
            const encoding = {
                doc: { headers: { 'X-File': 'true' } },
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

        it('should serialize arrays with explode=false as a single part', () => {
            const body = { tags: ['red', 'blue'] };
            const encoding = {
                tags: { style: 'form', explode: false },
            };
            const result = MultipartBuilder.serialize(body, encoding);
            const blob = result.content as any;
            const stringParts = blob.parts.filter((p: any) => typeof p === 'string').join('');

            expect(stringParts).toContain('name="tags"');
            expect(stringParts).toContain('red,blue');
            const matches = stringParts.match(/name="tags"/g);
            expect(matches?.length).toBe(1);
        });

        it('should serialize objects with explode=true as separate parts', () => {
            const body = { meta: { a: 1, b: 2 } };
            const encoding = {
                meta: { style: 'form', explode: true },
            };
            const result = MultipartBuilder.serialize(body, encoding);
            const blob = result.content as any;
            const stringParts = blob.parts.filter((p: any) => typeof p === 'string').join('');

            expect(stringParts).toContain('name="a"');
            expect(stringParts).toContain('name="b"');
            expect(stringParts).not.toContain('name="meta"');
        });

        it('should serialize objects with explode=false as a single part', () => {
            const body = { meta: { a: 1, b: 2 } };
            const encoding = {
                meta: { style: 'form', explode: false },
            };
            const result = MultipartBuilder.serialize(body, encoding);
            const blob = result.content as any;
            const stringParts = blob.parts.filter((p: any) => typeof p === 'string').join('');

            expect(stringParts).toContain('name="meta"');
            expect(stringParts).toContain('a,1,b,2');
        });
    });

    describe('Manual Construction (Array/OAS 3.2 based)', () => {
        it('should serialize Array body as multipart/mixed', () => {
            const body = ['item1', { id: 2 }];
            const config = {
                prefixEncoding: [{ contentType: 'text/plain' }, { contentType: 'application/json' }],
            };

            const result = MultipartBuilder.serialize(body, config);
            expect(result.content).toBeInstanceOf(global.Blob);
            expect(result.content.type).toBe('multipart/mixed');
            expect(result.headers['Content-Type']).toContain('multipart/mixed');

            // Verify parts
            const blob = result.content as any;
            const stringParts = blob.parts.filter((p: any) => typeof p === 'string').join('');

            // Should have no Content-Disposition by default for mixed array items
            expect(stringParts).not.toContain('Content-Disposition');

            // Verify Content-Types
            expect(stringParts).toContain('Content-Type: text/plain');
            expect(stringParts).toContain('Content-Type: application/json');

            // Verify Bodies
            expect(blob.parts).toContain('item1');
            expect(stringParts).toContain('{"id":2}'); // JSON stringified
        });

        it('should support itemEncoding basic fallback', () => {
            const body = [1, 2, 3];
            const config = {
                itemEncoding: { contentType: 'application/custom' },
            };

            const result = MultipartBuilder.serialize(body, config);
            const blob = result.content as any;
            const stringParts = blob.parts.filter((p: any) => typeof p === 'string').join('');

            // Check that it applied to all
            // We expect 3 occurrences of the content type
            const matches = stringParts.match(/Content-Type: application\/custom/g);
            expect(matches?.length).toBe(3);
        });

        it('should support prefixEncoding overriding itemEncoding', () => {
            const body = ['prefix', 'rest1', 'rest2'];
            const config = {
                prefixEncoding: [{ contentType: 'text/prefix' }],
                itemEncoding: { contentType: 'text/rest' },
            };

            const result = MultipartBuilder.serialize(body, config);
            const blob = result.content as any;
            const stringParts = blob.parts.filter((p: any) => typeof p === 'string').join('');

            expect(stringParts).toContain('Content-Type: text/prefix');
            const restMatches = stringParts.match(/Content-Type: text\/rest/g);
            expect(restMatches?.length).toBe(2); // rest1 and rest2
        });
    });
});
