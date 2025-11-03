import * as path from 'path';
import { Project, Scope } from 'ts-morph';
import { SwaggerParser } from '../../../core/parser.js';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../../core/constants.js';

/**
 * Generates the `auth.interceptor.ts` file. This interceptor is responsible for
 * attaching API keys and/or Bearer tokens to outgoing HTTP requests based on the
 * security schemes defined in the OpenAPI specification.
 * It currently supports `apiKey` (in header or query) and `http`/`oauth2` (for Bearer tokens).
 * Other schemes like `apiKey` in `cookie` are parsed but do not generate interception logic.
 */
export class AuthInterceptorGenerator {
    constructor(private parser: SwaggerParser, private project: Project) { }

    /**
     * Generates the auth interceptor file if any security schemes are defined in the spec.
     * It analyzes the schemes to determine which tokens (API key, Bearer) are needed and
     * generates the corresponding injection logic.
     *
     * @param outputDir The root output directory.
     * @returns An object containing the names of the tokens used (e.g., `['apiKey', 'bearerToken']`),
     *          or `void` if no security schemes are found and no file is generated.
     */
    public generate(outputDir: string): { tokenNames: string[] } | void {
        const securitySchemes = Object.values(this.parser.getSecuritySchemes());
        if (securitySchemes.length === 0) {
            return; // Don't generate if no security schemes are defined.
        }

        const authDir = path.join(outputDir, 'auth');
        const filePath = path.join(authDir, 'auth.interceptor.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        const hasApiKey = securitySchemes.some(s => s.type === 'apiKey');
        const hasBearer = securitySchemes.some(s => (s.type === 'http' && s.scheme === 'bearer') || s.type === 'oauth2');

        const tokenImports : string[] = [];
        const tokenNames: string[] = []; // This will be the return value

        if (hasApiKey) {
            tokenImports.push('API_KEY_TOKEN');
            tokenNames.push('apiKey');
        }
        if (hasBearer) {
            tokenImports.push('BEARER_TOKEN_TOKEN');
            tokenNames.push('bearerToken');
        }

        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/common/http', namedImports: ['HttpEvent', 'HttpHandler', 'HttpInterceptor', 'HttpRequest'] },
            { moduleSpecifier: '@angular/core', namedImports: ['inject', 'Injectable'] },
            { moduleSpecifier: 'rxjs', namedImports: ['Observable'] },
            { moduleSpecifier: './auth.tokens', namedImports: tokenImports }
        ]);

        const interceptorClass = sourceFile.addClass({
            name: `AuthInterceptor`,
            isExported: true,
            decorators: [{ name: 'Injectable', arguments: [`{ providedIn: 'root' }`] }],
            implements: ['HttpInterceptor'],
            docs: ["Intercepts HTTP requests to apply authentication credentials based on OpenAPI security schemes."]
        });

        if (hasApiKey) {
            interceptorClass.addProperty({ name: 'apiKey', isReadonly: true, scope: Scope.Private, type: 'string | null', initializer: `inject(API_KEY_TOKEN, { optional: true })` });
        }
        if (hasBearer) {
            interceptorClass.addProperty({ name: 'bearerToken', isReadonly: true, scope: Scope.Private, type: '(string | (() => string)) | null', initializer: `inject(BEARER_TOKEN_TOKEN, { optional: true })` });
        }

        const securityLogicBlocks: string[] = [];
        const generatedLogicSignatures = new Set<string>();

        for (const scheme of securitySchemes) {
            if (scheme.type === 'apiKey') {
                const signature = `apiKey:${scheme.in}`; // Make signature unique per 'in' type
                if (!generatedLogicSignatures.has(signature)) {
                    if (scheme.in === 'header') {
                        securityLogicBlocks.push(`if (this.apiKey) { authReq = req.clone({ setHeaders: { '${scheme.name}': this.apiKey } }); }`);
                    } else if (scheme.in === 'query') {
                        securityLogicBlocks.push(`if (this.apiKey) { authReq = req.clone({ setParams: { '${scheme.name}': this.apiKey } }); }`);
                    }
                    // Note: 'cookie' type is intentionally not handled as it requires HttpOnly cookies managed by the browser.
                    generatedLogicSignatures.add(signature);
                }
            } else if ((scheme.type === 'http' && scheme.scheme === 'bearer') || scheme.type === 'oauth2') {
                const signature = 'bearer';
                if (!generatedLogicSignatures.has(signature)) {
                    securityLogicBlocks.push(`if (this.bearerToken) { const token = typeof this.bearerToken === 'function' ? this.bearerToken() : this.bearerToken; if (token) { authReq = req.clone({ setHeaders: { 'Authorization': \`Bearer \${token}\` } }); } }`);
                    generatedLogicSignatures.add(signature);
                }
            }
        }

        const chainedSecurityLogic = securityLogicBlocks.join(' else ');

        interceptorClass.addMethod({
            name: 'intercept',
            parameters: [
                { name: 'req', type: 'HttpRequest<unknown>' },
                { name: 'next', type: 'HttpHandler' },
            ],
            returnType: 'Observable<HttpEvent<unknown>>',
            statements: `let authReq = req;\n${chainedSecurityLogic}\nreturn next.handle(authReq);`,
        });

        sourceFile.formatText();
        return { tokenNames };
    }
}
