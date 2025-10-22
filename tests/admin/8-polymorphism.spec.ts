/**
 * @fileoverview
 * This test suite validates the generation of dynamic admin forms for polymorphic data models
 * defined in an OpenAPI specification using `oneOf` and a `discriminator`. This is an advanced
 * feature that requires the generated UI to change its structure at runtime based on user input.
 * The tests verify the creation of a type-selector control, the dynamic adding/removing of
 * nested form controls, the conditional rendering of UI sections, and the correct assembly of
 * the final data payload for submission.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Project, IndentationText, SourceFile, ClassDeclaration, ScriptTarget, ModuleKind } from 'ts-morph';
import { generateFromConfig } from '../../src/index.js';
import { GeneratorConfig } from '../../src/core/types.js';
import { polymorphismSpec } from './specs/test.specs.js';

/**
 * A helper function to run the generator and retrieve the relevant generated files for polymorphism tests.
 * @param specString The OpenAPI specification as a JSON string.
 * @returns An object containing the component's TypeScript SourceFile and its HTML content.
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

    const tsFile = project.getSourceFileOrThrow('generated/admin/pets/pets-form/pets-form.component.ts');
    const html = project.getFileSystem().readFileSync('generated/admin/pets/pets-form/pets-form.component.html');

    return { tsFile, html };
}

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
        const result = await generateAndGetFormFiles(polymorphismSpec);
        tsFile = result.tsFile;
        html = result.html;
        formClass = tsFile.getClassOrThrow('PetsFormComponent');
    });

    /**
     * Verifies that the discriminator property (`petType`) is generated as a mat-select control.
     */
    it('should generate a select control for the discriminator property', () => {
        const initFormBody = formClass.getMethodOrThrow('initForm').getBodyText();
        expect(initFormBody).toContain(`petType: new FormControl<string | null>(null, [Validators.required])`);

        expect(html).toContain('<mat-select formControlName="petType"');
        expect(html).toContain('<mat-option value="cat"');
        expect(html).toContain('<mat-option value="dog"');
    });

    /**
     * Verifies that the component's TypeScript subscribes to the value changes of the discriminator
     * control to trigger the dynamic form updates.
     */
    it('should subscribe to discriminator value changes to update the form', () => {
        const constructorBody = formClass.getConstructors()[0].getBodyText();
        expect(constructorBody).toContain(`this.form.get('petType')?.valueChanges.subscribe`);
        expect(constructorBody).toContain(`this.updateFormForPetType(type);`);
    });

    /**
     * Verifies the generation of a dedicated helper method (`updateFormForPetType`) responsible
     * for adding and removing controls from the sub-form groups based on the selected type.
     */
    it('should generate a helper method to dynamically add/remove controls', () => {
        const updateMethod = formClass.getMethod('updateFormForPetType');
        expect(updateMethod).toBeDefined();

        const methodBody = updateMethod?.getBodyText() ?? '';
        // Check add/remove logic for 'cat'
        expect(methodBody).toContain(`case 'cat':`);
        expect(methodBody).toContain(`this.catGroup.addControl('huntingSkill'`);
        expect(methodBody).toContain(`this.dogGroup.removeControl('barkingLevel');`);

        // Check add/remove logic for 'dog'
        expect(methodBody).toContain(`case 'dog':`);
        expect(methodBody).toContain(`this.dogGroup.addControl('barkingLevel'`);
        expect(methodBody).toContain(`this.catGroup.removeControl('huntingSkill');`);
    });

    /**
     * Verifies that the generated HTML contains conditional containers (`*ngIf`) that are only
     * displayed when the corresponding discriminator value is selected.
     */
    it('should generate conditional HTML containers for each polymorphic type', () => {
        expect(html).toContain(`*ngIf="isPetType('cat')"`);
        expect(html).toContain(`formGroupName="cat"`);
        expect(html).toContain(`formControlName="huntingSkill"`);

        expect(html).toContain(`*ngIf="isPetType('dog')"`);
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
        expect(methodBody).toContain(`const subFormValue = this.form.get(petType)?.value;`);
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
        const methodBody = patchFormMethod.getBodyText() ?? '';

        expect(methodBody).toContain(`this.form.get('petType')?.setValue(entity.petType);`);
        expect(methodBody).toContain(`if (isCat(entity))`);
        expect(methodBody).toContain(`this.catGroup.patchValue(entity);`);
        expect(methodBody).toContain(`if (isDog(entity))`);
        expect(methodBody).toContain(`this.dogGroup.patchValue(entity);`);
    });
});
