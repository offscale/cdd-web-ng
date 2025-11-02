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
        // Return both the generator result and the project for inspection
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

        expect(tokenNames).toEqual(['apiKey', 'bearerToken']);
        expect(body).toContain("if (this.apiKey) { authReq = req.clone({ setHeaders: { 'X-API-KEY': this.apiKey } }); }");
        // Use "else" as it handles both single and multiple schemes
        expect(body).toContain("} else if (this.bearerToken)");
        expect(body).toContain("req.clone({ setHeaders: { 'Authorization': `Bearer ${token}` } })");
    });
});
