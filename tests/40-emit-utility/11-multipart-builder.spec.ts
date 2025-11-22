import { describe, expect, it } from 'vitest';
import { MultipartBuilderGenerator } from '@src/service/emit/utility/multipart-builder.generator.js';
import { createTestProject } from '../shared/helpers.js';
import ts from 'typescript';

function getMultipartBuilder() {
    const project = createTestProject();
    new MultipartBuilderGenerator(project).generate('/');
    const sourceFile = project.getSourceFileOrThrow('/utils/multipart-builder.ts');
    const startText = sourceFile.getText();

    // Removing export keywords to evaluate in this context
    // Note: We must remove 'export' from 'export class' to make it a local declaration in the function scope
    // before assigning it to exports.
    const codeWithoutExports = startText.replace(/export class/g, 'class').replace(/export interface/g, 'interface');

    const jsCode = ts.transpile(codeWithoutExports, {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.CommonJS
    });

    const moduleScope = { exports: {} as any };

    // Mock browser globals
    global.FormData = class FormData {
        _entries: Record<string, any> = {};
        append(k: string, v: any) { this._entries[k] = v; }
    } as any;
    // Minimal Mock Blob
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

    // Evaluate the code. Since we stripped 'export', we need to manually assign the class to exports
    // or rely on the class definition being returned/available.
    // A robust way is to append the assignment to the code.
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

    describe('Manual Construction (Custom Headers)', () => {
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

            // The builder creates a parts array. We check the strings inside.
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
            const fullBody = blob.parts.join('');

            expect(fullBody).toContain('filename="test.txt"');
            expect(fullBody).toContain('X-File: true');
            expect(fullBody).toContain('Content-Type: text/plain');
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
    });
});
