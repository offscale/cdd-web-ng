// src/generators/angular/service/service.generator.ts
import { ClassDeclaration, Project, Scope, SourceFile } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, PathInfo, SwaggerDefinition } from '@src/core/types/index.js';
import {
    getBasePathTokenName,
    getClientContextTokenName,
    getServerVariablesTokenName,
    getTypeScriptType,
    isDataTypeInterface,
    pascalCase,
} from '@src/core/utils/index.js';
import { ServiceMethodGenerator } from './service-method.generator.js';
import { AbstractServiceGenerator } from '../../base/service.base.js';

export class ServiceGenerator extends AbstractServiceGenerator {
    private methodGenerator: ServiceMethodGenerator;

    constructor(parser: SwaggerParser, project: Project, config: GeneratorConfig) {
        super(parser, project, config);
        this.methodGenerator = new ServiceMethodGenerator(this.config, this.parser);
    }

    public override generateServiceFile(controllerName: string, operations: PathInfo[], outputDir: string): void {
        super.generateServiceFile(controllerName, operations, outputDir);
    }

    protected getFileName(controllerName: string): string {
        return `${controllerName}.service.ts`;
    }

    protected generateImports(sourceFile: SourceFile, operations: PathInfo[]): void {
        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/core',
            namedImports: ['Injectable', 'inject'],
        });

        const httpImports = [
            'HttpClient',
            'HttpRequest',
            'HttpResponse',
            'HttpHeaders',
            'HttpEvent',
            'HttpParams',
            'HttpContext',
        ];
        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/common/http',
            namedImports: httpImports,
        });

        sourceFile.addImportDeclaration({
            moduleSpecifier: 'rxjs',
            namedImports: ['Observable'],
        });

        sourceFile.addImportDeclaration({
            moduleSpecifier: 'rxjs/operators',
            namedImports: ['map', 'filter', 'tap'],
        });

        sourceFile.addImportDeclaration({
            moduleSpecifier: '../utils/request-context',
            namedImports: ['createRequestOption', 'RequestOptions', 'HttpRequestOptions'],
        });

        sourceFile.addImportDeclaration({
            moduleSpecifier: '../utils/parameter-serializer',
            namedImports: ['ParameterSerializer'],
        });

        sourceFile.addImportDeclaration({
            moduleSpecifier: '../utils/http-params-builder',
            namedImports: ['ApiParameterCodec'],
        });

        sourceFile.addImportDeclaration({
            moduleSpecifier: '../utils/server-url',
            namedImports: ['getServerUrl', 'resolveServerUrl'],
        });

        if (
            operations.some(
                op => op.consumes?.includes('multipart/form-data') || op.requestBody?.content?.['multipart/form-data'],
            )
        ) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: '../utils/multipart.builder',
                namedImports: ['MultipartBuilder'],
            });
        }

        if (
            operations.some(
                op =>
                    op.parameters?.some(p => p.content?.['application/xml']) ||
                    op.requestBody?.content?.['application/xml'],
            )
        ) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: '../utils/xml.builder',
                namedImports: ['XmlBuilder'],
            });
        }

        const hasXmlResponse = operations.some(op =>
            Object.values(op.responses!).some(r => r.content?.['application/xml']),
        );

        if (hasXmlResponse) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: '../utils/xml-parser',
                namedImports: ['XmlParser'],
            });
        }

        let hasDecoding = false;
        let hasEncoding = false;

        const schemaHasDecodingHints = (
            schema: SwaggerDefinition | boolean | undefined,
            depth: number = 6,
        ): boolean => {
            if (!schema || typeof schema !== 'object' || depth <= 0) return false;
            if ('contentEncoding' in schema || 'contentSchema' in schema) return true;
            if (Array.isArray(schema)) {
                return schema.some((item: unknown) =>
                    schemaHasDecodingHints(item as SwaggerDefinition | boolean, depth - 1),
                );
            }
            return Object.values(schema).some(value =>
                schemaHasDecodingHints(value as SwaggerDefinition | boolean, depth - 1),
            );
        };

        for (const op of operations) {
            hasDecoding =
                hasDecoding ||
                Object.values(op.responses!).some(r => {
                    if (!r.content) return false;
                    return Object.values(r.content).some(media => {
                        const schema = media?.schema ?? media?.itemSchema;
                        return schemaHasDecodingHints(schema as SwaggerDefinition | boolean);
                    });
                });

            if (op.requestBody?.content?.['application/json']?.schema) {
                const s = op.requestBody.content['application/json'].schema;
                hasEncoding = hasEncoding || JSON.stringify(s).includes('contentMediaType');
            }

            if (op.parameters && op.parameters.length > 0) {
                const hasParamEncoding = op.parameters.some(param => {
                    const contentSchema =
                        param.content && Object.keys(param.content).length > 0
                            ? param.content[Object.keys(param.content)[0]!]?.schema
                            : undefined;
                    const schema = param.schema ?? contentSchema;
                    if (!schema) return false;
                    const serialized = JSON.stringify(schema);
                    return serialized.includes('contentEncoding') || serialized.includes('contentMediaType');
                });
                hasEncoding = hasEncoding || hasParamEncoding;
            }
        }

        if (hasDecoding) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: '../utils/content-decoder',
                namedImports: ['ContentDecoder'],
            });
        }

        if (hasEncoding) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: '../utils/content-encoder',
                namedImports: ['ContentEncoder'],
            });
        }

        const globalSecurity = this.parser.getSpec().security || [];
        const hasSecurity = operations.some(op => {
            if (op.security) return op.security.length > 0;
            return globalSecurity.length > 0;
        });

        if (hasSecurity) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: '../auth/auth.tokens',
                namedImports: ['SECURITY_CONTEXT_TOKEN'],
            });
        }

        const hasExtensions = operations.some(op => Object.keys(op).some(k => k.startsWith('x-')));
        if (hasExtensions) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: '../tokens/extensions.token',
                namedImports: ['EXTENSIONS_CONTEXT_TOKEN'],
            });
        }

        const knownTypes = this.parser.schemas.map(s => s.name);
        const modelImports = new Set<string>(['RequestOptions']);

        for (const op of operations) {
            for (const resp of Object.values(op.responses!)) {
                if (resp.content) {
                    Object.values(resp.content).forEach(media => {
                        const schema = media?.schema ?? media?.itemSchema;
                        if (!schema) return;
                        const typeName = getTypeScriptType(
                            schema as SwaggerDefinition,
                            this.config,
                            knownTypes,
                        ).replace(/\[\]| \| null/g, '');
                        if (isDataTypeInterface(typeName)) {
                            modelImports.add(typeName);
                        }
                    });
                }
            }

            op.parameters!.forEach(param => {
                const paramType = getTypeScriptType(param.schema as SwaggerDefinition, this.config, knownTypes).replace(
                    /\[\]| \| null/g,
                    '',
                );
                if (isDataTypeInterface(paramType)) {
                    modelImports.add(paramType);
                }
            });

            if (op.requestBody?.content?.['application/json']?.schema) {
                const bodyType = getTypeScriptType(
                    op.requestBody.content['application/json'].schema as SwaggerDefinition,
                    this.config,
                    knownTypes,
                ).replace(/\[\]| \| null/g, '');
                if (isDataTypeInterface(bodyType)) {
                    modelImports.add(bodyType);
                }
            }
        }

        const validModels = Array.from(modelImports).filter(
            (m: string) => /^[A-Z]/.test(m) && !['Date', 'Blob', 'File'].includes(m),
        );
        sourceFile.addImportDeclaration({
            moduleSpecifier: '../models',
            namedImports: validModels,
        });

        sourceFile.addImportDeclaration({
            moduleSpecifier: '../tokens',
            namedImports: [
                getBasePathTokenName(this.config.clientName),
                getServerVariablesTokenName(this.config.clientName),
            ],
        });
    }

    protected generateServiceContent(sourceFile: SourceFile, controllerName: string, operations: PathInfo[]): void {
        const className = `${pascalCase(controllerName)}Service`;

        const serviceClass = sourceFile.addClass({
            name: className,
            isExported: true,
            decorators: [{ name: 'Injectable', arguments: [`{ providedIn: 'root' }`] }],
        });

        this.addPropertiesAndHelpers(serviceClass);

        for (const op of operations) {
            this.methodGenerator.addServiceMethod(serviceClass, op);
        }
    }

    private addPropertiesAndHelpers(serviceClass: ClassDeclaration): void {
        serviceClass.addProperty({
            name: 'http',
            scope: Scope.Private,
            isReadonly: true,
            initializer: 'inject(HttpClient)',
        });

        const basePathToken = getBasePathTokenName(this.config.clientName);
        const varsToken = getServerVariablesTokenName(this.config.clientName);

        serviceClass.addProperty({
            name: 'basePath',
            scope: Scope.Private,
            isReadonly: true,
            type: 'string',
            initializer: `inject(${basePathToken}, { optional: true }) || getServerUrl(0, inject(${varsToken}, { optional: true }) ?? {})`,
        });
        const clientContextTokenName = getClientContextTokenName(this.config.clientName);

        serviceClass.addProperty({
            name: 'clientContextToken',
            type: `HttpContextToken<string>`,
            scope: Scope.Private,
            isReadonly: true,
            initializer: clientContextTokenName,
        });

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
