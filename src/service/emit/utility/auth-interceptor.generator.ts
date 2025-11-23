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
 *
 * UPDATED: Supports Advanced Auth Scope Logic (OAS 3.2).
 * It evaluates the `SECURITY_CONTEXT_TOKEN` to find the first satisfiable Security Requirement set.
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

        // Import the single unified security token
        tokenImports.push('SECURITY_CONTEXT_TOKEN');

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

        // Generate mappings for scheme -> application logic
        // This creates a map of functions where keys are the scheme names defined in OAS components
        const schemeLogicParts: string[] = [];
        const uniqueSchemesMap = this.parser.getSecuritySchemes();

        Object.entries(uniqueSchemesMap).forEach(([name, scheme]) => {
            if (scheme.type === 'apiKey' && scheme.name) {
                if (scheme.in === 'header') {
                    schemeLogicParts.push(`'${name}': (req) => this.apiKey ? req.clone({ headers: req.headers.set('${scheme.name}', this.apiKey) }) : null`);
                } else if (scheme.in === 'query') {
                    schemeLogicParts.push(`'${name}': (req) => this.apiKey ? req.clone({ params: req.params.set('${scheme.name}', this.apiKey) }) : null`);
                }
            } else if (this.isBearerScheme(scheme)) {
                schemeLogicParts.push(`'${name}': (req) => {
                    const token = typeof this.bearerToken === 'function' ? this.bearerToken() : this.bearerToken;
                    return token ? req.clone({ headers: req.headers.set('Authorization', \`Bearer \${token}\`) }) : null;
                }`);
            } else if (scheme.type === 'mutualTLS') {
                // MTLS is usually handled at the connection level by the browser/OS, so we pass it through effectively "satisfied"
                // Return req as-is to indicate satisfaction without modification.
                schemeLogicParts.push(`'${name}': (req) => req`);
            }
        });

        // Build the intercept method body
        const statementsBody = `
        const requirements = req.context.get(SECURITY_CONTEXT_TOKEN);

        // Map of Security Scheme Name -> Application Logic
        const applicators: Record<string, (r: HttpRequest<unknown>, scopes?: string[]) => HttpRequest<unknown> | null> = {
            ${schemeLogicParts.join(',\n            ')}
        };

        // If no requirements defined (or empty array from generator defaults), pass through.
        // Default behavior: If security IS in context but empty list, it means defaults.
        // If security token is populated, it's authoritative. 
        // We assume generator populates it with [] if no security.
        if (requirements.length === 0) {
            return next.handle(req);
        }

        // Iterate over the logical OR requirements (e.g. [ { APIKey: [] }, { OAuth: [] } ])
        for (const requirement of requirements) {
            let clone: HttpRequest<unknown> | null = req;
            let satisfied = true;

            // Check if the empty requirement {} (Anonymous) is present
            if (Object.keys(requirement).length === 0) {
                return next.handle(req);
            }

            // Iterate over logical AND requirements (e.g. { APIKey: [], OAuth: [] })
            for (const [scheme, scopes] of Object.entries(requirement)) {
                const apply = applicators[scheme];
                if (!apply) {
                    // Scheme defined in spec but not supported/configured in client
                    satisfied = false; 
                    break;
                }
                
                // Attempt to apply credentials
                clone = apply(clone!, scopes);
                if (!clone) {
                    // Credential missing
                    satisfied = false;
                    break;
                }
            }

            if (satisfied && clone) {
                return next.handle(clone);
            }
        }

        // If we reach here, no security requirement was fully satisfied.
        // We pass the original request. The server will likely return 401/403.
        return next.handle(req);
        `;

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
