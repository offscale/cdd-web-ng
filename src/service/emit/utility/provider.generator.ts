import { Project, SourceFile } from 'ts-morph';
import * as path from 'path';
import { GeneratorConfig, SecurityScheme, SwaggerParser } from '../../../core/types.js';
import { getBasePathTokenName, getInterceptorsTokenName, pascalCase } from '../../../core/utils.js';
import { PROVIDER_GENERATOR_HEADER_COMMENT } from '../../../core/constants.js';
import { AuthHelperGenerator } from './auth-helper.generator.js';

// A stricter type for the OAuth flow object to ensure properties exist before access.
interface OAuthFlow {
    authorizationUrl?: string;
    tokenUrl?: string;
    scopes?: Record<string, string>;
}

/**
 * Generates the `providers.ts` file, which contains functions to bootstrap the API client
 * within an Angular application's environment providers.
 */
export class ProviderGenerator {
    private clientName: string;
    private capitalizedClientName: string;

    constructor(private project: Project, private config: GeneratorConfig, private parser: SwaggerParser) {
        this.clientName = config.clientName || 'default';
        this.capitalizedClientName = pascalCase(this.clientName);
    }

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, "providers.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, PROVIDER_GENERATOR_HEADER_COMMENT);

        const securitySchemes = Object.values(this.parser.getSecuritySchemes());
        const
            hasSecurity = securitySchemes.length > 0;
        const hasApiKey = hasSecurity && securitySchemes.some(s => s.type === 'apiKey');
        const hasBearer = hasSecurity && securitySchemes.some(s => (s.type === 'http' && s.scheme === 'bearer') || s.type === 'oauth2');
        const oauthScheme = hasSecurity ? securitySchemes.find((s): s is SecurityScheme & { type: 'oauth2'; flows: Record<string, OAuthFlow> } => s.type === 'oauth2') : undefined;

        this.addImports(sourceFile, hasSecurity, hasApiKey, hasBearer, !!oauthScheme);
        this.addConfigInterface(sourceFile, hasApiKey, hasBearer, !!oauthScheme);
        this.addMainProviderFunction(sourceFile, hasSecurity, hasApiKey, hasBearer, !!oauthScheme);

        if (oauthScheme) {
            new AuthHelperGenerator(this.project).generate(outputDir);
            this.addOAuthProviderFunction(sourceFile, oauthScheme);
        }
    }

    private addImports(sourceFile: SourceFile, hasSecurity: boolean, hasApiKey: boolean, hasBearer: boolean, hasOAuth: boolean): void {
        sourceFile.addImportDeclarations([
            { namedImports: ["EnvironmentProviders", "Provider", "makeEnvironmentProviders"], moduleSpecifier: "@angular/core" },
            { namedImports: ["HTTP_INTERCEPTORS", "HttpInterceptor"], moduleSpecifier: "@angular/common/http" },
            { namedImports: [getBasePathTokenName(this.clientName), getInterceptorsTokenName(this.clientName)], moduleSpecifier: "./tokens" },
            { namedImports: [`${this.capitalizedClientName}BaseInterceptor`], moduleSpecifier: "./utils/base-interceptor" },
        ]);

        if (this.config.options.dateType === "Date") {
            sourceFile.addImportDeclaration({ namedImports: ["DateInterceptor"], moduleSpecifier: "./utils/date-transformer" });
        }

        if (hasSecurity && !hasOAuth) {
            sourceFile.addImportDeclaration({ namedImports: ["AuthInterceptor"], moduleSpecifier: "./auth/auth.interceptor" });
            if (hasApiKey) sourceFile.addImportDeclaration({ namedImports: ["API_KEY_TOKEN"], moduleSpecifier: "./auth/auth.tokens" });
            if (hasBearer) sourceFile.addImportDeclaration({ namedImports: ["BEARER_TOKEN_TOKEN"], moduleSpecifier: "./auth/auth.tokens" });
        }

        if (hasOAuth) {
            sourceFile.addImportDeclarations([
                { namedImports: ["provideHttpClient", "withInterceptorsFromDi"], moduleSpecifier: "@angular/common/http" },
                { namedImports: ["AuthConfig", "OAuthService"], moduleSpecifier: "angular-oauth2-oidc" },
                { namedImports: ["AuthHelperService"], moduleSpecifier: "./auth/auth-helper.service" },
                { namedImports: ["APP_INITIALIZER", "forwardRef"], moduleSpecifier: "@angular/core" },
                { namedImports: ["AuthInterceptor"], moduleSpecifier: "./auth/auth.interceptor" },
                { namedImports: ["BEARER_TOKEN_TOKEN"], moduleSpecifier: "./auth/auth.tokens" },
            ]);
        }
    }

    private addConfigInterface(sourceFile: SourceFile, hasApiKey: boolean, hasBearer: boolean, hasOAuth: boolean): void {
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
        if (hasApiKey) {
            configInterface.addProperty({ name: "apiKey", type: "string", hasQuestionToken: true, docs: ["The API key to be used for authentication."] });
        }
        if (hasBearer && !hasOAuth) {
            configInterface.addProperty({ name: "bearerToken", type: "string | (() => string)", hasQuestionToken: true, docs: ["The Bearer token or a function returning the token for authentication."] });
        }
    }

    private addMainProviderFunction(sourceFile: SourceFile, hasSecurity: boolean, hasApiKey: boolean, hasBearer: boolean, hasOAuth: boolean): void {
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
            if (hasApiKey) {
                securityProviders += `
    // Provide the API key via the API_KEY_TOKEN if it's configured.
    if (config.apiKey) {
        providers.push({ provide: API_KEY_TOKEN, useValue: config.apiKey });
    }
`;
            }

            if (hasBearer && hasOAuth) {
                securityProviders += `
    // When using OAuth, the bearer token is provided by the AuthHelperService.
    providers.push({
        provide: BEARER_TOKEN_TOKEN,
        useFactory: (authHelper: AuthHelperService) => authHelper.getAccessToken.bind(authHelper),
        deps: [forwardRef(() => AuthHelperService)]
    });
`;
            } else if (hasBearer) {
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

    private addOAuthProviderFunction(sourceFile: SourceFile, oauthScheme: SecurityScheme & { type: 'oauth2'; flows?: Record<string, OAuthFlow> }): void {
        const configTypeName = `${this.capitalizedClientName}ClientOAuthConfig`;
        const flow = oauthScheme.flows?.authorizationCode || oauthScheme.flows?.implicit || Object.values(oauthScheme.flows ?? {})[0];

        if (!flow) {
            console.warn(`[Generator] Skipping OAuth provider generation for ${this.clientName}: No recognizable flow (authorizationCode or implicit) was found.`);
            return;
        }

        const scopes = flow.scopes ? Object.keys(flow.scopes).join(' ') : '';
        const issuer = flow.authorizationUrl ? `'${new URL(flow.authorizationUrl).origin}'` : `'' // TODO: Add the OAuth issuer URL`;

        sourceFile.addInterface({
            name: configTypeName,
            isExported: true,
            properties: [
                { name: "clientId", type: "string" },
                { name: "redirectUri", type: "string" },
                { name: "authConfig", type: "Partial<AuthConfig>", hasQuestionToken: true, docs: ["Optional additional or override configuration for the `angular-oauth2-oidc` library."] }
            ],
            docs: [`Configuration for the ${this.capitalizedClientName} client when using OAuth2/OIDC authentication.`]
        });

        sourceFile.addFunction({
            name: `provide${this.capitalizedClientName}ClientWithOAuth`,
            isExported: true,
            parameters: [{ name: "config", type: configTypeName }],
            returnType: "EnvironmentProviders",
            docs: [
                `Provides the necessary services for OAuth2/OIDC authentication using the 'angular-oauth2-oidc' library,`,
                `pre-configured with settings from the OpenAPI specification.`
            ],
            statements: `
const defaultConfig: AuthConfig = {
    issuer: ${issuer},
    tokenEndpoint: ${flow.tokenUrl ? `'${flow.tokenUrl}'` : 'undefined /* TODO: Add token endpoint URL if not in spec */'},
    redirectUri: config.redirectUri,
    clientId: config.clientId,
    responseType: 'code', // Standard for modern OAuth2 flows
    scope: '${scopes}',
    showDebugInformation: false, // Set to true for debugging OAuth flow
};

const authConfig: AuthConfig = { ...defaultConfig, ...config.authConfig };

return makeEnvironmentProviders([
    // Required for the oidc library's internal http calls
    provideHttpClient(withInterceptorsFromDi()),
    { provide: AuthConfig, useValue: authConfig },
    OAuthService,
    AuthHelperService,
    {
        provide: APP_INITIALIZER,
        useFactory: (authHelper: AuthHelperService) => () => authHelper.configure(),
        deps: [AuthHelperService],
        multi: true
    }
]);`
        });
    }
}
