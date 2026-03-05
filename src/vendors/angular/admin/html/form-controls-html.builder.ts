// src/generators/angular/admin/html/form-controls-html.builder.ts
import { FormControlModel } from '@src/vendors/angular/admin/analysis/form-types.js';
import { SwaggerDefinition } from '@src/core/types/index.js';
import { camelCase, pascalCase, singular } from '@src/functions/utils.js';

import { HtmlElementBuilder, HtmlElementBuilder as _ } from '../html-element.builder.js';

export function buildErrorMessages(control: FormControlModel): HtmlElementBuilder[] {
    /* v8 ignore next */
    const errors: HtmlElementBuilder[] = [];

    /* v8 ignore next */
    for (const rule of control.validationRules) {
        /* v8 ignore next */
        switch (rule.type) {
            case 'required':
                /* v8 ignore next */
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('required')) { This field is required. }`,
                    ),
                );
                /* v8 ignore next */
                break;
            case 'minLength':
                /* v8 ignore next */
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('minlength')) { Must be at least ${rule.value} characters long. }`,
                    ),
                );
                /* v8 ignore next */
                break;
            case 'maxLength':
                /* v8 ignore next */
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('maxlength')) { Cannot exceed ${rule.value} characters. }`,
                    ),
                );
                /* v8 ignore next */
                break;
            case 'min':
                /* v8 ignore next */
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('min')) { Value must be at least ${rule.value}. }`,
                    ),
                );
                /* v8 ignore next */
                break;
            case 'max':
                /* v8 ignore next */
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('max')) { Value cannot exceed ${rule.value}. }`,
                    ),
                );
                /* v8 ignore next */
                break;
            case 'exclusiveMinimum':
                /* v8 ignore next */
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('exclusiveMinimum')) { Value must be greater than ${rule.value}. }`,
                    ),
                );
                /* v8 ignore next */
                break;
            case 'exclusiveMaximum':
                /* v8 ignore next */
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('exclusiveMaximum')) { Value must be less than ${rule.value}. }`,
                    ),
                );
                /* v8 ignore next */
                break;
            case 'pattern':
                /* v8 ignore next */
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('pattern')) { Invalid format. }`,
                    ),
                );
                /* v8 ignore next */
                break;
            case 'email':
                /* v8 ignore next */
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('email')) { Please enter a valid email address. }`,
                    ),
                );
                /* v8 ignore next */
                break;
            case 'multipleOf':
                /* v8 ignore next */
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('multipleOf')) { Value must be a multiple of ${rule.value}. }`,
                    ),
                );
                /* v8 ignore next */
                break;
            case 'uniqueItems':
                /* v8 ignore next */
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('uniqueItems')) { All items must be unique. }`,
                    ),
                );
                /* v8 ignore next */
                break;
            case 'minItems':
                /* v8 ignore next */
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('minlength')) { Must contain at least ${rule.value} items. }`,
                    ),
                );
                /* v8 ignore next */
                break;
            case 'maxItems':
                /* v8 ignore next */
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('maxlength')) { Cannot contain more than ${rule.value} items. }`,
                    ),
                );
                /* v8 ignore next */
                break;
            case 'const':
                /* v8 ignore next */
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('const')) { Value must be {{ form.get('${control.name}')?.errors?.['const'].required }}. }`,
                    ),
                );
                /* v8 ignore next */
                break;
            case 'not':
                /* v8 ignore next */
                errors.push(
                    _.create('mat-error').setInnerHtml(
                        `@if (form.get('${control.name}')?.hasError('not')) { Value matches a restricted format. }`,
                    ),
                );
                /* v8 ignore next */
                break;
        }
    }
    /* v8 ignore next */
    return errors;
}

export function buildFormControl(control: FormControlModel): HtmlElementBuilder | null {
    /* v8 ignore next */
    if (!control || !control.schema) return null;
    /* v8 ignore next */
    const labelText = pascalCase(control.name);

    /* v8 ignore next */
    if (control.schema.oneOf && control.schema.discriminator) {
        /* v8 ignore next */
        return createSelect(control, labelText, `discriminatorOptions`, false);
    }

    /* v8 ignore next */
    switch (control.schema.type) {
        case 'string':
            /* v8 ignore next */
            if (control.schema.format === 'date' || control.schema.format === 'date-time')
                /* v8 ignore next */
                return createDatepicker(control, labelText);
            /* v8 ignore next */
            if (control.schema.format === 'binary') return createFile(control, labelText);
            /* v8 ignore next */
            if (control.schema.format === 'textarea') return createTextarea(control, labelText);
            /* v8 ignore next */
            if (control.schema.enum)
                /* v8 ignore next */
                return control.schema.enum.length > 4
                    ? createSelect(control, labelText, `${camelCase(control.name)}Options`, false)
                    : createRadio(control, labelText, `${camelCase(control.name)}Options`);
            /* v8 ignore next */
            return createInput(control, labelText, 'text');
        case 'boolean':
            /* v8 ignore next */
            return createToggle(control, labelText);
        case 'integer':
        case 'number':
            /* v8 ignore next */
            if (
                control.schema.minimum !== undefined &&
                control.schema.maximum !== undefined &&
                !control.schema.exclusiveMinimum &&
                !control.schema.exclusiveMaximum
            ) {
                /* v8 ignore next */
                return createSlider(control, labelText, control.schema.minimum, control.schema.maximum);
            }
            /* v8 ignore next */
            return createInput(control, labelText, 'number');
        case 'array': {
            /* v8 ignore next */
            const items = control.schema.items as SwaggerDefinition;
            /* v8 ignore next */
            if (items?.enum) return createSelect(control, labelText, `${camelCase(control.name)}Options`, true);
            /* v8 ignore next */ else if (items?.properties || items?.type === 'object')
                return createFormArray(control, labelText);
            /* v8 ignore next */
            return createChips(control, labelText);
        }
        case 'object':
            /* v8 ignore next */
            if (control.controlType === 'map') return createMapEditor(control, labelText);
            /* v8 ignore next */
            return control.nestedControls ? createFormGroup(control) : null;
        default:
            /* v8 ignore next */
            return null;
    }
}

function createInput(control: FormControlModel, label: string, type: 'text' | 'number'): HtmlElementBuilder {
    /* v8 ignore next */
    const field = _.create('mat-form-field');
    /* v8 ignore next */
    field.appendChild(_.create('mat-label').setTextContent(label));
    /* v8 ignore next */
    const input = _.create('input')
        .setAttribute('matInput', '')
        .setAttribute('formControlName', control.name)
        .setAttribute('type', type);

    /* v8 ignore next */
    if (control.schema?.readOnly) {
        /* v8 ignore next */
        input.setAttribute('[readonly]', 'true');
    }

    /* v8 ignore next */
    field.appendChild(input.selfClosing());
    /* v8 ignore next */
    buildErrorMessages(control).forEach(error => field.appendChild(error));
    /* v8 ignore next */
    return field;
}

function createDatepicker(control: FormControlModel, label: string): HtmlElementBuilder {
    /* v8 ignore next */
    const pickerId = `picker_${control.name}`;
    /* v8 ignore next */
    const field = _.create('mat-form-field');
    /* v8 ignore next */
    field.appendChild(_.create('mat-label').setTextContent(label));
    /* v8 ignore next */
    field.appendChild(
        _.create('input')
            .setAttribute('matInput', '')
            .setAttribute(`[matDatepicker]`, pickerId)
            .setAttribute('formControlName', control.name)
            .selfClosing(),
    );
    /* v8 ignore next */
    field.appendChild(_.create('mat-datepicker-toggle').setAttribute('matSuffix', '').setAttribute('[for]', pickerId));
    /* v8 ignore next */
    field.appendChild(_.create('mat-datepicker').setAttribute(`#${pickerId}`, ''));
    /* v8 ignore next */
    return field;
}

function createSelect(
    control: FormControlModel,
    label: string,
    optionsName: string,
    isMultiple: boolean,
): HtmlElementBuilder {
    /* v8 ignore next */
    const field = _.create('mat-form-field');
    /* v8 ignore next */
    const select = _.create('mat-select').setAttribute('formControlName', control.name);
    /* v8 ignore next */
    if (isMultiple) select.setAttribute('multiple', '');
    /* v8 ignore next */
    select.setInnerHtml(
        `@for (option of ${optionsName}; track option) {\n  <mat-option [value]="option">{{option}}</mat-option>\n}`,
    );
    /* v8 ignore next */
    field.appendChild(_.create('mat-label').setTextContent(label));
    /* v8 ignore next */
    field.appendChild(select);
    /* v8 ignore next */
    return field;
}

function createFile(control: FormControlModel, label: string): HtmlElementBuilder {
    /* v8 ignore next */
    const inputId = `fileInput_${control.name}`;
    /* v8 ignore next */
    const container = _.create('div').addClass('admin-file-input');
    /* v8 ignore next */
    container.appendChild(_.create('span').addClass('mat-body-1').setTextContent(label));
    /* v8 ignore next */
    container.appendChild(
        _.create('input')
            .setAttribute('type', 'file')
            .setAttribute(`#${inputId}`, '')
            .setAttribute('(change)', `onFileSelected($event, '${control.name}')`)
            .setAttribute('style', 'display: none;')
            .selfClosing(),
    );
    /* v8 ignore next */
    container.appendChild(
        _.create('button')
            .setAttribute('mat-stroked-button', '')
            .setAttribute('type', 'button')
            .setAttribute('(click)', `${inputId}.click()`)
            .setTextContent('Choose File'),
    );
    /* v8 ignore next */
    container.appendChild(
        _.create('span')
            .addClass('file-name')
            .setTextContent(`{{ form.get('${control.name}')?.value?.name || 'No file selected' }}`),
    );
    /* v8 ignore next */
    return container;
}

function createRadio(control: FormControlModel, label: string, optionsName: string): HtmlElementBuilder {
    /* v8 ignore next */
    const group = _.create('div').addClass('admin-radio-group');
    /* v8 ignore next */
    const radioGroup = _.create('mat-radio-group').setAttribute('formControlName', control.name);
    /* v8 ignore next */
    radioGroup.setInnerHtml(
        `@for (option of ${optionsName}; track option) { <mat-radio-button [value]="option">{{option}}</mat-radio-button> }`,
    );
    /* v8 ignore next */
    group.appendChild(_.create('label').addClass('mat-label').setTextContent(label));
    /* v8 ignore next */
    group.appendChild(radioGroup);
    /* v8 ignore next */
    return group;
}

function createToggle(control: FormControlModel, label: string): HtmlElementBuilder {
    /* v8 ignore next */
    const group = _.create('div').addClass('admin-toggle-group');
    /* v8 ignore next */
    const toggleGroup = _.create('mat-button-toggle-group').setAttribute('formControlName', control.name);
    /* v8 ignore next */
    toggleGroup.appendChild(_.create('mat-button-toggle').setAttribute('value', 'true').setTextContent('Yes'));
    /* v8 ignore next */
    toggleGroup.appendChild(_.create('mat-button-toggle').setAttribute('value', 'false').setTextContent('No'));
    /* v8 ignore next */
    group.appendChild(_.create('label').addClass('mat-label').setTextContent(label));
    /* v8 ignore next */
    group.appendChild(toggleGroup);
    /* v8 ignore next */
    return group;
}

function createSlider(
    control: FormControlModel,
    label: string,
    min: number | string,
    max: number | string,
): HtmlElementBuilder {
    /* v8 ignore next */
    const container = _.create('div').addClass('admin-slider-container');
    /* v8 ignore next */
    container.appendChild(_.create('label').addClass('mat-label').setTextContent(label));
    /* v8 ignore next */
    container.appendChild(
        _.create('mat-slider')
            .setAttribute('min', String(min))
            .setAttribute('max', String(max))
            .setAttribute('discrete', '')
            .setAttribute('showTickMarks', '')
            .setAttribute('formControlName', control.name),
    );
    /* v8 ignore next */
    return container;
}

function createChips(control: FormControlModel, label: string): HtmlElementBuilder {
    /* v8 ignore next */
    const field = _.create('mat-form-field');
    /* v8 ignore next */
    const chipGrid = _.create('mat-chip-grid')
        .setAttribute('formControlName', control.name)
        .setAttribute(`#chipGrid_${control.name}`, '');
    /* v8 ignore next */
    chipGrid.setInnerHtml(
        `@for (item of form.get('${control.name}')?.value; track item) {\n  <mat-chip-row>{{item}}</mat-chip-row>\n}`,
    );
    /* v8 ignore next */
    field.appendChild(_.create('mat-label').setTextContent(label));
    /* v8 ignore next */
    field.appendChild(chipGrid);
    /* v8 ignore next */
    buildErrorMessages(control).forEach(error => field.appendChild(error));
    /* v8 ignore next */
    return field;
}

function createTextarea(control: FormControlModel, label: string): HtmlElementBuilder {
    /* v8 ignore next */
    const field = _.create('mat-form-field');
    /* v8 ignore next */
    field.appendChild(_.create('mat-label').setTextContent(label));
    /* v8 ignore next */
    const area = _.create('textarea').setAttribute('matInput', '').setAttribute('formControlName', control.name);
    /* v8 ignore next */
    if (control.schema?.readOnly) area.setAttribute('[readonly]', 'true');
    /* v8 ignore next */
    field.appendChild(area);
    /* v8 ignore next */
    return field;
}

function createFormGroup(control: FormControlModel): HtmlElementBuilder {
    /* v8 ignore next */
    const container = _.create('div').addClass('admin-form-group').setAttribute('formGroupName', control.name);
    /* v8 ignore next */
    container.appendChild(_.create('h3').setTextContent(pascalCase(control.name)));
    /* v8 ignore next */
    for (const nestedControl of control.nestedControls!) {
        /* v8 ignore next */
        const builder = buildFormControl(nestedControl);
        /* v8 ignore next */
        if (builder) container.appendChild(builder);
    }
    /* v8 ignore next */
    return container;
}

function createFormArray(control: FormControlModel, label: string): HtmlElementBuilder {
    /* v8 ignore next */
    const container = _.create('div').addClass('admin-form-array');
    /* v8 ignore next */
    container.appendChild(_.create('h3').setTextContent(label));
    /* v8 ignore next */
    const arrayContainer = _.create('div').setAttribute('formArrayName', control.name);
    /* v8 ignore next */
    const itemContainer = _.create('div').setAttribute(
        '@for',
        `item of ${camelCase(control.name)}Array.controls; track $index; let i = $index;`,
    );
    /* v8 ignore next */
    itemContainer.setAttribute('[formGroupName]', 'i');

    /* v8 ignore next */
    if (control.nestedControls) {
        /* v8 ignore next */
        for (const nestedControl of control.nestedControls) {
            /* v8 ignore next */
            const builder = buildFormControl(nestedControl);
            /* v8 ignore next */
            if (builder) itemContainer.appendChild(builder);
        }
    }

    /* v8 ignore next */
    itemContainer.appendChild(
        _.create('button')
            .setAttribute('mat-icon-button', '')
            .setAttribute('color', 'warn')
            .setAttribute('(click)', `remove${pascalCase(singular(control.name))}(i)`)
            .appendChild(_.create('mat-icon').setTextContent('delete')),
    );
    /* v8 ignore next */
    arrayContainer.appendChild(itemContainer);
    /* v8 ignore next */
    container.appendChild(arrayContainer);
    /* v8 ignore next */
    container.appendChild(
        _.create('button')
            .setAttribute('mat-stroked-button', '')
            .setAttribute('type', 'button')
            .setAttribute('(click)', `add${pascalCase(singular(control.name))}()`)
            .setTextContent(`Add ${pascalCase(singular(control.name))}`),
    );
    /* v8 ignore next */
    return container;
}

function createMapEditor(control: FormControlModel, label: string): HtmlElementBuilder {
    /* v8 ignore next */
    const container = _.create('div').addClass('admin-map-editor');
    /* v8 ignore next */
    container.appendChild(_.create('h3').setTextContent(label));

    /* v8 ignore next */
    const arrayContainer = _.create('div').setAttribute('formArrayName', control.name);

    /* v8 ignore next */
    const mapGetter = `${camelCase(control.name)}Map`;

    /* v8 ignore next */
    const loopContainer = _.create('div').setAttribute(
        '@for',
        `pair of ${mapGetter}.controls; track $index; let i = $index;`,
    );
    /* v8 ignore next */
    loopContainer.setAttribute('[formGroupName]', 'i').addClass('map-pair-row');

    /* v8 ignore next */
    const keyField = _.create('mat-form-field').addClass('map-key-field');
    /* v8 ignore next */
    keyField.appendChild(_.create('mat-label').setTextContent('Key'));
    /* v8 ignore next */
    keyField.appendChild(_.create('input').setAttribute('matInput', '').setAttribute('formControlName', 'key'));

    /* v8 ignore next */
    if (control.mapValueControl) {
        /* v8 ignore next */
        const valueControlFake = { ...control.mapValueControl, name: 'value' };
        /* v8 ignore next */
        const valueBuilder = buildFormControl(valueControlFake);

        /* v8 ignore next */
        if (valueBuilder) {
            /* v8 ignore next */
            loopContainer.appendChild(keyField);
            /* v8 ignore next */
            loopContainer.appendChild(valueBuilder);
        }
    }

    /* v8 ignore next */
    loopContainer.appendChild(
        _.create('button')
            .setAttribute('mat-icon-button', '')
            .setAttribute('color', 'warn')
            .setAttribute('(click)', `remove${pascalCase(control.name)}Entry(i)`)
            .appendChild(_.create('mat-icon').setTextContent('delete')),
    );

    /* v8 ignore next */
    arrayContainer.appendChild(loopContainer);
    /* v8 ignore next */
    container.appendChild(arrayContainer);

    /* v8 ignore next */
    container.appendChild(
        _.create('button')
            .setAttribute('mat-stroked-button', '')
            .setAttribute('type', 'button')
            .setAttribute('(click)', `add${pascalCase(control.name)}Entry()`)
            .setTextContent(`Add Entry`),
    );

    /* v8 ignore next */
    return container;
}
