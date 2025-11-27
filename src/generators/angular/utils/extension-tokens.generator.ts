import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

export class ExtensionTokensGenerator {
    constructor(private project: Project) {}

    public generate(outputDir: string): void {
        const tokensDir = path.join(outputDir, 'tokens');
        const filePath = path.join(tokensDir, 'extensions.token.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addImportDeclarations([
            {
                moduleSpecifier: '@angular/common/http',
                namedImports: ['HttpContextToken'],
            },
        ]);

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'EXTENSIONS_CONTEXT_TOKEN',
                    initializer: `new HttpContextToken<Record<string, any>>(() => ({}))`,
                },
            ],
            docs: [
                'Context token containing Specification Extensions (x-*) defined on the Operation in the OpenAPI spec.',
                'Useful for interceptors to read metadata like x-cache-ttl, x-retry-count, etc.',
            ],
        });

        sourceFile.formatText();
    }
}
