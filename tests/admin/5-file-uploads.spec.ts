/**
 * @fileoverview
 * This test suite is dedicated to validating the generation of admin UI components for handling
 * file uploads. It specifically tests schemas where a property is defined with `type: string`
 * and `format: binary`. The tests ensure that the generator correctly produces a file input
 * element in the HTML template, a corresponding `FormControl` in the TypeScript class, and the
 * necessary helper method to handle the file selection event.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Project, IndentationText, SourceFile, ClassDeclaration } from 'ts-morph';
import { generateFromConfig } from '../../src/index.js';
import { GeneratorConfig } from '../../src/core/types.js';
import { fileUploadsSpec } from './specs/test.specs.js';

/**
 * A helper function to run the generator on a file upload-specific spec and retrieve the generated form component files.
 * @param specString The OpenAPI specification as a JSON string.
 * @returns An object containing the TypeScript SourceFile and the HTML content of the form component.
 */
async function generateAndGetFormFiles(specString: string): Promise<{ tsFile: SourceFile, html: string }> {
    const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: { indentationText: IndentationText.TwoSpaces },
    compilerOptions: {
        target: ScriptTarget.ESNext,
        module: ModuleKind.ESNext,
        moduleResolution: 99, // NodeNext
        lib: ["ES2022", "DOM"],
        strict: true,
        esModuleInterop: true,
        allowArbitraryExtensions: true, // Crucial for `.js` imports in NodeNext
        resolveJsonModule: true
    }
});

    const config: GeneratorConfig = {
        input: 'spec.json',
        output: './generated',
        options: {
            dateType: 'string',
            enumStyle: 'enum',
            generateServices: true,
            admin: true
        }
    };

    project.createSourceFile('./spec.json', specString);
    await generateFromConfig(config, project);

    const tsFile = project.getSourceFileOrThrow('generated/admin/avatars/avatars-form/avatars-form.component.ts');
    const html = project.getFileSystem().readFileSync('generated/admin/avatars/avatars-form/avatars-form.component.html');

    return { tsFile, html };
}

/**
 * Main test suite for verifying the generation of file upload components.
 */
describe('Integration: File Uploads Generation', () => {
    let tsFile: SourceFile;
    let html: string;
    let formClass: ClassDeclaration;

    /**
     * Runs the code generator once before all tests in this suite.
     */
    beforeAll(async () => {
        const result = await generateAndGetFormFiles(fileUploadsSpec);
        tsFile = result.tsFile;
        html = result.html;
        formClass = tsFile.getClassOrThrow('AvatarsFormComponent');
    });

    /**
     * Verifies that the generated HTML contains a standard `<input type="file">`
     * and a button to trigger the file selection dialog.
     */
    it('should generate a file input control in the HTML', () => {
        // Check for the hidden file input
        expect(html).toContain('<input type="file" #fileInputimage_id');
        // Check for the button that triggers the file input
        expect(html).toContain('<button mat-flat-button type="button" (click)="fileInputimage_id.click()">');
    });

    /**
     * Verifies that the `initForm` method in the component's TypeScript creates a `FormControl`
     * for the file property.
     */
    it('should generate the correct FormControl for the file', () => {
        const initFormBody = formClass.getMethodOrThrow('initForm').getBodyText();
        expect(initFormBody).toContain('image: new FormControl(null)');
    });

    /**
     * Verifies that a helper method (e.g., `onFileSelected`) is generated to handle the
     * file input's `change` event and patch the selected file into the form.
     */
    it('should generate the onFileSelected helper method', () => {
        const onFileSelectedMethod = formClass.getMethod('onFileSelected');
        expect(onFileSelectedMethod).toBeDefined();

        const methodBody = onFileSelectedMethod?.getBodyText() ?? '';
        expect(methodBody).toContain(`const file = (event.target as HTMLInputElement).files?.[0];`);
        expect(methodBody).toContain(`this.form.patchValue({ [formControlName]: file });`);
    });

    /**
     * Verifies that the `onSubmit` method does NOT contain special logic for `FormData`.
     * The generated services are expected to handle `Blob` or `File` types directly,
     * so the form component simply passes the raw form value.
     */
    it('should NOT create special FormData logic in onSubmit', () => {
        const createItemMethod = formClass.getMethodOrThrow('createItem');
        const methodBody = createItemMethod.getBodyText() ?? '';

        // It should be a direct pass-through of the form value
        expect(methodBody).toContain('this.avatarsService.createAvatar(this.form.value)');
        // It should NOT create FormData
        expect(methodBody).not.toContain('new FormData()');
    });
});
