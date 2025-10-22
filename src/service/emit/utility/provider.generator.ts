import { Project, SourceFile } from 'ts-morph';
import * as path from 'path';
import { GeneratorConfig, SwaggerParser } from '../../../core/types.js';
import { getBasePathTokenName, getInterceptorsTokenName, pascalCase } from '../../../core/utils.js';
import { PROVIDER_GENERATOR_HEADER_COMMENT } from '../../../core/constants.js';

/**
 * Generates the `providers.ts` file.
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
        // Correctly determine which auth types are present based on the input
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
        let securityProviders = '';
        if (hasSecurity) {
            securityProviders += `
    // Provide the AuthInterceptor to handle adding auth credentials to requests.
    providers.push({
        provide: HTTP_INTERCEPTORS,
        useClass: AuthInterceptor,
        multi: true
    });
`;
            if (this.hasApiKey) {
                securityProviders += `
    // Provide the API key via the API_KEY_TOKEN if it's configured.
    if (config.apiKey) {
        providers.push({ provide: API_KEY_TOKEN, useValue: config.apiKey });
    }
`;
            }
            if (this.hasBearer) {
                securityProviders += `
    // Provide the bearer token via the BEARER_TOKEN_TOKEN if it's configured.
    if (config.bearerToken) {
        providers.push({ provide: BEARER_TOKEN_TOKEN, useValue: config.bearerToken });
    }
`;
            }
        }

        sourceFile.addFunction({
            name: `provide${this.capitalizedClientName}Client`,
            isExported: true,
            parameters: [{ name: "config", type: `${this.capitalizedClientName}Config` }],
            returnType: "EnvironmentProviders",
            docs: [`Provides the necessary services and configuration for the ${this.capitalizedClientName} API client.`],
            statements: `
const providers: Provider[] = [
    { provide: ${getBasePathTokenName(this.clientName)}, useValue: config.basePath },
    // The base interceptor is responsible for applying client-specific interceptors.
    { provide: HTTP_INTERCEPTORS, useClass: ${this.capitalizedClientName}BaseInterceptor, multi: true }
];

${securityProviders}

// Instantiate custom interceptors provided by the user.
const customInterceptors = config.interceptors?.map(InterceptorClass => new InterceptorClass()) || [];

// Add the date transformer interceptor if enabled. It runs before custom interceptors.
if (config.enableDateTransform !== false && ${this.config.options.dateType === "Date"}) {
    customInterceptors.unshift(new DateInterceptor());
}

// Provide a single array of all client-specific interceptors.
providers.push({
    provide: ${getInterceptorsTokenName(this.clientName)},
    useValue: customInterceptors
});

return makeEnvironmentProviders(providers);`
        });
    }
}
