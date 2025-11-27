import { Resource } from '@src/core/types/index.js';
import { FormAnalysisResult } from '@src/analysis/form-types.js';
import { pascalCase } from '@src/core/utils/index.js';

import { HtmlElementBuilder as _ } from '../html-element.builder.js';
import { buildFormControl } from './form-controls-html.builder.js';

export function generateFormComponentHtml(resource: Resource, analysis: FormAnalysisResult): string {
    const root = _.create('div').addClass('admin-form-container');
    const title = _.create('h1').setTextContent('{{formTitle}}');
    const form = _.create('form').setAttribute('[formGroup]', 'form').setAttribute('(ngSubmit)', 'onSubmit()');
    const fieldsContainer = _.create('div').addClass('admin-form-fields');

    // Build list of discriminator property names to exclude from standard generation loop
    const discriminatorProps = analysis.polymorphicProperties.map(p => p.propertyName);

    // Use the pre-analyzed top-level controls
    analysis.topLevelControls
        .filter(control => !discriminatorProps.includes(control.name))
        .forEach(control => {
            const controlBuilder = buildFormControl(control);
            if (controlBuilder) {
                fieldsContainer.appendChild(controlBuilder);
            }
        });

    // Handle polymorphism using the pre-analyzed model
    if (analysis.isPolymorphic) {
        for (const poly of analysis.polymorphicProperties) {
            // 1. Render the selector control
            const discriminatorControl = analysis.topLevelControls.find(c => c.name === poly.propertyName);
            if (discriminatorControl) {
                const selectorControl = buildFormControl(discriminatorControl);
                if (selectorControl) fieldsContainer.appendChild(selectorControl);
            }

            // 2. Render the dynamic form groups for this discriminator
            for (const option of poly.options || []) {
                const typeName = option.discriminatorValue;

                const ifContainer = _.create('div');
                const formGroupContainer = _.create('div').setAttribute('formGroupName', typeName);

                option.controls.forEach(control => {
                    const controlBuilder = buildFormControl(control);
                    if (controlBuilder) formGroupContainer.appendChild(controlBuilder);
                });

                const innerHtml = formGroupContainer.render(1);

                // Use the generated is{PascalCase(Prop)} method
                const checkMethod = `is${pascalCase(poly.propertyName)}`;
                ifContainer.setInnerHtml(`@if (${checkMethod}('${typeName}')) {\n${innerHtml}\n  }`);

                fieldsContainer.appendChild(ifContainer);
            }
        }
    }

    const actionsContainer = _.create('div').addClass('admin-form-actions');
    const cancelButton = _.create('button')
        .setAttribute('mat-stroked-button', '')
        .setAttribute('type', 'button')
        .setAttribute('(click)', 'onCancel()')
        .setTextContent('Cancel');
    const saveButton = _.create('button')
        .setAttribute('mat-flat-button', '')
        .setAttribute('color', 'primary')
        .setAttribute('type', 'submit')
        .setAttribute('[disabled]', 'form.invalid || form.pristine');

    const saveButtonContent = `\n@if (isEditMode()) { \n  <span>Save Changes</span>\n} @else { \n  <span>Create ${resource.modelName}</span>\n}\n`;
    saveButton.setInnerHtml(saveButtonContent);

    actionsContainer.appendChild(cancelButton).appendChild(saveButton);
    form.appendChild(fieldsContainer).appendChild(actionsContainer);
    root.appendChild(title).appendChild(form);

    return root.render();
}
