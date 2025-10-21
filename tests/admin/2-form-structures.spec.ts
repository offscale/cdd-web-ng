/**
 * @fileoverview
 * This test suite validates the generator's ability to create complex form structures in the admin UI.
 * It focuses on schemas that involve nested objects and arrays of objects. The tests ensure that
 * the generator correctly produces nested `FormGroup`s for object properties and `FormArray`s for
 * array properties, along with the corresponding HTML structures (`formGroupName`, `formArrayName`)
 * and necessary helper methods in the component's TypeScript file for managing the `FormArray`.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Project, IndentationText, SourceFile } from 'ts-morph';
import { generateFromConfig } from '../../src/index.js';
import { GeneratorConfig } from '../../src/core/types.js';
import { advancedStructuresSpec } from './specs/test.specs.js';

/**
 * A helper function to run the generator and retrieve the generated form component files for a "structures" test.
 * This abstracts the boilerplate of setting up the ts-morph project for each test.
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

    const tsFile = project.getSourceFileOrThrow('generated/admin/orders/orders-form/orders-form.component.ts');
    const html = project.getFileSystem().readFileSync('generated/admin/orders/orders-form/orders-form.component.html');

    return { tsFile, html };
}

/**
 * Main test suite for verifying the generation of complex form structures.
 */
describe('Integration: Form Structures Generation', () => {
    let tsFile: SourceFile;
    let html: string;
    let formClass: any;

    /**

     * Runs the code generator once before all tests in this suite to avoid
     * redundant executions. The generated files are stored in shared variables.
     */
    beforeAll(async () => {
        const result = await generateAndGetFormFiles(advancedStructuresSpec);
        tsFile = result.tsFile;
        html = result.html;
        formClass = tsFile.getClass('OrdersFormComponent');
    });

    /**
     * Verifies that properties marked as `readOnly: true` in the OpenAPI schema
     * are correctly excluded from the generated form.
     */
    it('should NOT generate form controls for readOnly properties', () => {
        const initFormBody = formClass.getMethod('initForm').getBodyText();
        expect(initFormBody).not.toContain('orderId:');
        expect(html).not.toContain('formControlName="orderId"');
    });

    /**
     * Tests that a property which is another object schema results in a nested `FormGroup`.
     */
    it('should generate a nested FormGroup for object properties', () => {
        const initFormBody = formClass.getMethod('initForm').getBodyText();
        expect(initFormBody).toMatch(/customer: new FormGroup/);
        expect(initFormBody).toMatch(/name: new FormControl/);
        expect(initFormBody).toMatch(/address: new FormControl/);
    });

    /**
     * Verifies that the corresponding HTML uses the `formGroupName` directive
     * to correctly bind the nested form group.
     */
    it('should generate HTML with formGroupName for nested objects', () => {
        expect(html).toContain('formGroupName="customer"');
        expect(html).toContain('formControlName="name"');
        expect(html).toContain('formControlName="address"');
    });

    /**
     * Tests that a property which is an array of objects results in a `FormArray`.
     */
    it('should generate a FormArray for an array of objects', () => {
        const initFormBody = formClass.getMethod('initForm').getBodyText();
        expect(initFormBody).toContain('items: new FormArray([])');
    });

    /**
     * Verifies that necessary helper methods are generated in the component's TypeScript
     * to manage the `FormArray` (e.g., getting the array, adding new items, removing items).
     */
    it('should generate helper methods for the FormArray', () => {
        expect(formClass.getGetAccessor('itemsArray')).toBeDefined();
        expect(formClass.getMethod('addItemsArrayItem')).toBeDefined();
        expect(formClass.getMethod('removeItemsArrayItem')).toBeDefined();
        expect(formClass.getMethod('createItemsArrayItem')).toBeDefined();
    });

    /**
     * Verifies that the `patchForm` method correctly handles patching the `FormArray`
     * when loading data into an existing form (i.e., in edit mode).
     */
    it('should generate patch logic for the FormArray in edit mode', () => {
        const patchFormBody = formClass.getMethod('patchForm').getBodyText();
        expect(patchFormBody).toContain('entity.items?.forEach(item =>');
        expect(patchFormBody).toContain('this.itemsArray.push(this.createItemsArrayItem(item));');
    });

    /**
     * Verifies that the corresponding HTML uses the `formArrayName` directive and `*ngFor`
     * to correctly render and bind the form array controls.
     */
    it('should generate correct HTML for the FormArray', () => {
        expect(html).toContain('formArrayName="items"');
        expect(html).toContain('*ngFor="let item of itemsArray.controls; let i = index"');
        expect(html).toContain('[formGroupName]="i"');
        expect(html).toContain('formControlName="productId"');
        expect(html).toContain('formControlName="quantity"');
        expect(html).toContain('(click)="removeItemsArrayItem(i)"');
    });
});
