import { Project } from 'ts-morph';

export class RequestContextGenerator {
    constructor(private readonly project: Project) {}

    generate(outputDir: string): void {
        const sourceFile = this.project.createSourceFile(`${outputDir}/utils/request-context.ts`, '', {
            overwrite: true,
        });

        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/common/http',
            namedImports: ['HttpHeaders', 'HttpParams', 'HttpContext'],
        });

        sourceFile.addInterface({
            name: 'RequestOptions',
            isExported: true,
            properties: [
                { name: 'headers?', type: 'HttpHeaders | Record<string, string | string[]>' },
                { name: 'context?', type: 'HttpContext' },
                { name: 'observe?', type: "'body' | 'events' | 'response'" },
                { name: 'params?', type: 'any' },
                { name: 'reportProgress?', type: 'boolean' },
                { name: 'responseType?', type: "'arraybuffer' | 'blob' | 'json' | 'text'" },
                { name: 'withCredentials?', type: 'boolean' },
            ],
        });

        sourceFile.addInterface({
            name: 'HttpRequestOptions',
            isExported: true,
            extends: ['RequestOptions'],
            properties: [{ name: 'body?', type: 'any' }],
        });

        sourceFile.addFunction({
            name: 'createRequestOption',
            isExported: true,
            parameters: [{ name: 'options?', type: 'RequestOptions' }],
            returnType: 'HttpRequestOptions',
            statements: 'return { ...options };',
        });
    }
}
