import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '../../src/core/parser.js';
import { GeneratorConfig } from '../../src/core/types.js';
import { ProviderGenerator } from '../../src/service/emit/utility/provider.generator.js';
import { TokenGenerator } from '../../src/service/emit/utility/token.generator.js';
import { BaseInterceptorGenerator } from '../../src/service/emit/utility/base-interceptor.generator.js';
import { AuthTokensGenerator } from '../../src/service/emit/utility/auth-tokens.generator.js';
import { AuthInterceptorGenerator } from '../../src/service/emit/utility/auth-interceptor.generator.js';
import { DateTransformerGenerator } from '../../src/service/emit/utility/date-transformer.generator.js';
import { emptySpec, securitySpec } from '../shared/specs.js';

/**
 * @fileoverview
 * Tests for the `ProviderGenerator` to ensure it correctly creates the standalone
 * provider function based on various configurations (security, date types, custom interceptors).
 */
describe('Emitter: ProviderGenerator', () => {
    const runGenerator = (spec: object, configOverrides: Partial<GeneratorConfig['options']> = {}) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = {
            input: '',
            output: '/out',
            clientName: 'Test',
            options: { generateServices: true, dateType: 'string', enumStyle: 'enum', ...configOverrides },
        };
        const parser = new SwaggerParser(spec as any, config);

        // Run dependency generators to create the files the ProviderGenerator depends on
        new TokenGenerator(project, config.clientName).generate(config.output);
        new BaseInterceptorGenerator(project, config.clientName).generate(config.output);
        if (config.options.dateType === 'Date') {
            new DateTransformerGenerator(project).generate(config.output);
        }

        let tokenNames: string[] = [];
        // FIX: Use the same logic as the orchestrator to correctly handle void return
        if (Object.keys(parser.getSecuritySchemes()).length > 0) {
            new AuthTokensGenerator(project).generate(config.output);
            const authInterceptorResult = new AuthInterceptorGenerator(parser, project).generate(config.output);
            tokenNames = authInterceptorResult?.tokenNames || [];
        }

        new ProviderGenerator(parser, project, tokenNames).generate(config.output);
        return project.getSourceFile('/out/providers.ts')?.getText();
    };

    it('should not generate if generateServices is false', () => {
        const fileContent = runGenerator(emptySpec, { generateServices: false });
        expect(fileContent).toBeUndefined();
    });

    it('should generate a basic provider without security or date transform', () => {
        const fileContent = runGenerator(emptySpec);
        expect(fileContent).toContain('export function provideTestClient(config: TestConfig)');
        expect(fileContent).toContain('export interface TestConfig');
        expect(fileContent).toContain('enableDateTransform?: boolean');
        expect(fileContent).not.toContain('AuthInterceptor');
        expect(fileContent).not.toContain('DateInterceptor');
    });

    it('should add security providers if spec contains security schemes', () => {
        const fileContent = runGenerator(securitySpec);
        expect(fileContent).toContain('apiKey?: string');
        expect(fileContent).toContain('bearerToken?: string | (() => string)');
        expect(fileContent).toContain('if (config.apiKey)');
        expect(fileContent).toContain('if (config.bearerToken)');
        expect(fileContent).toContain(
            'providers.push({ provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true });',
        );
    });

    it('should add DateInterceptor if dateType is "Date"', () => {
        const fileContent = runGenerator(emptySpec, { dateType: 'Date' });
        expect(fileContent).toContain('if (config.enableDateTransform !== false)');
        expect(fileContent).toContain('customInterceptors.unshift(new DateInterceptor());');
    });

    it('should generate an empty custom interceptors array if none are provided', () => {
        const fileContent = runGenerator(emptySpec);
        expect(fileContent).toContain(
            'const customInterceptors = config.interceptors?.map(InterceptorClass => new InterceptorClass()) || [];',
        );
        expect(fileContent).toContain(`provide: HTTP_INTERCEPTORS_TEST, useValue: customInterceptors`);
    });

    it('should not include token providers for unsupported security schemes (e.g., cookie)', () => {
        const spec = {
            ...emptySpec,
            components: { securitySchemes: { Cookie: { type: 'apiKey', in: 'cookie', name: 'sid' } } },
        };
        const fileContent = runGenerator(spec);

        // FIX: With the corrected logic, the AuthInterceptor shouldn't be generated or provided at all.
        expect(fileContent).not.toContain(
            'providers.push({ provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true });',
        );
        expect(fileContent).not.toContain('API_KEY_TOKEN');
        expect(fileContent).not.toContain('BEARER_TOKEN_TOKEN');
    });
});
