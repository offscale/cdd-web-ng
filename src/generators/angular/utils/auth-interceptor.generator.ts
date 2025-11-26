import * as path from 'node:path';
import { Project, Scope } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';
import { SecurityScheme } from '@src/core/types/index.js';

export class AuthInterceptorGenerator {
    constructor(private parser: SwaggerParser, private project: Project) {
    }

    public generate(outputDir: string): { tokenNames: string[] } | void {
        const securitySchemes = Object.values(this.parser.getSecuritySchemes());

        const hasSupportedApiKey = securitySchemes.some(s => s.type === 'apiKey' && (s.in === 'header' || s.in === 'query'));
        const hasBearer = securitySchemes.some(s => this.isBearerScheme(s));
        const hasMutualTLS = securitySchemes.some(s => s.type === 'mutualTLS');

        if (!hasSupportedApiKey && !hasBearer && !hasMutualTLS) {
            return;
        }

        const authDir = path.join(outputDir, 'auth');
        const filePath = path.join(authDir, 'auth.interceptor.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        const tokenImports: string[] = ['SECURITY_CONTEXT_TOKEN'];
        const tokenNames: string[] = [];

        if (hasSupportedApiKey) {
            tokenImports.push('API_KEY_TOKEN');
            tokenNames.push('apiKey');
        }
        if (hasBearer) {
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
                schemeLogicParts.push(`'${name}': (req) => this.mtlsConfig ? req.clone({ context: req.context.set(HTTPS_AGENT_CONTEXT_TOKEN, this.mtlsConfig) }) : req`);
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

    private isBearerScheme(s: SecurityScheme): boolean {
        return (s.type === 'http' && s.scheme === 'bearer') || s.type === 'oauth2' || s.type === 'openIdConnect';
    }
}
