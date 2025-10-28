import * as path from 'path';
import { Project } from 'ts-morph';
import { SwaggerParser } from '../../../core/parser.js';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../../core/constants.js';

/**
 * Generates the auth.interceptor.ts file.
 */
export class AuthInterceptorGenerator {
    constructor(private parser: SwaggerParser, private project: Project) { }

    public generate(outputDir: string): { tokenNames: string[] } | void {
        const securitySchemes = Object.values(this.parser.getSecuritySchemes());
        if (securitySchemes.length === 0) {
            return;
        }

        const authDir = path.join(outputDir, 'auth');
        const filePath = path.join(authDir, 'auth.interceptor.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        // Correctly determine which token types are needed
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
            decorators: [{ name: 'Injectable', arguments: [] }],
            implements: ['HttpInterceptor'],
            docs: ["Intercepts HTTP requests to apply authentication credentials based on OpenAPI security schemes."]
        });

        if (hasApiKey) {
            interceptorClass.addProperty({ name: 'apiKey', isReadonly: true, scope: 'private', type: 'string | null', initializer: `inject(API_KEY_TOKEN, { optional: true })` });
        }
        if (hasBearer) {
            interceptorClass.addProperty({ name: 'bearerToken', isReadonly: true, scope: 'private', type: '(string | (() => string)) | null', initializer: `inject(BEARER_TOKEN_TOKEN, { optional: true })` });
        }

        const securityLogicBlocks: string[] = [];
        const generatedLogicSignatures = new Set<string>();

        for (const scheme of securitySchemes) {
            if (scheme.type === 'apiKey') {
                const signature = 'apiKey';
                if (!generatedLogicSignatures.has(signature)) {
                    // We only generate one apiKey block. We'll pick the first one we see.
                    if(scheme.in === 'header') {
                        securityLogicBlocks.push(`if (this.apiKey) { authReq = req.clone({ setHeaders: { '${scheme.name}': this.apiKey } }); }`);
                    } else if(scheme.in === 'query') {
                        securityLogicBlocks.push(`if (this.apiKey) { authReq = req.clone({ setParams: { '${scheme.name}': this.apiKey } }); }`);
                    }
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
        // This is the value a consumer (ProviderGenerator) will use.
        return { tokenNames };
    }
}
