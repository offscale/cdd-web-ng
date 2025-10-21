/**
 * @fileoverview
 * This test suite validates the `ProviderGenerator`. This generator is responsible for creating
 * a helper function (e.g., `provideAuth`) that simplifies the process of configuring authentication
 * for the generated services in an Angular application. It tests that the generator correctly
 * creates an `AuthConfig` interface and a provider function that supplies the necessary
 * authentication tokens and registers the `AuthInterceptor`.
 */

import { describe, it, expect } from 'vitest';
import { Project, IndentationText, SourceFile } from 'ts-morph';
import { SwaggerParser } from '../../src/core/parser.js';
import { GeneratorConfig } from '../../src/core/types.js';
import { AuthInterceptorGenerator } from '../../src/service/emit/utility/auth-interceptor.generator.js';
import { ProviderGenerator } from '../../src/service/emit/utility/provider.generator.js';
import { authSchemesSpec } from '../admin/specs/test.specs.js';

/**
 * A helper function to run both the AuthInterceptorGenerator and the ProviderGenerator.
 * The ProviderGenerator depends on the AuthInterceptorGenerator having run first to know which
 * tokens need to be provided.
 *
 * @param specString The OpenAPI specification as a JSON string.
 * @returns A promise that resolves to the generated SourceFile for the providers, or undefined if not generated.
 */
async function generateProviders(specString: string): Promise<SourceFile | undefined> {
    const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: { indentationText: IndentationText.TwoSpaces },
    compilerOptions: {
        target: ScriptTarget.ESNext,
        module: ModuleKind.ESNext,
        moduleResolution: 99, // NodeNext
        lib: ["ES2022", "DOM"],
        strict: true,
        esModuleInterop: true,
        allowArbitraryExtensions: true, // Crucial for `.js` imports in NodeNext
        resolveJsonModule: true
    }
});

    const config: GeneratorConfig = {
        input: 'spec.json',
        output: './generated',
        options: {
            dateType: 'string',
            enumStyle: 'enum',
            generateServices: true,
        }
    };

    const spec = JSON.parse(specString);
    const parser = new SwaggerParser(spec, config);

    // --- FIX: Explicitly run ALL dependencies ---
    // 1. Generate tokens first
    new AuthTokensGenerator(project).generate('./generated');

    // 2. Then generate the interceptor
    const interceptorGenerator = new AuthInterceptorGenerator(parser, project);
    const interceptorResult = interceptorGenerator.generate('./generated');

    if (interceptorResult) {
        // 3. Now generate the provider, passing the real token names
        const providerGenerator = new ProviderGenerator(parser, project, interceptorResult.tokenNames);
        providerGenerator.generate('./generated');
    }
    // --- END FIX ---

    return project.getSourceFile('generated/auth/auth.providers.ts');
}

/**
 * Main test suite for the ProviderGenerator.
 */
describe('ProviderGenerator', () => {

    /**
     * Verifies that the generator does nothing if the OpenAPI spec contains no security schemes.
     * In this case, no interceptor is generated, and thus no providers are needed.
     */
    it('should not generate a provider file if no security schemes are defined', async () => {
        const emptySpec = JSON.stringify({ openapi: '3.0.0', info: { title: 'test', version: '1' }, paths: {} });
        const providerFile = await generateProviders(emptySpec);
        expect(providerFile).toBeUndefined();
    });

    /**
     * Tests the generation of the `AuthConfig` interface and the `provideAuth` function
     * when multiple security schemes are present. It ensures all necessary tokens are included
     * and the interceptor is correctly registered.
     */
    it('should generate an AuthConfig interface and a provider function for API Key and Bearer schemes', async () => {
        const providerFile = await generateProviders(authSchemesSpec);
        expect(providerFile).toBeDefined();

        const fileText = providerFile!.getFullText();

        // Check for the AuthConfig interface with the correct optional properties
        expect(fileText).toContain('export interface AuthConfig {');
        expect(fileText).toMatch(/apiKey\?: string;/);
        expect(fileText).toMatch(/bearerToken\?: string | \(\) => string;/);

        // Check for the provideAuth function signature
        expect(fileText).toContain('export function provideAuth(config: AuthConfig): EnvironmentProviders {');

        // Check for the provider definitions
        expect(fileText).toContain(`{ provide: API_KEY_TOKEN, useValue: config.apiKey }`);
        expect(fileText).toContain(`{ provide: BEARER_TOKEN_TOKEN, useValue: config.bearerToken }`);

        // Check that the interceptor is provided
        expect(fileText).toContain('{ provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }');

        // Check for necessary imports
        expect(fileText).toContain(`import { API_KEY_TOKEN, BEARER_TOKEN_TOKEN } from './auth.tokens'`);
        expect(fileText).toContain(`import { AuthInterceptor } from './auth.interceptor'`);
    });
});
