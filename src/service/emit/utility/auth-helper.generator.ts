import * as path from 'path';
import { Project } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../../core/constants.js';

/**
 * Generates the `auth-helper.service.ts` file, which provides a simplified facade
 * for interacting with the `angular-oauth2-oidc` library.
 */
export class AuthHelperGenerator {
    constructor(private project: Project) {}

    public generate(outputDir: string): void {
        const authDir = path.join(outputDir, 'auth');
        const filePath = path.join(authDir, 'auth-helper.service.ts');

        const sourceFile = this.project.createSourceFile(filePath, this.getAuthHelperServiceTemplate(), { overwrite: true });

        // Add header and imports programmatically
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core', namedImports: ['Injectable', 'inject'] },
            { moduleSpecifier: '@angular/router', namedImports: ['Router'] },
            { moduleSpecifier: 'angular-oauth2-oidc', namedImports: ['OAuthService'] },
            { moduleSpecifier: 'rxjs', namedImports: ['filter'] },
        ]);

        sourceFile.formatText();
    }

    private getAuthHelperServiceTemplate(): string {
        return `
@Injectable({ providedIn: 'root' })
export class AuthHelperService {
    private readonly oAuthService = inject(OAuthService);
    private readonly router = inject(Router);

    /**
     * The stream of authentication events from the underlying OAuthService.
     * Useful for reacting to events like token reception or logout.
     */
    public readonly events$ = this.oAuthService.events;
      
    /**
     * A stream that emits true when a token is successfully received, indicating
     * the user is authenticated.
     */
    public readonly isAuthenticated$ = this.events$.pipe(filter(e => e.type === 'token_received'));
      
    /**
     * An observable stream of the user's identity claims when authenticated.
     * Emits null if the user is not authenticated.
     */
    public readonly identityClaims$ = this.oAuthService.identityClaims$;

    /**
     * Configures the OAuth service and attempts to log in silently with an existing token.
     * This should be called once during application initialization (e.g., via APP_INITIALIZER).
     */
    public async configure(): Promise<void> {
        await this.oAuthService.loadDiscoveryDocumentAndTryLogin();
    }

    /**
     * Initiates the OAuth2/OIDC login flow (e.g., redirecting to the login page).
     * @param redirectUrl An optional URL to redirect back to after a successful login.
     */
    public login(redirectUrl?: string): void {
        this.oAuthService.initCodeFlow(redirectUrl);
    }

    /**
     * Logs the user out by clearing local tokens and optionally redirecting to the IdP's logout endpoint.
     * After logout, it navigates the user to the root of the application.
     */
    public logout(): void {
        this.oAuthService.logOut();
        this.router.navigate(['/']);
    }

    /**
     * Retrieves the current access token.
     * @returns The access token string, or an empty string if not available.
     */
    public getAccessToken(): string {
        return this.oAuthService.getAccessToken();
    }

    /**
     * Retrieves the claims from the identity token.
     * @returns An object containing the user's identity claims, or null if not available.
     */
    public getIdentityClaims(): object | null {
        return this.oAuthService.getIdentityClaims();
    }
}
`;
    }
}
