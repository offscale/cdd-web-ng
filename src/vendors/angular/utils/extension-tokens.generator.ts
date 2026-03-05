import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

export class ExtensionTokensGenerator {
    /* v8 ignore next */
    constructor(private project: Project) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const tokensDir = path.join(outputDir, 'tokens');
        /* v8 ignore next */
        const filePath = path.join(tokensDir, 'extensions.token.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        /* v8 ignore next */
        sourceFile.addImportDeclarations([
            {
                moduleSpecifier: '@angular/common/http',
                namedImports: ['HttpContextToken'],
            },
        ]);

        /* v8 ignore next */
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'EXTENSIONS_CONTEXT_TOKEN',
                    initializer: `new HttpContextToken<Record<string, never>>(() => ({}))`,
                },
            ],
            docs: [
                'Context token containing Specification Extensions (x-*) defined on the Operation in the OpenAPI spec.',
                'Useful for interceptors to read metadata like x-cache-ttl, x-retry-count, etc.',
            ],
        });

        /* v8 ignore next */
        sourceFile.formatText();
    }
}
