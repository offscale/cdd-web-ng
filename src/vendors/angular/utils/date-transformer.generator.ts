import { Project, VariableDeclarationKind } from 'ts-morph';
import * as path from 'node:path';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

export class DateTransformerGenerator {
    constructor(private project: Project) {}

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, 'utils');
        const filePath = path.join(utilsDir, 'date-transformer.ts');

        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addImportDeclarations([
            {
                namedImports: ['HttpEvent', 'HttpHandler', 'HttpInterceptor', 'HttpRequest', 'HttpResponse'],
                moduleSpecifier: '@angular/common/http',
            },
            {
                namedImports: ['Injectable'],
                moduleSpecifier: '@angular/core',
            },
            {
                namedImports: ['Observable', 'map'],
                moduleSpecifier: 'rxjs',
            },
        ]);

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'ISO_DATE_REGEX',
                    initializer: `/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$/`,
                },
            ],
            docs: ['A regex pattern to identify strings that are likely ISO 8601 date-time formats.'],
        });

        sourceFile.addFunction({
            name: 'transformDates',
            isExported: true,
            parameters: [{ name: 'body', type: 'any' }],
            returnType: 'any',
            docs: ['Recursively traverses an object or array and converts ISO date strings to Date objects.'],
            statements: `
    if (body === null || body === undefined || typeof body !== 'object') { 
        return body; 
    } 

    if (Array.isArray(body)) { 
        return body.map(item => transformDates(item)); 
    } 

    const transformedBody: { [key: string]: any } = {}; 
    for (const key of Object.keys(body)) { 
        const value = body[key]; 
        if (typeof value === 'string' && ISO_DATE_REGEX.test(value)) { 
            transformedBody[key] = new Date(value); 
        } else if (typeof value === 'object') { 
            transformedBody[key] = transformDates(value); 
        } else { 
            transformedBody[key] = value; 
        } 
    } 
    return transformedBody;`,
        });

        sourceFile.addClass({
            name: 'DateInterceptor',
            isExported: true,
            decorators: [{ name: 'Injectable', arguments: [`{ providedIn: 'root' }`] }],
            implements: ['HttpInterceptor'],
            docs: ['Intercepts HTTP responses and transforms ISO date strings to Date objects in the response body.'],
            methods: [
                {
                    name: 'intercept',
                    parameters: [
                        { name: 'req', type: 'HttpRequest<any>' },
                        { name: 'next', type: 'HttpHandler' },
                    ],
                    returnType: 'Observable<HttpEvent<any>>',
                    statements: `
    return next.handle(req).pipe( 
        map(event => { 
            if (event instanceof HttpResponse && event.body) { 
                return event.clone({ body: transformDates(event.body) }); 
            } 
            return event; 
        }) 
    );`,
                },
            ],
        });

        sourceFile.formatText();
    }
}
