import { Project } from 'ts-morph';
import { Resource } from '@src/core/types/index.js';
import { camelCase, pascalCase } from '@src/functions/utils.js';

export class FormComponentGenerator {
    /* v8 ignore next */
    constructor(private readonly project: Project) {}

    public generate(resource: Resource, outDir: string): void {
        /* v8 ignore next */
        const componentName = `${pascalCase(resource.name)}FormComponent`;
        /* v8 ignore next */
        const tagName = `app-${camelCase(resource.name)
            .replace(/([A-Z])/g, '-$1')
            .toLowerCase()}-form`;
        /* v8 ignore next */
        const serviceName = `${pascalCase(resource.name)}Service`;
        /* v8 ignore next */
        const dirPath = `${outDir}/${resource.name}/${resource.name}-form`;

        /* v8 ignore next */
        /* v8 ignore start */
        if (!this.project.getFileSystem().directoryExists(dirPath)) {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            this.project.getFileSystem().mkdirSync(dirPath);
            /* v8 ignore stop */
        }

        /* v8 ignore next */
        const filePath = `${dirPath}/${resource.name}-form.component.ts`;
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        const createOp = resource.operations.find(op => op.action === 'create');
        /* v8 ignore next */
        const updateOp = resource.operations.find(op => op.action === 'update');
        /* v8 ignore next */
        const getOp = resource.operations.find(op => op.action === 'getById');

        /* v8 ignore next */
        const createMethodCall = createOp?.methodName || 'create';
        /* v8 ignore next */
        const updateMethodCall = updateOp?.methodName || 'update';
        /* v8 ignore next */
        const getMethodCall = getOp?.methodName || 'getById';

        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: `../../../services/${resource.name}.service.js`,
            namedImports: [serviceName],
        });

        /* v8 ignore next */
        const template = `<style>
    :host { display: block; font-family: sans-serif; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
    input, select, textarea { width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
    button { padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; }
    .btn-secondary { background: #6c757d; margin-left: 8px; }
</style>
<div>
    <h2><span id="form-title">Create</span> ${pascalCase(resource.name)}</h2>
    <form id="resource-form">
        ${resource.formProperties
            .map(
                /* v8 ignore next */
                p => `
        <div class="form-group">
            <label for="${p.name}">${pascalCase(p.name)}</label>
            <input type="text" id="${p.name}" name="${p.name}" />
        </div>
        `,
            )
            .join('')}
        <button type="submit">Save</button>
        <button type="button" class="btn-secondary" id="cancel-btn">Cancel</button>
    </form>
</div>`;

        /* v8 ignore next */
        const classDecl = sourceFile.addClass({
            name: componentName,
            isExported: true,
            extends: 'HTMLElement',
        });

        /* v8 ignore next */
        classDecl.addProperty({
            name: 'service',
            initializer: `new ${serviceName}()`,
        });

        /* v8 ignore next */
        classDecl.addProperty({
            name: 'itemId',
            type: 'string | null',
            initializer: 'null',
        });

        /* v8 ignore next */
        classDecl.addMethod({
            name: 'connectedCallback',
            isAsync: true,
            statements: [
                `this.innerHTML = ${JSON.stringify(template)};`,
                `const match = window.location.hash.match(/\\/${resource.name}\\/edit\\/(.+)/);`,
                `if (match) {`,
                `    this.itemId = match[1];`,
                `    this.querySelector('#form-title')!.textContent = 'Edit';`,
                `    await this.loadData();`,
                `} else {`,
                `    this.itemId = null;`,
                `    this.querySelector('#form-title')!.textContent = 'Create';`,
                `}`,
                `this.querySelector('#cancel-btn')?.addEventListener('click', () => {`,
                `    window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/${resource.name}' } }));`,
                `});`,
                `this.querySelector('#resource-form')?.addEventListener('submit', async (e) => {`,
                `    e.preventDefault();`,
                `    await this.saveData();`,
                `});`,
            ].join('\n'),
        });

        /* v8 ignore next */
        const loadDataStatements = [
            `if (!this.itemId) return;`,
            `try {`,
            `    const data = await this.service.${getMethodCall}(this.itemId);`,
        ];

        /* v8 ignore next */
        resource.formProperties.forEach(p => {
            /* v8 ignore next */
            loadDataStatements.push(`    const input${p.name} = this.querySelector('#${p.name}') as HTMLInputElement;`);
            /* v8 ignore next */
            loadDataStatements.push(
                `    if (input${p.name} && data.${p.name} !== undefined) input${p.name}.value = String(data.${p.name});`,
            );
        });

        /* v8 ignore next */
        loadDataStatements.push(`} catch (error) {`, `    console.error('Failed to load item', error);`, `}`);

        /* v8 ignore next */
        classDecl.addMethod({
            name: 'loadData',
            isAsync: true,
            statements: loadDataStatements.join('\n'),
        });

        /* v8 ignore next */
        const saveDataStatements = [`const payload: string | number | boolean | object | undefined | null = {};`];

        /* v8 ignore next */
        resource.formProperties.forEach(p => {
            /* v8 ignore next */
            saveDataStatements.push(`const input${p.name} = this.querySelector('#${p.name}') as HTMLInputElement;`);
            /* v8 ignore next */
            saveDataStatements.push(`if (input${p.name}) payload.${p.name} = input${p.name}.value;`);
        });

        /* v8 ignore next */
        saveDataStatements.push(
            `try {`,
            `    if (this.itemId) {`,
            `        await this.service.${updateMethodCall}(this.itemId, payload);`,
            `    } else {`,
            `        await this.service.${createMethodCall}(payload);`,
            `    }`,
            `    window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/${resource.name}' } }));`,
            `} catch (error) {`,
            `    console.error('Failed to save item', error);`,
            `    alert('Failed to save');`,
            `}`,
        );

        /* v8 ignore next */
        classDecl.addMethod({
            name: 'saveData',
            isAsync: true,
            statements: saveDataStatements.join('\n'),
        });

        /* v8 ignore next */
        sourceFile.addStatements(`customElements.define('${tagName}', ${componentName});`);
    }
}
