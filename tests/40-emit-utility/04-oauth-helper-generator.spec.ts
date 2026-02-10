import { describe, expect, it } from 'vitest';
import { SwaggerParser } from '@src/core/parser.js';
import { createTestProject } from '../shared/helpers.js';
import { securitySpec } from '../shared/specs.js';
import { OAuthHelperGenerator } from '@src/generators/angular/utils/oauth-helper.generator.js';

describe('Emitter: OAuthHelperGenerator', () => {
    const runGenerator = (spec: object) => {
        const project = createTestProject();
        const parser = new SwaggerParser(spec as any, { output: '/out' } as any);
        new OAuthHelperGenerator(parser, project).generate('/out');
        return project;
    };

    it('should not generate files if no oauth2 scheme is present', () => {
        const project = runGenerator({
            ...securitySpec,
            components: { securitySchemes: { ApiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-KEY' } } },
        });
        expect(project.getSourceFile('/out/auth/oauth.service.ts')).toBeUndefined();
    });

    it('should generate service and component if Authorization Code flow is present', () => {
        // We create a specific spec here to guarantee Authorization Code flow exists
        const authCodeSpec = {
            openapi: '3.0.0',
            info: { title: 'Auth Code', version: '1' },
            paths: {},
            components: {
                securitySchemes: {
                    AuthCode: {
                        type: 'oauth2',
                        flows: {
                            authorizationCode: {
                                authorizationUrl: 'https://auth.com/auth',
                                tokenUrl: 'https://auth.com/token',
                                scopes: {},
                            },
                        },
                    },
                },
            },
        };

        const project = runGenerator(authCodeSpec);
        expect(project.getSourceFile('/out/auth/oauth.service.ts')).toBeDefined();
        // Redirect component is required for Auth Code flow
        expect(project.getSourceFile('/out/auth/oauth-redirect/oauth-redirect.component.ts')).toBeDefined();
        expect(project.getFileSystem().readFileSync('/out/auth/oauth-redirect/oauth-redirect.component.html')).toBe(
            '<p>Redirecting...</p>',
        );

        // Check content
        const service = project
            .getSourceFileOrThrow('/out/auth/oauth.service.ts')
            .getClassOrThrow('OAuthHelperService');
        expect(service.getMethod('login')).toBeDefined();
    });

    it('should generate service and component if openIdConnect scheme is present', () => {
        const specWithOidc = {
            ...securitySpec,
            components: { securitySchemes: { OIDC: { type: 'openIdConnect', openIdConnectUrl: '...' } } },
        };
        const project = runGenerator(specWithOidc);
        expect(project.getSourceFile('/out/auth/oauth.service.ts')).toBeDefined();
        // OIDC implies the need for redirect handling usually
        expect(project.getSourceFile('/out/auth/oauth-redirect/oauth-redirect.component.ts')).toBeDefined();
    });

    it('should generate Password flow methods if password flow is defined', () => {
        const passwordSpec = {
            openapi: '3.0.0',
            info: { title: 'Password Flow', version: '1' },
            paths: {},
            components: {
                securitySchemes: {
                    PasswordAuth: {
                        type: 'oauth2',
                        flows: {
                            password: { tokenUrl: 'https://auth.com/token', scopes: {} },
                        },
                    },
                },
            },
        };
        const project = runGenerator(passwordSpec);
        const sourceFile = project.getSourceFileOrThrow('/out/auth/oauth.service.ts');
        const service = sourceFile.getClassOrThrow('OAuthHelperService');

        expect(service.getProperty('tokenUrl')?.getInitializer()?.getText()).toBe("'https://auth.com/token'");
        expect(service.getProperty('http')).toBeDefined(); // HttpClient needed
        expect(service.getMethod('loginPassword')).toBeDefined();

        // Should NOT have auth code methods or redirect component for pure password flow
        expect(service.getMethod('login')).toBeUndefined();
        expect(project.getSourceFile('/out/auth/oauth-redirect/oauth-redirect.component.ts')).toBeUndefined();
    });

    it('should generate Client Credentials logic', () => {
        const ccSpec = {
            openapi: '3.0.0',
            info: { title: 'CC Flow', version: '1' },
            paths: {},
            components: {
                securitySchemes: {
                    CC: {
                        type: 'oauth2',
                        flows: { clientCredentials: { tokenUrl: 'https://cc.com/token', scopes: {} } },
                    },
                },
            },
        };
        const project = runGenerator(ccSpec);
        const sourceFile = project.getSourceFileOrThrow('/out/auth/oauth.service.ts');
        const service = sourceFile.getClassOrThrow('OAuthHelperService');

        expect(service.getMethod('loginClientCredentials')).toBeDefined();
        // No redirect component needed for CC flow
        expect(project.getSourceFile('/out/auth/oauth-redirect/oauth-redirect.component.ts')).toBeUndefined();
    });

    it('should generate Device Authorization flow logic', () => {
        const deviceSpec = {
            openapi: '3.2.0',
            info: { title: 'Device Flow', version: '1' },
            paths: {},
            components: {
                securitySchemes: {
                    DeviceAuth: {
                        type: 'oauth2',
                        flows: {
                            deviceAuthorization: {
                                deviceAuthorizationUrl: 'https://device.example.com/device',
                                tokenUrl: 'https://device.example.com/token',
                                scopes: {},
                            },
                        },
                    },
                },
            },
        };
        const project = runGenerator(deviceSpec);
        const sourceFile = project.getSourceFileOrThrow('/out/auth/oauth.service.ts');
        const service = sourceFile.getClassOrThrow('OAuthHelperService');

        expect(service.getProperty('deviceAuthorizationUrl')?.getInitializer()?.getText()).toBe(
            "'https://device.example.com/device'",
        );
        expect(service.getMethod('startDeviceAuthorization')).toBeDefined();
        expect(service.getMethod('pollDeviceToken')).toBeDefined();
        expect(service.getProperty('http')).toBeDefined();

        // Device flow does not require redirect component
        expect(project.getSourceFile('/out/auth/oauth-redirect/oauth-redirect.component.ts')).toBeUndefined();
    });

    it('should generate Implicit flow logic', () => {
        const implicitSpec = {
            openapi: '3.0.0',
            info: { title: 'Implicit Flow', version: '1' },
            paths: {},
            components: {
                securitySchemes: {
                    Imp: {
                        type: 'oauth2',
                        flows: { implicit: { authorizationUrl: 'https://imp.com/auth', scopes: {} } },
                    },
                },
            },
        };
        const project = runGenerator(implicitSpec);
        const sourceFile = project.getSourceFileOrThrow('/out/auth/oauth.service.ts');
        const service = sourceFile.getClassOrThrow('OAuthHelperService');

        expect(service.getMethod('loginImplicit')).toBeDefined();
        expect(service.getProperty('authorizationUrl')?.getInitializer()?.getText()).toBe("'https://imp.com/auth'");
        // Implicit requires redirect component
        expect(project.getSourceFile('/out/auth/oauth-redirect/oauth-redirect.component.ts')).toBeDefined();
    });

    it('should combine methods if multiple flows present', () => {
        const mixedSpec = {
            openapi: '3.0.0',
            info: { title: 'Mixed', version: '1' },
            paths: {},
            components: {
                securitySchemes: {
                    Mixed: {
                        type: 'oauth2',
                        flows: {
                            password: { tokenUrl: 't', scopes: {} },
                            authorizationCode: { authorizationUrl: 'a', tokenUrl: 't', scopes: {} },
                        },
                    },
                },
            },
        };
        const project = runGenerator(mixedSpec);
        const service = project
            .getSourceFileOrThrow('/out/auth/oauth.service.ts')
            .getClassOrThrow('OAuthHelperService');

        expect(service.getMethod('login')).toBeDefined(); // Auth Code
        expect(service.getMethod('loginPassword')).toBeDefined(); // Password
        // Redirect needed because Auth Code is present
        expect(project.getSourceFile('/out/auth/oauth-redirect/oauth-redirect.component.ts')).toBeDefined();
    });

    it('should handle oauth2 scheme without flows', () => {
        const noFlowSpec = {
            openapi: '3.0.0',
            info: { title: 'No Flow', version: '1' },
            paths: {},
            components: {
                securitySchemes: {
                    NoFlow: { type: 'oauth2' },
                },
            },
        };
        const project = runGenerator(noFlowSpec);
        expect(project.getSourceFile('/out/auth/oauth.service.ts')).toBeDefined();
        // No implicit or auth code -> no redirect component
        expect(project.getSourceFile('/out/auth/oauth-redirect/oauth-redirect.component.ts')).toBeUndefined();
    });

    it('should not overwrite authorization/token URLs when already set', () => {
        const multiSchemeSpec = {
            openapi: '3.0.0',
            info: { title: 'Multi', version: '1' },
            paths: {},
            components: {
                securitySchemes: {
                    Implicit1: {
                        type: 'oauth2',
                        flows: { implicit: { authorizationUrl: 'https://first.example.com/auth', scopes: {} } },
                    },
                    Implicit2: {
                        type: 'oauth2',
                        flows: { implicit: { authorizationUrl: 'https://second.example.com/auth', scopes: {} } },
                    },
                    AuthCode2: {
                        type: 'oauth2',
                        flows: {
                            authorizationCode: {
                                authorizationUrl: 'https://second.example.com/auth',
                                tokenUrl: 'https://second.example.com/token',
                                scopes: {},
                            },
                        },
                    },
                    ClientCreds4: {
                        type: 'oauth2',
                        flows: { clientCredentials: { tokenUrl: 'https://fourth.example.com/token', scopes: {} } },
                    },
                    Password3: {
                        type: 'oauth2',
                        flows: { password: { tokenUrl: 'https://third.example.com/token', scopes: {} } },
                    },
                },
            },
        };
        const project = runGenerator(multiSchemeSpec);
        const service = project.getSourceFileOrThrow('/out/auth/oauth.service.ts').getText();

        // First authorizationUrl should win
        expect(service).toContain("authorizationUrl = 'https://first.example.com/auth'");
        // First tokenUrl should win (from auth code)
        expect(service).toContain("tokenUrl = 'https://second.example.com/token'");
    });
});
