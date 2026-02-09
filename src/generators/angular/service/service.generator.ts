import { ClassDeclaration, Project, Scope, SourceFile } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, PathInfo } from '@src/core/types/index.js';
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

    // Override to expose explicit file generation if needed by legacy tests,
    // or simply rely on the base class 'generate' method for bulk operations.
    // For consistency with interface, we expose the specific single file method used by existing tests.
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

        const httpImports = ['HttpClient', 'HttpRequest', 'HttpResponse', 'HttpHeaders', 'HttpEvent', 'HttpParams'];
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

        // CHANGE: Use new generic serializer
        sourceFile.addImportDeclaration({
            moduleSpecifier: '../utils/parameter-serializer',
            namedImports: ['ParameterSerializer'],
        });

        // CHANGE: Use Identity Codec for Angular HttpParams compatibility
        sourceFile.addImportDeclaration({
            moduleSpecifier: '../utils/http-params-builder',
            namedImports: ['ApiParameterCodec'],
        });

        sourceFile.addImportDeclaration({
            moduleSpecifier: '../utils/server-url',
            namedImports: ['getServerUrl'],
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

        // Check for ContentDecoder/ContentEncoder needs
        let hasDecoding = false;
        let hasEncoding = false;

        for (const op of operations) {
            hasDecoding =
                hasDecoding ||
                Object.values(op.responses!).some(r => {
                    const s = r.content?.['application/json']?.schema;
                    return s && JSON.stringify(s).includes('contentSchema');
                });

            // Check request body for encoding
            if (op.requestBody?.content?.['application/json']?.schema) {
                const s = op.requestBody.content['application/json'].schema;
                // Simple heuristic check for recursive property
                hasEncoding = hasEncoding || JSON.stringify(s).includes('contentMediaType');
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

        // Model Imports Analysis
        const knownTypes = this.parser.schemas.map(s => s.name);
        const modelImports = new Set<string>(['RequestOptions']);

        for (const op of operations) {
            // Check all responses for models
            for (const resp of Object.values(op.responses!)) {
                if (resp.content) {
                    const jsonSchema = resp.content['application/json']?.schema;
                    const xmlSchema = resp.content['application/xml']?.schema;
                    const wildcardSchema = resp.content['*/*']?.schema;

                    const schema = jsonSchema || xmlSchema || wildcardSchema;
                    if (schema) {
                        const typeName = getTypeScriptType(schema, this.config, knownTypes).replace(
                            /\[\]| \| null/g,
                            '',
                        );
                        if (isDataTypeInterface(typeName)) {
                            modelImports.add(typeName);
                        }
                    }
                }
            }

            op.parameters!.forEach(param => {
                const paramType = getTypeScriptType(param.schema, this.config, knownTypes).replace(
                    /\[\]| \| null/g,
                    '',
                );
                if (isDataTypeInterface(paramType)) {
                    modelImports.add(paramType);
                }
            });

            if (op.requestBody?.content?.['application/json']?.schema) {
                const bodyType = getTypeScriptType(
                    op.requestBody.content['application/json'].schema,
                    this.config,
                    knownTypes,
                ).replace(/\[\]| \| null/g, '');
                if (isDataTypeInterface(bodyType)) {
                    modelImports.add(bodyType);
                }
            }
        }

        const validModels = Array.from(modelImports).filter(
            m => /^[A-Z]/.test(m) && !['Date', 'Blob', 'File'].includes(m),
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
            // Priority: 1. Explicitly Provided Path -> 2. Calculated path from Servers[0] + Injected Variables
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
