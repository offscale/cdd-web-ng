import { Project, VariableDeclarationKind } from "ts-morph";
import * as path from "path";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";
import { getBasePathTokenName, getClientContextTokenName, getInterceptorsTokenName } from "../../../core/utils.js";

/**
 * Generates the `tokens/index.ts` file.
 * This file contains the core dependency injection (DI) tokens used throughout the generated client library
 * for providing configuration values like the base API path and custom interceptors.
 */
export class TokenGenerator {
    private readonly clientName: string;

    constructor(private project: Project, clientName?: string) {
        this.clientName = clientName || "default";
    }

    public generate(outputDir: string): void {
        const tokensDir = path.join(outputDir, "tokens");
        const filePath = path.join(tokensDir, "index.ts");

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addImportDeclarations([
            {
                namedImports: ["InjectionToken"],
                moduleSpecifier: "@angular/core",
            },
            {
                namedImports: ["HttpInterceptor", "HttpContextToken"],
                moduleSpecifier: "@angular/common/http",
            },
        ]);

        // Generate client-specific, uniquely named tokens
        const basePathTokenName = getBasePathTokenName(this.clientName);
        const interceptorsTokenName = getInterceptorsTokenName(this.clientName);
        const clientContextTokenName = getClientContextTokenName(this.clientName);

        // 1. Base Path Token
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: basePathTokenName,
                    initializer: `new InjectionToken<string>('${basePathTokenName}')`,
                },
            ],
            docs: [`Injection token for providing the base API path for the '${this.clientName}' client.`]
        });

        // 2. Client-Specific Interceptors Token
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: interceptorsTokenName,
                    initializer: `new InjectionToken<HttpInterceptor[]>('${interceptorsTokenName}', {
  providedIn: 'root',
  factory: () => [], // Default to an empty array if not provided
})`,
                },
            ],
            docs: [
                `Injection token for providing an array of client-specific HttpInterceptor instances`,
                `for the '${this.clientName}' client.`
            ]
        });

        // 3. Client Identification Token (for HttpContext)
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: clientContextTokenName,
                    initializer: `new HttpContextToken<string>(() => '${this.clientName}')`,
                },
            ],
            docs: [
                `HttpContextToken used to identify which requests belong to the '${this.clientName}' client.`,
                `This allows the BaseInterceptor to apply the correct set of interceptors.`
            ]
        });

        sourceFile.formatText();
    }
}
