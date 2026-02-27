import { ClassDeclaration, Project, Scope, SourceFile } from 'ts-morph';
import { SwaggerParser } from '@src/openapi/parse.js';
import { GeneratorConfig, PathInfo, SwaggerDefinition } from '@src/core/types/index.js';
import { getTypeScriptType, isDataTypeInterface, pascalCase } from '@src/functions/utils.js';
import { AbstractServiceGenerator } from '../../../functions/emit_service.js';
import { AxiosServiceMethodGenerator } from './service-method.generator.js';

/**
 * Specialized Service Generator for the axios implementation.
 * It produces an ES class containing axios methods for all mapped OpenAPI endpoints.
 */
export class AxiosServiceGenerator extends AbstractServiceGenerator {
    private methodGenerator: AxiosServiceMethodGenerator;

    /**
     * Instantiates an AxiosServiceGenerator.
     * @param parser The OpenAPI specification parser.
     * @param project The ts-morph project holding the AST.
     * @param config The global generator config object.
     */
    constructor(parser: SwaggerParser, project: Project, config: GeneratorConfig) {
        super(parser, project, config);
        this.methodGenerator = new AxiosServiceMethodGenerator(this.config, this.parser);
    }

    /**
     * Determines the output file name for the generated service class.
     * @param controllerName The canonical group name.
     * @returns The generated TypeScript file name.
     */
    protected getFileName(controllerName: string): string {
        return `${controllerName}.service.ts`;
    }

    /**
     * Discovers all required dependencies and writes import declarations at the top of the output source file.
     * @param sourceFile The generated source file.
     * @param operations The group of paths/operations the service will implement.
     */
    protected generateImports(sourceFile: SourceFile, operations: PathInfo[]): void {
        sourceFile.addImportDeclaration({
            moduleSpecifier: 'axios',
            defaultImport: 'axios',
            namedImports: ['AxiosInstance', 'AxiosRequestConfig'],
        });

        sourceFile.addImportDeclaration({
            moduleSpecifier: '../utils/parameter-serializer',
            namedImports: ['ParameterSerializer'],
        });

        sourceFile.addImportDeclaration({
            moduleSpecifier: '../utils/server-url',
            namedImports: ['getServerUrl', 'resolveServerUrl'],
        });

        const knownTypes = this.parser.schemas.map(s => s.name);
        const modelImports = new Set<string>();

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
        if (validModels.length > 0) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: '../models',
                namedImports: validModels,
            });
        }
    }

    /**
     * Builds the service class skeleton and populates its member variables and methods.
     * @param sourceFile The generated source file.
     * @param controllerName The canonical group name.
     * @param operations The group of paths/operations the service will implement.
     */
    protected generateServiceContent(sourceFile: SourceFile, controllerName: string, operations: PathInfo[]): void {
        const className = `${pascalCase(controllerName)}Service`;

        const serviceClass = sourceFile.addClass({
            name: className,
            isExported: true,
        });

        this.addPropertiesAndHelpers(serviceClass);

        for (const op of operations) {
            this.methodGenerator.addServiceMethod(serviceClass, op);
        }
    }

    /**
     * Injects the standard variables (e.g. `basePath`, `axiosInstance`) and constructor logic.
     * @param serviceClass The `ts-morph` class representation of the service.
     */
    private addPropertiesAndHelpers(serviceClass: ClassDeclaration): void {
        serviceClass.addProperty({
            name: 'basePath',
            scope: Scope.Private,
            initializer: '""',
        });

        serviceClass.addProperty({
            name: 'axiosInstance',
            scope: Scope.Private,
            type: 'AxiosInstance',
        });

        serviceClass.addConstructor({
            parameters: [
                { name: 'basePath', type: 'string', hasQuestionToken: true },
                { name: 'axiosInstance', type: 'AxiosInstance', hasQuestionToken: true },
            ],
            statements: [
                'this.basePath = basePath || getServerUrl(0, {});',
                'this.axiosInstance = axiosInstance || axios.create();',
            ],
        });
    }
}
