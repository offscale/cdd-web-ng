import * as path from 'node:path';
import { ClassDeclaration, Project, Scope } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../../core/constants.js';

export class AuthHelperGenerator {
    constructor(private project: Project) {
    }

    public generate(outputDir: string): void {
        const authDir = path.join(outputDir, 'auth');
        const filePath = path.join(authDir, 'auth-helper.service.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.addStatements(UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core', namedImports: ['Injectable', 'inject'] },
            { moduleSpecifier: '@angular/router', namedImports: ['Router'] },
            { moduleSpecifier: 'angular-oauth2-oidc', namedImports: ['OAuthService'] },
            { moduleSpecifier: 'rxjs', namedImports: ['filter'] },
        ]);

        const helperClass = sourceFile.addClass({
            name: 'AuthHelperService',
            isExported: true,
            decorators: [{
                name: 'Injectable',
                arguments: [`{ providedIn: 'root' }`]
            }]
        });

        this.addProperties(helperClass);
        this.addMethods(helperClass);

        sourceFile.formatText();
    }

    private addProperties(helperClass: ClassDeclaration): void {
        helperClass.addProperties([
            {
                name: 'oAuthService',
                scope: Scope.Private,
                isReadonly: true,
                initializer: 'inject(OAuthService)'
            },
            {
                name: 'router',
                scope: Scope.Private,
                isReadonly: true,
                initializer: 'inject(Router)'
            },
            {
                name: 'events$',
                isReadonly: true,
                scope: Scope.Public,
                initializer: 'this.oAuthService.events',
                docs: ["The stream of authentication events from the underlying OAuthService."]
            },
            {
                name: 'isAuthenticated$',
                isReadonly: true,
                scope: Scope.Public,
                initializer: `this.events$.pipe(filter(e => e.type === 'token_received'))`,
                docs: ["A stream that emits true when a token is successfully received, indicating the user is authenticated."]
            },
            {
                name: 'identityClaims$',
                isReadonly: true,
                scope: Scope.Public,
                initializer: `this.oAuthService.identityClaims$`,
                docs: ["An observable stream of the user's identity claims when authenticated."]
            }
        ]);
    }

    private addMethods(helperClass: ClassDeclaration): void {
        helperClass.addMethods([
            {
                name: 'configure',
                isAsync: true,
                returnType: 'Promise<void>',
                docs: ["Configures the OAuth service and attempts to log in silently with an existing token."],
                statements: `await this.oAuthService.loadDiscoveryDocumentAndTryLogin();`
            },
            {
                name: 'login',
                parameters: [{ name: 'redirectUrl', type: 'string', hasQuestionToken: true }],
                docs: ["Initiates the OAuth2/OIDC login flow."],
                statements: `this.oAuthService.initCodeFlow(redirectUrl);`
            },
            {
                name: 'logout',
                docs: ["Logs the user out by clearing local tokens."],
                statements: `this.oAuthService.logOut();\nthis.router.navigate(['/']);`
            },
            {
                name: 'getAccessToken',
                returnType: 'string',
                docs: ["Retrieves the current access token."],
                statements: `return this.oAuthService.getAccessToken();`
            },
            {
                name: 'getIdentityClaims',
                returnType: 'object | null',
                docs: ["Retrieves the claims from the identity token."],
                statements: `return this.oAuthService.getIdentityClaims();`
            }
        ]);
    }
}
