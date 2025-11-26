import { Project, SourceFile } from 'ts-morph';
import * as path from 'node:path';
import { GeneratorConfig } from '@src/core/types/index.js';
import { SwaggerParser } from '@src/core/parser.js';
import {
    getBasePathTokenName,
    getInterceptorsTokenName,
    getServerVariablesTokenName,
    pascalCase
} from "@src/core/utils/index.js";
import { PROVIDER_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

export class ProviderGenerator {
    private readonly clientName: string;
    private readonly capitalizedClientName: string;
    private readonly config: GeneratorConfig;
    private readonly hasApiKey: boolean;
    private readonly hasCookieAuth: boolean;
    private readonly hasBearer: boolean;
    private readonly hasMtls: boolean;

    constructor(parser: SwaggerParser, private project: Project, private tokenNames: string[] = []) {
        this.config = parser.config;
        this.clientName = this.config.clientName ?? 'default';
        this.capitalizedClientName = pascalCase(this.clientName);
        this.hasApiKey = this.tokenNames.includes('apiKey');
        this.hasCookieAuth = this.tokenNames.includes('cookieAuth');
        this.hasBearer = this.tokenNames.includes('bearerToken');
        this.hasMtls = this.tokenNames.includes('httpsAgentConfig');
    }

    public generate(outputDir: string): void {
        if (this.config.options.generateServices === false) {
            return;
        }

        const filePath = path.join(outputDir, "providers.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, PROVIDER_GENERATOR_HEADER_COMMENT);

        const hasSecurity = this.hasApiKey || this.hasCookieAuth || this.hasBearer || this.hasMtls;

        this.addImports(sourceFile, hasSecurity);
        this.addConfigInterface(sourceFile);
        this.addMainProviderFunction(sourceFile, hasSecurity);

        sourceFile.formatText();
    }

    private addImports(sourceFile: SourceFile, hasSecurity: boolean): void {
        sourceFile.addImportDeclarations([
            {
                namedImports: ["EnvironmentProviders", "Provider", "makeEnvironmentProviders"],
                moduleSpecifier: "@angular/core"
            },
            { namedImports: ["HTTP_INTERCEPTORS", "HttpInterceptor"], moduleSpecifier: "@angular/common/http" },
            {
                namedImports: [getBasePathTokenName(this.clientName), getServerVariablesTokenName(this.clientName), getInterceptorsTokenName(this.clientName)],
                moduleSpecifier: "./tokens"
            },
            {
                namedImports: [`${this.capitalizedClientName}BaseInterceptor`],
                moduleSpecifier: "./utils/base-interceptor"
            },
        ]);

        if (this.config.options.dateType === "Date") {
            sourceFile.addImportDeclaration({
                namedImports: ["DateInterceptor"],
                moduleSpecifier: "./utils/date-transformer"
            });
        }

        if (hasSecurity) {
            sourceFile.addImportDeclaration({
                namedImports: ["AuthInterceptor"],
                moduleSpecifier: "./auth/auth.interceptor"
            });
            const tokenImports: string[] = [];
            if (this.hasApiKey) tokenImports.push("API_KEY_TOKEN");
            if (this.hasCookieAuth) tokenImports.push("COOKIE_AUTH_TOKEN");
            if (this.hasBearer) tokenImports.push("BEARER_TOKEN_TOKEN");
            if (this.hasMtls) tokenImports.push("HTTPS_AGENT_CONFIG_TOKEN");
            sourceFile.addImportDeclaration({ namedImports: tokenImports, moduleSpecifier: "./auth/auth.tokens" });
        }
    }

    private addConfigInterface(sourceFile: SourceFile): void {
        const configInterface = sourceFile.addInterface({
            name: `${this.capitalizedClientName}Config`,
            isExported: true,
            properties: [
                {
                    name: "basePath",
                    type: "string",
                    hasQuestionToken: true,
                    docs: ["The base path of the API endpoint. If provided, it overrides the default server URL."]
                },
                {
                    name: "serverVariables",
                    type: "Record<string, string>",
                    hasQuestionToken: true,
                    docs: ["Values for server variables (e.g. { port: '8080' }) to resolve the default server URL."]
                },
                {
                    name: "enableDateTransform",
                    type: "boolean",
                    hasQuestionToken: true,
                    docs: ["If true, automatically transforms ISO date strings. Default: true"]
                },
                {
                    name: "interceptors",
                    type: `(new (...args: any[]) => HttpInterceptor)[]`,
                    hasQuestionToken: true,
                    docs: ["An array of custom HttpInterceptor classes."]
                },
            ],
            docs: [`Configuration for the ${this.capitalizedClientName} API client.`]
        });
        if (this.hasApiKey) {
            configInterface.addProperty({
                name: "apiKey",
                type: "string",
                hasQuestionToken: true,
                docs: ["The API key to be used for authentication (Header/Query)."]
            });
        }
        if (this.hasCookieAuth) {
            configInterface.addProperty({
                name: "cookieAuth",
                type: "string",
                hasQuestionToken: true,
                docs: ["The API key value to be set in a Cookie (Node.js/SSR only)."]
            });
        }
        if (this.hasBearer) {
            configInterface.addProperty({
                name: "bearerToken",
                type: "string | (() => string)",
                hasQuestionToken: true,
                docs: ["The Bearer token or a function returning the token."]
            });
        }
        if (this.hasMtls) {
            configInterface.addProperty({
                name: "httpsAgentConfig",
                type: "any",
                hasQuestionToken: true,
                docs: ["Configuration for the HTTPS Agent (e.g. PFX, Cert, Key) for Mutual TLS."]
            });
        }
    }

    private addMainProviderFunction(sourceFile: SourceFile, hasSecurity: boolean): void {
        sourceFile.addFunction({
            name: `provide${this.capitalizedClientName}Client`,
            isExported: true,
            parameters: [{ name: "config", type: `${this.capitalizedClientName}Config` }],
            returnType: "EnvironmentProviders",
            docs: [
                `Provides the necessary services and configuration for the ${this.capitalizedClientName} API client.`,
            ],
            statements: writer => {
                writer.writeLine(`const providers: Provider[] = [`);
                writer.indent(() => {
                    writer.writeLine(`{ provide: ${getBasePathTokenName(this.clientName)}, useValue: config.basePath || null },`);
                    writer.writeLine(`{ provide: ${getServerVariablesTokenName(this.clientName)}, useValue: config.serverVariables || {} },`);
                    writer.writeLine(`{ provide: HTTP_INTERCEPTORS, useClass: ${this.capitalizedClientName}BaseInterceptor, multi: true }`);
                });
                writer.writeLine(`];`);

                if (hasSecurity) {
                    writer.blankLine();
                    writer.writeLine(`providers.push({ provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true });`);

                    if (this.hasApiKey) {
                        writer.write("if (config.apiKey)").block(() => {
                            writer.writeLine(`providers.push({ provide: API_KEY_TOKEN, useValue: config.apiKey });`);
                        });
                    }
                    if (this.hasCookieAuth) {
                        writer.write("if (config.cookieAuth)").block(() => {
                            writer.writeLine(`providers.push({ provide: COOKIE_AUTH_TOKEN, useValue: config.cookieAuth });`);
                        });
                    }
                    if (this.hasBearer) {
                        writer.write("if (config.bearerToken)").block(() => {
                            writer.writeLine(`providers.push({ provide: BEARER_TOKEN_TOKEN, useValue: config.bearerToken });`);
                        });
                    }
                    if (this.hasMtls) {
                        writer.write("if (config.httpsAgentConfig)").block(() => {
                            writer.writeLine(`providers.push({ provide: HTTPS_AGENT_CONFIG_TOKEN, useValue: config.httpsAgentConfig });`);
                        });
                    }
                }

                writer.blankLine();
                writer.writeLine("const customInterceptors = config.interceptors?.map(InterceptorClass => new InterceptorClass()) || [];");

                if (this.config.options.dateType === "Date") {
                    writer.write("if (config.enableDateTransform !== false)").block(() => {
                        writer.writeLine('customInterceptors.unshift(new DateInterceptor());');
                    });
                }

                writer.writeLine(`providers.push({ provide: ${getInterceptorsTokenName(this.clientName)}, useValue: customInterceptors });`);
                writer.blankLine();
                writer.writeLine("return makeEnvironmentProviders(providers);");
            }
        });
    }
}
