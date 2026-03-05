import * as path from 'node:path';
import { ClassDeclaration, Project, Scope } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

export class AuthHelperGenerator {
    /* v8 ignore next */
    constructor(private project: Project) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const authDir = path.join(outputDir, 'auth');
        /* v8 ignore next */
        const filePath = path.join(authDir, 'auth-helper.service.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        sourceFile.addStatements(UTILITY_GENERATOR_HEADER_COMMENT);

        /* v8 ignore next */
        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core', namedImports: ['Injectable', 'inject'] },
            { moduleSpecifier: '@angular/router', namedImports: ['Router'] },
            { moduleSpecifier: 'angular-oauth2-oidc', namedImports: ['OAuthService'] },
            { moduleSpecifier: 'rxjs', namedImports: ['filter'] },
        ]);

        /* v8 ignore next */
        const helperClass = sourceFile.addClass({
            name: 'AuthHelperService',
            isExported: true,
            decorators: [
                {
                    name: 'Injectable',
                    arguments: [`{ providedIn: 'root' }`],
                },
            ],
        });

        /* v8 ignore next */
        this.addProperties(helperClass);
        /* v8 ignore next */
        this.addMethods(helperClass);

        /* v8 ignore next */
        sourceFile.formatText();
    }

    private addProperties(helperClass: ClassDeclaration): void {
        /* v8 ignore next */
        helperClass.addProperties([
            {
                name: 'oAuthService',
                scope: Scope.Private,
                isReadonly: true,
                initializer: 'inject(OAuthService)',
            },
            {
                name: 'router',
                scope: Scope.Private,
                isReadonly: true,
                initializer: 'inject(Router)',
            },
            {
                name: 'events$',
                isReadonly: true,
                scope: Scope.Public,
                initializer: 'this.oAuthService.events',
                docs: ['The stream of authentication events from the underlying OAuthService.'],
            },
            {
                name: 'isAuthenticated$',
                isReadonly: true,
                scope: Scope.Public,
                initializer: `this.events$.pipe(filter(e => e.type === 'token_received'))`,
                docs: [
                    'A stream that emits true when a token is successfully received, indicating the user is authenticated.',
                ],
            },
            {
                name: 'identityClaims$',
                isReadonly: true,
                scope: Scope.Public,
                initializer: `this.oAuthService.identityClaims$`,
                docs: ["An observable stream of the user's identity claims when authenticated."],
            },
        ]);
    }

    private addMethods(helperClass: ClassDeclaration): void {
        /* v8 ignore next */
        helperClass.addMethods([
            {
                name: 'configure',
                isAsync: true,
                returnType: 'Promise<void>',
                docs: ['Configures the OAuth service and attempts to log in silently with an existing token.'],
                statements: `await this.oAuthService.loadDiscoveryDocumentAndTryLogin();`,
            },
            {
                name: 'login',
                parameters: [{ name: 'redirectUrl', type: 'string', hasQuestionToken: true }],
                docs: ['Initiates the OAuth2/OIDC login flow.'],
                statements: `this.oAuthService.initCodeFlow(redirectUrl);`,
            },
            {
                name: 'logout',
                docs: ['Logs the user out by clearing local tokens.'],
                statements: `this.oAuthService.logOut();\nthis.router.navigate(['/']);`,
            },
            {
                name: 'getAccessToken',
                returnType: 'string',
                docs: ['Retrieves the current access token.'],
                statements: `return this.oAuthService.getAccessToken();`,
            },
            {
                name: 'getIdentityClaims',
                returnType: 'object | null',
                docs: ['Retrieves the claims from the identity token.'],
                statements: `return this.oAuthService.getIdentityClaims();`,
            },
        ]);
    }
}
