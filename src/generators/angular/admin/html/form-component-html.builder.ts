import { Resource } from "@src/core/types/index.js";
import { FormAnalysisResult } from "@src/analysis/form-types.js";

import { HtmlElementBuilder as _ } from '../html-element.builder.js';
import { buildFormControl } from "./form-controls-html.builder.js";

export function generateFormComponentHtml(resource: Resource, analysis: FormAnalysisResult): string {
    const root = _.create('div').addClass('admin-form-container');
    const title = _.create('h1').setTextContent('{{formTitle}}');
    const form = _.create('form').setAttribute('[formGroup]', 'form').setAttribute('(ngSubmit)', 'onSubmit()');
    const fieldsContainer = _.create('div').addClass('admin-form-fields');

    // Use the pre-analyzed top-level controls
    analysis.topLevelControls
        .filter(control => !analysis.isPolymorphic || control.name !== analysis.discriminatorPropName)
        .forEach(control => {
            const controlBuilder = buildFormControl(control);
            if (controlBuilder) {
                fieldsContainer.appendChild(controlBuilder);
            }
        });

    // Handle polymorphism using the pre-analyzed model
    if (analysis.isPolymorphic) {
        const discriminatorControl = analysis.topLevelControls.find(c => c.name === analysis.discriminatorPropName);
        if (discriminatorControl) {
            const selectorControl = buildFormControl(discriminatorControl);
            if (selectorControl) fieldsContainer.appendChild(selectorControl);
        }

        for (const option of analysis.polymorphicOptions || []) {
            const typeName = option.discriminatorValue;

            const ifContainer = _.create('div');
            const formGroupContainer = _.create('div').setAttribute('formGroupName', typeName);

            option.controls.forEach(control => {
                const controlBuilder = buildFormControl(control);
                if (controlBuilder) formGroupContainer.appendChild(controlBuilder);
            });

            const innerHtml = formGroupContainer.render(1);
            ifContainer.setInnerHtml(`@if (isPetType('${typeName}')) {\n${innerHtml}\n  }`);
            fieldsContainer.appendChild(ifContainer);
        }
    }

    const actionsContainer = _.create('div').addClass('admin-form-actions');
    const cancelButton = _.create('button').setAttribute('mat-stroked-button', '').setAttribute('type', 'button').setAttribute('(click)', 'onCancel()').setTextContent('Cancel');
    const saveButton = _.create('button').setAttribute('mat-flat-button', '').setAttribute('color', 'primary').setAttribute('type', 'submit').setAttribute('[disabled]', 'form.invalid || form.pristine');

    const saveButtonContent = `\n@if (isEditMode()) { \n  <span>Save Changes</span>\n} @else { \n  <span>Create ${resource.modelName}</span>\n}\n`;
    saveButton.setInnerHtml(saveButtonContent);

    actionsContainer.appendChild(cancelButton).appendChild(saveButton);
    form.appendChild(fieldsContainer).appendChild(actionsContainer);
    root.appendChild(title).appendChild(form);

    return root.render();
}
