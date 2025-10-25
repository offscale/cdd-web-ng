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

    /**
     * Runs the code generator once before all tests.
     */
    beforeAll(async () => {
        const project = await generateAdminUI(polymorphismSpec);
        tsFile = project.getSourceFileOrThrow('/generated/admin/pets/pets-form/pets-form.component.ts');
        html = project.getFileSystem().readFileSync('/generated/admin/pets/pets-form/pets-form.component.html');
        formClass = tsFile.getClassOrThrow('PetsFormComponent');
    });

    /**
     * Verifies that the discriminator property (`petType`) is generated as a mat-select control.
     */
    it('should generate a select control for the discriminator property', () => {
        const initFormBody = formClass.getMethodOrThrow('initForm').getBodyText();
        expect(initFormBody).toContain(`petType: new FormControl<string | null>(null, [Validators.required])`);

        expect(html).toContain('<mat-select formControlName="petType"');

        const optionsProp = formClass.getPropertyOrThrow('discriminatorOptions');
        expect(optionsProp.isStatic()).toBe(true);
        const optionsArrayText = optionsProp.getInitializerOrThrow().getText();
        expect(optionsArrayText).toContain('"cat"');
        expect(optionsArrayText).toContain('"dog"');

        expect(html).toContain('<mat-option [value]="option"');
    });

    /**
     * Verifies that the component's TypeScript subscribes to the value changes of the discriminator
     * control to trigger the dynamic form updates.
     */
    it('should subscribe to discriminator value changes to update the form', () => {
        const ngOnInitBody = formClass.getMethodOrThrow('ngOnInit').getBodyText()!;
        expect(ngOnInitBody).toContain(`valueChanges.subscribe`);
        expect(ngOnInitBody).toContain(`this.updateFormForPetType(type)`);
    });

    /**
     * Verifies the generation of a dedicated helper method (`updateFormForPetType`) responsible
     * for adding and removing controls from the sub-form groups based on the selected type.
     */
    it('should generate a helper method to dynamically add/remove controls', () => {
        const updateMethod = formClass.getMethod('updateFormForPetType');
        expect(updateMethod).toBeDefined();

        const methodBody = updateMethod?.getBodyText() ?? '';
        expect(methodBody).toContain(`case 'cat':`);
        expect(methodBody).toContain(`this.form.addControl('cat'`); // Check for add
        expect(html).toContain(`formControlName="huntingSkill"`); // Check HTML for the control

        expect(methodBody).toContain(`case 'dog':`);
        expect(methodBody).toContain(`this.form.addControl('dog'`);
        expect(html).toContain(`formControlName="barkingLevel"`);

        // Check for removal of other groups
        expect(methodBody).toContain(`this.form.removeControl('dog');`);
        expect(methodBody).toContain(`this.form.removeControl('cat');`);
    });

    /**
     * Verifies that the generated HTML contains conditional containers (`@if`) that are only
     * displayed when the corresponding discriminator value is selected.
     */
    it('should generate conditional HTML containers for each polymorphic type', () => {
        expect(html).toContain(`@if (isPetType('cat'))`);
        expect(html).toContain(`formGroupName="cat"`);
        expect(html).toContain(`formControlName="huntingSkill"`);

        expect(html).toContain(`@if (isPetType('dog'))`);
        expect(html).toContain(`formGroupName="dog"`);
        expect(html).toContain(`formControlName="barkingLevel"`);
    });

    /**
     * Verifies that the `onSubmit` process correctly reconstructs the final data payload. It must
     * merge the values from the base form with the values from the currently active sub-form.
     */
    it('should reconstruct the correct payload in the `onSubmit` process', () => {
        const getPayloadMethod = formClass.getMethodOrThrow('getPayload');
        const methodBody = getPayloadMethod.getBodyText() ?? '';

        expect(methodBody).toContain(`const baseValue = this.form.getRawValue();`);
        expect(methodBody).toContain(`const subFormValue = this.form.get(petType)?.value`);
        expect(methodBody).toContain(`const payload = { ...baseValue, ...subFormValue };`);
        expect(methodBody).toContain(`delete payload.cat;`);
        expect(methodBody).toContain(`delete payload.dog;`);
    });

    /**
     * Verifies that the `patchForm` method, used in edit mode, correctly handles polymorphic data
     * by setting the discriminator value and then patching the appropriate sub-form.
     */
    it('should correctly patch polymorphic data in edit mode', () => {
        const patchFormMethod = formClass.getMethodOrThrow('patchForm');
        const methodBody = patchFormMethod.getBodyText()!;

        expect(methodBody).toContain(`this.form.get('petType')?.setValue(petType, { emitEvent: true });`);
        expect(methodBody).toContain(`if (isCat(entity))`);
        expect(methodBody).toMatch(/\(this\.form\.get\('cat'\) as FormGroup\)\?.patchValue\(entity\)/);
        expect(methodBody).toContain(`if (isDog(entity))`);
        expect(methodBody).toMatch(/\(this\.form\.get\('dog'\) as FormGroup\)\?.patchValue\(entity\)/);
    });
});
