/**
 * @fileoverview
 * This test suite validates the `ProviderGenerator`.
 */

import { describe, it, expect } from 'vitest';
import { Project, IndentationText, SourceFile, ScriptTarget, ModuleKind } from 'ts-morph';
import { SwaggerParser } from '../../src/core/parser.js';
import { GeneratorConfig } from '../../src/core/types.js';
import { AuthTokensGenerator } from '../../src/service/emit/utility/auth-tokens.generator.js';
import { AuthInterceptorGenerator } from '../../src/service/emit/utility/auth-interceptor.generator.js';
import { ProviderGenerator } from '../../src/service/emit/utility/provider.generator.js';
import { authSchemesSpec } from '../admin/specs/test.specs.js';
import { BaseInterceptorGenerator } from '../../src/service/emit/utility/base-interceptor.generator.js';
import { TokenGenerator } from '../../src/service/emit/utility/token.generator.js';

/**
 * A helper function to run the provider generation pipeline manually.
 * This is the most stable way to test as it avoids potential module resolution bugs with Vitest.
 * @param specString The OpenAPI specification as a JSON string.
 * @returns A promise that resolves to the generated SourceFile for the providers.
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
            allowArbitraryExtensions: true,
            resolveJsonModule: true
        }
    });

    const config: GeneratorConfig = {
        input: '/spec.json',
        output: '/generated',
        options: {
            dateType: 'string',
            enumStyle: 'enum',
            generateServices: true,
        }
    };

    // Step 1: Create the parser instance from the spec string
    const spec = JSON.parse(specString);
    const parser = new SwaggerParser(spec, config);

    // Step 2: Run all dependency generators that ProviderGenerator needs
    // These must be run in the correct order to generate the files that providers.ts imports.
    new TokenGenerator(project, config.clientName).generate(config.output);
    new BaseInterceptorGenerator(project, config.clientName).generate(config.output);
    new AuthTokensGenerator(project).generate(config.output);

    const interceptorGenerator = new AuthInterceptorGenerator(parser, project);
    const interceptorResult = interceptorGenerator.generate(config.output);

    // Step 3: Run the actual generator we are testing
    const providerGenerator = new ProviderGenerator(parser, project, interceptorResult?.tokenNames);
    providerGenerator.generate(config.output);

    // Step 4: Return the file for assertion
    return project.getSourceFile(`${config.output}/providers.ts`);
}

describe('ProviderGenerator', () => {

    it('should generate a provider file even if no security schemes are defined', async () => {
        const emptySpec = JSON.stringify({ openapi: '3.0.0', info: { title: 'test', version: '1' }, paths: {} });
        const providerFile = await generateProviders(emptySpec);
        expect(providerFile).toBeDefined();
        const fileText = providerFile!.getFullText();
        expect(fileText).toContain('provideDefaultClient');
        expect(fileText).not.toContain('AuthInterceptor');
    });

    it('should generate an AuthConfig interface and a provider function for API Key and Bearer schemes', async () => {
        const providerFile = await generateProviders(authSchemesSpec);
        expect(providerFile).toBeDefined();

        const fileText = providerFile!.getFullText();

        expect(fileText).toContain('export interface DefaultConfig');
        expect(fileText).toMatch(/apiKey\?:\s*string/);
        expect(fileText).toMatch(/bearerToken\?:\s*string\s*\|\s*\(\)\s*=>\s*string/);
        expect(fileText).toContain('export function provideDefaultClient(config: DefaultConfig)');
        expect(fileText).toContain(`if (config.apiKey)`); // Looser check
        expect(fileText).toContain(`if (config.bearerToken)`); // Looser check
        expect(fileText).toMatch(/provide:\s*HTTP_INTERCEPTORS,\s*useClass:\s*AuthInterceptor,\s*multi:\s*true/);
        expect(fileText).toMatch(/import\s*{[^}]+API_KEY_TOKEN[^}]+}\s*from\s*['"]\.\/auth\/auth.tokens/);
        expect(fileText).toMatch(/import\s*{[^}]+AuthInterceptor[^}]+}\s*from\s*['"]\.\/auth\/auth.interceptor/);
    });
});