// ./tests/admin/2-form-structures.spec.ts

import { describe, it, expect, beforeAll } from 'vitest';
import { Project, SourceFile } from 'ts-morph';
import { advancedStructuresSpec } from './specs/test.specs.js';
import { generateAdminUI } from './test.helpers.js';

describe('Integration: Form Structures Generation', () => {
    let tsFile: SourceFile;
    let html: string;
    let formClass: any;

    beforeAll(async () => {
        const project = await generateAdminUI(advancedStructuresSpec);
        tsFile = project.getSourceFileOrThrow('/generated/admin/orders/orders-form/orders-form.component.ts');
        html = project.getFileSystem().readFileSync('/generated/admin/orders/orders-form/orders-form.component.html');
        formClass = tsFile.getClass('OrdersFormComponent');
    });

    // ... (rest of the tests remain unchanged)
    it('should NOT generate form controls for readOnly properties', () => {
        const initFormBody = formClass.getMethod('initForm').getBodyText();
        expect(initFormBody).not.toContain('orderId:');
        expect(html).not.toContain('formControlName="orderId"');
    });

    it('should generate a nested FormGroup for object properties', () => {
        const initFormBody = formClass.getMethod('initForm').getBodyText();
        expect(initFormBody).toMatch(/customer: new FormGroup/);
        expect(initFormBody).toMatch(/name: new FormControl/);
        expect(initFormBody).toMatch(/address: new FormControl/);
    });

    it('should generate HTML with formGroupName for nested objects', () => {
        expect(html).toContain('formGroupName="customer"');
        expect(html).toContain('formControlName="name"');
        expect(html).toContain('formControlName="address"');
    });

    it('should generate a FormArray for an array of objects', () => {
        const initFormBody = formClass.getMethod('initForm').getBodyText();
        expect(initFormBody).toContain('items: new FormArray([])');
    });

    it('should generate helper methods for the FormArray', () => {
        expect(formClass.getGetAccessor('itemsArray')).toBeDefined();
        expect(formClass.getMethod('addItemsArrayItem')).toBeDefined();
        expect(formClass.getMethod('removeItemsArrayItem')).toBeDefined();
        expect(formClass.getMethod('createItemsArrayItem')).toBeDefined();
    });

    it('should generate patch logic for the FormArray in edit mode', () => {
        const patchFormBody = formClass.getMethod('patchForm').getBodyText();
        expect(patchFormBody).toContain('entity.items?.forEach(item =>');
        expect(patchFormBody).toContain('this.itemsArray.push(this.createItemsArrayItem(item));');
    });

    it('should generate correct HTML for the FormArray', () => {
        expect(html).toContain('formArrayName="items"');
        expect(html).toContain('*ngFor="let item of itemsArray.controls; let i = index"');
        expect(html).toContain('[formGroupName]="i"');
        expect(html).toContain('formControlName="productId"');
        expect(html).toContain('formControlName="quantity"');
        expect(html).toContain('(click)="removeItemsArrayItem(i)"');
    });
});
