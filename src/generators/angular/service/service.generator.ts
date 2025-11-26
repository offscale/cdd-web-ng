import { ClassDeclaration, Project, Scope, SourceFile } from 'ts-morph';
import * as path from 'node:path';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, PathInfo } from '@src/core/types/index.js';
import {
    camelCase,
    getBasePathTokenName,
    getClientContextTokenName,
    getTypeScriptType,
    isDataTypeInterface,
    pascalCase
} from "@src/core/utils/index.js";
import { SERVICE_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';
import { ServiceMethodGenerator } from './service-method.generator.js';

/**
 * Normalize method and file names to be valid TypeScript identifiers.
 * Example: get-custom-name -> getCustomName
 */
function toTsIdentifier(name: string): string {
    return camelCase(name.replace(/[^\w]/g, ' '));
}

export class ServiceGenerator {
    private methodGenerator: ServiceMethodGenerator;

    constructor(private parser: SwaggerParser, private project: Project, private config: GeneratorConfig) {
        this.methodGenerator = new ServiceMethodGenerator(this.config, this.parser);
    }

    public generateServiceFile(controllerName: string, operations: PathInfo[], outputDir: string): void {
        const cleanControllerName = toTsIdentifier(controllerName);
        const pascalControllerName = pascalCase(cleanControllerName);

        const fileName = `${cleanControllerName}.service.ts`;
        const filePath = path.join(outputDir, fileName);
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.addStatements(SERVICE_GENERATOR_HEADER_COMMENT);
        const className = `${pascalControllerName}Service`;
        const knownTypes = this.parser.schemas.map(s => s.name);
        const modelImports = new Set<string>(['RequestOptions']);

        for (const op of operations) {
            // Check all responses for models
            if (op.responses) {
                for (const resp of Object.values(op.responses)) {
                    if (resp.content) {
                        // Look for schemas in any content type, favoring JSON
                        const jsonSchema = resp.content['application/json']?.schema;
                        const xmlSchema = resp.content['application/xml']?.schema;
                        const wildcardSchema = resp.content['*/*']?.schema;

                        const schema = jsonSchema || xmlSchema || wildcardSchema;
                        if (schema) {
                            const typeName = getTypeScriptType(schema, this.config, knownTypes).replace(/\[\]| \| null/g, '');
                            if (isDataTypeInterface(typeName)) {
                                modelImports.add(typeName);
                            }
                        }
                    }
                }
            }

            (op.parameters ?? []).forEach(param => {
                const paramType = getTypeScriptType(param.schema, this.config, knownTypes).replace(/\[\]| \| null/g, '');
                if (isDataTypeInterface(paramType)) {
                    modelImports.add(paramType);
                }
            });

            if (op.requestBody?.content?.['application/json']?.schema) {
                const bodyType = getTypeScriptType(op.requestBody.content['application/json'].schema, this.config, knownTypes).replace(/\[\]| \| null/g, '');
                if (isDataTypeInterface(bodyType)) {
                    modelImports.add(bodyType);
                }
            }
        }

        this.addImports(sourceFile, modelImports, operations);
        const serviceClass = this.addClass(sourceFile, className);
        this.addPropertiesAndHelpers(serviceClass);

        for (const op of operations) {
            if (!op.methodName) {
                if (op.operationId) {
                    op.methodName = toTsIdentifier(op.operationId);
                } else {
                    op.methodName = toTsIdentifier(op.method.toLowerCase() + '_' + op.path);
                }
            } else if (op.methodName.includes('-') || !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(op.methodName)) {
                op.methodName = toTsIdentifier(op.methodName);
            }

            this.methodGenerator.addServiceMethod(serviceClass, op);
        }

        sourceFile.formatText();
    }

    private addImports(sourceFile: SourceFile, modelImports: Set<string>, operations: PathInfo[]): void {
        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/core',
            namedImports: ['Injectable', 'inject']
        });

        const httpImports = ['HttpClient', 'HttpRequest', 'HttpResponse', 'HttpHeaders', 'HttpEvent', 'HttpParams'];
        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/common/http',
            namedImports: httpImports
        });

        sourceFile.addImportDeclaration({
            moduleSpecifier: 'rxjs',
            namedImports: ['Observable']
        });

        sourceFile.addImportDeclaration({
            moduleSpecifier: 'rxjs/operators',
            namedImports: ['map', 'filter', 'tap']
        });

        sourceFile.addImportDeclaration({
            moduleSpecifier: '../utils/request-context',
            namedImports: ['createRequestOption', 'RequestOptions', 'HttpRequestOptions']
        });

        sourceFile.addImportDeclaration({
            moduleSpecifier: '../utils/http-params.builder',
            namedImports: ['HttpParamsBuilder']
        });

        if (operations.some(op => op.consumes?.includes('multipart/form-data') || op.requestBody?.content?.['multipart/form-data'])) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: '../utils/multipart.builder',
                namedImports: ['MultipartBuilder']
            });
        }

        if (operations.some(op => op.parameters?.some(p => p.content?.['application/xml']) || op.requestBody?.content?.['application/xml'])) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: '../utils/xml.builder',
                namedImports: ['XmlBuilder']
            });
        }

        const hasXmlResponse = operations.some(op => {
            // Logic check simplified: Just check if any response has xml content
            if (op.responses) {
                return Object.values(op.responses).some(r => r.content?.['application/xml']);
            }
            return false;
        });

        if (hasXmlResponse) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: '../utils/xml-parser',
                namedImports: ['XmlParser']
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
                namedImports: ['SECURITY_CONTEXT_TOKEN']
            });
        }

        const validModels = Array.from(modelImports).filter(m => /^[A-Z]/.test(m) && !['Date', 'Blob', 'File'].includes(m));
        if (validModels.length > 0) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: '../models',
                namedImports: validModels
            });
        }

        sourceFile.addImportDeclaration({
            moduleSpecifier: '../tokens',
            namedImports: [getBasePathTokenName(this.config.clientName)]
        });

        sourceFile.addImportDeclaration({
            moduleSpecifier: '../utils/api-parameter-codec',
            namedImports: ['ApiParameterCodec']
        });
    }

    private addClass(sourceFile: SourceFile, className: string): ClassDeclaration {
        return sourceFile.addClass({
            name: className,
            isExported: true,
            decorators: [{ name: 'Injectable', arguments: [`{ providedIn: 'root' }`] }],
        });
    }

    private addPropertiesAndHelpers(serviceClass: ClassDeclaration): void {
        serviceClass.addProperty({
            name: 'http',
            scope: Scope.Private,
            isReadonly: true,
            initializer: 'inject(HttpClient)'
        });
        serviceClass.addProperty({
            name: 'basePath',
            scope: Scope.Private,
            isReadonly: true,
            type: 'string',
            initializer: `inject(${getBasePathTokenName(this.config.clientName)})`
        });
        const clientContextTokenName = getClientContextTokenName(this.config.clientName);

        serviceClass.addProperty({
            name: "clientContextToken",
            type: `HttpContextToken<string>`,
            scope: Scope.Private,
            isReadonly: true,
            initializer: clientContextTokenName
        });

        serviceClass.addMethod({
            name: "createContextWithClientId",
            scope: Scope.Private,
            parameters: [{ name: 'existingContext', type: 'HttpContext', hasQuestionToken: true }],
            returnType: 'HttpContext',
            statements: `const context = existingContext || new HttpContext();\nreturn context.set(this.clientContextToken, '${this.config.clientName || "default"}');`,
            docs: ["Creates a new HttpContext or enhances an existing one with the client identifier token."],
        });
    }
}
