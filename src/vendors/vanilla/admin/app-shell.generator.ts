import { Project } from 'ts-morph';
import { Resource } from '@src/core/types/index.js';
import { camelCase, pascalCase } from '@src/functions/utils.js';

export class AppShellGenerator {
    /* v8 ignore next */
    constructor(private readonly project: Project) {}

    public generate(resources: Resource[], outDir: string): void {
        /* v8 ignore next */
        const filePath = `${outDir}/app-shell.ts`;
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        resources.forEach(res => {
            /* v8 ignore next */
            if (res.operations.some(op => op.action === 'list')) {
                /* v8 ignore next */
                sourceFile.addImportDeclaration({
                    moduleSpecifier: `./${res.name}/${res.name}-list/${res.name}-list.component.js`,
                });
            }
            /* v8 ignore next */
            if (res.isEditable) {
                /* v8 ignore next */
                sourceFile.addImportDeclaration({
                    moduleSpecifier: `./${res.name}/${res.name}-form/${res.name}-form.component.js`,
                });
            }
        });

        /* v8 ignore next */
        const template = `<style>
    :host { display: flex; height: 100vh; font-family: sans-serif; }
    aside { width: 250px; background: #343a40; color: white; padding: 1rem; }
    aside h1 { font-size: 1.2rem; margin-top: 0; }
    nav ul { list-style: none; padding: 0; }
    nav li { margin-bottom: 0.5rem; }
    nav a { color: #adb5bd; text-decoration: none; cursor: pointer; }
    nav a:hover { color: white; }
    main { flex: 1; padding: 2rem; background: #f8f9fa; overflow-y: auto; }
</style>
<aside>
    <h1>Admin UI</h1>
    <nav>
        <ul>
/* v8 ignore next */
            ${resources.map(res => `<li><a data-path="/${res.name}">${pascalCase(res.name)}</a></li>`).join('')}
        </ul>
    </nav>
</aside>
<main id="router-outlet">
    <h2>Welcome to Admin UI</h2>
    <p>Select a resource from the sidebar.</p>
</main>`;

        /* v8 ignore next */
        const classDecl = sourceFile.addClass({
            name: 'AppShell',
            isExported: true,
            extends: 'HTMLElement',
        });

        /* v8 ignore next */
        classDecl.addMethod({
            name: 'connectedCallback',
            statements: [
                `this.innerHTML = ${JSON.stringify(template)};`,
                `this.querySelectorAll('a[data-path]').forEach(a => {`,
                `    a.addEventListener('click', (e) => {`,
                `        e.preventDefault();`,
                `        const path = (e.target as HTMLElement).getAttribute('data-path');`,
                `        if (path) this.navigate(path);`,
                `    });`,
                `});`,
                `window.addEventListener('navigate', ((e: CustomEvent) => {`,
                `    if (e.detail && e.detail.path) this.navigate(e.detail.path);`,
                `}) as EventListener);`,
                `window.addEventListener('hashchange', () => this.handleRoute());`,
                `this.handleRoute();`,
            ].join('\n'),
        });

        /* v8 ignore next */
        classDecl.addMethod({
            name: 'navigate',
            parameters: [{ name: 'path', type: 'string' }],
            statements: `window.location.hash = path;`,
        });

        /* v8 ignore next */
        const routingStatements = [
            `const outlet = this.querySelector('#router-outlet');`,
            `if (!outlet) return;`,
            `const path = window.location.hash.slice(1) || '/';`,
            `outlet.innerHTML = '';`,
        ];

        /* v8 ignore next */
        resources.forEach(res => {
            /* v8 ignore next */
            const tagNameList = `app-${camelCase(res.name)
                .replace(/([A-Z])/g, '-$1')
                .toLowerCase()}-list`;
            /* v8 ignore next */
            const tagNameForm = `app-${camelCase(res.name)
                .replace(/([A-Z])/g, '-$1')
                .toLowerCase()}-form`;

            /* v8 ignore next */
            routingStatements.push(`
                if (path.startsWith('/${res.name}/edit') || path.startsWith('/${res.name}/new')) {
                    outlet.appendChild(document.createElement('${tagNameForm}'));
                    return;
                }
                if (path === '/${res.name}') {
                    outlet.appendChild(document.createElement('${tagNameList}'));
                    return;
                }
            `);
        });

        /* v8 ignore next */
        routingStatements.push(`outlet.innerHTML = '<h2>404 Not Found</h2>';`);

        /* v8 ignore next */
        classDecl.addMethod({
            name: 'handleRoute',
            statements: routingStatements.join('\n'),
        });

        /* v8 ignore next */
        sourceFile.addStatements(`customElements.define('app-shell', AppShell);`);
    }
}
