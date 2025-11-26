import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from "@src/core/types/index.js";
import { ProviderGenerator } from '@src/generators/angular/utils/provider.generator.js';
import { TokenGenerator } from '@src/generators/angular/utils/token.generator.js';
import { BaseInterceptorGenerator } from '@src/generators/angular/utils/base-interceptor.generator.js';
import { AuthTokensGenerator } from '@src/generators/angular/utils/auth-tokens.generator.js';
import { AuthInterceptorGenerator } from '@src/generators/angular/utils/auth-interceptor.generator.js';
import { DateTransformerGenerator } from '@src/generators/angular/utils/date-transformer.generator.js';
import { emptySpec, securitySpec } from '../shared/specs.js';
import { createTestProject } from '../shared/helpers.js';

describe('Emitter: ProviderGenerator', () => {
    const runGenerator = (spec: object, config: Partial<GeneratorConfig> = {}) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const fullConfig: GeneratorConfig = {
            input: '',
            output: '/out',
            // `clientName` is deliberately omitted from the base to test fallback logic
            options: { generateServices: true, dateType: 'string', enumStyle: 'enum' },
            ...config
        };

        const parser = new SwaggerParser(spec as any, fullConfig);

        new TokenGenerator(project, fullConfig.clientName).generate(fullConfig.output);
        new BaseInterceptorGenerator(project, fullConfig.clientName).generate(fullConfig.output);

        if (fullConfig.options.dateType === 'Date') {
            new DateTransformerGenerator(project).generate(fullConfig.output);
        }

        let tokenNames: string[] = [];
        if (Object.keys(parser.getSecuritySchemes()).length > 0) {
            new AuthTokensGenerator(project).generate(fullConfig.output);
            const authInterceptorResult = new AuthInterceptorGenerator(parser, project).generate(fullConfig.output);
            tokenNames = authInterceptorResult?.tokenNames || [];
        }

        new ProviderGenerator(parser, project, tokenNames).generate(fullConfig.output);
        return project.getSourceFile('/out/providers.ts')?.getText();
    };

    it('should use "Default" client name when none is provided in config', () => {
        // Run with an empty config, so clientName is undefined
        const fileContent = runGenerator(emptySpec, {});
        expect(fileContent).toContain('export function provideDefaultClient(config: DefaultConfig)');
        expect(fileContent).toContain('export interface DefaultConfig');
    });

    it('should not generate if generateServices is false', () => {
        const fileContent = runGenerator(emptySpec, { options: { generateServices: false } as any });
        expect(fileContent).toBeUndefined();
    });

    it('should generate a basic provider without security or date transform', () => {
        const fileContent = runGenerator(emptySpec, { clientName: 'Test' });
        expect(fileContent).toBeDefined();
        expect(fileContent).toContain('export function provideTestClient(config: TestConfig)');
        expect(fileContent).toContain('export interface TestConfig');
        // The fix: basePath is now optional because server-url logic can provide a default
        expect(fileContent).toContain('basePath?: string');
        expect(fileContent).toContain('enableDateTransform?: boolean');
        expect(fileContent).not.toContain('apiKey?: string');
        expect(fileContent).not.toContain('bearerToken?:');
        expect(fileContent).not.toContain('AuthInterceptor');
        expect(fileContent).not.toContain('DateInterceptor');
    });

    it('should add providers for both API key and Bearer token when spec contains both', () => {
        const fileContent = runGenerator(securitySpec, { clientName: 'Test' });
        expect(fileContent).toContain('apiKey?: string');
        expect(fileContent).toContain('bearerToken?: string | (() => string)');
        expect(fileContent).toContain('if (config.apiKey)');
        expect(fileContent).toContain('if (config.bearerToken)');
        expect(fileContent).toContain(
            'providers.push({ provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true });',
        );
    });

    it('should add providers for ONLY API key when spec contains only that', () => {
        const apiKeySpec = {
            ...emptySpec,
            components: { securitySchemes: { ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-KEY' } } }
        };
        const fileContent = runGenerator(apiKeySpec, { clientName: 'Test' });
        expect(fileContent).toContain('apiKey?: string');
        expect(fileContent).not.toContain('bearerToken?:');
        expect(fileContent).toContain('if (config.apiKey)');
        expect(fileContent).not.toContain('if (config.bearerToken)');
        expect(fileContent).toContain('AuthInterceptor');
    });

    it('should add providers for ONLY Bearer token when spec contains only that', () => {
        const bearerSpec = {
            ...emptySpec,
            components: { securitySchemes: { BearerAuth: { type: 'http', scheme: 'bearer' } } }
        };
        const fileContent = runGenerator(bearerSpec, { clientName: 'Test' });
        expect(fileContent).not.toContain('apiKey?: string');
        expect(fileContent).toContain('bearerToken?: string | (() => string)');
        expect(fileContent).not.toContain('if (config.apiKey)');
        expect(fileContent).toContain('if (config.bearerToken)');
        expect(fileContent).toContain('AuthInterceptor');
    });

    it('should add providers for mutualTLS', () => {
        const mtlsSpec = {
            ...emptySpec,
            components: { securitySchemes: { MTLS: { type: 'mutualTLS' } } }
        };
        const fileContent = runGenerator(mtlsSpec, { clientName: 'Test' });
        expect(fileContent).toContain('httpsAgentConfig?: any');
        expect(fileContent).toContain('if (config.httpsAgentConfig)');
        expect(fileContent).toContain('providers.push({ provide: HTTPS_AGENT_CONFIG_TOKEN, useValue: config.httpsAgentConfig });');
    });

    it('should add DateInterceptor if dateType is "Date"', () => {
        const fileContent = runGenerator(emptySpec, { clientName: 'Test', options: { dateType: 'Date' } as any });
        expect(fileContent).toContain('if (config.enableDateTransform !== false)');
        expect(fileContent).toContain('customInterceptors.unshift(new DateInterceptor());');
    });

    it('should generate an empty custom interceptors array if none are provided', () => {
        const fileContent = runGenerator(emptySpec, { clientName: 'Test' });
        expect(fileContent).toContain(
            'const customInterceptors = config.interceptors?.map(InterceptorClass => new InterceptorClass()) || [];',
        );
        expect(fileContent).toContain(`provide: HTTP_INTERCEPTORS_TEST, useValue: customInterceptors`);
    });

    it('should include token providers for cookie authentication (Updated for OAS 3.2 Compliance)', () => {
        const spec = {
            ...emptySpec,
            components: { securitySchemes: { Cookie: { type: 'apiKey', in: 'cookie', name: 'sid' } } },
        };
        // Run Generator
        const fileContent = runGenerator(spec, { clientName: 'Test' });

        // It SHOULD check for cookieAuth
        expect(fileContent).toContain('cookieAuth?: string');
        expect(fileContent).toContain('if (config.cookieAuth)');
        expect(fileContent).toContain('providers.push({ provide: COOKIE_AUTH_TOKEN, useValue: config.cookieAuth });');

        // It should ALSO register the AuthInterceptor now since cookie auth is supported via interceptor logic
        expect(fileContent).toContain(
            'providers.push({ provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true });',
        );
    });

    it('should return early if generateServices is explicitly false', () => {
        const project = createTestProject();
        const config: GeneratorConfig = {
            input: '',
            output: '/out',
            options: { generateServices: false, dateType: 'string', enumStyle: 'enum' },
        };
        const parser = new SwaggerParser(emptySpec as any, config);
        const generator = new ProviderGenerator(parser, project, []);

        generator.generate('/out');

        // If the 'return' statement was hit, the file should not have been created.
        expect(project.getSourceFile('/out/providers.ts')).toBeUndefined();
    });
});
