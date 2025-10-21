import { Project, Scope } from "ts-morph";
import * as path from "path";
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../../core/constants.js';
import { getClientContextTokenName, getInterceptorsTokenName, pascalCase } from "../../../core/utils.js";

/**
 * Generates the `base-interceptor.ts` file. This interceptor is responsible for applying
 * all client-specific interceptors only to requests that belong to this API client.
 */
export class BaseInterceptorGenerator {
    private readonly clientName: string;
    private readonly capitalizedClientName: string;

    constructor(private project: Project, clientName?: string) {
        this.clientName = clientName || 'default';
        this.capitalizedClientName = pascalCase(this.clientName);
    }

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, "utils");
        const filePath = path.join(utilsDir, "base-interceptor.ts");

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        const interceptorsTokenName = getInterceptorsTokenName(this.clientName);
        const clientContextTokenName = getClientContextTokenName(this.clientName);

        sourceFile.addImportDeclarations([
            {
                namedImports: ["HttpContextToken", "HttpEvent", "HttpHandler", "HttpInterceptor", "HttpRequest"],
                moduleSpecifier: "@angular/common/http",
            },
            {
                namedImports: ["inject", "Injectable"],
                moduleSpecifier: "@angular/core",
            },
            {
                namedImports: ["Observable"],
                moduleSpecifier: "rxjs",
            },
            {
                namedImports: [clientContextTokenName, interceptorsTokenName],
                moduleSpecifier: "../tokens",
            },
        ]);

        sourceFile.addClass({
            name: `${this.capitalizedClientName}BaseInterceptor`,
            isExported: true,
            decorators: [{ name: "Injectable" }],
            implements: ["HttpInterceptor"],
            docs: [
                `Base HttpInterceptor for the ${this.capitalizedClientName} client.`,
                `It checks for a client-specific context token on each request and, if present,`,
                `applies all interceptors provided via the ${interceptorsTokenName} token.`,
            ],
            properties: [
                {
                    name: "httpInterceptors",
                    type: "HttpInterceptor[]",
                    scope: Scope.Private,
                    isReadonly: true,
                    initializer: `inject(${interceptorsTokenName})`,
                },
                {
                    name: "clientContextToken",
                    type: "HttpContextToken<string>",
                    scope: Scope.Private,
                    isReadonly: true,
                    initializer: clientContextTokenName,
                },
            ],
            methods: [
                {
                    name: "intercept",
                    parameters: [
                        { name: "req", type: "HttpRequest<unknown>" },
                        { name: "next", type: "HttpHandler" },
                    ],
                    returnType: "Observable<HttpEvent<unknown>>",
                    statements: `
    // If the request context does not have our client token, pass it through without modification.
    if (!req.context.has(this.clientContextToken)) {
      return next.handle(req);
    }

    // This request belongs to our client.
    // We create a new handler that chains all of our client-specific interceptors.
    // \`reduceRight\` is used to apply interceptors in the correct order (first in, last out).
    const handler: HttpHandler = this.httpInterceptors.reduceRight(
      (nextHandler, interceptor) => ({
        handle: (request: HttpRequest<unknown>) => interceptor.intercept(request, nextHandler),
      }),
      next // The final handler in the chain is the original \`next\` handler.
    );

    // Pass the request to our newly constructed handler chain.
    return handler.handle(req);`,
                }
            ]
        });

        sourceFile.formatText();
    }
}
