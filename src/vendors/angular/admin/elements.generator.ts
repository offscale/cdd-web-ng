import { Project } from 'ts-morph';
import { Resource } from '@src/core/types/index.js';
import { camelCase, pascalCase } from '@src/functions/utils.js';

export class ElementsGenerator {
    /* v8 ignore next */
    constructor(private readonly project: Project) {}

    public generate(resources: Resource[], outDir: string): void {
        /* v8 ignore next */
        const filePath = `${outDir}/elements.ts`;
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/core',
            namedImports: ['Injector'],
        });
        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/elements',
            namedImports: ['createCustomElement'],
        });

        // Import components
        /* v8 ignore next */
        const componentNames: string[] = [];
        /* v8 ignore next */
        for (const resource of resources) {
            /* v8 ignore next */
            const hasList = resource.operations.some(op => op.action === 'list');
            /* v8 ignore next */
            const hasForm = resource.isEditable;

            /* v8 ignore next */
            if (hasList) {
                /* v8 ignore next */
                const className = `${pascalCase(resource.name)}ListComponent`;
                /* v8 ignore next */
                sourceFile.addImportDeclaration({
                    moduleSpecifier: `./${resource.name}/${resource.name}-list/${resource.name}-list.component`,
                    namedImports: [className],
                });
                /* v8 ignore next */
                componentNames.push(className);
            }
            /* v8 ignore next */
            if (hasForm) {
                /* v8 ignore next */
                const className = `${pascalCase(resource.name)}FormComponent`;
                /* v8 ignore next */
                sourceFile.addImportDeclaration({
                    moduleSpecifier: `./${resource.name}/${resource.name}-form/${resource.name}-form.component`,
                    namedImports: [className],
                });
                /* v8 ignore next */
                componentNames.push(className);
            }
        }

        // Generate registration function
        /* v8 ignore next */
        const body = componentNames
            .map(name => {
                /* v8 ignore next */
                const tag = `app-${camelCase(name)
                    .replace(/([A-Z])/g, '-$1')
                    .toLowerCase()}`;
                /* v8 ignore next */
                return `
        const ${name}Element = createCustomElement(${name}, { injector });
        if (!customElements.get('${tag}')) {
            customElements.define('${tag}', ${name}Element);
        }`;
            })
            .join('\n');

        /* v8 ignore next */
        sourceFile.addFunction({
            isExported: true,
            name: 'registerAdminWebComponents',
            parameters: [{ name: 'injector', type: 'Injector' }],
            statements: body,
        });
    }
}
