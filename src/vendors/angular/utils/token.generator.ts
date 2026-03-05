import { Project, VariableDeclarationKind } from 'ts-morph';

import * as path from 'node:path';

import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';
import {
    getBasePathTokenName,
    getClientContextTokenName,
    getInterceptorsTokenName,
    getServerVariablesTokenName,
} from '@src/functions/utils.js';

export class TokenGenerator {
    private readonly clientName: string;

    constructor(
        /* v8 ignore next */
        private project: Project,
        clientName?: string,
    ) {
        /* v8 ignore next */
        this.clientName = clientName || 'default';
    }

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const tokensDir = path.join(outputDir, 'tokens');
        /* v8 ignore next */
        const filePath = path.join(tokensDir, 'index.ts');

        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        /* v8 ignore next */
        sourceFile.addImportDeclarations([
            {
                namedImports: ['InjectionToken'],
                moduleSpecifier: '@angular/core',
            },
            {
                namedImports: ['HttpInterceptor', 'HttpContextToken'],
                moduleSpecifier: '@angular/common/http',
            },
        ]);

        /* v8 ignore next */
        const basePathTokenName = getBasePathTokenName(this.clientName);
        /* v8 ignore next */
        const serverVariablesTokenName = getServerVariablesTokenName(this.clientName);
        /* v8 ignore next */
        const interceptorsTokenName = getInterceptorsTokenName(this.clientName);
        /* v8 ignore next */
        const clientContextTokenName = getClientContextTokenName(this.clientName);

        /* v8 ignore next */
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: basePathTokenName,
                    initializer: `new InjectionToken<string>('${basePathTokenName}')`,
                },
            ],
            docs: [`Injection token for providing the base API path.`],
        });

        /* v8 ignore next */
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: serverVariablesTokenName,
                    initializer: `new InjectionToken<Record<string, string>>('${serverVariablesTokenName}')`,
                },
            ],
            docs: [`Injection token for providing dynamic server variables (e.g. { port: '8080' }).`],
        });

        /* v8 ignore next */
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: interceptorsTokenName,
                    initializer: `new InjectionToken<HttpInterceptor[]>('${interceptorsTokenName}', { providedIn: 'root', factory: () => [] })`,
                },
            ],
            docs: [`Injection token for client-specific interceptors.`],
        });

        /* v8 ignore next */
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: clientContextTokenName,
                    initializer: `new HttpContextToken<string>(() => '${this.clientName}')`,
                },
            ],
            docs: [`HttpContextToken identifying requests for this client.`],
        });

        /* v8 ignore next */
        sourceFile.formatText();
    }
}
