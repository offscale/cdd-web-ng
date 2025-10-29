// src/service/emit/service/service.generator.ts

import { Project, ClassDeclaration, Scope, SourceFile } from 'ts-morph';
import * as path from 'path';
import { SwaggerParser } from '../../../core/parser.js';
import { GeneratorConfig, PathInfo } from '../../../core/types.js';
import { camelCase, pascalCase, getBasePathTokenName, getClientContextTokenName, hasDuplicateFunctionNames } from '../../../core/utils.js';
import { SERVICE_GENERATOR_HEADER_COMMENT } from '../../../core/constants.js';
import { ServiceMethodGenerator } from './service-method.generator.js';

/**
 * Generates Angular service files, one for each controller (tag) found in the OpenAPI spec.
 */
export class ServiceGenerator {
    private methodGenerator: ServiceMethodGenerator;

    constructor(private parser: SwaggerParser, private project: Project, private config: GeneratorConfig) {
        this.methodGenerator = new ServiceMethodGenerator(config, parser);
    }

    /**
     * FIX: This method now loops over all controller groups and generates a file for each.
     * The old 'generateServiceFile' logic is now contained within the loop.
     */
    public generate(outputDir: string, controllerGroups: Record<string, PathInfo[]>) {
        for (const [controllerName, operations] of Object.entries(controllerGroups)) {
            const fileName = `${camelCase(controllerName)}.service.ts`;
            const filePath = path.join(outputDir, fileName);
            const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

            sourceFile.addStatements(SERVICE_GENERATOR_HEADER_COMMENT);
            const className = `${pascalCase(controllerName)}Service`;

            this.addImports(sourceFile);
            const serviceClass = this.addClass(sourceFile, className);
            this.addPropertiesAndHelpers(serviceClass);

            operations.forEach(op => this.methodGenerator.addServiceMethod(serviceClass, op));

            if (hasDuplicateFunctionNames(serviceClass.getMethods())) {
                throw new Error(`Duplicate method names found in service class ${className}. Please ensure operationIds are unique or use the 'customizeMethodName' option.`);
            }
            sourceFile.fixMissingImports({ importModuleSpecifierPreference: 'relative' });
        }
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
