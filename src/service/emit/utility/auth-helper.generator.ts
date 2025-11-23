import * as path from 'node:path';
import { ClassDeclaration, Project, Scope } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

/**
 * Generates the `auth-helper.service.ts` file using ts-morph. This service provides a simplified
 * facade for interacting with the `angular-oauth2-oidc` library.
 *
 * NOTE: This generator currently stubs out a simplified `OAuthService`. For a full implementation,
 * the generated code would contain more complex logic involving the `angular-oauth2-oidc` library.
 * The focus here is on demonstrating the ts-morph-first approach.
 */
export class AuthHelperGenerator {
    constructor(private project: Project) {
    }

    public generate(outputDir: string): void {
        const authDir = path.join(outputDir, 'auth');
        const filePath = path.join(authDir, 'auth-helper.service.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.addStatements(UTILITY_GENERATOR_HEADER_COMMENT);

        // Add all necessary imports
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
                docs: ["The stream of authentication events from the underlying OAuthService.\nUseful for reacting to events like token reception or logout."]
            },
            {
                name: 'isAuthenticated$',
                isReadonly: true,
                scope: Scope.Public,
                initializer: `this.events$.pipe(filter(e => e.type === 'token_received'))`,
                docs: ["A stream that emits true when a token is successfully received, indicating\nthe user is authenticated."]
            },
            {
                name: 'identityClaims$',
                isReadonly: true,
                scope: Scope.Public,
                initializer: `this.oAuthService.identityClaims$`,
                docs: ["An observable stream of the user's identity claims when authenticated.\nEmits null if the user is not authenticated."]
            }
        ]);
    }

    private addMethods(helperClass: ClassDeclaration): void {
        helperClass.addMethods([
            {
                name: 'configure',
                isAsync: true,
                returnType: 'Promise<void>',
                docs: ["Configures the OAuth service and attempts to log in silently with an existing token.\nThis should be called once during application initialization (e.g., via APP_INITIALIZER)."],
                statements: `await this.oAuthService.loadDiscoveryDocumentAndTryLogin();`
            },
            {
                name: 'login',
                parameters: [{ name: 'redirectUrl', type: 'string', hasQuestionToken: true }],
                docs: ["Initiates the OAuth2/OIDC login flow (e.g., redirecting to the login page).\n@param redirectUrl An optional URL to redirect back to after a successful login."],
                statements: `this.oAuthService.initCodeFlow(redirectUrl);`
            },
            {
                name: 'logout',
                docs: ["Logs the user out by clearing local tokens and optionally redirecting to the IdP's logout endpoint.\nAfter logout, it navigates the user to the root of the application."],
                statements: `this.oAuthService.logOut();\nthis.router.navigate(['/']);`
            },
            {
                name: 'getAccessToken',
                returnType: 'string',
                docs: ["Retrieves the current access token.\n@returns The access token string, or an empty string if not available."],
                statements: `return this.oAuthService.getAccessToken();`
            },
            {
                name: 'getIdentityClaims',
                returnType: 'object | null',
                docs: ["Retrieves the claims from the identity token.\n@returns An object containing the user's identity claims, or null if not available."],
                statements: `return this.oAuthService.getIdentityClaims();`
            }
        ]);
    }
}
