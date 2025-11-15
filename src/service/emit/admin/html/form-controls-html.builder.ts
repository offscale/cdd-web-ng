// src/service/emit/admin/html/form-controls-html.builder.ts

import { FormProperty, SwaggerDefinition } from "../../../../core/types.js";
import { camelCase, pascalCase, singular } from "../../../../core/utils.js";
import { HtmlElementBuilder, HtmlElementBuilder as _ } from "../html-element.builder.js";

/**
 * Generates all possible <mat-error> blocks for a given form property based on its schema.
 * @param prop The FormProperty to generate errors for.
 * @returns An array of HtmlElementBuilder instances, one for each possible validation error.
 */
function buildErrorMessages(prop: FormProperty): HtmlElementBuilder[] {
    const errors: HtmlElementBuilder[] = [];
    const schema = prop.schema;

    if (schema.required) {
        errors.push(_.create('mat-error').setInnerHtml(`@if (form.get('${prop.name}')?.hasError('required')) { This field is required. }`));
    }
    if (schema.minLength) {
        errors.push(_.create('mat-error').setInnerHtml(`@if (form.get('${prop.name}')?.hasError('minlength')) { Must be at least ${schema.minLength} characters long. }`));
    }
    if (schema.maxLength) {
        errors.push(_.create('mat-error').setInnerHtml(`@if (form.get('${prop.name}')?.hasError('maxlength')) { Cannot exceed ${schema.maxLength} characters. }`));
    }
    if (schema.minimum !== undefined) {
        errors.push(_.create('mat-error').setInnerHtml(`@if (form.get('${prop.name}')?.hasError('min')) { Value must be at least ${schema.minimum}. }`));
    }
    if (schema.maximum !== undefined) {
        errors.push(_.create('mat-error').setInnerHtml(`@if (form.get('${prop.name}')?.hasError('max')) { Value cannot exceed ${schema.maximum}. }`));
    }
    if (schema.pattern) {
        errors.push(_.create('mat-error').setInnerHtml(`@if (form.get('${prop.name}')?.hasError('pattern')) { Invalid format. }`));
    }
    if (schema.format === 'email') {
        errors.push(_.create('mat-error').setInnerHtml(`@if (form.get('${prop.name}')?.hasError('email')) { Please enter a valid email address. }`));
    }
    // Custom Validators
    if (schema.exclusiveMinimum) {
        errors.push(_.create('mat-error').setInnerHtml(`@if (form.get('${prop.name}')?.hasError('exclusiveMinimum')) { Value must be greater than ${schema.minimum}. }`));
    }
    if (schema.exclusiveMaximum) {
        errors.push(_.create('mat-error').setInnerHtml(`@if (form.get('${prop.name}')?.hasError('exclusiveMaximum')) { Value must be less than ${schema.maximum}. }`));
    }
    if (schema.multipleOf !== undefined) {
        errors.push(_.create('mat-error').setInnerHtml(`@if (form.get('${prop.name}')?.hasError('multipleOf')) { Value must be a multiple of ${schema.multipleOf}. }`));
    }
    // Array Validators
    if (schema.uniqueItems) {
        errors.push(_.create('mat-error').setInnerHtml(`@if (form.get('${prop.name}')?.hasError('uniqueItems')) { All items must be unique. }`));
    }
    if (schema.minItems) {
        errors.push(_.create('mat-error').setInnerHtml(`@if (form.get('${prop.name}')?.hasError('minlength')) { Must contain at least ${schema.minItems} items. }`));
    }

    return errors;
}

/**
 * Main factory function that builds an appropriate Angular Material form control
 * based on the property's OpenAPI schema definition. It acts as a router,
 * delegating to more specific builder functions.
 * @param prop The property definition, including its name and schema.
 * @returns An `HtmlElementBuilder` instance for the control, or `null` if the
 *          schema type is not supported or the property is read-only.
 */
export function buildFormControl(prop: FormProperty): HtmlElementBuilder | null {
    if (!prop || !prop.schema || prop.schema.readOnly) return null;
    const labelText = pascalCase(prop.name);

    if (prop.schema.oneOf && prop.schema.discriminator) {
        return createSelect(prop, labelText, `discriminatorOptions`, false);
    }

    switch (prop.schema.type) {
        case 'string':
            if (prop.schema.format === 'date' || prop.schema.format === 'date-time') return createDatepicker(prop, labelText);
            if (prop.schema.format === 'binary') return createFile(prop, labelText);
            if (prop.schema.format === 'textarea') return createTextarea(prop, labelText);
            if (prop.schema.enum) {
                return prop.schema.enum.length > 4
                    ? createSelect(prop, labelText, `${camelCase(prop.name)}Options`, false)
                    : createRadio(prop, labelText, `${camelCase(prop.name)}Options`);
            }
            return createInput(prop, labelText, 'text');
        case 'boolean':
            return createToggle(prop, labelText);
        case 'integer':
        case 'number':
            if (prop.schema.minimum !== undefined && prop.schema.maximum !== undefined && !prop.schema.exclusiveMinimum && !prop.schema.exclusiveMaximum) {
                return createSlider(prop, labelText, prop.schema.minimum, prop.schema.maximum);
            }
            return createInput(prop, labelText, 'number');
        case 'array':
            const items = prop.schema.items as SwaggerDefinition;
            if (items?.enum) {
                return createSelect(prop, labelText, `${camelCase(prop.name)}Options`, true);
            } else if (items?.properties || items?.type === 'object') {
                return createFormArray(prop, labelText);
            }
            return createChips(prop, labelText);
        case 'object':
            if (prop.schema.properties) {
                return createFormGroup(prop);
            }
            return null;
        default:
            return null;
    }
}

/** @private Creates a standard <mat-form-field> with a text or number input. */
function createInput(prop: FormProperty, label: string, type: 'text' | 'number'): HtmlElementBuilder {
    const field = _.create('mat-form-field');
    field.appendChild(_.create('mat-label').setTextContent(label));
    field.appendChild(_.create('input').setAttribute('matInput', '').setAttribute('formControlName', prop.name).setAttribute('type', type).selfClosing());

    buildErrorMessages(prop).forEach(error => field.appendChild(error));

    return field;
}

/** @private Creates a date picker control. */
function createDatepicker(prop: FormProperty, label: string): HtmlElementBuilder {
    const pickerId = `picker_${prop.name}`;
    const field = _.create('mat-form-field');
    field.appendChild(_.create('mat-label').setTextContent(label));
    field.appendChild(_.create('input').setAttribute('matInput', '').setAttribute(`[matDatepicker]`, pickerId).setAttribute('formControlName', prop.name).selfClosing());
    field.appendChild(_.create('mat-datepicker-toggle').setAttribute('matSuffix', '').setAttribute('[for]', pickerId));
    field.appendChild(_.create('mat-datepicker').setAttribute(`#${pickerId}`, ''));
    return field;
}

/** @private Creates a single or multi-select dropdown. */
function createSelect(prop: FormProperty, label: string, optionsName: string, isMultiple: boolean): HtmlElementBuilder {
    const field = _.create('mat-form-field');
    const select = _.create('mat-select').setAttribute('formControlName', prop.name);
    if (isMultiple) {
        select.setAttribute('multiple', '');
    }
    select.setInnerHtml(`@for (option of ${optionsName}; track option) {\n  <mat-option [value]="option">{{option}}</mat-option>\n}`);
    field.appendChild(_.create('mat-label').setTextContent(label));
    field.appendChild(select);
    return field;
}

/** @private Creates a file input control. */
function createFile(prop: FormProperty, label: string): HtmlElementBuilder {
    const inputId = `fileInput_${prop.name}`;
    const container = _.create('div').addClass('admin-file-input');
    container.appendChild(_.create('span').addClass('mat-body-1').setTextContent(label));
    container.appendChild(_.create('input').setAttribute('type', 'file').setAttribute(`#${inputId}`, '').setAttribute('(change)', `onFileSelected($event, '${prop.name}')`).setAttribute('style', 'display: none;').selfClosing());
    container.appendChild(_.create('button').setAttribute('mat-stroked-button', '').setAttribute('type', 'button').setAttribute('(click)', `${inputId}.click()`).setTextContent('Choose File'));
    container.appendChild(_.create('span').addClass('file-name').setTextContent(`{{ form.get('${prop.name}')?.value?.name || 'No file selected' }}`));
    return container;
}

/** @private Creates a group of radio buttons. */
function createRadio(prop: FormProperty, label: string, optionsName: string): HtmlElementBuilder {
    const group = _.create('div').addClass('admin-radio-group');
    const radioGroup = _.create('mat-radio-group').setAttribute('formControlName', prop.name);
    radioGroup.setInnerHtml(`@for (option of ${optionsName}; track option) { <mat-radio-button [value]="option">{{option}}</mat-radio-button> }`);
    group.appendChild(_.create('label').addClass('mat-label').setTextContent(label));
    group.appendChild(radioGroup);
    return group;
}

/** @private Creates a Yes/No toggle button group for a boolean. */
function createToggle(prop: FormProperty, label: string): HtmlElementBuilder {
    const group = _.create('div').addClass('admin-toggle-group');
    const toggleGroup = _.create('mat-button-toggle-group').setAttribute('formControlName', prop.name);
    toggleGroup.appendChild(_.create('mat-button-toggle').setAttribute('value', 'true').setTextContent('Yes'));
    toggleGroup.appendChild(_.create('mat-button-toggle').setAttribute('value', 'false').setTextContent('No'));
    group.appendChild(_.create('label').addClass('mat-label').setTextContent(label));
    group.appendChild(toggleGroup);
    return group;
}

/** @private Creates a slider for a number within a defined range. */
function createSlider(prop: FormProperty, label: string, min: any, max: any): HtmlElementBuilder {
    const container = _.create('div').addClass('admin-slider-container');
    container.appendChild(_.create('label').addClass('mat-label').setTextContent(label));
    container.appendChild(_.create('mat-slider').setAttribute('min', String(min)).setAttribute('max', String(max)).setAttribute('discrete', '').setAttribute('showTickMarks', '').setAttribute('formControlName', prop.name));
    return container;
}

/** @private Creates a chip input for an array of strings. */
function createChips(prop: FormProperty, label: string): HtmlElementBuilder {
    const field = _.create('mat-form-field');
    const chipGrid = _.create('mat-chip-grid').setAttribute('formControlName', prop.name).setAttribute(`#chipGrid_${prop.name}`, '');
    chipGrid.setInnerHtml(`@for (item of form.get('${prop.name}')?.value; track item) {\n  <mat-chip-row>{{item}}</mat-chip-row>\n}`);
    field.appendChild(_.create('mat-label').setTextContent(label));
    field.appendChild(chipGrid);
    buildErrorMessages(prop).forEach(error => field.appendChild(error));
    return field;
}

/** @private Creates a textarea for long-form text. */
function createTextarea(prop: FormProperty, label: string): HtmlElementBuilder {
    const field = _.create('mat-form-field');
    field.appendChild(_.create('mat-label').setTextContent(label));
    field.appendChild(_.create('textarea').setAttribute('matInput', '').setAttribute('formControlName', prop.name));
    return field;
}

/** @private Creates a container for a nested FormGroup. */
function createFormGroup(prop: FormProperty): HtmlElementBuilder {
    const container = _.create('div').addClass('admin-form-group').setAttribute('formGroupName', prop.name);
    container.appendChild(_.create('h3').setTextContent(pascalCase(prop.name)));
    for (const key in prop.schema.properties) {
        const control = buildFormControl({ name: key, schema: prop.schema.properties[key] });
        if (control) {
            container.appendChild(control);
        }
    }
    return container;
}

/** @private Creates a container for a FormArray of nested FormGroups. */
function createFormArray(prop: FormProperty, label: string): HtmlElementBuilder {
    const container = _.create('div').addClass('admin-form-array');
    container.appendChild(_.create('h3').setTextContent(label));

    const arrayContainer = _.create('div').setAttribute('formArrayName', prop.name);
    const itemContainer = _.create('div').setAttribute('@for', `item of ${camelCase(prop.name)}Array.controls; track $index; let i = $index;`);
    itemContainer.setAttribute('[formGroupName]', 'i');

    const itemProperties = (prop.schema.items as SwaggerDefinition)?.properties ?? {};
    for (const key in itemProperties) {
        const control = buildFormControl({ name: key, schema: itemProperties[key] });
        if (control) {
            itemContainer.appendChild(control);
        }
    }

    itemContainer.appendChild(_.create('button').setAttribute('mat-icon-button', '').setAttribute('color', 'warn').setAttribute('(click)', `remove${pascalCase(singular(prop.name))}(i)`).appendChild(_.create('mat-icon').setTextContent('delete')));

    arrayContainer.appendChild(itemContainer);
    container.appendChild(arrayContainer);
    container.appendChild(_.create('button').setAttribute('mat-stroked-button', '').setAttribute('type', 'button').setAttribute('(click)', `add${pascalCase(singular(prop.name))}()`).setTextContent(`Add ${pascalCase(singular(prop.name))}`));
    return container;
}
