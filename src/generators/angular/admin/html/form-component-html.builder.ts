import { Resource, SwaggerDefinition } from "@src/core/types/index.js";
import { HtmlElementBuilder as _ } from '../html-element.builder.js';
import { buildFormControl } from "./form-controls-html.builder.js";
import { SwaggerParser } from "@src/core/parser.js";

export function generateFormComponentHtml(resource: Resource, parser: SwaggerParser): string {
    const root = _.create('div').addClass('admin-form-container');
    const title = _.create('h1').setTextContent('{{formTitle}}');
    const form = _.create('form').setAttribute('[formGroup]', 'form').setAttribute('(ngSubmit)', 'onSubmit()');
    const fieldsContainer = _.create('div').addClass('admin-form-fields');

    const oneOfProp = resource.formProperties.find(p => p.schema.oneOf && p.schema.discriminator);

    resource.formProperties
        .filter(prop => !prop.schema.readOnly && prop !== oneOfProp)
        .forEach(prop => {
            const controlBuilder = buildFormControl(prop);
            if (controlBuilder) {
                fieldsContainer.appendChild(controlBuilder);
            }
        });

    if (oneOfProp) {
        const selectorControl = buildFormControl(oneOfProp);
        if (selectorControl) fieldsContainer.appendChild(selectorControl);

        const options = parser.getPolymorphicSchemaOptions(oneOfProp.schema);
        const dPropName = oneOfProp.schema.discriminator!.propertyName;

        for (const option of options) {
            const typeName = option.name;
            const subSchema = option.schema;

            const getAllProperties = (schema: SwaggerDefinition): Record<string, SwaggerDefinition> => {
                let allProperties: Record<string, SwaggerDefinition> = { ...schema.properties };
                if (schema.allOf) {
                    for (const sub of schema.allOf) {
                        const resolvedSub = parser.resolve<SwaggerDefinition>(sub);
                        if (resolvedSub) {
                            const subProps = getAllProperties(resolvedSub);
                            allProperties = { ...subProps, ...allProperties };
                        }
                    }
                }
                return allProperties;
            };

            const ifContainer = _.create('div');
            const formGroupContainer = _.create('div').setAttribute('formGroupName', typeName);
            const allSubSchemaProperties = getAllProperties(subSchema);

            Object.entries(allSubSchemaProperties)
                .filter(([key, schema]) => key !== dPropName && !schema.readOnly)
                .forEach(([key, schema]) => {
                    const control = buildFormControl({ name: key, schema: schema as SwaggerDefinition });
                    if (control) formGroupContainer.appendChild(control);
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
