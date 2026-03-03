import { Project } from 'ts-morph';
import { Resource } from '@src/core/types/index.js';
import { camelCase, pascalCase } from '@src/functions/utils.js';

export class FormComponentGenerator {
    constructor(private readonly project: Project) {}

    public generate(resource: Resource, outDir: string): void {
        const componentName = `${pascalCase(resource.name)}FormComponent`;
        const tagName = `app-${camelCase(resource.name)
            .replace(/([A-Z])/g, '-$1')
            .toLowerCase()}-form`;
        const serviceName = `${pascalCase(resource.name)}Service`;
        const dirPath = `${outDir}/${resource.name}/${resource.name}-form`;

        if (!this.project.getFileSystem().directoryExists(dirPath)) {
            this.project.getFileSystem().mkdirSync(dirPath);
        }

        const filePath = `${dirPath}/${resource.name}-form.component.ts`;
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        const createOp = resource.operations.find(op => op.action === 'create');
        const updateOp = resource.operations.find(op => op.action === 'update');
        const getOp = resource.operations.find(op => op.action === 'getById');

        const createMethodCall = createOp?.methodName || 'create';
        const updateMethodCall = updateOp?.methodName || 'update';
        const getMethodCall = getOp?.methodName || 'getById';

        sourceFile.addImportDeclaration({
            moduleSpecifier: `../../../services/${resource.name}.service.js`,
            namedImports: [serviceName],
        });

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

        const classDecl = sourceFile.addClass({
            name: componentName,
            isExported: true,
            extends: 'HTMLElement',
        });

        classDecl.addProperty({
            name: 'service',
            initializer: `new ${serviceName}()`,
        });

        classDecl.addProperty({
            name: 'itemId',
            type: 'string | null',
            initializer: 'null',
        });

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

        const loadDataStatements = [
            `if (!this.itemId) return;`,
            `try {`,
            `    const data = await this.service.${getMethodCall}(this.itemId);`,
        ];

        resource.formProperties.forEach(p => {
            loadDataStatements.push(`    const input${p.name} = this.querySelector('#${p.name}') as HTMLInputElement;`);
            loadDataStatements.push(
                `    if (input${p.name} && data.${p.name} !== undefined) input${p.name}.value = String(data.${p.name});`,
            );
        });

        loadDataStatements.push(`} catch (error) {`, `    console.error('Failed to load item', error);`, `}`);

        classDecl.addMethod({
            name: 'loadData',
            isAsync: true,
            statements: loadDataStatements.join('\n'),
        });

        const saveDataStatements = [`const payload: any = {};`];

        resource.formProperties.forEach(p => {
            saveDataStatements.push(`const input${p.name} = this.querySelector('#${p.name}') as HTMLInputElement;`);
            saveDataStatements.push(`if (input${p.name}) payload.${p.name} = input${p.name}.value;`);
        });

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

        classDecl.addMethod({
            name: 'saveData',
            isAsync: true,
            statements: saveDataStatements.join('\n'),
        });

        sourceFile.addStatements(`customElements.define('${tagName}', ${componentName});`);
    }
}
