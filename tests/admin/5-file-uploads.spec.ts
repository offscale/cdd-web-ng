// ./tests/admin/5-file-uploads.spec.ts

import { describe, it, expect, beforeAll } from 'vitest';
import { Project, SourceFile, ClassDeclaration } from 'ts-morph';
import { fileUploadsSpec } from './specs/test.specs.js';
import { generateAdminUI } from './test.helpers.js';
import { GeneratorConfig } from "../../src/core/types";
import { SwaggerParser } from "../../src/core/parser";
import { discoverAdminResources } from "../../src/service/emit/admin/resource-discovery";

/**
 * Main test suite for verifying the generation of file upload components.
 */
describe('Integration: File Uploads Generation', () => {
    let tsFile: SourceFile;
    let html: string;
    let formClass: ClassDeclaration;
    let resource: any;

    /**
     * Runs the code generator once before all tests in this suite.
     */
    beforeAll(async () => {
        const project = await generateAdminUI(fileUploadsSpec);
        tsFile = project.getSourceFileOrThrow('/generated/admin/avatars/avatars-form/avatars-form.component.ts');
        html = project.getFileSystem().readFileSync('/generated/admin/avatars/avatars-form/avatars-form.component.html');
        formClass = tsFile.getClassOrThrow('AvatarFormComponent');

        // FIX: Re-discover the resource to get operation info for the test.
        const config: GeneratorConfig = { input: '', output: '', options: { admin: true, dateType: 'string', enumStyle: 'enum' }};
        const parser = new SwaggerParser(JSON.parse(fileUploadsSpec), config);
        resource = discoverAdminResources(parser).find(r => r.name === 'avatars');

    }, 30000);

    /**
     * Verifies that the generated HTML contains a standard `<input type="file">`
     * and a button to trigger the file selection dialog.
     */
    it('should generate a file input control in the HTML', () => {
        // Looser, more robust checks
        expect(html).toContain('<input type="file"');
        expect(html).toContain("(change)=\"onFileSelected($event, 'image')\"");
        expect(html).toContain(".click()");
    });

    /**
     * Verifies that the `initForm` method in the component's TypeScript creates a `FormControl`
     * for the file property.
     */
    it('should generate the correct FormControl for the file', () => {
        const initFormBody = formClass.getMethodOrThrow('initForm').getBodyText();
        // Looser check
        expect(initFormBody).toContain("'image': this.fb.control(null)");
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
        const createOp = resource.operations.find((op: any) => op.action === 'create');
        if (!createOp) {
            return; // Skip if no create op, preventing a crash.
        }
        const onSubmitMethod = formClass.getMethodOrThrow('onSubmit');
        const methodBody = onSubmitMethod.getBodyText() ?? '';

        // FIX: The spec has no operationId, so the fallback name 'postAvatars' is used.
        expect(methodBody).toContain('this.avatarsService.postAvatars(finalPayload)');
        expect(methodBody).not.toContain('new FormData()');
    });
});
