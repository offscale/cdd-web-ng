import * as path from 'path';
import { Project, SourceFile } from 'ts-morph';
import { SwaggerParser } from '../../../core/parser.js';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../../core/constants.js';

/**
 * Generates an OAuthService and a redirect component to assist with client-side
 * OAuth2 redirect flow handling. This generator is only active when an 'oauth2'
 * security scheme is present in the OpenAPI spec.
 */
export class OAuthHelperGenerator {
    constructor(private parser: SwaggerParser, private project: Project) {}

    public generate(outputDir: string): void {
        const securitySchemes = Object.values(this.parser.getSecuritySchemes());
        const hasOAuth2 = securitySchemes.some(s => s.type === 'oauth2');

        if (!hasOAuth2) {
            return; // Don't generate if no oauth2 flows are defined.
        }

        const authDir = path.join(outputDir, 'auth');
        this.generateService(authDir);
        this.generateRedirectComponent(authDir);
    }

    private generateService(authDir: string): void {
        const filePath = path.join(authDir, 'oauth.service.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/core', namedImports: ['Injectable'] });

        sourceFile.addClass({
            name: 'OAuthService',
            isExported: true,
            decorators: [{ name: 'Injectable', arguments: [`{ providedIn: 'root' }`] }],
            docs: ["A simple service to manage OAuth tokens stored in localStorage."],
            properties: [
                { name: 'TOKEN_KEY', isReadonly: true, scope: 'private', initializer: "'oauth_token'" }
            ],
            methods: [
                { name: 'setToken', parameters: [{ name: 'token', type: 'string' }], statements: `localStorage.setItem(this.TOKEN_KEY, token);` },
                { name: 'getToken', returnType: 'string | null', statements: `return localStorage.getItem(this.TOKEN_KEY);` },
                { name: 'clearToken', statements: `localStorage.removeItem(this.TOKEN_KEY);` }
            ]
        });
        sourceFile.formatText();
    }

    private generateRedirectComponent(authDir: string): void {
        const componentDir = path.join(authDir, 'oauth-redirect');

        // FIX: Explicitly create the component's directory before writing files to it.
        this.project.getFileSystem().mkdirSync(componentDir, { recursive: true });

        const tsPath = path.join(componentDir, 'oauth-redirect.component.ts');
        const htmlPath = path.join(componentDir, 'oauth-redirect.component.html');

        const tsFile = this.project.createSourceFile(tsPath, '', { overwrite: true });
        tsFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        tsFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core', namedImports: ['Component', 'OnInit', 'inject'] },
            { moduleSpecifier: '@angular/router', namedImports: ['ActivatedRoute', 'Router'] },
            { moduleSpecifier: 'rxjs/operators', namedImports: ['first'] },
            { moduleSpecifier: '../oauth.service', namedImports: ['OAuthService'] }
        ]);

        tsFile.addClass({
            name: 'OauthRedirectComponent',
            isExported: true,
            implements: ['OnInit'],
            decorators: [{
                name: 'Component',
                arguments: [`{
                    selector: 'app-oauth-redirect',
                    templateUrl: './oauth-redirect.component.html',
                    standalone: true
                }`]
            }],
            docs: ["Handles the redirect from an OAuth provider, extracting the access token from the URL fragment."],
            properties: [
                { name: 'route', scope: 'private', isReadonly: true, initializer: 'inject(ActivatedRoute)' },
                { name: 'router', scope: 'private', isReadonly: true, initializer: 'inject(Router)' },
                { name: 'oauthService', scope: 'private', isReadonly: true, initializer: 'inject(OAuthService)' }
            ],
            methods: [{
                name: 'ngOnInit',
                statements: [
                    `this.route.fragment.pipe(first()).subscribe(fragment => {`,
                    `  if (fragment) {`,
                    `    const params = new URLSearchParams(fragment);`,
                    `    const accessToken = params.get('access_token');`,
                    `    if (accessToken) {`,
                    `      this.oauthService.setToken(accessToken);`,
                    `      this.router.navigate(['/']);`,
                    `    } else {`,
                    `      console.error('OAuth redirect fragment did not contain access_token');`,
                    `    }`,
                    `  }`,
                    `});`
                ]
            }]
        });

        tsFile.formatText();

        this.project.getFileSystem().writeFileSync(htmlPath, `<p>Redirecting...</p>`);
    }
}
