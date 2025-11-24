import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

export class AuthTokensGenerator {
    constructor(private project: Project) {
    }

    public generate(outputDir: string): void {
        const authDir = path.join(outputDir, 'auth');
        const filePath = path.join(authDir, 'auth.tokens.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addImportDeclarations([
            {
                moduleSpecifier: '@angular/core',
                namedImports: ['InjectionToken'],
            },
            {
                moduleSpecifier: '@angular/common/http',
                namedImports: ['HttpContextToken'],
            }
        ]);

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'API_KEY_TOKEN',
                    initializer: `new InjectionToken<string>('API_KEY')`,
                },
            ],
            docs: ["Injection token for providing an API key."]
        });

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'BEARER_TOKEN_TOKEN',
                    initializer: `new InjectionToken<string | (() => string)>('BEARER_TOKEN')`,
                },
            ],
            docs: ["Injection token for providing a bearer token or a function that returns a bearer token."]
        });

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'SECURITY_CONTEXT_TOKEN',
                    initializer: `new HttpContextToken<Record<string, string[]>[]>(() => [])`,
                },
            ],
            docs: [
                "Context token containing the full Security Requirement Object for the request.",
            ]
        });

        sourceFile.formatText();
    }
}
