import { Project, ClassDeclaration, Scope, SourceFile } from 'ts-morph';
import * as path from 'path';
import { SwaggerParser } from '../../../core/parser.js';
import { GeneratorConfig, PathInfo } from '../../../core/types.js';
import { camelCase, pascalCase, getBasePathTokenName, getClientContextTokenName, isDataTypeInterface, getTypeScriptType } from '../../../core/utils.js';
import { SERVICE_GENERATOR_HEADER_COMMENT } from '../../../core/constants.js';
import { ServiceMethodGenerator } from './service-method.generator.js';

/**
 * Derives a suffix for a method name from a URL path.
 * e.g., `/users/{id}/posts` becomes `UsersByIdPosts`.
 * @param path The URL path string.
 * @returns A PascalCase string representing the path structure.
 */
function path_to_method_name_suffix(path: string): string {
    return path.split('/').filter(Boolean).map(segment => {
        if (segment.startsWith('{') && segment.endsWith('}')) {
            return `By${pascalCase(segment.slice(1, -1))}`;
        }
        return pascalCase(segment);
    }).join('');
}

/**
 * Generates an Angular service class file for a specific controller (group of operations).
 * It orchestrates the creation of the file, its imports, the class structure, and delegates
 * the generation of individual methods to the `ServiceMethodGenerator`.
 */
export class ServiceGenerator {
    private methodGenerator: ServiceMethodGenerator;

    /**
     * Initializes a new instance of the `ServiceGenerator`.
     * @param parser The `SwaggerParser` instance for accessing the spec.
     * @param project The `ts-morph` project instance.
     * @param config The global generator configuration.
     */
    constructor(private parser: SwaggerParser, private project: Project, private config: GeneratorConfig) {
        this.methodGenerator = new ServiceMethodGenerator(this.config, this.parser);
    }

    /**
     * Generates a complete service file for a given controller and its operations.
     * This is the main public method of the class. It handles file creation,
     * import analysis, class scaffolding, and method name de-duplication before
     * delegating to the `ServiceMethodGenerator` for each operation.
     *
     * @param controllerName The PascalCase name of the controller (e.g., 'Users').
     * @param operations An array of `PathInfo` objects belonging to this controller.
     * @param outputDir The directory where the service file will be saved.
     */
    public generateServiceFile(controllerName: string, operations: PathInfo[], outputDir: string): void {
        const fileName = `${camelCase(controllerName)}.service.ts`;
        const filePath = path.join(outputDir, fileName);
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.addStatements(SERVICE_GENERATOR_HEADER_COMMENT);
        const className = `${pascalCase(controllerName)}Service`;
        const knownTypes = this.parser.schemas.map(s => s.name);
        const modelImports = new Set<string>(['RequestOptions']);

        // Discover all model types that need to be imported.
        for (const op of operations) {
            const successResponse = op.responses?.['200'] ?? op.responses?.['201'];
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

            // De-duplicate method names to avoid compilation errors
            let uniqueMethodName = methodName;
            let counter = 1;
            while (usedMethodNames.has(uniqueMethodName)) {
                uniqueMethodName = `${methodName}${++counter}`;
            }
            usedMethodNames.add(uniqueMethodName);
            op.methodName = uniqueMethodName; // Store the final name for the method generator

            this.methodGenerator.addServiceMethod(serviceClass, op);
        });
    }

    private addImports(sourceFile: SourceFile, modelImports: Set<string>): void {
        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core', namedImports: ['Injectable', 'inject'] },
            { moduleSpecifier: '@angular/common/http', namedImports: ['HttpClient', 'HttpContext', 'HttpParams', 'HttpResponse', 'HttpEvent'] },
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
        serviceClass.addProperty({ name: "clientContextToken", type: `import("@angular/common/http").HttpContextToken<string>`, scope: Scope.Private, isReadonly: true, initializer: clientContextTokenName });

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
