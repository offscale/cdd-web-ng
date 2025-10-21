/**
 * @fileoverview
 * This test suite validates the `AuthInterceptorGenerator`. Its purpose is to ensure that an
 * `AuthInterceptor` is generated correctly based on the security schemes defined in an OpenAPI
 * specification. It tests various scenarios, including API keys in headers and queries, Bearer tokens,
 * OAuth2 flows, and combinations of these, ensuring the generated interceptor will correctly
 - * attach authentication credentials to outgoing HTTP requests.
 */

import { describe, it, expect } from 'vitest';
import { Project, IndentationText, SourceFile, ModuleKind, ScriptTarget } from 'ts-morph';
import { SwaggerParser } from '../../src/core/parser.js';
import { GeneratorConfig } from '../../src/core/types.js';
import { AuthInterceptorGenerator } from '../../src/service/emit/utility/auth-interceptor.generator.js';
import { AuthTokensGenerator } from '../../src/service/emit/utility/auth-tokens.generator.js';
import { authSchemesSpec, authSchemesSpecV2 } from './specs/test.specs.js';

/**
 * A helper function to create a ts-morph Project, a SwaggerParser instance,
 * and run the AuthInterceptorGenerator. This encapsulates the setup logic for each test case.
 *
 * @param specString The OpenAPI specification as a JSON string.
 * @returns A promise that resolves to the generated SourceFile for the auth interceptor.
 *          If no interceptor is generated (e.g., no security schemes), it returns undefined.
 */
async function generateInterceptor(specString: string): Promise<SourceFile | undefined> {
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
    // ------------------- FIX -------------------
    // The AuthTokensGenerator must run before the interceptor generator.
    new AuthTokensGenerator(project).generate('./generated');
    // ----------------- END FIX -----------------
    const generator = new AuthInterceptorGenerator(parser, project);

    generator.generate('./generated');

    return project.getSourceFile('generated/auth/auth.interceptor.ts');
}

/**
 * Main test suite for the AuthInterceptorGenerator.
 */
describe('AuthInterceptorGenerator', () => {

    /**
     * Verifies that the generator does nothing when the OpenAPI spec contains no security schemes.
     */
    it('should not generate an interceptor if no security schemes are defined', async () => {
        const emptySpec = JSON.stringify({ openapi: '3.0.0', info: { title: 'test', version: '1' }, paths: {} });
        const interceptorFile = await generateInterceptor(emptySpec);
        expect(interceptorFile).toBeUndefined();
    });

    /**
     * Tests generation for a simple API key passed in a request header.
     * It checks if the interceptor injects the correct token and clones the request
     * with the appropriate header.
     */
    it('should generate an interceptor for an API key in the header', async () => {
        const spec = JSON.stringify({ ...JSON.parse(authSchemesSpec), components: { securitySchemes: { ApiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-KEY' } } } });
        const interceptorFile = await generateInterceptor(spec);
        const interceptorText = interceptorFile?.getFullText() ?? '';

        // ------------------- FIX -------------------
        // Made assertions less brittle; they no longer depend on specific quote styles or semicolons.
        expect(interceptorText).toContain('API_KEY_TOKEN');
        expect(interceptorText).toContain('./auth.tokens');
        // ----------------- END FIX -----------------
        expect(interceptorText).toContain('inject(API_KEY_TOKEN, { optional: true })');
        expect(interceptorText).toContain(`authReq = req.clone({ setHeaders: { 'X-API-KEY': this.apiKey } });`);
    });

    /**
     * Tests generation for an API key passed as a query parameter.
     */
    it('should generate an interceptor for an API key in the query string', async () => {
        const spec = JSON.stringify({ ...JSON.parse(authSchemesSpec), components: { securitySchemes: { ApiKeyQuery: { type: 'apiKey', in: 'query', name: 'apiKey' } } } });
        const interceptorFile = await generateInterceptor(spec);
        const interceptorText = interceptorFile?.getFullText() ?? '';

        expect(interceptorText).toContain('API_KEY_TOKEN');
        expect(interceptorText).toContain(`authReq = req.clone({ setParams: { 'apiKey': this.apiKey } });`);
    });

    /**
     * Tests generation for a standard HTTP Bearer token.
     */
    it('should generate an interceptor for a Bearer token', async () => {
        const spec = JSON.stringify({ ...JSON.parse(authSchemesSpec), components: { securitySchemes: { BearerAuth: { type: 'http', scheme: 'bearer' } } } });
        const interceptorFile = await generateInterceptor(spec);
        const interceptorText = interceptorFile?.getFullText() ?? '';

        // ------------------- FIX -------------------
        expect(interceptorText).toContain('BEARER_TOKEN_TOKEN');
        expect(interceptorText).toContain('./auth.tokens');
        // ----------------- END FIX -----------------
        expect(interceptorText).toContain('inject(BEARER_TOKEN_TOKEN, { optional: true })');
        expect(interceptorText).toContain(`const token = typeof this.bearerToken === 'function' ? this.bearerToken() : this.bearerToken;`);
        expect(interceptorText).toContain(`authReq = req.clone({ setHeaders: { 'Authorization': \`Bearer \${token}\` } });`);
    });

    /**
     * Tests generation for an OAuth2 flow.
     */
    it('should generate an interceptor for an OAuth2 flow', async () => {
        const spec = JSON.stringify({ ...JSON.parse(authSchemesSpec), components: { securitySchemes: { OAuth2Flow: { type: 'oauth2', flows: {} } } } });
        const interceptorFile = await generateInterceptor(spec);
        const interceptorText = interceptorFile?.getFullText() ?? '';

        expect(interceptorText).toContain('BEARER_TOKEN_TOKEN');
        expect(interceptorText).toContain(`authReq = req.clone({ setHeaders: { 'Authorization': \`Bearer \${token}\` } });`);
    });

    /**
     * Tests the logic when multiple security schemes are present.
     */
    it('should generate an interceptor with `else if` for multiple security schemes', async () => {
        const interceptorFile = await generateInterceptor(authSchemesSpec);
        // ------------------- FIX -------------------
        // The interceptorFile is now guaranteed to be defined if generation succeeds.
        const interceptorText = interceptorFile!.getClassOrThrow('AuthInterceptor').getMethodOrThrow('intercept').getBodyText()!;
        // ----------------- END FIX -----------------

        const apiKeyBlockCount = (interceptorText.match(/if \(this.apiKey\)/g) || []).length;
        const bearerBlockCount = (interceptorText.match(/if \(this.bearerToken\)/g) || []).length;
        const elseCount = (interceptorText.match(/} else if/g) || []).length;

        expect(apiKeyBlockCount).toBe(1);
        expect(bearerBlockCount).toBe(1);
        expect(elseCount).toBeGreaterThanOrEqual(1);
    });

    /**
     * Verifies that the generator can correctly parse Swagger 2.0 definitions.
     */
    it('should correctly generate from Swagger 2.0 `securityDefinitions`', async () => {
        const interceptorFile = await generateInterceptor(authSchemesSpecV2);
        const interceptorText = interceptorFile?.getFullText() ?? '';

        expect(interceptorText).toContain('inject(API_KEY_TOKEN, { optional: true })');
        expect(interceptorText).toContain(`authReq = req.clone({ setHeaders: { 'X-API-KEY': this.apiKey } });`);
    });
});
