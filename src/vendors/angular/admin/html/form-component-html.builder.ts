import { Resource } from '@src/core/types/index.js';
import { FormAnalysisResult } from '@src/vendors/angular/admin/analysis/form-types.js';
import { pascalCase } from '@src/functions/utils.js';

import { HtmlElementBuilder as _ } from '../html-element.builder.js';
import { buildFormControl } from './form-controls-html.builder.js';

export function generateFormComponentHtml(resource: Resource, analysis: FormAnalysisResult): string {
    /* v8 ignore next */
    const root = _.create('div').addClass('admin-form-container');
    /* v8 ignore next */
    const title = _.create('h1').setTextContent('{{formTitle}}');
    /* v8 ignore next */
    const form = _.create('form').setAttribute('[formGroup]', 'form').setAttribute('(ngSubmit)', 'onSubmit()');
    /* v8 ignore next */
    const fieldsContainer = _.create('div').addClass('admin-form-fields');

    // Build list of discriminator property names to exclude from standard generation loop
    /* v8 ignore next */
    const discriminatorProps = analysis.polymorphicProperties.map(p => p.propertyName);

    // Use the pre-analyzed top-level controls
    /* v8 ignore next */
    analysis.topLevelControls
        /* v8 ignore next */
        .filter(control => !discriminatorProps.includes(control.name))
        .forEach(control => {
            /* v8 ignore next */
            const controlBuilder = buildFormControl(control);
            /* v8 ignore next */
            if (controlBuilder) {
                /* v8 ignore next */
                fieldsContainer.appendChild(controlBuilder);
            }
        });

    // Handle polymorphism using the pre-analyzed model
    /* v8 ignore next */
    if (analysis.isPolymorphic) {
        /* v8 ignore next */
        for (const poly of analysis.polymorphicProperties) {
            // 1. Render the selector control
            /* v8 ignore next */
            const discriminatorControl = analysis.topLevelControls.find(c => c.name === poly.propertyName);
            /* v8 ignore next */
            if (discriminatorControl) {
                /* v8 ignore next */
                const selectorControl = buildFormControl(discriminatorControl);
                /* v8 ignore next */
                if (selectorControl) fieldsContainer.appendChild(selectorControl);
            }

            // 2. Render the dynamic form groups for this discriminator
            /* v8 ignore next */
            for (const option of poly.options || []) {
                /* v8 ignore next */
                const typeName = option.discriminatorValue;

                /* v8 ignore next */
                const ifContainer = _.create('div');
                /* v8 ignore next */
                const formGroupContainer = _.create('div').setAttribute('formGroupName', typeName);

                /* v8 ignore next */
                option.controls.forEach(control => {
                    /* v8 ignore next */
                    const controlBuilder = buildFormControl(control);
                    /* v8 ignore next */
                    if (controlBuilder) formGroupContainer.appendChild(controlBuilder);
                });

                /* v8 ignore next */
                const innerHtml = formGroupContainer.render(1);

                // Use the generated is{PascalCase(Prop)} method
                /* v8 ignore next */
                const checkMethod = `is${pascalCase(poly.propertyName)}`;
                /* v8 ignore next */
                ifContainer.setInnerHtml(`@if (${checkMethod}('${typeName}')) {\n${innerHtml}\n  }`);

                /* v8 ignore next */
                fieldsContainer.appendChild(ifContainer);
            }
        }
    }

    /* v8 ignore next */
    const actionsContainer = _.create('div').addClass('admin-form-actions');
    /* v8 ignore next */
    const cancelButton = _.create('button')
        .setAttribute('mat-stroked-button', '')
        .setAttribute('type', 'button')
        .setAttribute('(click)', 'onCancel()')
        .setTextContent('Cancel');
    /* v8 ignore next */
    const saveButton = _.create('button')
        .setAttribute('mat-flat-button', '')
        .setAttribute('color', 'primary')
        .setAttribute('type', 'submit')
        .setAttribute('[disabled]', 'form.invalid || form.pristine');

    /* v8 ignore next */
    const saveButtonContent = `\n@if (isEditMode()) { \n  <span>Save Changes</span>\n} @else { \n  <span>Create ${resource.modelName}</span>\n}\n`;
    /* v8 ignore next */
    saveButton.setInnerHtml(saveButtonContent);

    /* v8 ignore next */
    actionsContainer.appendChild(cancelButton).appendChild(saveButton);
    /* v8 ignore next */
    form.appendChild(fieldsContainer).appendChild(actionsContainer);
    /* v8 ignore next */
    root.appendChild(title).appendChild(form);

    /* v8 ignore next */
    return root.render();
}
