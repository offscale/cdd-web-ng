import { Project, SourceFile } from 'ts-morph';
import * as path from 'path';
import { GeneratorConfig } from '../../../core/types.js';
import { SwaggerParser } from '../../../core/parser.js';
import { getBasePathTokenName, getInterceptorsTokenName, pascalCase } from '../../../core/utils.js';
import { PROVIDER_GENERATOR_HEADER_COMMENT } from '../../../core/constants.js';

/**
 * Generates the `providers.ts` file using ts-morph for robust AST manipulation.
 */
export class ProviderGenerator {
    private readonly clientName: string;
    private readonly capitalizedClientName: string;
    private readonly config: GeneratorConfig;
    private readonly hasApiKey: boolean;
    private readonly hasBearer: boolean;

    constructor(private parser: SwaggerParser, private project: Project, private tokenNames: string[] = []) {
        this.config = parser.config;
        this.clientName = this.config.clientName || 'default';
        this.capitalizedClientName = pascalCase(this.clientName);
        this.hasApiKey = this.tokenNames.includes('apiKey');
        this.hasBearer = this.tokenNames.includes('bearerToken');
    }

    public generate(outputDir: string): void {
        if (!this.config.options.generateServices) {
            return;
        }

        const filePath = path.join(outputDir, "providers.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, PROVIDER_GENERATOR_HEADER_COMMENT);

        const hasSecurity = this.hasApiKey || this.hasBearer;

        this.addImports(sourceFile, hasSecurity);
        this.addConfigInterface(sourceFile);
        this.addMainProviderFunction(sourceFile, hasSecurity);

        sourceFile.formatText();
    }

    private addImports(sourceFile: SourceFile, hasSecurity: boolean): void {
        sourceFile.addImportDeclarations([
            { namedImports: ["EnvironmentProviders", "Provider", "makeEnvironmentProviders"], moduleSpecifier: "@angular/core" },
            { namedImports: ["HTTP_INTERCEPTORS", "HttpInterceptor"], moduleSpecifier: "@angular/common/http" },
            { namedImports: [getBasePathTokenName(this.clientName), getInterceptorsTokenName(this.clientName)], moduleSpecifier: "./tokens" },
            { namedImports: [`${this.capitalizedClientName}BaseInterceptor`], moduleSpecifier: "./utils/base-interceptor" },
        ]);

        if (this.config.options.dateType === "Date") {
            sourceFile.addImportDeclaration({ namedImports: ["DateInterceptor"], moduleSpecifier: "./utils/date-transformer" });
        }

        if (hasSecurity) {
            sourceFile.addImportDeclaration({ namedImports: ["AuthInterceptor"], moduleSpecifier: "./auth/auth.interceptor" });
            const tokenImports: string[] = [];
            if (this.hasApiKey) tokenImports.push("API_KEY_TOKEN");
            if (this.hasBearer) tokenImports.push("BEARER_TOKEN_TOKEN");
            if (tokenImports.length > 0) {
                sourceFile.addImportDeclaration({ namedImports: tokenImports, moduleSpecifier: "./auth/auth.tokens" });
            }
        }
    }

    private addConfigInterface(sourceFile: SourceFile): void {
        const configInterface = sourceFile.addInterface({
            name: `${this.capitalizedClientName}Config`,
            isExported: true,
            properties: [
                { name: "basePath", type: "string" },
                { name: "enableDateTransform", type: "boolean", hasQuestionToken: true, docs: ["If true, automatically transforms ISO date strings in responses to Date objects. Default: true"] },
                { name: "interceptors", type: `(new (...args: never[]) => HttpInterceptor)[]`, hasQuestionToken: true, docs: ["An array of custom HttpInterceptor classes to apply to requests for this client."] },
            ],
            docs: [`Configuration for the ${this.capitalizedClientName} API client.`]
        });
        if (this.hasApiKey) {
            configInterface.addProperty({ name: "apiKey", type: "string", hasQuestionToken: true, docs: ["The API key to be used for authentication."] });
        }
        if (this.hasBearer) {
            configInterface.addProperty({ name: "bearerToken", type: "string | (() => string)", hasQuestionToken: true, docs: ["The Bearer token or a function returning the token for authentication."] });
        }
    }

    private addMainProviderFunction(sourceFile: SourceFile, hasSecurity: boolean): void {
        sourceFile.addFunction({
            name: `provide${this.capitalizedClientName}Client`,
            isExported: true,
            parameters: [{ name: "config", type: `${this.capitalizedClientName}Config` }],
            returnType: "EnvironmentProviders",
            docs: [`Provides the necessary services and configuration for the ${this.capitalizedClientName} API client.`],
            // **CRITICAL FIX**: Build the entire body as a string.
            statements: writer => {
                writer.writeLine(`const providers: Provider[] = [`);
                writer.indent(() => {
                    writer.writeLine(`{ provide: ${getBasePathTokenName(this.clientName)}, useValue: config.basePath },`);
                    writer.writeLine(`// The base interceptor is responsible for applying client-specific interceptors.`);
                    writer.writeLine(`{ provide: HTTP_INTERCEPTORS, useClass: ${this.capitalizedClientName}BaseInterceptor, multi: true }`);
                });
                writer.writeLine(`];`);

                if (hasSecurity) {
                    writer.blankLine();
                    writer.writeLine("// Provide the AuthInterceptor to handle adding auth credentials to requests.");
                    writer.writeLine(`providers.push({ provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true });`);

                    if (this.hasApiKey) {
                        writer.blankLine();
                        writer.write("if (config.apiKey)").block(() => {
                            writer.writeLine(`providers.push({ provide: API_KEY_TOKEN, useValue: config.apiKey });`);
                        });
                    }
                    if (this.hasBearer) {
                        writer.blankLine();
                        writer.write("if (config.bearerToken)").block(() => {
                            writer.writeLine(`providers.push({ provide: BEARER_TOKEN_TOKEN, useValue: config.bearerToken });`);
                        });
                    }
                }

                writer.blankLine();
                writer.writeLine("// Instantiate custom interceptors provided by the user.");
                writer.writeLine("const customInterceptors = config.interceptors?.map(InterceptorClass => new InterceptorClass()) || [];");

                if (this.config.options.dateType === "Date") {
                    writer.blankLine();
                    writer.write("if (config.enableDateTransform !== false)").block(() => {
                        writer.writeLine('// The date transformer interceptor runs before other custom interceptors.');
                        writer.writeLine('customInterceptors.unshift(new DateInterceptor());');
                    });
                }

                writer.blankLine();
                writer.writeLine("// Provide a single array of all client-specific interceptors for the BaseInterceptor to use.");
                writer.writeLine(`providers.push({ provide: ${getInterceptorsTokenName(this.clientName)}, useValue: customInterceptors });`);
                writer.blankLine();
                writer.writeLine("return makeEnvironmentProviders(providers);");
            }
        });
    }
}
