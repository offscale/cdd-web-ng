// src/service/emit/service/service.generator.ts

import { Project, ClassDeclaration, Scope, SourceFile } from 'ts-morph';
import * as path from 'path';
import { SwaggerParser } from '../../../core/parser.js';
import { GeneratorConfig, PathInfo } from '../../../core/types.js';
import { camelCase, pascalCase, getBasePathTokenName, getClientContextTokenName, isDataTypeInterface, getTypeScriptType } from '../../../core/utils.js';
import { SERVICE_GENERATOR_HEADER_COMMENT } from '../../../core/constants.js';
import { ServiceMethodGenerator } from './service-method.generator.js';

// ... (keep path_to_method_name_suffix function as is) ...
function path_to_method_name_suffix(path: string): string {
    return path.split('/').filter(Boolean).map(segment => {
        if (segment.startsWith('{') && segment.endsWith('}')) {
            return `By${pascalCase(segment.slice(1, -1))}`;
        }
        return pascalCase(segment);
    }).join('');
}

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

        // ... (keep model import discovery logic as is) ...
        for (const op of operations) {
            const successResponse = op.responses?.['200'] ?? op.responses?.['201'] ?? op.responses?.['default'];
            if (successResponse?.content?.['application/json']?.schema) {
                const responseType = getTypeScriptType(successResponse.content['application/json'].schema as any, this.config, knownTypes).replace(/\[\]| \| null/g, '');
                if (isDataTypeInterface(responseType)) {
                    modelImports.add(responseType);
                }
            }

            (op.parameters ?? []).forEach(param => {
                const schemaObject = param.schema ? param.schema : param;
                const paramType = getTypeScriptType(schemaObject as any, this.config, knownTypes).replace(/\[\]| \| null/g, '');
                if (isDataTypeInterface(paramType)) {
                    modelImports.add(paramType);
                }
            });

            if (op.requestBody?.content?.['application/json']?.schema) {
                const bodyType = getTypeScriptType(op.requestBody.content['application/json'].schema as any, this.config, knownTypes).replace(/\[\]| \| null/g, '');
                if (isDataTypeInterface(bodyType)) {
                    modelImports.add(bodyType);
                }
            }
        }

        this.addImports(sourceFile, modelImports);
        const serviceClass = this.addClass(sourceFile, className);
        this.addPropertiesAndHelpers(serviceClass);

        const usedMethodNames = new Set<string>();
        operations.forEach(op => {
            let methodName: string;
            const customizer = this.config.options?.customizeMethodName;
            if (customizer && op.operationId) {
                methodName = customizer(op.operationId);
            } else {
                methodName = op.operationId
                    ? camelCase(op.operationId)
                    : `${op.method.toLowerCase()}${path_to_method_name_suffix(op.path)}`;
            }

            let uniqueMethodName = methodName;
            let counter = 1;
            while (usedMethodNames.has(uniqueMethodName)) {
                uniqueMethodName = `${methodName}${++counter}`;
            }
            usedMethodNames.add(uniqueMethodName);
            op.methodName = uniqueMethodName;

            this.methodGenerator.addServiceMethod(serviceClass, op);
        });
    }

    private addImports(sourceFile: SourceFile, modelImports: Set<string>): void {
        sourceFile.addImportDeclarations([
            // **FIX**: Added `HttpHeaders` to the imports for use in the method generator.
            { moduleSpecifier: '@angular/core', namedImports: ['Injectable', 'inject'] },
            { moduleSpecifier: '@angular/common/http', namedImports: ['HttpClient', 'HttpContext', 'HttpParams', 'HttpResponse', 'HttpEvent', 'HttpHeaders', 'HttpContextToken'] },
            { moduleSpecifier: 'rxjs', namedImports: ['Observable'] },
            { moduleSpecifier: `../models`, namedImports: Array.from(modelImports) },
            { moduleSpecifier: `../tokens`, namedImports: [getBasePathTokenName(this.config.clientName), getClientContextTokenName(this.config.clientName)] },
            { moduleSpecifier: `../utils/http-params-builder`, namedImports: ['HttpParamsBuilder'] },
        ]);
    }

    private addClass(sourceFile: SourceFile, className: string): ClassDeclaration {
        return sourceFile.addClass({
            name: className,
            isExported: true,
            decorators: [{ name: 'Injectable', arguments: [`{ providedIn: 'root' }`] }],
        });
    }

    private addPropertiesAndHelpers(serviceClass: ClassDeclaration): void {
        serviceClass.addProperty({ name: 'http', scope: Scope.Private, isReadonly: true, initializer: 'inject(HttpClient)' });
        serviceClass.addProperty({ name: 'basePath', scope: Scope.Private, isReadonly: true, type: 'string', initializer: `inject(${getBasePathTokenName(this.config.clientName)})` });
        const clientContextTokenName = getClientContextTokenName(this.config.clientName);

        // **FIX**: Correctly type the property without an inline import().
        serviceClass.addProperty({ name: "clientContextToken", type: `HttpContextToken<string>`, scope: Scope.Private, isReadonly: true, initializer: clientContextTokenName });

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
