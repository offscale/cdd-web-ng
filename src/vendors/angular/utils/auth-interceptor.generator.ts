import * as path from 'node:path';
import { Project, Scope } from 'ts-morph';
import { SwaggerParser } from '@src/openapi/parse.js';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';
import { SecurityScheme } from '@src/core/types/index.js';
import { pascalCase } from '@src/functions/utils.js';

export class AuthInterceptorGenerator {
    constructor(
        private parser: SwaggerParser,
        private project: Project,
    ) {}

    public generate(outputDir: string): { tokenNames: string[] } | void {
        const securitySchemes = Object.values(this.parser.getSecuritySchemes());

        const hasApiKeyHeader = securitySchemes.some(s => s.type === 'apiKey' && s.in === 'header');
        const hasApiKeyQuery = securitySchemes.some(s => s.type === 'apiKey' && s.in === 'query');
        const hasApiKeyCookie = securitySchemes.some(s => s.type === 'apiKey' && s.in === 'cookie');

        // OAS 3.0 support: Generic HTTP schemes (Basic, Digest, etc) alongside Bearer/OAuth2/OIDC
        const hasHttpToken = securitySchemes.some(s => this.isHttpTokenScheme(s));
        const hasMutualTLS = securitySchemes.some(s => s.type === 'mutualTLS');

        if (!hasApiKeyHeader && !hasApiKeyQuery && !hasApiKeyCookie && !hasHttpToken && !hasMutualTLS) {
            return;
        }

        const authDir = path.join(outputDir, 'auth');
        const filePath = path.join(authDir, 'auth.interceptor.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        const tokenImports: string[] = ['SECURITY_CONTEXT_TOKEN'];
        const tokenNames: string[] = [];

        if (hasApiKeyHeader || hasApiKeyQuery) {
            tokenImports.push('API_KEY_TOKEN');
            tokenNames.push('apiKey');
        }
        if (hasApiKeyCookie) {
            tokenImports.push('COOKIE_AUTH_TOKEN');
            tokenNames.push('cookieAuth');
        }
        if (hasHttpToken) {
            tokenImports.push('BEARER_TOKEN_TOKEN');
            tokenNames.push('bearerToken');
        }
        if (hasMutualTLS) {
            tokenImports.push('HTTPS_AGENT_CONFIG_TOKEN');
            tokenImports.push('HTTPS_AGENT_CONTEXT_TOKEN');
            tokenNames.push('httpsAgentConfig');
        }

        sourceFile.addImportDeclarations([
            {
                moduleSpecifier: '@angular/common/http',
                namedImports: ['HttpEvent', 'HttpHandler', 'HttpInterceptor', 'HttpRequest', 'HttpHeaders'],
            },
            { moduleSpecifier: '@angular/core', namedImports: ['inject', 'Injectable'] },
            { moduleSpecifier: 'rxjs', namedImports: ['Observable'] },
            { moduleSpecifier: './auth.tokens', namedImports: tokenImports },
            // Helper used for correct cookie serialization logic (OAS 3.2)
            ...(hasApiKeyCookie
                ? [
                      {
                          moduleSpecifier: '../utils/http-params-builder',
                          namedImports: ['HttpParamsBuilder'],
                      },
                  ]
                : []),
        ]);

        const interceptorClass = sourceFile.addClass({
            name: `AuthInterceptor`,
            isExported: true,
            decorators: [{ name: 'Injectable', arguments: [`{ providedIn: 'root' }`] }],
            implements: ['HttpInterceptor'],
            docs: ['Intercepts HTTP requests to apply authentication credentials based on OpenAPI security schemes.'],
        });

        if (hasApiKeyHeader || hasApiKeyQuery) {
            interceptorClass.addProperty({
                name: 'apiKey',
                isReadonly: true,
                scope: Scope.Private,
                type: 'string | null',
                initializer: `inject(API_KEY_TOKEN, { optional: true })`,
            });
        }
        if (hasApiKeyCookie) {
            interceptorClass.addProperty({
                name: 'cookieAuth',
                isReadonly: true,
                scope: Scope.Private,
                type: 'string | null',
                initializer: `inject(COOKIE_AUTH_TOKEN, { optional: true })`,
            });
        }
        if (hasHttpToken) {
            interceptorClass.addProperty({
                name: 'bearerToken',
                isReadonly: true,
                scope: Scope.Private,
                type: '(string | (() => string)) | null',
                initializer: `inject(BEARER_TOKEN_TOKEN, { optional: true })`,
            });
        }
        if (hasMutualTLS) {
            interceptorClass.addProperty({
                name: 'mtlsConfig',
                isReadonly: true,
                scope: Scope.Private,
                type: 'any',
                initializer: `inject(HTTPS_AGENT_CONFIG_TOKEN, { optional: true })`,
            });
        }

        const schemeLogicParts: string[] = [];
        const uniqueSchemesMap = this.parser.getSecuritySchemes();

        Object.entries(uniqueSchemesMap).forEach(([name, scheme]) => {
            if (scheme.type === 'apiKey' && scheme.name) {
                if (scheme.in === 'header') {
                    schemeLogicParts.push(
                        `'${name}': (req) => this.apiKey ? req.clone({ headers: req.headers.set('${scheme.name}', this.apiKey) }) : null`,
                    );
                } else if (scheme.in === 'query') {
                    schemeLogicParts.push(
                        `'${name}': (req) => this.apiKey ? req.clone({ params: req.params.set('${scheme.name}', this.apiKey) }) : null`,
                    );
                } else if (scheme.in === 'cookie') {
                    // Cookie handling: Must serialize correctly (form style, explode true, allowReserved false is standard for simple api keys)
                    // NOTE: Setting Cookie header manually triggers warnings in browsers but is valid for Node/SSR
                    schemeLogicParts.push(`'${name}': (req) => {
                        if (!this.cookieAuth) return null;
                        if (typeof window !== 'undefined') {
                            console.warn('Setting "Cookie" header manually for scheme "${name}". This usually fails in browsers.');
                        }
                        // Simple serialization for API Key (treat as primitive string, style=form implicit)
                        const cookieVal = HttpParamsBuilder.serializeCookieParam('${scheme.name}', this.cookieAuth, 'form', true, false);
                        const existing = req.headers.get('Cookie') || '';
                        const newCookie = existing ? \`\${existing}; \${cookieVal}\` : cookieVal;
                        return req.clone({ headers: req.headers.set('Cookie', newCookie) });
                    }`);
                }
            } else if (this.isHttpTokenScheme(scheme)) {
                const prefix = this.getAuthPrefix(scheme);
                schemeLogicParts.push(`'${name}': (req) => {
                    const token = typeof this.bearerToken === 'function' ? this.bearerToken() : this.bearerToken;
                    // Use derived prefix (e.g. "Bearer", "Basic", "Digest")
                    return token ? req.clone({ headers: req.headers.set('Authorization', \`${prefix} \${token}\`) }) : null;
                }`);
            } else if (scheme.type === 'mutualTLS') {
                schemeLogicParts.push(
                    `'${name}': (req) => this.mtlsConfig ? req.clone({ context: req.context.set(HTTPS_AGENT_CONTEXT_TOKEN, this.mtlsConfig) }) : req`,
                );
            }
        });

        const statementsBody = `
        const requirements = req.context.get(SECURITY_CONTEXT_TOKEN);
        const applicators: Record<string, (r: HttpRequest<unknown>, scopes?: string[]) => HttpRequest<unknown> | null> = {
            ${schemeLogicParts.join(',\n            ')}
        };

        if (requirements.length === 0) {
            return next.handle(req);
        }

        for (const requirement of requirements) {
            let clone: HttpRequest<unknown> | null = req;
            let satisfied = true;

            if (Object.keys(requirement).length === 0) {
                return next.handle(req);
            }

            for (const [scheme, scopes] of Object.entries(requirement)) {
                const apply = applicators[scheme];
                if (!apply) {
                    satisfied = false;
                    break;
                }
                clone = apply(clone!, scopes);
                if (!clone) {
                    satisfied = false;
                    break;
                }
            }

            if (satisfied && clone) {
                return next.handle(clone);
            }
        }

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

    private isHttpTokenScheme(s: SecurityScheme): boolean {
        return s.type === 'http' || s.type === 'oauth2' || s.type === 'openIdConnect';
    }

    private getAuthPrefix(s: SecurityScheme): string {
        if (s.type === 'oauth2' || s.type === 'openIdConnect') return 'Bearer';
        if (s.type === 'http') {
            // scheme is required for http type
            const scheme = s.scheme;
            if (!scheme || scheme.toLowerCase() === 'bearer') return 'Bearer';
            // Use pascalCase to handle casing conventions (e.g. basic -> Basic, digest -> Digest)
            return pascalCase(scheme);
        }
        return 'Bearer';
    }
}
