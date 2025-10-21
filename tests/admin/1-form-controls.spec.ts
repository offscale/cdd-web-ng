/**
 * @fileoverview
 * This test suite focuses on the integration of OpenAPI schema properties with the generation
 * of specific Angular Material form controls in the admin UI. It verifies that different
 * schema attributes (like `enum`, `format`, `type`, `default`, and validation keywords)
 * correctly produce the corresponding form controls (e.g., `<mat-select>`, `<mat-datepicker>`)
 * and associated `FormControl` definitions with validators and default values in the component's
 * TypeScript and HTML files.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Project, IndentationText, SourceFile, ModuleKind, ScriptTarget } from 'ts-morph';
import { emitClientLibrary } from '../../src/service/emit/orchestrator.js';
import { SwaggerParser } from '../../src/core/parser.js';
import { GeneratorConfig } from '../../src/core/types.js';
import { basicControlsSpec } from './specs/test.specs.js';
// --- FIX: Import the 'posix' version of the path module to guarantee '/' separators ---
import { posix as path } from 'path';

/**
 * A helper function to run the generator and retrieve the generated form component files.
 * This abstracts the boilerplate of setting up the ts-morph project for each test.
 * @param specString The OpenAPI specification as a JSON string.
 * @returns An object containing the TypeScript SourceFile and the HTML content of the form component.
 */
async function generateAndGetFormFiles(specString: string): Promise<{ tsFile: SourceFile; html: string }> {
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
            allowArbitraryExtensions: true,
            resolveJsonModule: true
        }
    });

    // --- FIX: Use an absolute path from the VFS root. This is critical. ---
    const outputDir = '/generated';

    const config: GeneratorConfig = {
        input: 'spec.json',
        output: outputDir,
        options: {
            dateType: 'string',
            enumStyle: 'enum',
            generateServices: true,
            admin: true
        }
    };

    const spec = JSON.parse(specString);
    const parser = new SwaggerParser(spec, config);
    await emitClientLibrary(outputDir, parser, config, project);

    // --- FIX: Construct the retrieval path using path.posix.join to match the generator ---
    const tsPath = path.join(outputDir, 'admin/widgets/widgets-form/widgets-form.component.ts');
    const htmlPath = path.join(outputDir, 'admin/widgets/widgets-form/widgets-form.component.html');

    // These lookups will now succeed because the path strings are guaranteed to be identical.
    const tsFile = project.getSourceFileOrThrow(tsPath);
    const html = project.getFileSystem().readFileSync(htmlPath);

    return { tsFile, html };
}

/**
 * Main test suite for verifying the generation of different form controls and their properties.
 */
describe('Integration: Form Controls Generation', () => {
    let tsFile: SourceFile;
    let html: string;
    let formGroupInit: string;

    /**
     * Runs the code generator once before all tests in this suite to avoid
     * redundant executions. The generated files are stored in shared variables.
     */
    beforeAll(async () => {
        const result = await generateAndGetFormFiles(basicControlsSpec);
        tsFile = result.tsFile;
        html = result.html;
        formGroupInit = tsFile.getClass('WidgetsFormComponent')?.getMethod('initForm')?.getBodyText() ?? '';
    }, 30000); // Increased timeout for generation

    /**
     * Test suite for individual control types.
     */
    describe('Individual Control Types', () => {
        it('should generate a MatDatepicker for "format: date"', () => {
            expect(html).toContain('<mat-datepicker-toggle matSuffix [for]="pickerlaunchDate_id">');
            expect(html).toContain('<mat-datepicker #pickerlaunchDate_id>');
            expect(formGroupInit).toContain(`launchDate: new FormControl(null)`);
        });

        it('should generate a MatButtonToggleGroup for "type: boolean"', () => {
            expect(html).toContain('<mat-button-toggle-group formControlName="isPublic"');
            expect(formGroupInit).toContain(`isPublic: new FormControl(true)`); // Checks for default value
        });

        it('should generate a MatRadioGroup for small enums (<= 4 items)', () => {
            expect(html).toContain('<mat-radio-group formControlName="status"');
            expect(html).toContain('<mat-radio-button value="Pending"');
        });

        it('should generate a MatSelect for large enums (> 4 items)', () => {
            expect(html).toContain('<mat-select formControlName="priority"');
            expect(html).toContain('<mat-option value="Low"');
        });

        it('should generate a MatChipList for an array of strings', () => {
            expect(html).toContain('<mat-chip-grid #chipGridtags_id');
            expect(formGroupInit).toContain('tags: new FormArray([])');
        });

        it('should generate a MatSelect with "multiple" for an array of enums', () => {
            expect(html).toContain('<mat-select formControlName="categories" multiple>');
            expect(html).toContain('<mat-option value="Tech"');
            expect(formGroupInit).toContain('categories: new FormControl([])');
        });

        it('should generate a MatSlider for an integer with min/max', () => {
            expect(html).toContain('<mat-slider');
            expect(html).toContain('min="0"');
            expect(html).toContain('max="100"');
        });

        it('should generate a textarea for "format: textarea"', () => {
            expect(html).toContain('<textarea matInput formControlName="description"');
        });
    });

    /**
     * Test suite for form control validators.
     */
    describe('Validators', () => {
        it('should apply built-in validators like minLength', () => {
            expect(formGroupInit).toContain('name: new FormControl(null, [Validators.minLength(3)])');
            expect(html).toContain('<input matInput formControlName="name"');
        });

        it('should apply number validators for minimum and maximum', () => {
            const stockControl = formGroupInit.match(/stock: new FormControl\(null, \[(.*?)\]\)/);
            expect(stockControl).not.toBeNull();
            expect(stockControl![1]).toContain('Validators.min(0)');
            expect(stockControl![1]).toContain('Validators.max(100)');
        });
    });
});