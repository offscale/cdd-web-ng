import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

export class AuthTokensGenerator {
    /* v8 ignore next */
    constructor(private project: Project) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const authDir = path.join(outputDir, 'auth');
        /* v8 ignore next */
        const filePath = path.join(authDir, 'auth.tokens.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        /* v8 ignore next */
        sourceFile.addImportDeclarations([
            {
                moduleSpecifier: '@angular/core',
                namedImports: ['InjectionToken'],
            },
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
                    name: 'API_KEY_TOKEN',
                    initializer: `new InjectionToken<string>('API_KEY')`,
                },
            ],
            docs: ['Injection token for providing an API key (Header/Query).'],
        });

        /* v8 ignore next */
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'COOKIE_AUTH_TOKEN',
                    initializer: `new InjectionToken<string>('COOKIE_AUTH')`,
                },
            ],
            docs: ['Injection token for providing an API key via Cookie (Node/SSR mainly).'],
        });

        /* v8 ignore next */
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'BEARER_TOKEN_TOKEN',
                    initializer: `new InjectionToken<string | (() => string)>('BEARER_TOKEN')`,
                },
            ],
            docs: ['Injection token for providing a bearer token or a function that returns a bearer token.'],
        });

        /* v8 ignore next */
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'HTTPS_AGENT_CONFIG_TOKEN',
                    initializer: `new InjectionToken<Record<string, string | number | boolean | object | undefined | null>>('HTTPS_AGENT_CONFIG')`,
                },
            ],
            docs: ['Injection token for mTLS/HTTPS Agent configuration (Node.js/SSR only).'],
        });

        /* v8 ignore next */
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'HTTPS_AGENT_CONTEXT_TOKEN',
                    initializer: `new HttpContextToken<Record<string, string | number | boolean | object | undefined | null> | null>(() => null)`,
                },
            ],
            docs: ['HttpContextToken to pass mTLS configuration to the underlying HttpHandler.'],
        });

        /* v8 ignore next */
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'SECURITY_CONTEXT_TOKEN',
                    initializer: `new HttpContextToken<Record<string, string[]>[]>(() => [])`,
                },
            ],
            docs: ['Context token containing the full Security Requirement Object for the request.'],
        });

        /* v8 ignore next */
        sourceFile.formatText();
    }
}
