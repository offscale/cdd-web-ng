import { Project } from 'ts-morph';

export class RequestContextGenerator {
    /* v8 ignore next */
    constructor(private readonly project: Project) {}

    generate(outputDir: string): void {
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(`${outputDir}/utils/request-context.ts`, '', {
            overwrite: true,
        });

        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/common/http',
            namedImports: ['HttpHeaders', 'HttpParams', 'HttpContext'],
        });

        /* v8 ignore next */
        sourceFile.addInterface({
            name: 'RequestOptions',
            isExported: true,
            properties: [
                { name: 'headers?', type: 'HttpHeaders | Record<string, string | string[]>' },
                { name: 'context?', type: 'HttpContext' },
                { name: 'observe?', type: "'body' | 'events' | 'response'" },
                { name: 'params?', type: 'Record<string, never>' },
                { name: 'reportProgress?', type: 'boolean' },
                { name: 'responseType?', type: "'arraybuffer' | 'blob' | 'json' | 'text'" },
                { name: 'withCredentials?', type: 'boolean' },
            ],
        });

        /* v8 ignore next */
        sourceFile.addInterface({
            name: 'HttpRequestOptions',
            isExported: true,
            extends: ['RequestOptions'],
            properties: [{ name: 'body?', type: 'Record<string, never>' }],
        });

        /* v8 ignore next */
        sourceFile.addFunction({
            name: 'createRequestOption',
            isExported: true,
            parameters: [{ name: 'options?', type: 'RequestOptions' }],
            returnType: 'HttpRequestOptions',
            statements: 'return { ...options };',
        });
    }
}
