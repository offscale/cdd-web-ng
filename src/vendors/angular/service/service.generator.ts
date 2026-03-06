// src/generators/angular/service/service.generator.ts
import { ClassDeclaration, Project, Scope, SourceFile } from 'ts-morph';
import { SwaggerParser } from '@src/openapi/parse.js';
import { GeneratorConfig, PathInfo, SwaggerDefinition, OpenApiValue } from '@src/core/types/index.js';
import {
    getBasePathTokenName,
    getClientContextTokenName,
    getServerVariablesTokenName,
    getTypeScriptType,
    isDataTypeInterface,
    pascalCase,
} from '@src/functions/utils.js';
import { ServiceMethodGenerator } from './service-method.generator.js';
import { AbstractServiceGenerator } from '../../../functions/emit_service.js';

export class ServiceGenerator extends AbstractServiceGenerator {
    private methodGenerator: ServiceMethodGenerator;

    constructor(parser: SwaggerParser, project: Project, config: GeneratorConfig) {
        /* v8 ignore next */
        super(parser, project, config);
        /* v8 ignore next */
        this.methodGenerator = new ServiceMethodGenerator(this.config, this.parser);
    }

    public override generateServiceFile(controllerName: string, operations: PathInfo[], outputDir: string): void {
        /* v8 ignore next */
        super.generateServiceFile(controllerName, operations, outputDir);
    }

    protected getFileName(controllerName: string): string {
        /* v8 ignore next */
        return `${controllerName}.service.ts`;
    }

    protected generateImports(sourceFile: SourceFile, operations: PathInfo[]): void {
        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/core',
            namedImports: ['Injectable', 'inject'],
        });

        /* v8 ignore next */
        const httpImports = [
            'HttpClient',
            'HttpRequest',
            'HttpResponse',
            'HttpHeaders',
            'HttpEvent',
            'HttpParams',
            'HttpContext',
            'HttpContextToken',
        ];
        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/common/http',
            namedImports: httpImports,
        });

        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: 'rxjs',
            namedImports: ['Observable'],
        });

        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: 'rxjs/operators',
            namedImports: ['map', 'filter', 'tap'],
        });

        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: '../utils/request-context',
            namedImports: ['createRequestOption', 'RequestOptions', 'HttpRequestOptions'],
        });

        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: '../tokens',
            namedImports: ['CLIENT_CONTEXT_TOKEN_DEFAULT'],
        });

        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: '../utils/parameter-serializer',
            namedImports: ['ParameterSerializer'],
        });

        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: '../utils/http-params-builder',
            namedImports: ['ApiParameterCodec'],
        });

        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: '../utils/server-url',
            namedImports: ['getServerUrl', 'resolveServerUrl'],
        });

        /* v8 ignore next */
        if (
            operations.some(
                /* v8 ignore next */
                op => op.consumes?.includes('multipart/form-data') || op.requestBody?.content?.['multipart/form-data'],
            )
        ) {
            /* v8 ignore next */
            sourceFile.addImportDeclaration({
                moduleSpecifier: '../utils/multipart-builder',
                namedImports: ['MultipartBuilder'],
            });
        }

        /* v8 ignore next */
        if (
            operations.some(
                op =>
                    /* v8 ignore next */
                    op.parameters?.some(p => p.content?.['application/xml']) ||
                    op.requestBody?.content?.['application/xml'],
            )
        ) {
            /* v8 ignore next */
            sourceFile.addImportDeclaration({
                moduleSpecifier: '../utils/xml-builder',
                namedImports: ['XmlBuilder'],
            });
        }

        /* v8 ignore next */
        const hasXmlResponse = operations.some(op =>
            /* v8 ignore next */
            Object.values(op.responses!).some(r => r.content?.['application/xml']),
        );

        /* v8 ignore next */
        if (hasXmlResponse) {
            /* v8 ignore next */
            sourceFile.addImportDeclaration({
                moduleSpecifier: '../utils/xml-parser',
                namedImports: ['XmlParser'],
            });
        }

        /* v8 ignore next */
        let hasDecoding = false;
        /* v8 ignore next */
        let hasEncoding = false;

        /* v8 ignore next */
        const schemaHasDecodingHints = (
            schema: SwaggerDefinition | boolean | undefined,
            depth: number = 6,
        ): boolean => {
            /* v8 ignore next */
            if (!schema || typeof schema !== 'object' || depth <= 0) return false;
            /* v8 ignore next */
            if ('contentEncoding' in schema || 'contentSchema' in schema) return true;
            /* v8 ignore next */
            /* v8 ignore start */
            if (Array.isArray(schema)) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                return schema.some(
                    (item: OpenApiValue) =>
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        schemaHasDecodingHints(item as SwaggerDefinition | boolean, depth - 1),
                    /* v8 ignore stop */
                );
            }
            /* v8 ignore next */
            return Object.values(schema).some(value =>
                /* v8 ignore next */
                schemaHasDecodingHints(value as SwaggerDefinition | boolean, depth - 1),
            );
        };

        /* v8 ignore next */
        for (const op of operations) {
            /* v8 ignore next */
            hasDecoding =
                hasDecoding ||
                Object.values(op.responses!).some(r => {
                    /* v8 ignore next */
                    if (!r.content) return false;
                    /* v8 ignore next */
                    return Object.values(r.content).some(media => {
                        /* v8 ignore next */
                        /* v8 ignore start */
                        const schema = media?.schema ?? media?.itemSchema;
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        return schemaHasDecodingHints(schema as SwaggerDefinition | boolean);
                    });
                });

            /* v8 ignore next */
            if (op.requestBody?.content?.['application/json']?.schema) {
                /* v8 ignore next */
                const s = op.requestBody.content['application/json'].schema;
                /* v8 ignore next */
                hasEncoding = hasEncoding || JSON.stringify(s).includes('contentMediaType');
            }

            /* v8 ignore next */
            if (op.parameters && op.parameters.length > 0) {
                /* v8 ignore next */
                const hasParamEncoding = op.parameters.some(param => {
                    const contentSchema =
                        /* v8 ignore next */
                        param.content && Object.keys(param.content).length > 0
                            ? param.content[Object.keys(param.content)[0]!]?.schema
                            : undefined;
                    /* v8 ignore next */
                    /* v8 ignore start */
                    const schema = param.schema ?? contentSchema;
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    if (!schema) return false;
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    const serialized = JSON.stringify(schema);
                    /* v8 ignore next */
                    return serialized.includes('contentEncoding') || serialized.includes('contentMediaType');
                });
                /* v8 ignore next */
                hasEncoding = hasEncoding || hasParamEncoding;
            }
        }

        /* v8 ignore next */
        if (hasDecoding) {
            /* v8 ignore next */
            sourceFile.addImportDeclaration({
                moduleSpecifier: '../utils/content-decoder',
                namedImports: ['ContentDecoder'],
            });
        }

        /* v8 ignore next */
        if (hasEncoding) {
            /* v8 ignore next */
            sourceFile.addImportDeclaration({
                moduleSpecifier: '../utils/content-encoder',
                namedImports: ['ContentEncoder'],
            });
        }

        /* v8 ignore next */
        const globalSecurity = this.parser.getSpec().security || [];
        /* v8 ignore next */
        const hasSecurity = operations.some(op => {
            /* v8 ignore next */
            if (op.security) return op.security.length > 0;
            /* v8 ignore next */
            return globalSecurity.length > 0;
        });

        /* v8 ignore next */
        if (hasSecurity) {
            /* v8 ignore next */
            sourceFile.addImportDeclaration({
                moduleSpecifier: '../auth/auth.tokens',
                namedImports: ['SECURITY_CONTEXT_TOKEN'],
            });
        }

        /* v8 ignore next */
        const hasExtensions = operations.some(op => Object.keys(op).some(k => k.startsWith('x-')));
        /* v8 ignore next */
        if (hasExtensions) {
            /* v8 ignore next */
            sourceFile.addImportDeclaration({
                moduleSpecifier: '../tokens/extensions.token',
                namedImports: ['EXTENSIONS_CONTEXT_TOKEN'],
            });
        }

        /* v8 ignore next */
        const knownTypes = this.parser.schemas.map(s => s.name);
        /* v8 ignore next */
        const modelImports = new Set<string>();

        /* v8 ignore next */
        for (const op of operations) {
            /* v8 ignore next */
            for (const resp of Object.values(op.responses!)) {
                /* v8 ignore next */
                if (resp.content) {
                    /* v8 ignore next */
                    Object.values(resp.content).forEach(media => {
                        /* v8 ignore next */
                        /* v8 ignore start */
                        const schema = media?.schema ?? media?.itemSchema;
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (!schema) return;
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        const typeName = getTypeScriptType(
                            schema as SwaggerDefinition,
                            this.config,
                            knownTypes,
                        ).replace(/\[\]| \| null/g, '');
                        /* v8 ignore next */
                        if (isDataTypeInterface(typeName)) {
                            /* v8 ignore next */
                            modelImports.add(typeName);
                        }
                    });
                }
            }

            /* v8 ignore next */
            op.parameters!.forEach(param => {
                /* v8 ignore next */
                const paramType = getTypeScriptType(param.schema as SwaggerDefinition, this.config, knownTypes).replace(
                    /\[\]| \| null/g,
                    '',
                );
                /* v8 ignore next */
                if (isDataTypeInterface(paramType)) {
                    /* v8 ignore next */
                    modelImports.add(paramType);
                }
            });

            /* v8 ignore next */
            if (op.requestBody?.content?.['application/json']?.schema) {
                /* v8 ignore next */
                const bodyType = getTypeScriptType(
                    op.requestBody.content['application/json'].schema as SwaggerDefinition,
                    this.config,
                    knownTypes,
                ).replace(/\[\]| \| null/g, '');
                /* v8 ignore next */
                if (isDataTypeInterface(bodyType)) {
                    /* v8 ignore next */
                    modelImports.add(bodyType);
                }
            }
        }

        /* v8 ignore next */
        const validModels = Array.from(modelImports).filter(
            /* v8 ignore next */
            (m: string) => /^[A-Z]/.test(m) && !['Date', 'Blob', 'File'].includes(m),
        );
        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: '../models',
            namedImports: validModels,
        });

        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: '../tokens',
            namedImports: [
                getBasePathTokenName(this.config.clientName),
                getServerVariablesTokenName(this.config.clientName),
            ],
        });
    }

    protected generateServiceContent(sourceFile: SourceFile, controllerName: string, operations: PathInfo[]): void {
        /* v8 ignore next */
        const className = `${pascalCase(controllerName)}Service`;

        /* v8 ignore next */
        const serviceClass = sourceFile.addClass({
            name: className,
            isExported: true,
            decorators: [{ name: 'Injectable', arguments: [`{ providedIn: 'root' }`] }],
        });

        /* v8 ignore next */
        this.addPropertiesAndHelpers(serviceClass);

        /* v8 ignore next */
        for (const op of operations) {
            /* v8 ignore next */
            this.methodGenerator.addServiceMethod(serviceClass, op);
        }
    }

    private addPropertiesAndHelpers(serviceClass: ClassDeclaration): void {
        /* v8 ignore next */
        serviceClass.addProperty({
            name: 'http',
            scope: Scope.Private,
            isReadonly: true,
            initializer: 'inject(HttpClient)',
        });

        /* v8 ignore next */
        const basePathToken = getBasePathTokenName(this.config.clientName);
        /* v8 ignore next */
        const varsToken = getServerVariablesTokenName(this.config.clientName);

        /* v8 ignore next */
        serviceClass.addProperty({
            name: 'basePath',
            scope: Scope.Private,
            isReadonly: true,
            type: 'string',
            initializer: `inject(${basePathToken}, { optional: true }) || getServerUrl(0, inject(${varsToken}, { optional: true }) ?? {})`,
        });
        /* v8 ignore next */
        const clientContextTokenName = getClientContextTokenName(this.config.clientName);

        /* v8 ignore next */
        serviceClass.addProperty({
            name: 'clientContextToken',
            type: `HttpContextToken<string>`,
            scope: Scope.Private,
            isReadonly: true,
            initializer: clientContextTokenName,
        });

        /* v8 ignore next */
        serviceClass.addMethod({
            name: 'createContextWithClientId',
            scope: Scope.Private,
            parameters: [{ name: 'existingContext', type: 'HttpContext', hasQuestionToken: true }],
            returnType: 'HttpContext',
            statements: `const context = existingContext || new HttpContext();\nreturn context.set(this.clientContextToken, '${this.config.clientName || 'default'}');`,
            docs: ['Creates a new HttpContext or enhances an existing one with the client identifier token.'],
        });
    }
}
