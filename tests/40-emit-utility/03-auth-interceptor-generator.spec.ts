import { describe, expect, it } from 'vitest';
import { SwaggerParser } from '../../src/core/parser.js';
import { AuthInterceptorGenerator } from '../../src/service/emit/utility/auth-interceptor.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { emptySpec, securitySpec, providerCoverageSpec } from '../shared/specs.js';
import { GeneratorConfig } from '@src/core/types.js';

/**
 * @fileoverview
 * Tests for the `AuthInterceptorGenerator` to ensure it correctly handles various
 * security scheme configurations from an OpenAPI spec, including mixed schemes,
 * single scheme types, and unsupported schemes.
 */
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

        // Two apiKey schemes (header, query) should generate two distinct logic blocks
        expect(body).toContain("if (this.apiKey) { authReq = authReq.clone({ setParams");
        expect(body).toContain("if (this.apiKey) { authReq = authReq.clone({ setHeaders");

        // Two bearer types (http, oauth2) should generate only ONE logic block
        expect(body).toContain("if (this.bearerToken) { const token");
        // FIX: The logic was flawed. Now we check that only one bearer block exists.
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
        const body = project.getSourceFileOrThrow('/out/auth/auth.interceptor.ts').getClassOrThrow('AuthInterceptor').getMethodOrThrow('intercept')!.getBodyText()!;
        expect(tokenNames).toEqual(['bearerToken']);
        expect(body).toContain('if (this.bearerToken)');
        expect(body).not.toContain('if (this.apiKey)');
    });
});
