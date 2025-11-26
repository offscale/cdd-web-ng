import { describe, expect, it } from 'vitest';
import { SwaggerParser } from '@src/core/parser.js';
import { createTestProject } from '../shared/helpers.js';
import { emptySpec, securitySpec } from '../shared/specs.js';
import { GeneratorConfig } from "@src/core/types/index.js";
import { AuthInterceptorGenerator } from "@src/generators/angular/utils/auth-interceptor.generator.js";

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

    it('should generate logic for mixed security schemes using applicators map', () => {
        const { tokenNames, project } = runGenerator(securitySpec);
        const file = project.getSourceFileOrThrow('/out/auth/auth.interceptor.ts');
        const interceptorMethod = file.getClassOrThrow('AuthInterceptor').getMethodOrThrow('intercept');
        const body = interceptorMethod.getBodyText() ?? '';

        expect(tokenNames).toEqual(['apiKey', 'bearerToken']);

        // Check schema applicator definitions
        // Note: 'ApiKeyQuery' should be in there
        expect(body).toContain("'ApiKeyHeader': (req) => this.apiKey ? req.clone({ headers: req.headers.set('X-API-KEY', this.apiKey) }) : null");
        expect(body).toContain("'ApiKeyQuery': (req) => this.apiKey ? req.clone({ params: req.params.set('api_key_query', this.apiKey) }) : null");

        // Check Bearer
        expect(body).toContain("'BearerAuth': (req) => {");
        expect(body).toContain("req.clone({ headers: req.headers.set('Authorization', `Bearer ${token}`) })");

        // Check iterating logic
        expect(body).toContain('const requirements = req.context.get(SECURITY_CONTEXT_TOKEN);');
        expect(body).toContain('for (const requirement of requirements)');
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
        expect(body).toContain("'BearerAuth':");
        expect(body).toContain("'OAuth2Flow':");
        expect(body).not.toContain('this.apiKey');
    });

    it('should handle openIdConnect as a bearer token scheme', () => {
        const { tokenNames, project } = runGenerator({
            ...emptySpec,
            components: {
                securitySchemes: {
                    OIDC: {
                        type: 'openIdConnect',
                        openIdConnectUrl: 'https://example.com/.well-known/openid-configuration'
                    }
                }
            }
        });
        const body = project
            .getSourceFileOrThrow('/out/auth/auth.interceptor.ts')
            .getClassOrThrow('AuthInterceptor')!
            .getMethodOrThrow('intercept')!
            .getBodyText()!;
        expect(tokenNames).toEqual(['bearerToken']);
        expect(body).toContain("'OIDC':");
    });

    it('should handle generic HTTP schemes (Basic, Digest) by generating correct Authorization header', () => {
        const { tokenNames, project } = runGenerator({
            ...emptySpec,
            components: {
                securitySchemes: {
                    BasicAuth: { type: 'http', scheme: 'basic' },
                    DigestAuth: { type: 'http', scheme: 'digest' },
                    HobaAuth: { type: 'http', scheme: 'HOBA' }
                }
            }
        });

        const body = project
            .getSourceFileOrThrow('/out/auth/auth.interceptor.ts')
            .getClassOrThrow('AuthInterceptor')!
            .getMethodOrThrow('intercept')!
            .getBodyText()!;

        expect(tokenNames).toEqual(['bearerToken']);

        // Basic -> "Basic ${token}"
        expect(body).toContain("'BasicAuth': (req) => {");
        expect(body).toContain("req.clone({ headers: req.headers.set('Authorization', `Basic ${token}`) })");

        // Digest -> "Digest ${token}"
        expect(body).toContain("'DigestAuth':");
        expect(body).toContain("`Digest ${token}`");

        // Custom/Other (HOBA) -> "Hoba ${token}" (PascalCase)
        expect(body).toContain("'HobaAuth':");
        expect(body).toContain("`Hoba ${token}`");
    });

    it('should handle apiKey in cookie correctly', () => {
        const { tokenNames, project } = runGenerator({
            ...emptySpec,
            components: {
                securitySchemes: {
                    CookieAuth: { type: 'apiKey', in: 'cookie', name: 'session_id' },
                },
            },
        });

        expect(tokenNames).toEqual(['cookieAuth']);
        const file = project.getSourceFileOrThrow('/out/auth/auth.interceptor.ts');
        expect(file.getImportDeclaration('../utils/http-params-builder')).toBeDefined();

        const body = file
            .getClassOrThrow('AuthInterceptor')!
            .getMethodOrThrow('intercept')!
            .getBodyText()!;

        expect(body).toContain("'CookieAuth': (req) => {");
        expect(body).toContain("if (!this.cookieAuth) return null;");
        expect(body).toContain("HttpParamsBuilder.serializeCookieParam('session_id', this.cookieAuth, 'form', true, false)");
        expect(body).toContain("req.clone({ headers: req.headers.set('Cookie', newCookie) })");
    });

    it('should handle mutualTLS by generating a request context clone', () => {
        const specWithMtls = {
            ...emptySpec,
            components: {
                securitySchemes: {
                    MyCert: { type: 'mutualTLS', name: 'MyCert' }
                },
            },
        };
        const { project, tokenNames } = runGenerator(specWithMtls);
        const body = project.getSourceFileOrThrow('/out/auth/auth.interceptor.ts')
            .getClassOrThrow('AuthInterceptor')!
            .getMethodOrThrow('intercept')!
            .getBodyText()!;

        expect(tokenNames).toContain('httpsAgentConfig');
        expect(body).toContain('HTTPS_AGENT_CONTEXT_TOKEN');
        // Adjusted expectation for new implementation
        expect(body).toContain("'MyCert': (req) => this.mtlsConfig ? req.clone({ context: req.context.set(HTTPS_AGENT_CONTEXT_TOKEN, this.mtlsConfig) }) : req");
    });

    it('should check context requirements before iterating', () => {
        const { project } = runGenerator(securitySpec);
        const body = project.getSourceFileOrThrow('/out/auth/auth.interceptor.ts')
            .getClassOrThrow('AuthInterceptor')!
            .getMethodOrThrow('intercept')!
            .getBodyText()!;

        // If requirements array is empty (default), skip auth
        expect(body).toContain('if (requirements.length === 0)');
        expect(body).toContain('return next.handle(req);');
    });
});
