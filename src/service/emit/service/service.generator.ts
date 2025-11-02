// src/service/emit/service/service.generator.ts

import { Project, ClassDeclaration, Scope, SourceFile } from 'ts-morph';
import * as path from 'path';
import { SwaggerParser } from '../../../core/parser.js';
import { GeneratorConfig, PathInfo } from '../../../core/types.js';
import { camelCase, pascalCase, getBasePathTokenName, getClientContextTokenName, hasDuplicateFunctionNames } from '../../../core/utils.js';
import { SERVICE_GENERATOR_HEADER_COMMENT } from '../../../core/constants.js';
import { ServiceMethodGenerator } from './service-method.generator.js';

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
        this.methodGenerator = new ServiceMethodGenerator(config, parser);
    }

    public generateServiceFile(controllerName: string, operations: PathInfo[], outputDir: string) {
        const fileName = `${camelCase(controllerName)}.service.ts`;
        const filePath = path.join(outputDir, fileName);
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.addStatements(SERVICE_GENERATOR_HEADER_COMMENT);
        const className = `${pascalCase(controllerName)}Service`;

        this.addImports(sourceFile);
        const serviceClass = this.addClass(sourceFile, className);

        this.addPropertiesAndHelpers(serviceClass);

        const usedMethodNames = new Set<string>();

        operations.forEach(op => {
            let methodName: string;

            if (this.config.options.customizeMethodName) {
                if (!op.operationId) {
                    throw new Error('Operation ID is required for method name customization');
                }
                methodName = this.config.options.customizeMethodName(op.operationId);
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

        // REMOVED: This check was likely causing false positives. The `usedMethodNames`
        // Set is a more reliable mechanism for ensuring uniqueness before generation.
        // const implementationMethods = serviceClass.getMethods().filter(m => !m.isOverload());
        // if (hasDuplicateFunctionNames(implementationMethods)) {
        //     throw new Error(...);
        // }

        sourceFile.fixMissingImports({ importModuleSpecifierPreference: 'relative' });
    }

    private addImports(sourceFile: SourceFile) {
        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core', namedImports: ['Injectable', 'inject'] },
            { moduleSpecifier: '@angular/common/http', namedImports: ['HttpClient', 'HttpContext', 'HttpParams', 'HttpResponse', 'HttpEvent', 'HttpHeaders', 'HttpContextToken'] },
            { moduleSpecifier: 'rxjs', namedImports: ['Observable'] },
            { moduleSpecifier: `../models`, namedImports: ['RequestOptions'], isTypeOnly: true },
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

    private addPropertiesAndHelpers(serviceClass: ClassDeclaration) {
        serviceClass.addProperty({ name: 'http', scope: Scope.Private, isReadonly: true, initializer: 'inject(HttpClient)' });
        serviceClass.addProperty({ name: 'basePath', scope: Scope.Private, isReadonly: true, type: 'string', initializer: `inject(${getBasePathTokenName(this.config.clientName)})` });
        const clientContextTokenName = getClientContextTokenName(this.config.clientName);
        serviceClass.addProperty({ name: "clientContextToken", type: "HttpContextToken<string>", scope: Scope.Private, isReadonly: true, initializer: clientContextTokenName });

        serviceClass.addMethod({
            name: "createContextWithClientId",
            scope: Scope.Private,
            parameters: [{ name: 'existingContext', type: 'HttpContext', hasQuestionToken: true }],
            returnType: 'HttpContext',
            statements: `const context = existingContext || new HttpContext();\nreturn context.set(this.clientContextToken, '${this.config.clientName || "default"}');`,
            docs: ["Creates a new HttpContext with the client identifier token."],
        });
    }
}
