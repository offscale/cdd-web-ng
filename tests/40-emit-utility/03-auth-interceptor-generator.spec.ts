import { describe, expect, it } from 'vitest';
import { SwaggerParser } from '../../src/core/parser.js';
import { AuthInterceptorGenerator } from '../../src/service/emit/utility/auth-interceptor.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { emptySpec, securitySpec } from '../shared/specs.js';

describe('Emitter: AuthInterceptorGenerator', () => {
    const runGenerator = (spec: object) => {
        const project = createTestProject();
        const parser = new SwaggerParser(spec as any, { output: '/out' } as any);
        const generator = new AuthInterceptorGenerator(parser, project);
        const result = generator.generate('/out');
        return { ...result, project };
    };

    it('should not generate if no security schemes are present', () => {
        const { tokenNames, project } = runGenerator(emptySpec) as any;
        expect(tokenNames).toBeUndefined();
        expect(project.getSourceFile('/out/auth/auth.interceptor.ts')).toBeUndefined();
    });

    it('should generate logic for mixed security schemes', () => {
        const { tokenNames, project } = runGenerator(securitySpec);
        const file = project.getSourceFileOrThrow('/out/auth/auth.interceptor.ts');
        const interceptorMethod = file.getClassOrThrow('AuthInterceptor').getMethodOrThrow('intercept');
        const body = interceptorMethod.getBodyText() ?? '';

        expect(body).toContain("if (this.apiKey) { authReq = req.clone({ setParams: { 'api_key_query': this.apiKey } }); }");
        expect(body).toContain("req.clone({ setHeaders: { 'Authorization': \`Bearer \${token}\` } })");
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
        const body = project.getSourceFileOrThrow('/out/auth/auth.interceptor.ts').getClassOrThrow('AuthInterceptor').getMethodOrThrow('intercept')!.getBodyText()!;
        expect(tokenNames).toEqual(['bearerToken']);
        expect(body).toContain('if (this.bearerToken)');
        expect(body).not.toContain('if (this.apiKey)');
    });

    it('should generate correct logic for ONLY apiKey in query', () => {
        const { tokenNames, project } = runGenerator({
            ...emptySpec,
            components: {
                securitySchemes: {
                    ApiKeyQuery: { type: 'apiKey', in: 'query', name: 'api_key_query' },
                },
            },
        });
        const body = project.getSourceFileOrThrow('/out/auth/auth.interceptor.ts').getClassOrThrow('AuthInterceptor').getMethodOrThrow('intercept')!.getBodyText()!;
        expect(tokenNames).toEqual(['apiKey']);
        expect(body).toContain("if (this.apiKey) { authReq = req.clone({ setParams: { 'api_key_query': this.apiKey } }); }");
        expect(body).not.toContain('setHeaders');
    });

    it('should handle unsupported security schemes without generating logic for them', () => {
        const specWithUnsupported = {
            ...emptySpec,
            components: {
                securitySchemes: {
                    BasicAuth: { type: 'http', scheme: 'basic' },
                    ApiKeyCookie: { type: 'apiKey', in: 'cookie', name: 'SESSION_ID' }
                }
            }
        };
        const { tokenNames, project } = runGenerator(specWithUnsupported);
        const file = project.getSourceFileOrThrow('/out/auth/auth.interceptor.ts');
        const body = file.getClassOrThrow('AuthInterceptor').getMethodOrThrow('intercept')?.getBodyText() ?? '';

        // Since only unsupported schemes are present, only the apiKey token is needed, but no logic is generated for 'cookie'.
        expect(tokenNames).toEqual(['apiKey']);
        // The body should be simple, without any active auth logic.
        expect(body).toBe('let authReq = req;\n\nreturn next.handle(authReq);');
    });
});
