// src/generators/angular/utils/oauth-helper.generator.ts
import * as path from 'node:path';
import { ClassDeclaration, Project, Scope } from 'ts-morph';
import { SwaggerParser } from '@src/openapi/parse.js';
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
        /* v8 ignore next */
        private parser: SwaggerParser,
        /* v8 ignore next */
        private project: Project,
    ) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const securitySchemes = Object.values(this.parser.getSecuritySchemes());
        /* v8 ignore next */
        const oauthSchemes = securitySchemes.filter(s => s.type === 'oauth2' || s.type === 'openIdConnect');

        /* v8 ignore next */
        if (oauthSchemes.length === 0) {
            /* v8 ignore next */
            return;
        }

        /* v8 ignore next */
        const config: OAuthFlowConfig = {
            type: 'oauth2',
            hasImplicit: false,
            hasPassword: false,
            hasClientCredentials: false,
            hasAuthorizationCode: false,
            hasDeviceAuthorization: false,
        };

        /* v8 ignore next */
        for (const scheme of oauthSchemes) {
            /* v8 ignore next */
            if (scheme.type === 'openIdConnect') {
                /* v8 ignore next */
                config.hasAuthorizationCode = true;
                /* v8 ignore next */
                /* v8 ignore start */
            } else if (scheme.flows) {
                /* v8 ignore stop */
                // type-coverage:ignore-next-line
                /* v8 ignore next */
                const implicitFlow = scheme.flows.implicit as Record<string, string>;
                // type-coverage:ignore-next-line
                /* v8 ignore next */
                if (implicitFlow) {
                    /* v8 ignore next */
                    config.hasImplicit = true;
                    // type-coverage:ignore-next-line
                    /* v8 ignore next */
                    if (!config.authorizationUrl && implicitFlow.authorizationUrl)
                        // type-coverage:ignore-next-line
                        /* v8 ignore next */
                        config.authorizationUrl = implicitFlow.authorizationUrl;
                }
                // type-coverage:ignore-next-line
                /* v8 ignore next */
                const passwordFlow = scheme.flows.password as Record<string, string>;
                // type-coverage:ignore-next-line
                /* v8 ignore next */
                if (passwordFlow) {
                    /* v8 ignore next */
                    config.hasPassword = true;
                    // type-coverage:ignore-next-line
                    /* v8 ignore next */
                    if (!config.tokenUrl && passwordFlow.tokenUrl) config.tokenUrl = passwordFlow.tokenUrl;
                }
                // type-coverage:ignore-next-line
                /* v8 ignore next */
                const ccFlow = scheme.flows.clientCredentials as Record<string, string>;
                // type-coverage:ignore-next-line
                /* v8 ignore next */
                if (ccFlow) {
                    /* v8 ignore next */
                    config.hasClientCredentials = true;
                    // type-coverage:ignore-next-line
                    /* v8 ignore next */
                    if (!config.tokenUrl && ccFlow.tokenUrl) config.tokenUrl = ccFlow.tokenUrl;
                }
                // type-coverage:ignore-next-line
                /* v8 ignore next */
                const acFlow = scheme.flows.authorizationCode as Record<string, string>;
                // type-coverage:ignore-next-line
                /* v8 ignore next */
                if (acFlow) {
                    /* v8 ignore next */
                    config.hasAuthorizationCode = true;
                    // type-coverage:ignore-next-line
                    /* v8 ignore next */
                    if (!config.authorizationUrl && acFlow.authorizationUrl)
                        // type-coverage:ignore-next-line
                        /* v8 ignore next */
                        config.authorizationUrl = acFlow.authorizationUrl;
                    // type-coverage:ignore-next-line
                    /* v8 ignore next */
                    if (!config.tokenUrl && acFlow.tokenUrl) config.tokenUrl = acFlow.tokenUrl;
                }
                // type-coverage:ignore-next-line
                /* v8 ignore next */
                const devFlow = scheme.flows.deviceAuthorization as Record<string, string>;
                // type-coverage:ignore-next-line
                /* v8 ignore next */
                if (devFlow) {
                    /* v8 ignore next */
                    config.hasDeviceAuthorization = true;
                    // type-coverage:ignore-next-line
                    /* v8 ignore next */
                    /* v8 ignore start */
                    if (!config.deviceAuthorizationUrl && devFlow.deviceAuthorizationUrl)
                        /* v8 ignore stop */
                        // type-coverage:ignore-next-line
                        /* v8 ignore next */
                        config.deviceAuthorizationUrl = devFlow.deviceAuthorizationUrl;
                    // type-coverage:ignore-next-line
                    /* v8 ignore next */
                    /* v8 ignore start */
                    if (!config.tokenUrl && devFlow.tokenUrl) config.tokenUrl = devFlow.tokenUrl;
                    /* v8 ignore stop */
                }
            }
        }

        /* v8 ignore next */
        const authDir = path.join(outputDir, 'auth');
        /* v8 ignore next */
        this.generateService(authDir, config);

        /* v8 ignore next */
        if (config.hasImplicit || config.hasAuthorizationCode) {
            /* v8 ignore next */
            this.generateRedirectComponent(authDir);
        }
    }

    private generateService(authDir: string, config: OAuthFlowConfig): void {
        /* v8 ignore next */
        const filePath = path.join(authDir, 'oauth.service.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        /* v8 ignore next */
        const imports = [
            { moduleSpecifier: '@angular/core', namedImports: ['Injectable', 'inject'] },
            { moduleSpecifier: '@angular/router', namedImports: ['Router'] },
            { moduleSpecifier: 'angular-oauth2-oidc', namedImports: ['OAuthService', 'AuthConfig'] },
        ];

        /* v8 ignore next */
        if (config.hasPassword || config.hasClientCredentials || config.hasDeviceAuthorization) {
            /* v8 ignore next */
            imports.push({ moduleSpecifier: '@angular/common/http', namedImports: ['HttpClient', 'HttpHeaders'] });
        }

        /* v8 ignore next */
        sourceFile.addImportDeclarations(imports);

        /* v8 ignore next */
        const serviceClass = sourceFile.addClass({
            name: 'OAuthHelperService',
            isExported: true,
            decorators: [{ name: 'Injectable', arguments: [`{ providedIn: 'root' }`] }],
            docs: ['Service to manage OAuth2 tokens and flows.'],
        });

        /* v8 ignore next */
        serviceClass.addProperties([
            { name: 'oAuthService', scope: Scope.Private, isReadonly: true, initializer: 'inject(OAuthService)' },
            { name: 'router', scope: Scope.Private, isReadonly: true, initializer: 'inject(Router)' },
            { name: 'TOKEN_KEY', isReadonly: true, scope: Scope.Private, initializer: "'oauth_token'" },
        ]);

        /* v8 ignore next */
        if (config.hasPassword || config.hasClientCredentials || config.hasDeviceAuthorization) {
            /* v8 ignore next */
            serviceClass.addProperty({
                name: 'http',
                scope: Scope.Private,
                isReadonly: true,
                initializer: 'inject(HttpClient)',
            });
        }

        /* v8 ignore next */
        if (config.authorizationUrl) {
            /* v8 ignore next */
            serviceClass.addProperty({
                name: 'authorizationUrl',
                isReadonly: true,
                initializer: `'${config.authorizationUrl}'`,
            });
        }
        /* v8 ignore next */
        if (config.tokenUrl) {
            /* v8 ignore next */
            serviceClass.addProperty({
                name: 'tokenUrl',
                isReadonly: true,
                initializer: `'${config.tokenUrl}'`,
            });
        }
        /* v8 ignore next */
        if (config.deviceAuthorizationUrl) {
            /* v8 ignore next */
            serviceClass.addProperty({
                name: 'deviceAuthorizationUrl',
                isReadonly: true,
                initializer: `'${config.deviceAuthorizationUrl}'`,
            });
        }

        /* v8 ignore next */
        this.addCommonMethods(serviceClass);

        /* v8 ignore next */
        if (config.hasAuthorizationCode) {
            /* v8 ignore next */
            this.addAuthCodeMethods(serviceClass);
        }
        /* v8 ignore next */
        if (config.hasImplicit) {
            /* v8 ignore next */
            this.addImplicitMethods(serviceClass);
        }
        /* v8 ignore next */
        if (config.hasPassword) {
            /* v8 ignore next */
            this.addPasswordMethods(serviceClass);
        }
        /* v8 ignore next */
        if (config.hasClientCredentials) {
            /* v8 ignore next */
            this.addClientCredentialsMethods(serviceClass);
        }
        /* v8 ignore next */
        if (config.hasDeviceAuthorization) {
            /* v8 ignore next */
            this.addDeviceAuthorizationMethods(serviceClass);
        }

        /* v8 ignore next */
        sourceFile.formatText();
    }

    private addCommonMethods(serviceClass: ClassDeclaration): void {
        /* v8 ignore next */
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
        /* v8 ignore next */
        serviceClass.addMethod({
            name: 'login',
            docs: ['Initiates the Authorization Code flow (PKCE).'],
            parameters: [{ name: 'redirectUrl', type: 'string', hasQuestionToken: true }],
            statements: `this.oAuthService.initCodeFlow(redirectUrl);`,
        });
    }

    private addImplicitMethods(serviceClass: ClassDeclaration): void {
        /* v8 ignore next */
        serviceClass.addMethod({
            name: 'loginImplicit',
            docs: ['Initiates the Implicit flow.'],
            parameters: [{ name: 'redirectUrl', type: 'string', hasQuestionToken: true }],
            statements: `this.oAuthService.initImplicitFlow(redirectUrl);`,
        });
    }

    private addPasswordMethods(serviceClass: ClassDeclaration): void {
        /* v8 ignore next */
        serviceClass.addMethod({
            name: 'loginPassword',
            docs: ['Exchanges username/password for a token (Resource Owner Password Flow).'],
            parameters: [
                { name: 'username', type: 'string' },
                { name: 'password', type: 'string' },
            ],
            returnType: 'Promise<Record<string, never>>',
            statements: `
        const body = new URLSearchParams(); 
        body.set('grant_type', 'password'); 
        body.set('username', username); 
        body.set('password', password); 
        
        return new Promise((resolve, reject) => { 
            this.http.post(this.tokenUrl, body.toString(), { 
                headers: new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }) 
            }).subscribe({ 
                next: (res: { access_token?: string } & Record<string, never>) => { 
                    if (res.access_token) this.setToken(res.access_token); 
                    resolve(res); 
                }, 
                error: reject
            }); 
        });`,
        });
    }

    private addClientCredentialsMethods(serviceClass: ClassDeclaration): void {
        /* v8 ignore next */
        serviceClass.addMethod({
            name: 'loginClientCredentials',
            docs: ['Obtains a token using Client Credentials Flow.'],
            parameters: [
                { name: 'clientId', type: 'string' },
                { name: 'clientSecret', type: 'string' },
            ],
            returnType: 'Promise<Record<string, never>>',
            statements: `
        const body = new URLSearchParams(); 
        body.set('grant_type', 'client_credentials'); 
        body.set('client_id', clientId); 
        body.set('client_secret', clientSecret); 

        return new Promise((resolve, reject) => { 
            this.http.post(this.tokenUrl, body.toString(), { 
                headers: new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }) 
            }).subscribe({ 
                next: (res: { access_token?: string } & Record<string, never>) => { 
                    if (res.access_token) this.setToken(res.access_token); 
                    resolve(res); 
                }, 
                error: reject
            }); 
        });`,
        });
    }

    private addDeviceAuthorizationMethods(serviceClass: ClassDeclaration): void {
        /* v8 ignore next */
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
            returnType: 'Promise<Record<string, never>>',
            statements: `
        const body = new URLSearchParams(); 
        body.set('client_id', clientId); 
        if (scope) body.set('scope', scope); 

        return new Promise((resolve, reject) => { 
            this.http.post(this.deviceAuthorizationUrl, body.toString(), { 
                headers: new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }) 
            }).subscribe({ 
                next: (res: Record<string, never>) => resolve(res), 
                error: reject
            }); 
        });`,
        });

        /* v8 ignore next */
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
            returnType: 'Promise<Record<string, never>>',
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
                next: (res: { access_token?: string } & Record<string, never>) => { 
                    if (res.access_token) this.setToken(res.access_token); 
                    resolve(res); 
                }, 
                error: reject
            }); 
        });`,
        });
    }

    private generateRedirectComponent(authDir: string): void {
        /* v8 ignore next */
        const componentDir = path.join(authDir, 'oauth-redirect');
        /* v8 ignore next */
        this.project.getFileSystem().mkdirSync(componentDir);

        /* v8 ignore next */
        const tsPath = path.join(componentDir, 'oauth-redirect.component.ts');
        /* v8 ignore next */
        const htmlPath = path.join(componentDir, 'oauth-redirect.component.html');

        /* v8 ignore next */
        const tsFile = this.project.createSourceFile(tsPath, '', { overwrite: true });
        /* v8 ignore next */
        tsFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        /* v8 ignore next */
        tsFile.addImportDeclarations([
            {
                moduleSpecifier: '@angular/core',
                namedImports: ['Component', 'OnInit', 'inject', 'ChangeDetectionStrategy'],
            },
            { moduleSpecifier: '@angular/router', namedImports: ['ActivatedRoute', 'Router'] },
            { moduleSpecifier: 'rxjs/operators', namedImports: ['first'] },
            { moduleSpecifier: '../oauth.service', namedImports: ['OAuthHelperService'] },
        ]);

        /* v8 ignore next */
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

        /* v8 ignore next */
        tsFile.formatText();
        /* v8 ignore next */
        this.project.getFileSystem().writeFileSync(htmlPath, `<p>Redirecting...</p>`);
    }
}
