import { Project, SourceFile } from 'ts-morph';
import * as path from 'node:path';
import { GeneratorConfig } from '@src/core/types/index.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import {
    getBasePathTokenName,
    getInterceptorsTokenName,
    getServerVariablesTokenName,
    pascalCase,
} from '@src/functions/utils.js';
import { PROVIDER_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

export class ProviderGenerator {
    private readonly clientName: string;
    private readonly capitalizedClientName: string;
    private readonly config: GeneratorConfig;
    private readonly hasApiKey: boolean;
    private readonly hasCookieAuth: boolean;
    private readonly hasBearer: boolean;
    private readonly hasMtls: boolean;

    constructor(
        parser: SwaggerParser,
        /* v8 ignore next */
        private project: Project,
        /* v8 ignore next */
        private tokenNames: string[] = [],
    ) {
        /* v8 ignore next */
        this.config = parser.config;
        /* v8 ignore next */
        this.clientName = this.config.clientName ?? 'default';
        /* v8 ignore next */
        this.capitalizedClientName = pascalCase(this.clientName);
        /* v8 ignore next */
        this.hasApiKey = this.tokenNames.includes('apiKey');
        /* v8 ignore next */
        this.hasCookieAuth = this.tokenNames.includes('cookieAuth');
        /* v8 ignore next */
        this.hasBearer = this.tokenNames.includes('bearerToken');
        /* v8 ignore next */
        this.hasMtls = this.tokenNames.includes('httpsAgentConfig');
    }

    public generate(outputDir: string): void {
        /* v8 ignore next */
        if (this.config.options.generateServices === false) {
            /* v8 ignore next */
            return;
        }

        /* v8 ignore next */
        const filePath = path.join(outputDir, 'providers.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        sourceFile.insertText(0, PROVIDER_GENERATOR_HEADER_COMMENT);

        /* v8 ignore next */
        const hasSecurity = this.hasApiKey || this.hasCookieAuth || this.hasBearer || this.hasMtls;

        /* v8 ignore next */
        this.addImports(sourceFile, hasSecurity);
        /* v8 ignore next */
        this.addConfigInterface(sourceFile);
        /* v8 ignore next */
        this.addMainProviderFunction(sourceFile, hasSecurity);

        /* v8 ignore next */
        sourceFile.formatText();
    }

    private addImports(sourceFile: SourceFile, hasSecurity: boolean): void {
        /* v8 ignore next */
        sourceFile.addImportDeclarations([
            {
                namedImports: ['EnvironmentProviders', 'Provider', 'makeEnvironmentProviders'],
                moduleSpecifier: '@angular/core',
            },
            { namedImports: ['HTTP_INTERCEPTORS', 'HttpInterceptor'], moduleSpecifier: '@angular/common/http' },
            {
                namedImports: [
                    getBasePathTokenName(this.clientName),
                    getServerVariablesTokenName(this.clientName),
                    getInterceptorsTokenName(this.clientName),
                ],
                moduleSpecifier: './tokens',
            },
            {
                namedImports: [`${this.capitalizedClientName}BaseInterceptor`],
                moduleSpecifier: './utils/base-interceptor',
            },
        ]);

        /* v8 ignore next */
        if (this.config.options.dateType === 'Date') {
            /* v8 ignore next */
            sourceFile.addImportDeclaration({
                namedImports: ['DateInterceptor'],
                moduleSpecifier: './utils/date-transformer',
            });
        }

        /* v8 ignore next */
        if (hasSecurity) {
            /* v8 ignore next */
            sourceFile.addImportDeclaration({
                namedImports: ['AuthInterceptor'],
                moduleSpecifier: './auth/auth.interceptor',
            });
            /* v8 ignore next */
            const tokenImports: string[] = [];
            /* v8 ignore next */
            if (this.hasApiKey) tokenImports.push('API_KEY_TOKEN');
            /* v8 ignore next */
            if (this.hasCookieAuth) tokenImports.push('COOKIE_AUTH_TOKEN');
            /* v8 ignore next */
            if (this.hasBearer) tokenImports.push('BEARER_TOKEN_TOKEN');
            /* v8 ignore next */
            if (this.hasMtls) tokenImports.push('HTTPS_AGENT_CONFIG_TOKEN');
            /* v8 ignore next */
            sourceFile.addImportDeclaration({ namedImports: tokenImports, moduleSpecifier: './auth/auth.tokens' });
        }
    }

    private addConfigInterface(sourceFile: SourceFile): void {
        /* v8 ignore next */
        const configInterface = sourceFile.addInterface({
            name: `${this.capitalizedClientName}Config`,
            isExported: true,
            properties: [
                {
                    name: 'basePath',
                    type: 'string',
                    hasQuestionToken: true,
                    docs: ['The base path of the API endpoint. If provided, it overrides the default server URL.'],
                },
                {
                    name: 'serverVariables',
                    type: 'Record<string, string>',
                    hasQuestionToken: true,
                    docs: ["Values for server variables (e.g. { port: '8080' }) to resolve the default server URL."],
                },
                {
                    name: 'enableDateTransform',
                    type: 'boolean',
                    hasQuestionToken: true,
                    docs: ['If true, automatically transforms ISO date strings. Default: true'],
                },
                {
                    name: 'interceptors',
                    type: `(new (...args: Array<string | number | boolean | null>) => HttpInterceptor)[]`,
                    hasQuestionToken: true,
                    docs: ['An array of custom HttpInterceptor classes.'],
                },
            ],
            docs: [`Configuration for the ${this.capitalizedClientName} API client.`],
        });
        /* v8 ignore next */
        if (this.hasApiKey) {
            /* v8 ignore next */
            configInterface.addProperty({
                name: 'apiKey',
                type: 'string',
                hasQuestionToken: true,
                docs: ['The API key to be used for authentication (Header/Query).'],
            });
        }
        /* v8 ignore next */
        if (this.hasCookieAuth) {
            /* v8 ignore next */
            configInterface.addProperty({
                name: 'cookieAuth',
                type: 'string',
                hasQuestionToken: true,
                docs: ['The API key value to be set in a Cookie (Node.js/SSR only).'],
            });
        }
        /* v8 ignore next */
        if (this.hasBearer) {
            /* v8 ignore next */
            configInterface.addProperty({
                name: 'bearerToken',
                type: 'string | (() => string)',
                hasQuestionToken: true,
                docs: ['The Bearer token or a function returning the token.'],
            });
        }
        /* v8 ignore next */
        if (this.hasMtls) {
            /* v8 ignore next */
            configInterface.addProperty({
                name: 'httpsAgentConfig',
                type: 'Record<string, string | number | boolean | object | undefined | null>',
                hasQuestionToken: true,
                docs: ['Configuration for the HTTPS Agent (e.g. PFX, Cert, Key) for Mutual TLS.'],
            });
        }
    }

    private addMainProviderFunction(sourceFile: SourceFile, hasSecurity: boolean): void {
        /* v8 ignore next */
        sourceFile.addFunction({
            name: `provide${this.capitalizedClientName}Client`,
            isExported: true,
            parameters: [{ name: 'config', type: `${this.capitalizedClientName}Config` }],
            returnType: 'EnvironmentProviders',
            docs: [
                `Provides the necessary services and configuration for the ${this.capitalizedClientName} API client.`,
            ],
            statements: writer => {
                /* v8 ignore next */
                writer.writeLine(`const providers: Provider[] = [`);
                /* v8 ignore next */
                writer.indent(() => {
                    /* v8 ignore next */
                    writer.writeLine(
                        `{ provide: ${getBasePathTokenName(this.clientName)}, useValue: config.basePath || null },`,
                    );
                    /* v8 ignore next */
                    writer.writeLine(
                        `{ provide: ${getServerVariablesTokenName(this.clientName)}, useValue: config.serverVariables || {} },`,
                    );
                    /* v8 ignore next */
                    writer.writeLine(
                        `{ provide: HTTP_INTERCEPTORS, useClass: ${this.capitalizedClientName}BaseInterceptor, multi: true }`,
                    );
                });
                /* v8 ignore next */
                writer.writeLine(`];`);

                /* v8 ignore next */
                if (hasSecurity) {
                    /* v8 ignore next */
                    writer.blankLine();
                    /* v8 ignore next */
                    writer.writeLine(
                        `providers.push({ provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true });`,
                    );

                    /* v8 ignore next */
                    if (this.hasApiKey) {
                        /* v8 ignore next */
                        writer.write('if (config.apiKey)').block(() => {
                            /* v8 ignore next */
                            writer.writeLine(`providers.push({ provide: API_KEY_TOKEN, useValue: config.apiKey });`);
                        });
                    }
                    /* v8 ignore next */
                    if (this.hasCookieAuth) {
                        /* v8 ignore next */
                        writer.write('if (config.cookieAuth)').block(() => {
                            /* v8 ignore next */
                            writer.writeLine(
                                `providers.push({ provide: COOKIE_AUTH_TOKEN, useValue: config.cookieAuth });`,
                            );
                        });
                    }
                    /* v8 ignore next */
                    if (this.hasBearer) {
                        /* v8 ignore next */
                        writer.write('if (config.bearerToken)').block(() => {
                            /* v8 ignore next */
                            writer.writeLine(
                                `providers.push({ provide: BEARER_TOKEN_TOKEN, useValue: config.bearerToken });`,
                            );
                        });
                    }
                    /* v8 ignore next */
                    if (this.hasMtls) {
                        /* v8 ignore next */
                        writer.write('if (config.httpsAgentConfig)').block(() => {
                            /* v8 ignore next */
                            writer.writeLine(
                                `providers.push({ provide: HTTPS_AGENT_CONFIG_TOKEN, useValue: config.httpsAgentConfig });`,
                            );
                        });
                    }
                }

                /* v8 ignore next */
                writer.blankLine();
                /* v8 ignore next */
                writer.writeLine(
                    'const customInterceptors = config.interceptors?.map(InterceptorClass => new InterceptorClass()) || [];',
                );

                /* v8 ignore next */
                if (this.config.options.dateType === 'Date') {
                    /* v8 ignore next */
                    writer.write('if (config.enableDateTransform !== false)').block(() => {
                        /* v8 ignore next */
                        writer.writeLine('customInterceptors.unshift(new DateInterceptor());');
                    });
                }

                /* v8 ignore next */
                writer.writeLine(
                    `providers.push({ provide: ${getInterceptorsTokenName(this.clientName)}, useValue: customInterceptors });`,
                );
                /* v8 ignore next */
                writer.blankLine();
                /* v8 ignore next */
                writer.writeLine('return makeEnvironmentProviders(providers);');
            },
        });
    }
}
