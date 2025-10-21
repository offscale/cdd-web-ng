import * as path from 'path';
import { Project } from 'ts-morph';
import { SwaggerParser } from '../../../core/parser.js';
import { SecurityScheme } from '../../../core/types.js';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../../core/constants.js';

/**
 * Generates the `auth.interceptor.ts` file. This interceptor automatically attaches
 * API keys or bearer tokens to requests based on the security schemes defined
 * in the OpenAPI specification.
 */
export class AuthInterceptorGenerator {
    constructor(private parser: SwaggerParser, private project: Project) { }

    public generate(outputDir: string): void {
        const securitySchemes = Object.values(this.parser.getSecuritySchemes());
        if (securitySchemes.length === 0) {
            return; // No security schemes, no interceptor needed.
        }

        const authDir = path.join(outputDir, 'auth');
        const filePath = path.join(authDir, 'auth.interceptor.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        const hasApiKey = securitySchemes.some(s => s.type === 'apiKey');
        const hasBearer = securitySchemes.some(s => (s.type === 'http' && s.scheme === 'bearer') || s.type === 'oauth2');

        const tokenImports = [];
        if (hasApiKey) tokenImports.push('API_KEY_TOKEN');
        if (hasBearer) tokenImports.push('BEARER_TOKEN_TOKEN');

        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/common/http', namedImports: ['HttpEvent', 'HttpHandler', 'HttpInterceptor', 'HttpRequest'] },
            { moduleSpecifier: '@angular/core', namedImports: ['inject', 'Injectable'] },
            { moduleSpecifier: 'rxjs', namedImports: ['Observable'] },
            { moduleSpecifier: './auth.tokens', namedImports: tokenImports }
        ]);

        const interceptorClass = sourceFile.addClass({
            name: `AuthInterceptor`,
            isExported: true,
            decorators: [{ name: 'Injectable' }],
            implements: ['HttpInterceptor'],
            docs: ["Intercepts HTTP requests to apply authentication credentials based on OpenAPI security schemes."]
        });

        // Inject tokens only if they are needed
        if (hasApiKey) {
            interceptorClass.addProperty({
                name: 'apiKey', isReadonly: true, scope: 'private',
                initializer: `inject(API_KEY_TOKEN, { optional: true })`
            });
        }
        if (hasBearer) {
            interceptorClass.addProperty({
                name: 'bearerToken', isReadonly: true, scope: 'private',
                initializer: `inject(BEARER_TOKEN_TOKEN, { optional: true })`
            });
        }

        const securityLogicBlocks: string[] = [];

        for (const scheme of securitySchemes) {
            if (scheme.type === 'apiKey' && scheme.in === 'header' && scheme.name) {
                securityLogicBlocks.push(`if (this.apiKey) {
    authReq = req.clone({ setHeaders: { '${scheme.name}': this.apiKey } });
}`);
            } else if (scheme.type === 'apiKey' && scheme.in === 'query' && scheme.name) {
                securityLogicBlocks.push(`if (this.apiKey) {
    authReq = req.clone({ setParams: { '${scheme.name}': this.apiKey } });
}`);
            } else if ((scheme.type === 'http' && scheme.scheme === 'bearer') || scheme.type === 'oauth2') {
                // This block handles both standard Bearer tokens and OAuth2 access tokens,
                // as both use the 'Authorization: Bearer <token>' header.
                securityLogicBlocks.push(`if (this.bearerToken) {
    const token = typeof this.bearerToken === 'function' ? this.bearerToken() : this.bearerToken;
    if (token) {
        authReq = req.clone({ setHeaders: { 'Authorization': \`Bearer \${token}\` } });
    }
}`);
            }
        }

        // Join the logic blocks with `else if` to handle schemas where you only apply one auth method at a time.
        const chainedSecurityLogic = securityLogicBlocks.filter((v, i, a) => a.indexOf(v) === i).join(' else ');

        interceptorClass.addMethod({
            name: 'intercept',
            parameters: [
                { name: 'req', type: 'HttpRequest<unknown>' },
                { name: 'next', type: 'HttpHandler' },
            ],
            returnType: 'Observable<HttpEvent<unknown>>',
            statements: `
let authReq = req;

${chainedSecurityLogic}

return next.handle(authReq);`,
        });

        sourceFile.formatText();
    }
}
