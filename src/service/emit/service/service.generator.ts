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
            // Method name de-duplication and assignment is now handled in `groupPathsByController`
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
            { moduleSpecifier: `../utils/http-params-builder`, namedImports: ['HttpParamsBuilder'] },
        ]);

        // Logic to determine which auth tokens are needed
        const authTokensToImport = new Set<string>();

        // If any operation has securityOverride (empty security list) AND global security exists
        const hasSecurityOverrides = operations.some(op => op.security && op.security.length === 0);
        const hasGlobalSecurity = Object.keys(this.parser.getSecuritySchemes()).length > 0;

        if (hasSecurityOverrides && hasGlobalSecurity) {
            authTokensToImport.add('SKIP_AUTH_CONTEXT_TOKEN');
        }

        // data structure of op.security: { [schemeName: string]: string[] }[]
        const hasScopes = operations.some(op =>
            op.security?.some(s => Object.values(s).some(scopes => scopes.length > 0))
        );

        if (hasScopes) {
            authTokensToImport.add('AUTH_SCOPES_CONTEXT_TOKEN');
        }

        if (authTokensToImport.size > 0) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: `../auth/auth.tokens`,
                namedImports: Array.from(authTokensToImport)
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
