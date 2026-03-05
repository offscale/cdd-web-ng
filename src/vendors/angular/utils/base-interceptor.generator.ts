import { Project, Scope } from 'ts-morph';
import * as path from 'node:path';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';
import { getClientContextTokenName, getInterceptorsTokenName, pascalCase } from '@src/functions/utils.js';

export class BaseInterceptorGenerator {
    private readonly clientName: string;
    private readonly capitalizedClientName: string;

    constructor(
        /* v8 ignore next */
        private project: Project,
        clientName?: string,
    ) {
        /* v8 ignore next */
        this.clientName = clientName || 'default';
        /* v8 ignore next */
        this.capitalizedClientName = pascalCase(this.clientName);
    }

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const utilsDir = path.join(outputDir, 'utils');
        /* v8 ignore next */
        const filePath = path.join(utilsDir, 'base-interceptor.ts');

        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        /* v8 ignore next */
        const interceptorsTokenName = getInterceptorsTokenName(this.clientName);
        /* v8 ignore next */
        const clientContextTokenName = getClientContextTokenName(this.clientName);

        /* v8 ignore next */
        sourceFile.addImportDeclarations([
            {
                namedImports: ['HttpContextToken', 'HttpEvent', 'HttpHandler', 'HttpInterceptor', 'HttpRequest'],
                moduleSpecifier: '@angular/common/http',
            },
            {
                namedImports: ['inject', 'Injectable'],
                moduleSpecifier: '@angular/core',
            },
            {
                namedImports: ['Observable'],
                moduleSpecifier: 'rxjs',
            },
            {
                namedImports: [clientContextTokenName, interceptorsTokenName],
                moduleSpecifier: '../tokens',
            },
        ]);

        /* v8 ignore next */
        sourceFile.addClass({
            name: `${this.capitalizedClientName}BaseInterceptor`,
            isExported: true,
            decorators: [{ name: 'Injectable', arguments: [`{ providedIn: 'root' }`] }],
            implements: ['HttpInterceptor'],
            docs: [`Base HttpInterceptor for the ${this.capitalizedClientName} client.`],
            properties: [
                {
                    name: 'httpInterceptors',
                    type: 'HttpInterceptor[]',
                    scope: Scope.Private,
                    isReadonly: true,
                    initializer: `inject(${interceptorsTokenName})`,
                },
                {
                    name: 'clientContextToken',
                    type: 'HttpContextToken<string>',
                    scope: Scope.Private,
                    isReadonly: true,
                    initializer: clientContextTokenName,
                },
            ],
            methods: [
                {
                    name: 'intercept',
                    parameters: [
                        { name: 'req', type: 'HttpRequest<Record<string, unknown>>' },
                        { name: 'next', type: 'HttpHandler' },
                    ],
                    returnType: 'Observable<HttpEvent<Record<string, unknown>>>',
                    statements: `
    if (!req.context.has(this.clientContextToken)) { 
      return next.handle(req); 
    } 

    const handler: HttpHandler = this.httpInterceptors.reduceRight( 
      (nextHandler, interceptor) => ({ 
        handle: (request: HttpRequest<Record<string, unknown>>) => interceptor.intercept(request, nextHandler), 
      }), 
      next
    ); 

    return handler.handle(req);`,
                },
            ],
        });

        /* v8 ignore next */
        sourceFile.formatText();
    }
}
