// src/service/emit/service/service.generator.ts

import { ClassDeclaration, Project, Scope, SourceFile } from 'ts-morph';
import * as path from 'node:path';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, PathInfo } from '@src/core/types.js';
import {
    camelCase,
    getBasePathTokenName,
    getClientContextTokenName,
    getTypeScriptType,
    isDataTypeInterface,
    pascalCase
} from '@src/core/utils.js';
import { SERVICE_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';
import { ServiceMethodGenerator } from './service-method.generator.js';

export class ServiceGenerator {
    private methodGenerator: ServiceMethodGenerator;

    constructor(private parser: SwaggerParser, private project: Project, private config: GeneratorConfig) {
        this.methodGenerator = new ServiceMethodGenerator(this.config, this.parser);
    }

    public generateServiceFile(controllerName: string, operations: PathInfo[], outputDir: string): void {
        const fileName = `${camelCase(controllerName)}.service.ts`;
        const filePath = path.join(outputDir, fileName);
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.addStatements(SERVICE_GENERATOR_HEADER_COMMENT);
        const className = `${pascalCase(controllerName)}Service`;
        const knownTypes = this.parser.schemas.map(s => s.name);
        const modelImports = new Set<string>(['RequestOptions']);

        for (const op of operations) {
            const successResponse = op.responses?.['200'] ?? op.responses?.['201'] ?? op.responses?.['default'];
            if (successResponse?.content?.['application/json']?.schema) {
                const responseType = getTypeScriptType(successResponse.content['application/json'].schema, this.config, knownTypes).replace(/\[\]| \| null/g, '');
                if (isDataTypeInterface(responseType)) {
                    modelImports.add(responseType);
                }
            }

            (op.parameters ?? []).forEach(param => {
                // The extractPaths function ensures that param.schema is always populated.
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

        operations.forEach(op => {
            this.methodGenerator.addServiceMethod(serviceClass, op);
        });
    }

    private addImports(sourceFile: SourceFile, modelImports: Set<string>, operations: PathInfo[]): void {
        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core', namedImports: ['Injectable', 'inject'] },
            {
                moduleSpecifier: '@angular/common/http',
                namedImports: ['HttpClient', 'HttpContext', 'HttpParams', 'HttpResponse', 'HttpEvent', 'HttpHeaders', 'HttpContextToken']
            },
            { moduleSpecifier: 'rxjs', namedImports: ['Observable'] },
            { moduleSpecifier: `../models`, namedImports: Array.from(modelImports) },
            {
                moduleSpecifier: `../tokens`,
                namedImports: [getBasePathTokenName(this.config.clientName), getClientContextTokenName(this.config.clientName)]
            },
            // REQUIRED: Import ApiParameterCodec here so synthesized method bodies can reference it
            { moduleSpecifier: `../utils/http-params-builder`, namedImports: ['HttpParamsBuilder', 'ApiParameterCodec'] },
        ]);

        // Detect if XmlBuilder or MultipartBuilder are needed
        const needsXmlBuilder = operations.some(op =>
            !!op.requestBody?.content?.['application/xml'] ||
            (op.parameters && op.parameters.some(p => !!p.content?.['application/xml']))
        );

        const needsMultipartBuilder = operations.some(op => !!op.requestBody?.content?.['multipart/form-data']);

        if (needsXmlBuilder) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: `../utils/xml-builder`,
                namedImports: ['XmlBuilder']
            });
        }

        if (needsMultipartBuilder) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: `../utils/multipart-builder`,
                namedImports: ['MultipartBuilder']
            });
        }

        // Check if ANY operation requires security.
        // If an operation's effective security is non-empty, it will generate a `.set(SECURITY_CONTEXT_TOKEN, ...)` call.
        // If effective security is empty (default or explicit override []), no call is generated, so no import needed.
        const globalSecurity = this.parser.getSpec().security || [];

        const needsSecurityToken = operations.some(op => {
            // Calculate effective security for this operation as ServiceMethodGenerator does
            const effectiveSecurity = op.security !== undefined ? op.security : globalSecurity;
            return effectiveSecurity.length > 0;
        });

        if (needsSecurityToken) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: `../auth/auth.tokens`,
                namedImports: ['SECURITY_CONTEXT_TOKEN']
            });
        }
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
