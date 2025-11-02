import { describe, it, expect, beforeAll } from 'vitest';
import { Project, SourceFile, ClassDeclaration } from 'ts-morph';
import { advancedStructuresSpec } from './specs/test.specs.js';
import { generateAdminUI } from './test.helpers.js';

describe('Integration: Form Structures Generation', () => {
    let tsFile: SourceFile;
    let html: string;
    let formClass: ClassDeclaration;

    beforeAll(async () => {
        const project = await generateAdminUI(advancedStructuresSpec);
        tsFile = project.getSourceFileOrThrow('/generated/admin/orders/orders-form/orders-form.component.ts');
        html = project.getFileSystem().readFileSync('/generated/admin/orders/orders-form/orders-form.component.html');
        formClass = tsFile.getClassOrThrow('OrderFormComponent');
    }, 30000);

    // ... (rest of the tests remain unchanged)
    it('should NOT generate form controls for readOnly properties', () => {
        const initFormBody = formClass.getMethodOrThrow('initForm').getBodyText();
        expect(initFormBody).not.toContain('orderId:');
        expect(html).not.toContain('formControlName="orderId"');
    });

    it('should generate a nested FormGroup for object properties', () => {
        const initFormBody = formClass.getMethodOrThrow('initForm').getBodyText();
        expect(initFormBody).toContain("'customer': this.fb.group({");
        expect(initFormBody).toContain("'name': this.fb.control(null)");
    });

    it('should generate HTML with formGroupName for nested objects', () => {
        expect(html).toContain('formGroupName="customer"');
        expect(html).toContain('formControlName="name"');
        expect(html).toContain('formControlName="address"');
    });

    it('should generate a FormArray for an array of objects', () => {
        const initFormBody = formClass.getMethodOrThrow('initForm').getBodyText();
        expect(initFormBody).toContain("'items': this.fb.array([])");
    });

    it('should generate helper methods for the FormArray', () => {
        expect(formClass.getGetAccessor('itemsArray')).toBeDefined();
        expect(formClass.getMethod('addItem')).toBeDefined();
        expect(formClass.getMethod('removeItem')).toBeDefined();
        expect(formClass.getMethod('createItem')).toBeDefined();
    });

    it('should generate patch logic for the FormArray in edit mode', () => {
        const patchFormBody = formClass.getMethodOrThrow('patchForm').getBodyText();
        expect(patchFormBody).toContain('entity.items');
        expect(patchFormBody).toContain('this.itemsArray.push');
        // Corrected method name
        expect(patchFormBody).toContain('this.createItem(item)');
    });

    it('should generate correct HTML for the FormArray using @for', () => {
        expect(html).toContain('formArrayName="items"');
        expect(html).toContain('@for');
        expect(html).toContain('itemsArray.controls');
        expect(html).toContain('[formGroupName]="i"');
        expect(html).toContain('formControlName="productId"');
        expect(html).toContain('formControlName="quantity"');
        expect(html).toContain('(click)="removeItem(i)"');
    });
});
