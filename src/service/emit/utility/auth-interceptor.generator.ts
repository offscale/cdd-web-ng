// src/service/emit/utility/auth-interceptor.generator.ts
import * as path from 'node:path';
import { Project, Scope } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';
import { SecurityScheme } from '@src/core/types.js';

/**
 * Generates the `auth.interceptor.ts` file. This interceptor is responsible for
 * attaching API keys and/or Bearer tokens to outgoing HTTP requests based on the
 * security schemes defined in the OpenAPI specification.
 * It supports `apiKey`, `http` (Bearer), `oauth2`, `openIdConnect`, and recognizes `mutualTLS`.
 */
export class AuthInterceptorGenerator {
    /**
     * @param parser The `SwaggerParser` instance for accessing spec details.
     * @param project The `ts-morph` project for AST manipulation.
     */
    constructor(private parser: SwaggerParser, private project: Project) {
    }

    /**
     * Generates the auth interceptor file if any **supported** security schemes are defined in the spec.
     *
     * @param outputDir The root output directory.
     * @returns An object containing the names of the tokens for supported schemes (e.g., `['apiKey', 'bearerToken']`),
     *          or `void` if no supported security schemes are found and no file is generated.
     */
    public generate(outputDir: string): { tokenNames: string[] } | void {
        const securitySchemes = Object.values(this.parser.getSecuritySchemes());

        const hasSupportedApiKey = securitySchemes.some(s => s.type === 'apiKey' && (s.in === 'header' || s.in === 'query'));
        const hasBearer = securitySchemes.some(s => this.isBearerScheme(s));
        const hasMutualTLS = securitySchemes.some(s => s.type === 'mutualTLS');

        // If no supported schemes are found, do not generate the file at all.
        if (!hasSupportedApiKey && !hasBearer && !hasMutualTLS) {
            return;
        }

        const authDir = path.join(outputDir, 'auth');
        const filePath = path.join(authDir, 'auth.interceptor.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        const tokenImports: string[] = [];
        const tokenNames: string[] = [];

        // Ensure SKIP_AUTH_CONTEXT_TOKEN is imported
        tokenImports.push('SKIP_AUTH_CONTEXT_TOKEN');

        if (hasSupportedApiKey) {
            tokenImports.push('API_KEY_TOKEN');
            tokenNames.push('apiKey');
        }
        if (hasBearer) {
            tokenImports.push('BEARER_TOKEN_TOKEN');
            tokenNames.push('bearerToken');
        }

        sourceFile.addImportDeclarations([
            {
                moduleSpecifier: '@angular/common/http',
                namedImports: ['HttpEvent', 'HttpHandler', 'HttpInterceptor', 'HttpRequest'],
            },
            { moduleSpecifier: '@angular/core', namedImports: ['inject', 'Injectable'] },
            { moduleSpecifier: 'rxjs', namedImports: ['Observable'] },
            { moduleSpecifier: './auth.tokens', namedImports: tokenImports },
        ]);

        const interceptorClass = sourceFile.addClass({
            name: `AuthInterceptor`,
            isExported: true,
            decorators: [{ name: 'Injectable', arguments: [`{ providedIn: 'root' }`] }],
            implements: ['HttpInterceptor'],
            docs: ['Intercepts HTTP requests to apply authentication credentials based on OpenAPI security schemes.'],
        });

        if (hasSupportedApiKey) {
            interceptorClass.addProperty({
                name: 'apiKey',
                isReadonly: true,
                scope: Scope.Private,
                type: 'string | null',
                initializer: `inject(API_KEY_TOKEN, { optional: true })`,
            });
        }
        if (hasBearer) {
            interceptorClass.addProperty({
                name: 'bearerToken',
                isReadonly: true,
                scope: Scope.Private,
                type: '(string | (() => string)) | null',
                initializer: `inject(BEARER_TOKEN_TOKEN, { optional: true })`,
            });
        }

        let statementsBody = `// Check for the skip auth token in the request context
if (req.context.get(SKIP_AUTH_CONTEXT_TOKEN)) {
    return next.handle(req);
}\n`;
        statementsBody += 'let authReq = req;';
        let bearerLogicAdded = false;

        const uniqueSchemes = Array.from(new Set(securitySchemes.map(s => JSON.stringify(s)))).map(s => JSON.parse(s) as SecurityScheme);

        for (const scheme of uniqueSchemes) {
            if (scheme.type === 'apiKey' && scheme.name) {
                if (scheme.in === 'header') {
                    statementsBody += `\nif (this.apiKey) { authReq = authReq.clone({ setHeaders: { ...authReq.headers.keys().reduce((acc, key) => ({ ...acc, [key]: authReq.headers.getAll(key) }), {}), '${scheme.name}': this.apiKey } }); }`;
                } else if (scheme.in === 'query') {
                    statementsBody += `\nif (this.apiKey) { authReq = authReq.clone({ setParams: { ...authReq.params.keys().reduce((acc, key) => ({ ...acc, [key]: authReq.params.getAll(key) }), {}), '${scheme.name}': this.apiKey } }); }`;
                }
            } else if (this.isBearerScheme(scheme)) {
                if (!bearerLogicAdded) {
                    statementsBody += `\nif (this.bearerToken) { const token = typeof this.bearerToken === 'function' ? this.bearerToken() : this.bearerToken; if (token) { authReq = authReq.clone({ setHeaders: { ...authReq.headers.keys().reduce((acc, key) => ({ ...acc, [key]: authReq.headers.getAll(key) }), {}), 'Authorization': \`Bearer \${token}\` } }); } }`;
                    bearerLogicAdded = true;
                }
            } else if (scheme.type === 'mutualTLS') {
                statementsBody += `\n// Security Scheme '${scheme.name || 'MutualTLS'}' (mutualTLS) is assumed to be handled by the browser/client configuration.`;
            }
        }

        statementsBody += '\nreturn next.handle(authReq);';

        interceptorClass.addMethod({
            name: 'intercept',
            parameters: [
                { name: 'req', type: 'HttpRequest<unknown>' },
                { name: 'next', type: 'HttpHandler' },
            ],
            returnType: 'Observable<HttpEvent<unknown>>',
            statements: statementsBody,
        });

        sourceFile.formatText();
        return { tokenNames };
    }

    private isBearerScheme(s: SecurityScheme): boolean {
        return (s.type === 'http' && s.scheme === 'bearer') || s.type === 'oauth2' || s.type === 'openIdConnect';
    }
}
