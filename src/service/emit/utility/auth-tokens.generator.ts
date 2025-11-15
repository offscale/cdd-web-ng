// src/service/emit/utility/auth-tokens.generator.ts

import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../../core/constants.js';

/**
 * Generates the `auth/auth.tokens.ts` file, which defines InjectionTokens
 * for providing authentication credentials (e.g., API keys, bearer tokens)
 * to the AuthInterceptor.
 */
export class AuthTokensGenerator {
    constructor(private project: Project) {
    }

    public generate(outputDir: string): void {
        const authDir = path.join(outputDir, 'auth');
        const filePath = path.join(authDir, 'auth.tokens.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/core',
            namedImports: ['InjectionToken'],
        });

        // API Key Token
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

        // Bearer Token
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

        sourceFile.formatText();
    }
}
