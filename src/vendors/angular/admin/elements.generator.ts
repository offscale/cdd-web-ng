import { Project } from 'ts-morph';
import { Resource } from '@src/core/types/index.js';
import { camelCase, pascalCase } from '@src/functions/utils.js';

export class ElementsGenerator {
    constructor(private readonly project: Project) {}

    public generate(resources: Resource[], outDir: string): void {
        const filePath = `${outDir}/elements.ts`;
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/core',
            namedImports: ['Injector'],
        });
        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/elements',
            namedImports: ['createCustomElement'],
        });

        // Import components
        const componentNames: string[] = [];
        for (const resource of resources) {
            const hasList = resource.operations.some(op => op.action === 'list');
            const hasForm = resource.isEditable;

            if (hasList) {
                const className = `${pascalCase(resource.name)}ListComponent`;
                sourceFile.addImportDeclaration({
                    moduleSpecifier: `./${resource.name}/${resource.name}-list/${resource.name}-list.component`,
                    namedImports: [className],
                });
                componentNames.push(className);
            }
            if (hasForm) {
                const className = `${pascalCase(resource.name)}FormComponent`;
                sourceFile.addImportDeclaration({
                    moduleSpecifier: `./${resource.name}/${resource.name}-form/${resource.name}-form.component`,
                    namedImports: [className],
                });
                componentNames.push(className);
            }
        }

        // Generate registration function
        const body = componentNames
            .map(name => {
                const tag = `app-${camelCase(name)
                    .replace(/([A-Z])/g, '-$1')
                    .toLowerCase()}`;
                return `
        const ${name}Element = createCustomElement(${name}, { injector });
        if (!customElements.get('${tag}')) {
            customElements.define('${tag}', ${name}Element);
        }`;
            })
            .join('\n');

        sourceFile.addFunction({
            isExported: true,
            name: 'registerAdminWebComponents',
            parameters: [{ name: 'injector', type: 'Injector' }],
            statements: body,
        });
    }
}
