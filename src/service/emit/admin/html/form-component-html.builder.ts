import { Resource } from "../../../../core/types.js";
import { HtmlElementBuilder as _ } from '../html-element.builder.js';
import { buildFormControl } from "./form-controls-html.builder.js";
import { SwaggerParser } from "../../../../core/parser.js";

export function generateFormComponentHtml(resource: Resource, parser: SwaggerParser): string {
    const root = _.create('div').addClass('admin-form-container');

    const title = _.create('h1').setTextContent('{{formTitle}}');

    const form = _.create('form')
        .setAttribute('[formGroup]', 'form')
        .setAttribute('(ngSubmit)', 'onSubmit()');

    const fieldsContainer = _.create('div').addClass('admin-form-fields');
    resource.formProperties
        .filter(prop => !prop.schema.readOnly)
        .forEach(prop => {
            const controlBuilder = buildFormControl(prop);
            if (controlBuilder) {
                fieldsContainer.appendChild(controlBuilder);
            }
        });

    // START OF THE FIX: Add logic to generate polymorphic sub-forms
    const oneOfProp = resource.formProperties.find(p => p.schema.oneOf && p.schema.discriminator);
    if (oneOfProp) {
        const dPropName = oneOfProp.schema.discriminator!.propertyName;
        for (const subSchemaRef of oneOfProp.schema.oneOf!) {
            const subSchema = parser.resolveReference(subSchemaRef.$ref!)!;
            const typeName = subSchema.properties![dPropName].enum![0] as string;

            // Create the @if container
            const ifContainer = _.create('div')
                .setInnerHtml(`@if (isPetType('${typeName}')) { ... }`); // Placeholder

            // Create the formGroupName container that goes inside the @if
            const formGroupContainer = _.create('div').setAttribute('formGroupName', typeName);

            // Generate controls for the subtype's properties
            Object.entries(subSchema.properties!)
                .filter(([key]) => key !== dPropName) // Exclude the discriminator property itself
                .forEach(([key, schema]) => {
                    const control = buildFormControl({ name: key, schema });
                    if (control) {
                        formGroupContainer.appendChild(control);
                    }
                });

            // This is a small hack: we get the rendered string of the inner container
            // and inject it into the @if block placeholder.
            const innerHtml = formGroupContainer.render(1);
            ifContainer.setInnerHtml(`@if (isPetType('${typeName}')) {\n${innerHtml}\n  }`);

            fieldsContainer.appendChild(ifContainer);
        }
    }
    // END OF THE FIX

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

    const saveButtonContent = `
@if (isEditMode()) {
  <span>Save Changes</span>
} @else {
  <span>Create ${resource.modelName}</span>
}`;
    saveButton.setInnerHtml(saveButtonContent);

    actionsContainer.appendChild(cancelButton).appendChild(saveButton);
    form.appendChild(fieldsContainer).appendChild(actionsContainer);
    root.appendChild(title).appendChild(form);

    return root.render();
}
