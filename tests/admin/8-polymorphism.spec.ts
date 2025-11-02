// tests/admin/8-polymorphism.spec.ts
// Replace the entire file's content.

import { describe, it, expect, beforeAll } from 'vitest';
import { Project, SourceFile, ClassDeclaration } from 'ts-morph';
import { polymorphismSpec } from './specs/test.specs.js';
import { generateAdminUI } from './test.helpers.js';

/**
 * Main test suite for verifying the generation of dynamic forms for polymorphic types.
 */
describe('Integration: Polymorphism (oneOf/discriminator) Generation', () => {
    let tsFile: SourceFile;
    let html: string;
    let formClass: ClassDeclaration;

    beforeAll(async () => {
        const project = await generateAdminUI(polymorphismSpec);
        tsFile = project.getSourceFileOrThrow('/generated/admin/pets/pets-form/pets-form.component.ts');
        html = project.getFileSystem().readFileSync('/generated/admin/pets/pets-form/pets-form.component.html');
        formClass = tsFile.getClassOrThrow('PetFormComponent');
    }, 30000);

    it('should generate a select control for the discriminator property', () => {
        const initFormBody = formClass.getMethodOrThrow('initForm').getBodyText();
        // UPDATED: Looser check that is less brittle
        expect(initFormBody).toContain(`'petType': this.fb.control(null, [Validators.required])`);

        expect(html).toContain('<mat-select formControlName="petType"');

        const optionsProp = formClass.getPropertyOrThrow('discriminatorOptions');
        expect(optionsProp.isStatic()).toBe(false);
        const optionsArrayText = optionsProp.getInitializerOrThrow().getText();
        expect(optionsArrayText).toContain('"cat"');
        expect(optionsArrayText).toContain('"dog"');

        expect(html).toContain('<mat-option [value]="option"');
    });

    it('should use an effect to react to discriminator value changes', () => {
        const constructorBody = formClass.getConstructors()[0].getBodyText()!;
        // UPDATED: Test now looks for the 'effect' block instead of 'subscribe'
        expect(constructorBody).toContain(`effect(() => {`);
        expect(constructorBody).toContain(`const type = this.form.get(this.discriminatorPropName)?.value;`);
        expect(constructorBody).toContain(`this.updateFormForPetType(type)`);
    });

    it('should generate a helper method to dynamically add/remove controls', () => {
        const updateMethod = formClass.getMethod('updateFormForPetType');
        expect(updateMethod).toBeDefined();

        const methodBody = updateMethod?.getBodyText() ?? '';
        expect(methodBody).toContain(`case 'cat':`);
        expect(methodBody).toContain(`this.form.addControl('cat'`);
        expect(methodBody).toContain('this.fb.group({');
        expect(methodBody).toContain(`'huntingSkill': this.fb.control(null)`);

        expect(methodBody).toContain(`case 'dog':`);
        expect(methodBody).toContain(`this.form.addControl('dog'`);
        expect(methodBody).toContain(`'barkingLevel': this.fb.control(null)`);

        // This is a key part of the logic
        expect(methodBody).toContain(`this.discriminatorOptions.forEach(opt => this.form.removeControl(opt));`);
    });

    it('should generate conditional HTML containers for each polymorphic type', () => {
        expect(html).toContain(`@if (isPetType('cat'))`);
        // The sub-form groups are named after the type ('cat' or 'dog')
        expect(html).toContain(`formGroupName="cat"`);
        expect(html).toContain(`formControlName="huntingSkill"`);

        expect(html).toContain(`@if (isPetType('dog'))`);
        expect(html).toContain(`formGroupName="dog"`);
        expect(html).toContain(`formControlName="barkingLevel"`);
    });

    it('should reconstruct the correct payload in the `onSubmit` process', () => {
        const getPayloadMethod = formClass.getMethodOrThrow('getPayload');
        const methodBody = getPayloadMethod.getBodyText() ?? '';

        expect(methodBody).toContain(`const baseValue = this.form.getRawValue();`);
        expect(methodBody).toContain(`const subFormValue = this.form.get(petType)?.value`);
        expect(methodBody).toContain(`const payload = { ...baseValue, ...subFormValue };`);
        // UPDATED: The new logic is more robust and generic.
        expect(methodBody).toContain(`this.discriminatorOptions.forEach(opt => delete payload[opt]);`);
        // We no longer need to check for the specific 'cat' and 'dog' deletions.
    });

    it('should correctly patch polymorphic data in edit mode', () => {
        const patchFormMethod = formClass.getMethodOrThrow('patchForm');
        const methodBody = patchFormMethod.getBodyText()!;

        // UPDATED: The tests are now looser and check for the key parts of the logic
        // without being tied to the exact string representation.
        expect(methodBody).toContain(`this.form.get(this.discriminatorPropName)?.setValue(petType, { emitEvent: true });`);
        expect(methodBody).toContain(`if (this.isCat(entity))`);
        expect(methodBody).toMatch(/\(this\.form\.get\('cat'\) as FormGroup\)\?.patchValue\(entity\)/);
        expect(methodBody).toContain(`if (this.isDog(entity))`);
        expect(methodBody).toMatch(/\(this\.form\.get\('dog'\) as FormGroup\)\?.patchValue\(entity\)/);
    });
});
