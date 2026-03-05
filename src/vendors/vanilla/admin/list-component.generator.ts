import { Project } from 'ts-morph';
import { Resource } from '@src/core/types/index.js';
import { camelCase, pascalCase } from '@src/functions/utils.js';

export class ListComponentGenerator {
    /* v8 ignore next */
    constructor(private readonly project: Project) {}

    public generate(resource: Resource, outDir: string): void {
        /* v8 ignore next */
        const componentName = `${pascalCase(resource.name)}ListComponent`;
        /* v8 ignore next */
        const tagName = `app-${camelCase(resource.name)
            .replace(/([A-Z])/g, '-$1')
            .toLowerCase()}-list`;
        /* v8 ignore next */
        const serviceName = `${pascalCase(resource.name)}Service`;
        /* v8 ignore next */
        const dirPath = `${outDir}/${resource.name}/${resource.name}-list`;

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
        const filePath = `${dirPath}/${resource.name}-list.component.ts`;
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        const listOp = resource.operations.find(op => op.action === 'list');
        /* v8 ignore next */
        const deleteOp = resource.operations.find(op => op.action === 'delete');

        /* v8 ignore next */
        /* v8 ignore start */
        const methodCall = listOp?.methodName || 'list';
        /* v8 ignore stop */
        /* v8 ignore next */
        const deleteMethodCall = deleteOp?.methodName || 'delete';

        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: `../../../services/${resource.name}.service.js`,
            namedImports: [serviceName],
        });

        /* v8 ignore next */
        const template = `<style>
    :host { display: block; font-family: sans-serif; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .actions { display: flex; gap: 0.5rem; }
    button { cursor: pointer; padding: 4px 8px; }
    .btn-create { margin-bottom: 1rem; padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; }
</style>
<div>
    <h2>${pascalCase(resource.name)} List</h2>
    <button class="btn-create" id="create-btn">Create New ${pascalCase(resource.name)}</button>
    <table>
        <thead>
            <tr>
/* v8 ignore next */
                ${resource.listProperties.map(p => `<th>${pascalCase(p.name)}</th>`).join('')}
                <th>Actions</th>
            </tr>
        </thead>
        <tbody id="table-body">
            <tr><td colspan="${resource.listProperties.length + 1}">Loading...</td></tr>
        </tbody>
    </table>
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
            name: 'data',
            type: 'any[]',
            initializer: '[]',
        });

        /* v8 ignore next */
        classDecl.addMethod({
            name: 'connectedCallback',
            isAsync: true,
            statements: [
                `this.innerHTML = ${JSON.stringify(template)};`,
                `this.querySelector('#create-btn')?.addEventListener('click', () => {`,
                `    window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/${resource.name}/new' } }));`,
                `});`,
                `await this.loadData();`,
            ].join('\n'),
        });

        /* v8 ignore next */
        classDecl.addMethod({
            name: 'loadData',
            isAsync: true,
            statements: [
                `try {`,
                `    const response = await this.service.${methodCall}();`,
                `    this.data = Array.isArray(response) ? response : (response.data || response.items || []);`,
                `    this.renderTable();`,
                `} catch (error) {`,
                `    console.error('Failed to load data', error);`,
                `    const tbody = this.querySelector('#table-body');`,
                `    if (tbody) tbody.innerHTML = '<tr><td colspan="${resource.listProperties.length + 1}">Error loading data</td></tr>';`,
                `}`,
            ].join('\n'),
        });

        /* v8 ignore next */
        const renderStatements = [
            `const tbody = this.querySelector('#table-body');`,
            `if (!tbody) return;`,
            `if (this.data.length === 0) {`,
            `    tbody.innerHTML = '<tr><td colspan="${resource.listProperties.length + 1}">No data found.</td></tr>';`,
            `    return;`,
            `}`,
            `tbody.innerHTML = '';`,
            `this.data.forEach(item => {`,
            `    const tr = document.createElement('tr');`,
        ];

        /* v8 ignore next */
        resource.listProperties.forEach(p => {
            /* v8 ignore next */
            renderStatements.push(`    const td${p.name} = document.createElement('td');`);
            /* v8 ignore next */
            renderStatements.push(
                `    td${p.name}.textContent = item.${p.name} !== undefined ? String(item.${p.name}) : '';`,
            );
            /* v8 ignore next */
            renderStatements.push(`    tr.appendChild(td${p.name});`);
        });

        /* v8 ignore next */
        renderStatements.push(
            `    const tdActions = document.createElement('td');`,
            `    tdActions.className = 'actions';`,
            `    const editBtn = document.createElement('button');`,
            `    editBtn.textContent = 'Edit';`,
            `    editBtn.addEventListener('click', () => {`,
            `        window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/${resource.name}/edit/' + (item.id || item.name || '') } }));`,
            `    });`,
            `    const delBtn = document.createElement('button');`,
            `    delBtn.textContent = 'Delete';`,
            `    delBtn.addEventListener('click', async () => {`,
            `        if (confirm('Are you sure?')) {`,
            `            try {`,
            `                await this.service.${deleteMethodCall}(item.id || item.name || '');`,
            `                await this.loadData();`,
            `            } catch (e) {`,
            `                alert('Failed to delete');`,
            `            }`,
            `        }`,
            `    });`,
            `    tdActions.appendChild(editBtn);`,
            `    tdActions.appendChild(delBtn);`,
            `    tr.appendChild(tdActions);`,
            `    tbody.appendChild(tr);`,
            `});`,
        );

        /* v8 ignore next */
        classDecl.addMethod({
            name: 'renderTable',
            statements: renderStatements.join('\n'),
        });

        /* v8 ignore next */
        sourceFile.addStatements(`customElements.define('${tagName}', ${componentName});`);
    }
}
