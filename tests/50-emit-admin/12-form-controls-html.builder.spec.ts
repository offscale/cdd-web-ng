import { describe, expect, it } from 'vitest';

import { buildFormControl } from '@src/generators/angular/admin/html/form-controls-html.builder.js';
import { generateFormComponentHtml } from '@src/generators/angular/admin/html/form-component-html.builder.js';
import { FormAnalysisResult, FormControlModel } from '@src/analysis/form-types.js';
import { Resource } from '@src/core/types/index.js';

describe('Admin: Form HTML Builders', () => {
    const baseControl = {
        propertyName: 'name',
        dataType: 'string | null',
        defaultValue: null,
        validationRules: [],
        controlType: 'control',
    } as const;

    it('should return null when control or schema is missing', () => {
        expect(buildFormControl(null as any)).toBeNull();
        expect(buildFormControl({ ...baseControl, name: 'missing', schema: undefined } as any)).toBeNull();
    });

    it('should render a readonly textarea', () => {
        const control: FormControlModel = {
            ...baseControl,
            name: 'notes',
            schema: { type: 'string', format: 'textarea', readOnly: true },
        } as any;
        const html = buildFormControl(control)!.render();
        expect(html).toContain('textarea');
        expect(html).toContain('[readonly]');
    });

    it('should skip null nested controls in form groups and arrays', () => {
        const nullNested: FormControlModel = {
            ...baseControl,
            name: 'nested',
            schema: { type: 'object' },
            controlType: 'control',
        } as any;

        const groupControl: FormControlModel = {
            ...baseControl,
            name: 'group',
            schema: { type: 'object' },
            controlType: 'group',
            nestedControls: [nullNested],
        } as any;

        const groupHtml = buildFormControl(groupControl)!.render();
        expect(groupHtml).not.toContain('nested');

        const arrayControl: FormControlModel = {
            ...baseControl,
            name: 'items',
            schema: { type: 'array', items: { type: 'object' } },
            controlType: 'array',
            nestedControls: [nullNested],
        } as any;

        const arrayHtml = buildFormControl(arrayControl)!.render();
        expect(arrayHtml).not.toContain('nested');
    });

    it('should handle map editor without value control and with null value builder', () => {
        const mapControlNoValue: FormControlModel = {
            ...baseControl,
            name: 'meta',
            schema: { type: 'object' },
            controlType: 'map',
            mapValueControl: undefined,
        } as any;

        const mapHtml = buildFormControl(mapControlNoValue)!.render();
        expect(mapHtml).not.toContain('map-key-field');
        expect(mapHtml).not.toContain('formControlName=\"value\"');

        const mapControlNullValue: FormControlModel = {
            ...baseControl,
            name: 'meta2',
            schema: { type: 'object' },
            controlType: 'map',
            mapValueControl: { ...baseControl, name: 'value', schema: { type: 'object' } } as any,
        } as any;

        const mapHtmlNullValue = buildFormControl(mapControlNullValue)!.render();
        expect(mapHtmlNullValue).not.toContain('map-key-field');
        expect(mapHtmlNullValue).not.toContain('formControlName=\"value\"');
    });

    it('should tolerate polymorphic analysis without selector control or options', () => {
        const analysis: FormAnalysisResult = {
            interfaces: [],
            topLevelControls: [
                {
                    ...baseControl,
                    name: 'kind',
                    schema: { type: 'object' },
                    controlType: 'group',
                } as any,
            ],
            usesCustomValidators: false,
            hasFormArrays: false,
            hasFileUploads: false,
            isPolymorphic: true,
            polymorphicProperties: [
                {
                    propertyName: 'kind',
                    discriminatorOptions: [],
                    options: undefined as any,
                } as any,
            ],
            dependencyRules: [],
        };

        const resource = { name: 'test', modelName: 'Test' } as Resource;
        const html = generateFormComponentHtml(resource, analysis);

        expect(html).toContain('Create Test');
    });
});
