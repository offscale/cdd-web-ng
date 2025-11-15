import { Project, VariableDeclarationKind } from "ts-morph";
import * as path from "node:path";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";

/**
 * Generates the `date-transformer.ts` file if the `dateType: 'Date'` option is used.
 * This file contains an HttpInterceptor that automatically converts ISO date strings
 * in API responses into JavaScript `Date` objects.
 */
export class DateTransformerGenerator {
    constructor(private project: Project) {
    }

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, "utils");
        const filePath = path.join(utilsDir, "date-transformer.ts");

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addImportDeclarations([
            {
                namedImports: ["HttpEvent", "HttpHandler", "HttpInterceptor", "HttpRequest", "HttpResponse"],
                moduleSpecifier: "@angular/common/http",
            },
            {
                namedImports: ["Injectable"],
                moduleSpecifier: "@angular/core",
            },
            {
                namedImports: ["Observable", "map"],
                moduleSpecifier: "rxjs",
            },
        ]);

        // Add ISO date regex constant
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: "ISO_DATE_REGEX",
                    initializer: `/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$/`,
                },
            ],
            docs: ["A regex pattern to identify strings that are likely ISO 8601 date-time formats."]
        });

        // Add the recursive transformer function
        sourceFile.addFunction({
            name: "transformDates",
            isExported: true,
            parameters: [{ name: "body", type: "any" }],
            returnType: "any",
            docs: ["Recursively traverses an object or array and converts ISO date strings to Date objects."],
            statements: `
    if (body === null || body === undefined || typeof body !== 'object') {
        return body;
    }

    if (Array.isArray(body)) {
        return body.map(item => transformDates(item));
    }

    // It's a non-array object, so we iterate its properties.
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
    return transformedBody;`
        });

        // Add the interceptor class that uses the function
        sourceFile.addClass({
            name: "DateInterceptor",
            isExported: true,
            decorators: [{ name: 'Injectable', arguments: [`{ providedIn: 'root' }`] }],
            implements: ["HttpInterceptor"],
            docs: ["Intercepts HTTP responses and transforms ISO date strings to Date objects in the response body."],
            methods: [
                {
                    name: "intercept",
                    parameters: [
                        { name: "req", type: "HttpRequest<any>" },
                        { name: "next", type: "HttpHandler" },
                    ],
                    returnType: "Observable<HttpEvent<any>>",
                    statements: `
    return next.handle(req).pipe(
        map(event => {
            if (event instanceof HttpResponse && event.body) {
                // Return a new response with the transformed body
                return event.clone({ body: transformDates(event.body) });
            }
            // Pass through all other events untouched
            return event;
        })
    );`,
                },
            ],
        });

        sourceFile.formatText();
    }
}
