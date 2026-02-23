// src/generators/angular/utils/oauth-helper.generator.ts
import * as path from 'node:path';
import { ClassDeclaration, Project, Scope } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

interface OAuthFlowConfig {
    type: 'oauth2' | 'openIdConnect';
    hasImplicit: boolean;
    hasPassword: boolean;
    hasClientCredentials: boolean;
    hasAuthorizationCode: boolean;
    hasDeviceAuthorization: boolean;
    authorizationUrl?: string;
    deviceAuthorizationUrl?: string;
    tokenUrl?: string;
}

export class OAuthHelperGenerator {
    constructor(
        private parser: SwaggerParser,
        private project: Project,
    ) {}

    public generate(outputDir: string): void {
        const securitySchemes = Object.values(this.parser.getSecuritySchemes());
        const oauthSchemes = securitySchemes.filter(s => s.type === 'oauth2' || s.type === 'openIdConnect');

        if (oauthSchemes.length === 0) {
            return;
        }

        const config: OAuthFlowConfig = {
            type: 'oauth2',
            hasImplicit: false,
            hasPassword: false,
            hasClientCredentials: false,
            hasAuthorizationCode: false,
            hasDeviceAuthorization: false,
        };

        for (const scheme of oauthSchemes) {
            if (scheme.type === 'openIdConnect') {
                config.hasAuthorizationCode = true;
            } else if (scheme.flows) {
                // type-coverage:ignore-next-line
                const implicitFlow = scheme.flows.implicit as any;
                // type-coverage:ignore-next-line
                if (implicitFlow) {
                    config.hasImplicit = true;
                    // type-coverage:ignore-next-line
                    if (!config.authorizationUrl && implicitFlow.authorizationUrl)
                        // type-coverage:ignore-next-line
                        config.authorizationUrl = implicitFlow.authorizationUrl;
                }
                // type-coverage:ignore-next-line
                const passwordFlow = scheme.flows.password as any;
                // type-coverage:ignore-next-line
                if (passwordFlow) {
                    config.hasPassword = true;
                    // type-coverage:ignore-next-line
                    if (!config.tokenUrl && passwordFlow.tokenUrl) config.tokenUrl = passwordFlow.tokenUrl;
                }
                // type-coverage:ignore-next-line
                const ccFlow = scheme.flows.clientCredentials as any;
                // type-coverage:ignore-next-line
                if (ccFlow) {
                    config.hasClientCredentials = true;
                    // type-coverage:ignore-next-line
                    if (!config.tokenUrl && ccFlow.tokenUrl) config.tokenUrl = ccFlow.tokenUrl;
                }
                // type-coverage:ignore-next-line
                const acFlow = scheme.flows.authorizationCode as any;
                // type-coverage:ignore-next-line
                if (acFlow) {
                    config.hasAuthorizationCode = true;
                    // type-coverage:ignore-next-line
                    if (!config.authorizationUrl && acFlow.authorizationUrl)
                        // type-coverage:ignore-next-line
                        config.authorizationUrl = acFlow.authorizationUrl;
                    // type-coverage:ignore-next-line
                    if (!config.tokenUrl && acFlow.tokenUrl) config.tokenUrl = acFlow.tokenUrl;
                }
                // type-coverage:ignore-next-line
                const devFlow = scheme.flows.deviceAuthorization as any;
                // type-coverage:ignore-next-line
                if (devFlow) {
                    config.hasDeviceAuthorization = true;
                    // type-coverage:ignore-next-line
                    if (!config.deviceAuthorizationUrl && devFlow.deviceAuthorizationUrl)
                        // type-coverage:ignore-next-line
                        config.deviceAuthorizationUrl = devFlow.deviceAuthorizationUrl;
                    // type-coverage:ignore-next-line
                    if (!config.tokenUrl && devFlow.tokenUrl) config.tokenUrl = devFlow.tokenUrl;
                }
            }
        }

        const authDir = path.join(outputDir, 'auth');
        this.generateService(authDir, config);

        if (config.hasImplicit || config.hasAuthorizationCode) {
            this.generateRedirectComponent(authDir);
        }
    }

    private generateService(authDir: string, config: OAuthFlowConfig): void {
        const filePath = path.join(authDir, 'oauth.service.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        const imports = [
            { moduleSpecifier: '@angular/core', namedImports: ['Injectable', 'inject'] },
            { moduleSpecifier: '@angular/router', namedImports: ['Router'] },
            { moduleSpecifier: 'angular-oauth2-oidc', namedImports: ['OAuthService', 'AuthConfig'] },
        ];

        if (config.hasPassword || config.hasClientCredentials || config.hasDeviceAuthorization) {
            imports.push({ moduleSpecifier: '@angular/common/http', namedImports: ['HttpClient', 'HttpHeaders'] });
        }

        sourceFile.addImportDeclarations(imports);

        const serviceClass = sourceFile.addClass({
            name: 'OAuthHelperService',
            isExported: true,
            decorators: [{ name: 'Injectable', arguments: [`{ providedIn: 'root' }`] }],
            docs: ['Service to manage OAuth2 tokens and flows.'],
        });

        serviceClass.addProperties([
            { name: 'oAuthService', scope: Scope.Private, isReadonly: true, initializer: 'inject(OAuthService)' },
            { name: 'router', scope: Scope.Private, isReadonly: true, initializer: 'inject(Router)' },
            { name: 'TOKEN_KEY', isReadonly: true, scope: Scope.Private, initializer: "'oauth_token'" },
        ]);

        if (config.hasPassword || config.hasClientCredentials || config.hasDeviceAuthorization) {
            serviceClass.addProperty({
                name: 'http',
                scope: Scope.Private,
                isReadonly: true,
                initializer: 'inject(HttpClient)',
            });
        }

        if (config.authorizationUrl) {
            serviceClass.addProperty({
                name: 'authorizationUrl',
                isReadonly: true,
                initializer: `'${config.authorizationUrl}'`,
            });
        }
        if (config.tokenUrl) {
            serviceClass.addProperty({
                name: 'tokenUrl',
                isReadonly: true,
                initializer: `'${config.tokenUrl}'`,
            });
        }
        if (config.deviceAuthorizationUrl) {
            serviceClass.addProperty({
                name: 'deviceAuthorizationUrl',
                isReadonly: true,
                initializer: `'${config.deviceAuthorizationUrl}'`,
            });
        }

        this.addCommonMethods(serviceClass);

        if (config.hasAuthorizationCode) {
            this.addAuthCodeMethods(serviceClass);
        }
        if (config.hasImplicit) {
            this.addImplicitMethods(serviceClass);
        }
        if (config.hasPassword) {
            this.addPasswordMethods(serviceClass);
        }
        if (config.hasClientCredentials) {
            this.addClientCredentialsMethods(serviceClass);
        }
        if (config.hasDeviceAuthorization) {
            this.addDeviceAuthorizationMethods(serviceClass);
        }

        sourceFile.formatText();
    }

    private addCommonMethods(serviceClass: ClassDeclaration): void {
        serviceClass.addMethods([
            {
                name: 'setToken',
                parameters: [{ name: 'token', type: 'string' }],
                statements: `localStorage.setItem(this.TOKEN_KEY, token);`,
            },
            {
                name: 'getToken',
                returnType: 'string | null',
                statements: `return this.oAuthService.getAccessToken() || localStorage.getItem(this.TOKEN_KEY);`,
            },
            {
                name: 'clearToken',
                statements: `this.oAuthService.logOut();\nlocalStorage.removeItem(this.TOKEN_KEY);`,
            },
            {
                name: 'configure',
                isAsync: true,
                parameters: [{ name: 'config', type: 'AuthConfig', hasQuestionToken: true }],
                returnType: 'Promise<void>',
                statements: `
        if (config) { 
            this.oAuthService.configure(config); 
        } 
        await this.oAuthService.loadDiscoveryDocumentAndTryLogin(); 
                `,
            },
        ]);
    }

    private addAuthCodeMethods(serviceClass: ClassDeclaration): void {
        serviceClass.addMethod({
            name: 'login',
            docs: ['Initiates the Authorization Code flow (PKCE).'],
            parameters: [{ name: 'redirectUrl', type: 'string', hasQuestionToken: true }],
            statements: `this.oAuthService.initCodeFlow(redirectUrl);`,
        });
    }

    private addImplicitMethods(serviceClass: ClassDeclaration): void {
        serviceClass.addMethod({
            name: 'loginImplicit',
            docs: ['Initiates the Implicit flow.'],
            parameters: [{ name: 'redirectUrl', type: 'string', hasQuestionToken: true }],
            statements: `this.oAuthService.initImplicitFlow(redirectUrl);`,
        });
    }

    private addPasswordMethods(serviceClass: ClassDeclaration): void {
        serviceClass.addMethod({
            name: 'loginPassword',
            docs: ['Exchanges username/password for a token (Resource Owner Password Flow).'],
            parameters: [
                { name: 'username', type: 'string' },
                { name: 'password', type: 'string' },
            ],
            returnType: 'Promise<any>',
            statements: `
        const body = new URLSearchParams(); 
        body.set('grant_type', 'password'); 
        body.set('username', username); 
        body.set('password', password); 
        
        return new Promise((resolve, reject) => { 
            this.http.post(this.tokenUrl, body.toString(), { 
                headers: new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }) 
            }).subscribe({ 
                next: (res: any) => { 
                    if (res.access_token) this.setToken(res.access_token); 
                    resolve(res); 
                }, 
                error: reject
            }); 
        });`,
        });
    }

    private addClientCredentialsMethods(serviceClass: ClassDeclaration): void {
        serviceClass.addMethod({
            name: 'loginClientCredentials',
            docs: ['Obtains a token using Client Credentials Flow.'],
            parameters: [
                { name: 'clientId', type: 'string' },
                { name: 'clientSecret', type: 'string' },
            ],
            returnType: 'Promise<any>',
            statements: `
        const body = new URLSearchParams(); 
        body.set('grant_type', 'client_credentials'); 
        body.set('client_id', clientId); 
        body.set('client_secret', clientSecret); 

        return new Promise((resolve, reject) => { 
            this.http.post(this.tokenUrl, body.toString(), { 
                headers: new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }) 
            }).subscribe({ 
                next: (res: any) => { 
                    if (res.access_token) this.setToken(res.access_token); 
                    resolve(res); 
                }, 
                error: reject
            }); 
        });`,
        });
    }

    private addDeviceAuthorizationMethods(serviceClass: ClassDeclaration): void {
        serviceClass.addMethod({
            name: 'startDeviceAuthorization',
            docs: [
                'Initiates the OAuth2 Device Authorization flow.',
                '@param clientId The OAuth client ID.',
                '@param scope Optional space-delimited scopes.',
            ],
            parameters: [
                { name: 'clientId', type: 'string' },
                { name: 'scope', type: 'string', hasQuestionToken: true },
            ],
            returnType: 'Promise<any>',
            statements: `
        const body = new URLSearchParams(); 
        body.set('client_id', clientId); 
        if (scope) body.set('scope', scope); 

        return new Promise((resolve, reject) => { 
            this.http.post(this.deviceAuthorizationUrl, body.toString(), { 
                headers: new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }) 
            }).subscribe({ 
                next: (res: any) => resolve(res), 
                error: reject
            }); 
        });`,
        });

        serviceClass.addMethod({
            name: 'pollDeviceToken',
            docs: [
                'Polls the token endpoint for a device authorization token.',
                '@param deviceCode The device_code received from startDeviceAuthorization.',
                '@param clientId The OAuth client ID.',
                '@param clientSecret Optional client secret.',
            ],
            parameters: [
                { name: 'deviceCode', type: 'string' },
                { name: 'clientId', type: 'string' },
                { name: 'clientSecret', type: 'string', hasQuestionToken: true },
            ],
            returnType: 'Promise<any>',
            statements: `
        const body = new URLSearchParams(); 
        body.set('grant_type', 'urn:ietf:params:oauth:grant-type:device_code'); 
        body.set('device_code', deviceCode); 
        body.set('client_id', clientId); 
        if (clientSecret) body.set('client_secret', clientSecret); 

        return new Promise((resolve, reject) => { 
            this.http.post(this.tokenUrl, body.toString(), { 
                headers: new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }) 
            }).subscribe({ 
                next: (res: any) => { 
                    if (res.access_token) this.setToken(res.access_token); 
                    resolve(res); 
                }, 
                error: reject
            }); 
        });`,
        });
    }

    private generateRedirectComponent(authDir: string): void {
        const componentDir = path.join(authDir, 'oauth-redirect');
        this.project.getFileSystem().mkdirSync(componentDir);

        const tsPath = path.join(componentDir, 'oauth-redirect.component.ts');
        const htmlPath = path.join(componentDir, 'oauth-redirect.component.html');

        const tsFile = this.project.createSourceFile(tsPath, '', { overwrite: true });
        tsFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        tsFile.addImportDeclarations([
            {
                moduleSpecifier: '@angular/core',
                namedImports: ['Component', 'OnInit', 'inject', 'ChangeDetectionStrategy'],
            },
            { moduleSpecifier: '@angular/router', namedImports: ['ActivatedRoute', 'Router'] },
            { moduleSpecifier: 'rxjs/operators', namedImports: ['first'] },
            { moduleSpecifier: '../oauth.service', namedImports: ['OAuthHelperService'] },
        ]);

        tsFile.addClass({
            name: 'OauthRedirectComponent',
            isExported: true,
            implements: ['OnInit'],
            decorators: [
                {
                    name: 'Component',
                    arguments: [
                        `{ 

                    selector: 'app-oauth-redirect', 

                    templateUrl: './oauth-redirect.component.html', 

                    changeDetection: ChangeDetectionStrategy.OnPush

                }`,
                    ],
                },
            ],
            docs: ['Handles the redirect from an OAuth provider.'],
            properties: [
                { name: 'route', scope: Scope.Private, isReadonly: true, initializer: 'inject(ActivatedRoute)' },
                { name: 'router', scope: Scope.Private, isReadonly: true, initializer: 'inject(Router)' },
                {
                    name: 'oauthService',
                    scope: Scope.Private,
                    isReadonly: true,
                    initializer: 'inject(OAuthHelperService)',
                },
            ],
            methods: [
                {
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
                        `});`,
                    ],
                },
            ],
        });

        tsFile.formatText();
        this.project.getFileSystem().writeFileSync(htmlPath, `<p>Redirecting...</p>`);
    }
}
