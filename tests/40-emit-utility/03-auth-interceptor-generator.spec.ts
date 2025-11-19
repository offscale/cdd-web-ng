import { describe, expect, it } from 'vitest';
import { SwaggerParser } from '@src/core/parser.js';
import { AuthInterceptorGenerator } from '@src/service/emit/utility/auth-interceptor.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { emptySpec, securitySpec } from '../shared/specs.js';
import { GeneratorConfig } from '@src/core/types.js';

describe('Emitter: AuthInterceptorGenerator', () => {
    const runGenerator = (spec: object) => {
        const project = createTestProject();
        const config: GeneratorConfig = { output: '/out' } as any;
        const parser = new SwaggerParser(spec as any, config);
        const generator = new AuthInterceptorGenerator(parser, project);
        const result = generator.generate('/out');
        return { ...result, project };
    };

    it('should not generate if no security schemes are present', () => {
        const { tokenNames, project } = runGenerator(emptySpec);
        expect(tokenNames).toBeUndefined();
        expect(project.getSourceFile('/out/auth/auth.interceptor.ts')).toBeUndefined();
    });

    it('should generate logic for mixed security schemes and deduplicate logic for same types', () => {
        const { tokenNames, project } = runGenerator(securitySpec);
        const file = project.getSourceFileOrThrow('/out/auth/auth.interceptor.ts');
        const interceptorMethod = file.getClassOrThrow('AuthInterceptor').getMethodOrThrow('intercept');
        const body = interceptorMethod.getBodyText() ?? '';

        expect(tokenNames).toEqual(['apiKey', 'bearerToken']);

        expect(body).toContain('if (this.apiKey) { authReq = authReq.clone({ setParams');
        expect(body).toContain('if (this.apiKey) { authReq = authReq.clone({ setHeaders');

        // This is the key check: ensure the bearer logic appears exactly once.
        const bearerMatches = body.match(/if \(this.bearerToken\)/g);
        expect(bearerMatches).not.toBeNull();
        expect(bearerMatches!.length).toBe(1);
    });

    it('should generate correct logic for ONLY bearer/oauth2', () => {
        const { tokenNames, project } = runGenerator({
            ...emptySpec,
            components: {
                securitySchemes: {
                    BearerAuth: { type: 'http', scheme: 'bearer' },
                    OAuth2Flow: { type: 'oauth2', flows: {} },
                },
            },
        });
        const body = project
            .getSourceFileOrThrow('/out/auth/auth.interceptor.ts')
            .getClassOrThrow('AuthInterceptor')!
            .getMethodOrThrow('intercept')!
            .getBodyText()!;
        expect(tokenNames).toEqual(['bearerToken']);
        expect(body).toContain('if (this.bearerToken)');
        expect(body).not.toContain('if (this.apiKey)');
    });

    it('should handle openIdConnect as a bearer token scheme', () => {
        const { tokenNames, project } = runGenerator({
            ...emptySpec,
            components: {
                securitySchemes: {
                    OIDC: { type: 'openIdConnect', openIdConnectUrl: 'https://example.com/.well-known/openid-configuration' }
                }
            }
        });
        const body = project
            .getSourceFileOrThrow('/out/auth/auth.interceptor.ts')
            .getClassOrThrow('AuthInterceptor')!
            .getMethodOrThrow('intercept')!
            .getBodyText()!;
        expect(tokenNames).toEqual(['bearerToken']);
        expect(body).toContain('if (this.bearerToken)');
        expect(body).not.toContain('if (this.apiKey)');
    });

    it('should ignore apiKey in cookie', () => {
        const { tokenNames, project } = runGenerator({
            ...emptySpec,
            components: {
                securitySchemes: {
                    CookieAuth: { type: 'apiKey', in: 'cookie', name: 'session_id' },
                },
            },
        });

        expect(tokenNames).toBeUndefined();
        expect(project.getSourceFile('/out/auth/auth.interceptor.ts')).toBeUndefined();
    });

    it('should handle bearerToken as a simple string', () => {
        const { project } = runGenerator({
            ...emptySpec,
            components: {
                securitySchemes: { BearerTokenSimple: { type: 'http', scheme: 'bearer' } },
            },
        });
        const body = project.getSourceFileOrThrow('/out/auth/auth.interceptor.ts').getText();
        // This ensures the `typeof this.bearerToken === 'function'` branch is fully covered
        expect(body).toContain(`const token = typeof this.bearerToken === 'function' ? this.bearerToken() : this.bearerToken;`);
    });

    it('should ignore unsupported schemes when generating the intercept method body', () => {
        const mixedSpec = {
            ...emptySpec,
            components: {
                securitySchemes: {
                    ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-KEY' }, // Supported
                    BasicAuth: { type: 'http', scheme: 'basic' } // Unsupported
                },
            },
        };
        const { project } = runGenerator(mixedSpec);
        const body = project.getSourceFileOrThrow('/out/auth/auth.interceptor.ts')
            .getClassOrThrow('AuthInterceptor')!
            .getMethodOrThrow('intercept')!
            .getBodyText()!;

        expect(body).toContain('if (this.apiKey)'); // Logic for api key exists
        expect(body).not.toContain('Authorization'); // No logic for basic auth is added
    });

    it('should handle mutualTLS by generating a comment', () => {
        const specWithMtls = {
            ...emptySpec,
            components: {
                securitySchemes: {
                    MyCert: { type: 'mutualTLS', name: 'MyCert' }
                },
            },
        };
        const { project } = runGenerator(specWithMtls);
        const body = project.getSourceFileOrThrow('/out/auth/auth.interceptor.ts')
            .getClassOrThrow('AuthInterceptor')!
            .getMethodOrThrow('intercept')!
            .getBodyText()!;

        expect(body).toContain("// Security Scheme 'MyCert' (mutualTLS) is assumed to be handled by the browser/client configuration.");
    });
});
