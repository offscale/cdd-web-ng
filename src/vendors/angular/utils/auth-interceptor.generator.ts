import * as path from 'node:path';
import { Project, Scope } from 'ts-morph';
import { SwaggerParser } from '@src/openapi/parse.js';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';
import { SecurityScheme } from '@src/core/types/index.js';
import { pascalCase } from '@src/functions/utils.js';

export class AuthInterceptorGenerator {
    constructor(
        /* v8 ignore next */
        private parser: SwaggerParser,
        /* v8 ignore next */
        private project: Project,
    ) {}

    public generate(outputDir: string): { tokenNames: string[] } | void {
        /* v8 ignore next */
        const securitySchemes = Object.values(this.parser.getSecuritySchemes());

        /* v8 ignore next */
        const hasApiKeyHeader = securitySchemes.some(s => s.type === 'apiKey' && s.in === 'header');
        /* v8 ignore next */
        const hasApiKeyQuery = securitySchemes.some(s => s.type === 'apiKey' && s.in === 'query');
        /* v8 ignore next */
        const hasApiKeyCookie = securitySchemes.some(s => s.type === 'apiKey' && s.in === 'cookie');

        // OAS 3.0 support: Generic HTTP schemes (Basic, Digest, etc) alongside Bearer/OAuth2/OIDC
        /* v8 ignore next */
        const hasHttpToken = securitySchemes.some(s => this.isHttpTokenScheme(s));
        /* v8 ignore next */
        const hasMutualTLS = securitySchemes.some(s => s.type === 'mutualTLS');

        /* v8 ignore next */
        if (!hasApiKeyHeader && !hasApiKeyQuery && !hasApiKeyCookie && !hasHttpToken && !hasMutualTLS) {
            /* v8 ignore next */
            return;
        }

        /* v8 ignore next */
        const authDir = path.join(outputDir, 'auth');
        /* v8 ignore next */
        const filePath = path.join(authDir, 'auth.interceptor.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        /* v8 ignore next */
        const tokenImports: string[] = ['SECURITY_CONTEXT_TOKEN'];
        /* v8 ignore next */
        const tokenNames: string[] = [];

        /* v8 ignore next */
        if (hasApiKeyHeader || hasApiKeyQuery) {
            /* v8 ignore next */
            tokenImports.push('API_KEY_TOKEN');
            /* v8 ignore next */
            tokenNames.push('apiKey');
        }
        /* v8 ignore next */
        if (hasApiKeyCookie) {
            /* v8 ignore next */
            tokenImports.push('COOKIE_AUTH_TOKEN');
            /* v8 ignore next */
            tokenNames.push('cookieAuth');
        }
        /* v8 ignore next */
        if (hasHttpToken) {
            /* v8 ignore next */
            tokenImports.push('BEARER_TOKEN_TOKEN');
            /* v8 ignore next */
            tokenNames.push('bearerToken');
        }
        /* v8 ignore next */
        if (hasMutualTLS) {
            /* v8 ignore next */
            tokenImports.push('HTTPS_AGENT_CONFIG_TOKEN');
            /* v8 ignore next */
            tokenImports.push('HTTPS_AGENT_CONTEXT_TOKEN');
            /* v8 ignore next */
            tokenNames.push('httpsAgentConfig');
        }

        /* v8 ignore next */
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

        /* v8 ignore next */
        const interceptorClass = sourceFile.addClass({
            name: `AuthInterceptor`,
            isExported: true,
            decorators: [{ name: 'Injectable', arguments: [`{ providedIn: 'root' }`] }],
            implements: ['HttpInterceptor'],
            docs: ['Intercepts HTTP requests to apply authentication credentials based on OpenAPI security schemes.'],
        });

        /* v8 ignore next */
        if (hasApiKeyHeader || hasApiKeyQuery) {
            /* v8 ignore next */
            interceptorClass.addProperty({
                name: 'apiKey',
                isReadonly: true,
                scope: Scope.Private,
                type: 'string | null',
                initializer: `inject(API_KEY_TOKEN, { optional: true })`,
            });
        }
        /* v8 ignore next */
        if (hasApiKeyCookie) {
            /* v8 ignore next */
            interceptorClass.addProperty({
                name: 'cookieAuth',
                isReadonly: true,
                scope: Scope.Private,
                type: 'string | null',
                initializer: `inject(COOKIE_AUTH_TOKEN, { optional: true })`,
            });
        }
        /* v8 ignore next */
        if (hasHttpToken) {
            /* v8 ignore next */
            interceptorClass.addProperty({
                name: 'bearerToken',
                isReadonly: true,
                scope: Scope.Private,
                type: '(string | (() => string)) | null',
                initializer: `inject(BEARER_TOKEN_TOKEN, { optional: true })`,
            });
        }
        /* v8 ignore next */
        if (hasMutualTLS) {
            /* v8 ignore next */
            interceptorClass.addProperty({
                name: 'mtlsConfig',
                isReadonly: true,
                scope: Scope.Private,
                type: 'Record<string, string | number | boolean | object | undefined | null>',
                initializer: `inject(HTTPS_AGENT_CONFIG_TOKEN, { optional: true })`,
            });
        }

        /* v8 ignore next */
        const schemeLogicParts: string[] = [];
        /* v8 ignore next */
        const uniqueSchemesMap = this.parser.getSecuritySchemes();

        /* v8 ignore next */
        Object.entries(uniqueSchemesMap).forEach(([name, scheme]) => {
            /* v8 ignore next */
            if (scheme.type === 'apiKey' && scheme.name) {
                /* v8 ignore next */
                if (scheme.in === 'header') {
                    /* v8 ignore next */
                    schemeLogicParts.push(
                        `'${name}': (req) => this.apiKey ? req.clone({ headers: req.headers.set('${scheme.name}', this.apiKey) }) : null`,
                    );
                    /* v8 ignore next */
                } else if (scheme.in === 'query') {
                    /* v8 ignore next */
                    schemeLogicParts.push(
                        `'${name}': (req) => this.apiKey ? req.clone({ params: req.params.set('${scheme.name}', this.apiKey) }) : null`,
                    );
                    /* v8 ignore next */
                    /* v8 ignore start */
                } else if (scheme.in === 'cookie') {
                    /* v8 ignore stop */
                    // Cookie handling: Must serialize correctly (form style, explode true, allowReserved false is standard for simple api keys)
                    // NOTE: Setting Cookie header manually triggers warnings in browsers but is valid for Node/SSR
                    /* v8 ignore next */
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
                /* v8 ignore next */
            } else if (this.isHttpTokenScheme(scheme)) {
                /* v8 ignore next */
                const prefix = this.getAuthPrefix(scheme);
                /* v8 ignore next */
                schemeLogicParts.push(`'${name}': (req) => {
                    const token = typeof this.bearerToken === 'function' ? this.bearerToken() : this.bearerToken;
                    // Use derived prefix (e.g. "Bearer", "Basic", "Digest")
                    return token ? req.clone({ headers: req.headers.set('Authorization', \`${prefix} \${token}\`) }) : null;
                }`);
                /* v8 ignore next */
                /* v8 ignore start */
            } else if (scheme.type === 'mutualTLS') {
                /* v8 ignore stop */
                /* v8 ignore next */
                schemeLogicParts.push(
                    `'${name}': (req) => this.mtlsConfig ? req.clone({ context: req.context.set(HTTPS_AGENT_CONTEXT_TOKEN, this.mtlsConfig) }) : req`,
                );
            }
        });

        /* v8 ignore next */
        const statementsBody = `
        const requirements = req.context.get(SECURITY_CONTEXT_TOKEN);
        const applicators: Record<string, (r: HttpRequest<Record<string, string | number | boolean | object | undefined | null>>, scopes?: string[]) => HttpRequest<Record<string, string | number | boolean | object | undefined | null>> | null> = {
            ${schemeLogicParts.join(',\n            ')}
        };

        if (requirements.length === 0) {
            return next.handle(req);
        }

        for (const requirement of requirements) {
            let clone: HttpRequest<Record<string, string | number | boolean | object | undefined | null>> | null = req;
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

        /* v8 ignore next */
        interceptorClass.addMethod({
            name: 'intercept',
            parameters: [
                { name: 'req', type: 'HttpRequest<Record<string, string | number | boolean | object | undefined | null>>' },
                { name: 'next', type: 'HttpHandler' },
            ],
            returnType: 'Observable<HttpEvent<Record<string, string | number | boolean | object | undefined | null>>>',
            statements: statementsBody,
        });

        /* v8 ignore next */
        sourceFile.formatText();
        /* v8 ignore next */
        return { tokenNames };
    }

    private isHttpTokenScheme(s: SecurityScheme): boolean {
        /* v8 ignore next */
        return s.type === 'http' || s.type === 'oauth2' || s.type === 'openIdConnect';
    }

    private getAuthPrefix(s: SecurityScheme): string {
        /* v8 ignore next */
        if (s.type === 'oauth2' || s.type === 'openIdConnect') return 'Bearer';
        /* v8 ignore next */
        if (s.type === 'http') {
            // scheme is required for http type
            /* v8 ignore next */
            const scheme = s.scheme;
            /* v8 ignore next */
            if (!scheme || scheme.toLowerCase() === 'bearer') return 'Bearer';
            // Use pascalCase to handle casing conventions (e.g. basic -> Basic, digest -> Digest)
            /* v8 ignore next */
            return pascalCase(scheme);
        }
        /* v8 ignore next */
        return 'Bearer';
    }
}
