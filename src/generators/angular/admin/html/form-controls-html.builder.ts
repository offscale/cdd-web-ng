// src/generators/angular/admin/html/form-controls-html.builder.ts
import { FormControlModel } from '@src/analysis/form-types.js';
import { SwaggerDefinition } from '@src/core/types/index.js';
import { camelCase, pascalCase, singular } from '@src/core/utils/index.js';

import { HtmlElementBuilder, HtmlElementBuilder as _ } from '../html-element.builder.js';

export function buildErrorMessages(control: FormControlModel): HtmlElementBuilder[] {
    const errors: HtmlElementBuilder[] = [];

    for (const rule of control.validationRules) {
        switch (rule.type) {
            case 'required':
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('required')) { This field is required. }`,
                    ),
                );
                break;
            case 'minLength':
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('minlength')) { Must be at least ${rule.value} characters long. }`,
                    ),
                );
                break;
            case 'maxLength':
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('maxlength')) { Cannot exceed ${rule.value} characters. }`,
                    ),
                );
                break;
            case 'min':
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('min')) { Value must be at least ${rule.value}. }`,
                    ),
                );
                break;
            case 'max':
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('max')) { Value cannot exceed ${rule.value}. }`,
                    ),
                );
                break;
            case 'exclusiveMinimum':
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('exclusiveMinimum')) { Value must be greater than ${rule.value}. }`,
                    ),
                );
                break;
            case 'exclusiveMaximum':
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('exclusiveMaximum')) { Value must be less than ${rule.value}. }`,
                    ),
                );
                break;
            case 'pattern':
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('pattern')) { Invalid format. }`,
                    ),
                );
                break;
            case 'email':
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('email')) { Please enter a valid email address. }`,
                    ),
                );
                break;
            case 'multipleOf':
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('multipleOf')) { Value must be a multiple of ${rule.value}. }`,
                    ),
                );
                break;
            case 'uniqueItems':
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('uniqueItems')) { All items must be unique. }`,
                    ),
                );
                break;
            case 'minItems':
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('minlength')) { Must contain at least ${rule.value} items. }`,
                    ),
                );
                break;
            case 'maxItems':
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('maxlength')) { Cannot contain more than ${rule.value} items. }`,
                    ),
                );
                break;
            case 'const':
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('const')) { Value must be {{ form.get('${control.name}')?.errors?.['const'].required }}. }`,
                    ),
                );
                break;
            case 'not':
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('not')) { Value matches a restricted format. }`,
                    ),
                );
                break;
        }
    }
    return errors;
}

export function buildFormControl(control: FormControlModel): HtmlElementBuilder | null {
    if (!control || !control.schema) return null;
    const labelText = pascalCase(control.name);

    if (control.schema.oneOf && control.schema.discriminator) {
        return createSelect(control, labelText, `discriminatorOptions`, false);
    }

    switch (control.schema.type) {
        case 'string':
            if (control.schema.format === 'date' || control.schema.format === 'date-time')
                return createDatepicker(control, labelText);
            if (control.schema.format === 'binary') return createFile(control, labelText);
            if (control.schema.format === 'textarea') return createTextarea(control, labelText);
            if (control.schema.enum)
                return control.schema.enum.length > 4
                    ? createSelect(control, labelText, `${camelCase(control.name)}Options`, false)
                    : createRadio(control, labelText, `${camelCase(control.name)}Options`);
            return createInput(control, labelText, 'text');
        case 'boolean':
            return createToggle(control, labelText);
        case 'integer':
        case 'number':
            if (
                control.schema.minimum !== undefined &&
                control.schema.maximum !== undefined &&
                !control.schema.exclusiveMinimum &&
                !control.schema.exclusiveMaximum
            ) {
                return createSlider(control, labelText, control.schema.minimum, control.schema.maximum);
            }
            return createInput(control, labelText, 'number');
        case 'array': {
            const items = control.schema.items as SwaggerDefinition;
            if (items?.enum) return createSelect(control, labelText, `${camelCase(control.name)}Options`, true);
            else if (items?.properties || items?.type === 'object') return createFormArray(control, labelText);
            return createChips(control, labelText);
        }
        case 'object':
            if (control.controlType === 'map') return createMapEditor(control, labelText);
            return control.nestedControls ? createFormGroup(control) : null;
        default:
            return null;
    }
}

function createInput(control: FormControlModel, label: string, type: 'text' | 'number'): HtmlElementBuilder {
    const field = _.create('mat-form-field');
    field.appendChild(_.create('mat-label').setTextContent(label));
    const input = _.create('input')
        .setAttribute('matInput', '')
        .setAttribute('formControlName', control.name)
        .setAttribute('type', type);

    if (control.schema?.readOnly) {
        input.setAttribute('[readonly]', 'true');
    }

    field.appendChild(input.selfClosing());
    buildErrorMessages(control).forEach(error => field.appendChild(error));
    return field;
}

function createDatepicker(control: FormControlModel, label: string): HtmlElementBuilder {
    const pickerId = `picker_${control.name}`;
    const field = _.create('mat-form-field');
    field.appendChild(_.create('mat-label').setTextContent(label));
    field.appendChild(
        _.create('input')
            .setAttribute('matInput', '')
            .setAttribute(`[matDatepicker]`, pickerId)
            .setAttribute('formControlName', control.name)
            .selfClosing(),
    );
    field.appendChild(_.create('mat-datepicker-toggle').setAttribute('matSuffix', '').setAttribute('[for]', pickerId));
    field.appendChild(_.create('mat-datepicker').setAttribute(`#${pickerId}`, ''));
    return field;
}

function createSelect(
    control: FormControlModel,
    label: string,
    optionsName: string,
    isMultiple: boolean,
): HtmlElementBuilder {
    const field = _.create('mat-form-field');
    const select = _.create('mat-select').setAttribute('formControlName', control.name);
    if (isMultiple) select.setAttribute('multiple', '');
    select.setInnerHtml(
        `@for (option of ${optionsName}; track option) {\n  <mat-option [value]="option">{{option}}</mat-option>\n}`,
    );
    field.appendChild(_.create('mat-label').setTextContent(label));
    field.appendChild(select);
    return field;
}

function createFile(control: FormControlModel, label: string): HtmlElementBuilder {
    const inputId = `fileInput_${control.name}`;
    const container = _.create('div').addClass('admin-file-input');
    container.appendChild(_.create('span').addClass('mat-body-1').setTextContent(label));
    container.appendChild(
        _.create('input')
            .setAttribute('type', 'file')
            .setAttribute(`#${inputId}`, '')
            .setAttribute('(change)', `onFileSelected($event, '${control.name}')`)
            .setAttribute('style', 'display: none;')
            .selfClosing(),
    );
    container.appendChild(
        _.create('button')
            .setAttribute('mat-stroked-button', '')
            .setAttribute('type', 'button')
            .setAttribute('(click)', `${inputId}.click()`)
            .setTextContent('Choose File'),
    );
    container.appendChild(
        _.create('span')
            .addClass('file-name')
            .setTextContent(`{{ form.get('${control.name}')?.value?.name || 'No file selected' }}`),
    );
    return container;
}

function createRadio(control: FormControlModel, label: string, optionsName: string): HtmlElementBuilder {
    const group = _.create('div').addClass('admin-radio-group');
    const radioGroup = _.create('mat-radio-group').setAttribute('formControlName', control.name);
    radioGroup.setInnerHtml(
        `@for (option of ${optionsName}; track option) { <mat-radio-button [value]="option">{{option}}</mat-radio-button> }`,
    );
    group.appendChild(_.create('label').addClass('mat-label').setTextContent(label));
    group.appendChild(radioGroup);
    return group;
}

function createToggle(control: FormControlModel, label: string): HtmlElementBuilder {
    const group = _.create('div').addClass('admin-toggle-group');
    const toggleGroup = _.create('mat-button-toggle-group').setAttribute('formControlName', control.name);
    toggleGroup.appendChild(_.create('mat-button-toggle').setAttribute('value', 'true').setTextContent('Yes'));
    toggleGroup.appendChild(_.create('mat-button-toggle').setAttribute('value', 'false').setTextContent('No'));
    group.appendChild(_.create('label').addClass('mat-label').setTextContent(label));
    group.appendChild(toggleGroup);
    return group;
}

function createSlider(
    control: FormControlModel,
    label: string,
    min: number | string,
    max: number | string,
): HtmlElementBuilder {
    const container = _.create('div').addClass('admin-slider-container');
    container.appendChild(_.create('label').addClass('mat-label').setTextContent(label));
    container.appendChild(
        _.create('mat-slider')
            .setAttribute('min', String(min))
            .setAttribute('max', String(max))
            .setAttribute('discrete', '')
            .setAttribute('showTickMarks', '')
            .setAttribute('formControlName', control.name),
    );
    return container;
}

function createChips(control: FormControlModel, label: string): HtmlElementBuilder {
    const field = _.create('mat-form-field');
    const chipGrid = _.create('mat-chip-grid')
        .setAttribute('formControlName', control.name)
        .setAttribute(`#chipGrid_${control.name}`, '');
    chipGrid.setInnerHtml(
        `@for (item of form.get('${control.name}')?.value; track item) {\n  <mat-chip-row>{{item}}</mat-chip-row>\n}`,
    );
    field.appendChild(_.create('mat-label').setTextContent(label));
    field.appendChild(chipGrid);
    buildErrorMessages(control).forEach(error => field.appendChild(error));
    return field;
}

function createTextarea(control: FormControlModel, label: string): HtmlElementBuilder {
    const field = _.create('mat-form-field');
    field.appendChild(_.create('mat-label').setTextContent(label));
    const area = _.create('textarea').setAttribute('matInput', '').setAttribute('formControlName', control.name);
    if (control.schema?.readOnly) area.setAttribute('[readonly]', 'true');
    field.appendChild(area);
    return field;
}

function createFormGroup(control: FormControlModel): HtmlElementBuilder {
    const container = _.create('div').addClass('admin-form-group').setAttribute('formGroupName', control.name);
    container.appendChild(_.create('h3').setTextContent(pascalCase(control.name)));
    for (const nestedControl of control.nestedControls!) {
        const builder = buildFormControl(nestedControl);
        if (builder) container.appendChild(builder);
    }
    return container;
}

function createFormArray(control: FormControlModel, label: string): HtmlElementBuilder {
    const container = _.create('div').addClass('admin-form-array');
    container.appendChild(_.create('h3').setTextContent(label));
    const arrayContainer = _.create('div').setAttribute('formArrayName', control.name);
    const itemContainer = _.create('div').setAttribute(
        '@for',
        `item of ${camelCase(control.name)}Array.controls; track $index; let i = $index;`,
    );
    itemContainer.setAttribute('[formGroupName]', 'i');

    if (control.nestedControls) {
        for (const nestedControl of control.nestedControls) {
            const builder = buildFormControl(nestedControl);
            if (builder) itemContainer.appendChild(builder);
        }
    }

    itemContainer.appendChild(
        _.create('button')
            .setAttribute('mat-icon-button', '')
            .setAttribute('color', 'warn')
            .setAttribute('(click)', `remove${pascalCase(singular(control.name))}(i)`)
            .appendChild(_.create('mat-icon').setTextContent('delete')),
    );
    arrayContainer.appendChild(itemContainer);
    container.appendChild(arrayContainer);
    container.appendChild(
        _.create('button')
            .setAttribute('mat-stroked-button', '')
            .setAttribute('type', 'button')
            .setAttribute('(click)', `add${pascalCase(singular(control.name))}()`)
            .setTextContent(`Add ${pascalCase(singular(control.name))}`),
    );
    return container;
}

function createMapEditor(control: FormControlModel, label: string): HtmlElementBuilder {
    const container = _.create('div').addClass('admin-map-editor');
    container.appendChild(_.create('h3').setTextContent(label));

    const arrayContainer = _.create('div').setAttribute('formArrayName', control.name);

    const mapGetter = `${camelCase(control.name)}Map`;

    const loopContainer = _.create('div').setAttribute(
        '@for',
        `pair of ${mapGetter}.controls; track $index; let i = $index;`,
    );
    loopContainer.setAttribute('[formGroupName]', 'i').addClass('map-pair-row');

    const keyField = _.create('mat-form-field').addClass('map-key-field');
    keyField.appendChild(_.create('mat-label').setTextContent('Key'));
    keyField.appendChild(_.create('input').setAttribute('matInput', '').setAttribute('formControlName', 'key'));

    if (control.mapValueControl) {
        const valueControlFake = { ...control.mapValueControl, name: 'value' };
        const valueBuilder = buildFormControl(valueControlFake);

        if (valueBuilder) {
            loopContainer.appendChild(keyField);
            loopContainer.appendChild(valueBuilder);
        }
    }

    loopContainer.appendChild(
        _.create('button')
            .setAttribute('mat-icon-button', '')
            .setAttribute('color', 'warn')
            .setAttribute('(click)', `remove${pascalCase(control.name)}Entry(i)`)
            .appendChild(_.create('mat-icon').setTextContent('delete')),
    );

    arrayContainer.appendChild(loopContainer);
    container.appendChild(arrayContainer);

    container.appendChild(
        _.create('button')
            .setAttribute('mat-stroked-button', '')
            .setAttribute('type', 'button')
            .setAttribute('(click)', `add${pascalCase(control.name)}Entry()`)
            .setTextContent(`Add Entry`),
    );

    return container;
}
