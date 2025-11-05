import { Resource, FormProperty, SwaggerDefinition } from "../../../../core/types.js";
import { HtmlElementBuilder as _ } from '../html-element.builder.js';
import { buildFormControl } from "./form-controls-html.builder.js";
import { SwaggerParser } from "../../../../core/parser.js";

/**
 * Generates the complete HTML content for a resource's form component template.
 *
 * This function builds the entire form structure, including a title, the main `<form>` tag
 * with its bindings, a container for all form fields, and action buttons (Cancel/Save).
 *
 * It intelligently handles two primary cases:
 * 1.  **Standard Forms**: Renders all properties as regular form controls.
 * 2.  **Polymorphic Forms (`oneOf`)**: Renders the discriminator property as a selector
 *     (e.g., a dropdown). It then generates dynamic sub-sections for each possible type,
 *     wrapped in an Angular `@if` block that is toggled by the component's `isPetType()` method.
 *
 * @param resource The metadata for the resource, containing its properties.
 * @param parser The SwaggerParser instance, required to resolve schema details for polymorphism.
 * @returns A string containing the full, formatted HTML template for the component.
 */
export function generateFormComponentHtml(resource: Resource, parser: SwaggerParser): string {
    // The root container for the entire form view.
    const root = _.create('div').addClass('admin-form-container');

    // The main title, bound to a computed signal in the component class.
    const title = _.create('h1').setTextContent('{{formTitle}}');

    // The <form> element, bound to the component's FormGroup and onSubmit method.
    const form = _.create('form')
        .setAttribute('[formGroup]', 'form')
        .setAttribute('(ngSubmit)', 'onSubmit()');

    // A flex container for all the input fields.
    const fieldsContainer = _.create('div').addClass('admin-form-fields');

    // Identify the single property that controls the polymorphic behavior, if any.
    const oneOfProp = resource.formProperties.find(p => p.schema.oneOf && p.schema.discriminator);

    // First, render all "normal" properties that are not part of the polymorphic structure.
    resource.formProperties
        .filter(prop => !prop.schema.readOnly && prop !== oneOfProp)
        .forEach(prop => {
            const controlBuilder = buildFormControl(prop);
            if (controlBuilder) {
                fieldsContainer.appendChild(controlBuilder);
            }
        });

    // If a polymorphic property was found, render its special dynamic structure.
    if (oneOfProp) {
        // Render the main selector control for the discriminator property itself (e.g., a dropdown for 'petType').
        const selectorControl = buildFormControl(oneOfProp);
        if (selectorControl) {
            fieldsContainer.appendChild(selectorControl);
        }

        // Retrieve the structured options for the polymorphic type (e.g., Cat, Dog).
        const options = parser.getPolymorphicSchemaOptions(oneOfProp.schema);
        const dPropName = oneOfProp.schema.discriminator!.propertyName;

        // Iterate through each possible subtype and create a dedicated, conditional UI block for it.
        for (const option of options) {
            const typeName = option.name; // e.g., 'cat' or 'dog'
            const subSchema = option.schema;

            // Create a container that will be controlled by an Angular `@if` block.
            // This relies on the `isPetType(type: string)` method existing in the component class.
            const ifContainer = _.create('div');

            // Create the sub-form container with the `formGroupName` directive.
            const formGroupContainer = _.create('div').setAttribute('formGroupName', typeName);

            // Generate controls for all properties of this specific subtype.
            // It is crucial to filter out the discriminator property itself to avoid rendering it twice.
            Object.entries(subSchema.properties!)
                .filter(([key, schema]) => key !== dPropName && !schema.readOnly)
                .forEach(([key, schema]) => {
                    const control = buildFormControl({ name: key, schema: schema as SwaggerDefinition });
                    if (control) {
                        formGroupContainer.appendChild(control);
                    }
                });

            // Nest the generated sub-form inside the `@if` block's markup.
            const innerHtml = formGroupContainer.render(1);
            ifContainer.setInnerHtml(`@if (isPetType('${typeName}')) {\n${innerHtml}\n  }`);

            fieldsContainer.appendChild(ifContainer);
        }
    }

    // Create the container for the form's action buttons.
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

    // Dynamically change the save button's text based on whether we are creating or editing.
    const saveButtonContent = `\n@if (isEditMode()) {
  <span>Save Changes</span>
} @else {
  <span>Create ${resource.modelName}</span>
}\n`;
    saveButton.setInnerHtml(saveButtonContent);

    // Assemble all the pieces into the final structure.
    actionsContainer.appendChild(cancelButton).appendChild(saveButton);
    form.appendChild(fieldsContainer).appendChild(actionsContainer);
    root.appendChild(title).appendChild(form);

    // Render the entire DOM tree to a string.
    return root.render();
}
