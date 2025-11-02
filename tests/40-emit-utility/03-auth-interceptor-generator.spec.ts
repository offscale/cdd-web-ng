import { describe, it, expect } from 'vitest';
import { SwaggerParser } from '../../src/core/parser.js';
import { AuthInterceptorGenerator } from '../../src/service/emit/utility/auth-interceptor.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { securitySpec, emptySpec } from '../shared/specs.js';

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

    it('should generate logic for all supported security schemes', () => {
        const { tokenNames, project } = runGenerator(securitySpec);
        const file = project.getSourceFileOrThrow('/out/auth/auth.interceptor.ts');
        const interceptorMethod = file.getClassOrThrow('AuthInterceptor').getMethodOrThrow('intercept');
        const body = interceptorMethod.getBodyText() ?? '';

        // securitySpec contains ApiKey, Bearer, and OAuth2 which maps to Bearer
        expect(tokenNames).toEqual(['apiKey', 'bearerToken']);
        expect(body).toContain("if (this.apiKey) { authReq = req.clone({ setHeaders: { 'X-API-KEY': this.apiKey } }); }");
        expect(body).toContain("} else if (this.bearerToken)");
        expect(body).toContain("req.clone({ setHeaders: { 'Authorization': `Bearer ${token}` } })");
    });

    it('should handle unsupported security schemes without generating logic for them', () => {
        const specWithUnsupported = {
            ...emptySpec,
            components: {
                securitySchemes: {
                    BasicAuth: { type: 'http', scheme: 'basic' }
                }
            }
        };
        const { tokenNames, project } = runGenerator(specWithUnsupported);
        const file = project.getSourceFileOrThrow('/out/auth/auth.interceptor.ts');
        const body = file.getClassOrThrow('AuthInterceptor').getMethodOrThrow('intercept')?.getBodyText() ?? '';

        // No tokens should be needed or generated
        expect(tokenNames).toEqual([]);
        // The intercept method body should be empty, just returning the original request
        expect(body).not.toContain('authReq = req.clone');
    });
});
