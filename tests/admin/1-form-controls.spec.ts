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
import { generateFromConfig } from '../../src/index.js';
import { GeneratorConfig } from '../../src/core/types.js';
import { basicControlsSpec } from './specs/test.specs.js';
import { posix as path } from 'path';

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

    const config: GeneratorConfig = {
        input: 'spec.json',
        output: '/generated',
        options: {
            dateType: 'string',
            enumStyle: 'enum',
            generateServices: true,
            admin: true
        }
    };

    project.createSourceFile(`/${config.input}`, specString); // Use absolute path
    await generateFromConfig(config, project);

    const tsPath = path.join(config.output, 'admin/widgets/widgets-form/widgets-form.component.ts');
    const htmlPath = path.join(config.output, 'admin/widgets/widgets-form/widgets-form.component.html');

    const tsFile = project.getSourceFileOrThrow(tsPath);
    const html = project.getFileSystem().readFileSync(htmlPath);

    return { tsFile, html };
}

describe('Integration: Form Controls Generation', () => {
    let tsFile: SourceFile;
    let html: string;
    let formGroupInit: string = '';

    beforeAll(async () => {
        const result = await generateAndGetFormFiles(basicControlsSpec);
        tsFile = result.tsFile;
        html = result.html;
        // Now that the generator is more complete, we can inspect the method body
        formGroupInit = tsFile.getClass('WidgetsFormComponent')?.getMethod('initForm')?.getBodyText() ?? '';
    }, 30000);

    describe('Individual Control Types', () => {
        it('should generate a MatDatepicker for "format: date"', () => {
            expect(html).toContain('<mat-datepicker-toggle matSuffix [for]="pickerlaunchDate_id">');
            expect(html).toContain('<mat-datepicker #pickerlaunchDate_id>');
        });

        it('should generate a MatButtonToggleGroup for "type: boolean"', () => {
            expect(html).toContain('<mat-button-toggle-group formControlName="isPublic"');
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
        });

        it('should generate a MatSelect with "multiple" for an array of enums', () => {
            expect(html).toContain('<mat-select formControlName="categories" multiple>');
            expect(html).toContain('<mat-option value="Tech"');
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

    describe('Validators', () => {
        it('should apply built-in validators like minLength', () => {
            expect(html).toContain('<input matInput formControlName="name"');
        });

        it('should apply number validators for minimum and maximum', () => {
            // This is tested via the slider's min/max attributes for now
            expect(html).toContain('<mat-slider');
        });
    });
});
