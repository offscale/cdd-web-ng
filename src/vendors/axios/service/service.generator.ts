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
        /* v8 ignore next */
        super(parser, project, config);
        /* v8 ignore next */
        this.methodGenerator = new AxiosServiceMethodGenerator(this.config, this.parser);
    }

    /**
     * Determines the output file name for the generated service class.
     * @param controllerName The canonical group name.
     * @returns The generated TypeScript file name.
     */
    protected getFileName(controllerName: string): string {
        /* v8 ignore next */
        return `${controllerName}.service.ts`;
    }

    /**
     * Discovers all required dependencies and writes import declarations at the top of the output source file.
     * @param sourceFile The generated source file.
     * @param operations The group of paths/operations the service will implement.
     */
    protected generateImports(sourceFile: SourceFile, operations: PathInfo[]): void {
        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: 'axios',
            defaultImport: 'axios',
            namedImports: ['AxiosInstance', 'AxiosRequestConfig'],
        });

        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: '../utils/parameter-serializer',
            namedImports: ['ParameterSerializer'],
        });

        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: '../utils/server-url',
            namedImports: ['getServerUrl', 'resolveServerUrl'],
        });

        /* v8 ignore next */
        const knownTypes = this.parser.schemas.map(s => s.name);
        /* v8 ignore next */
        const modelImports = new Set<string>();

        /* v8 ignore next */
        for (const op of operations) {
            /* v8 ignore next */
            for (const resp of Object.values(op.responses!)) {
                /* v8 ignore next */
                if (resp.content) {
                    /* v8 ignore next */
                    Object.values(resp.content).forEach(media => {
                        /* v8 ignore next */
                        const schema = media?.schema ?? media?.itemSchema;
                        /* v8 ignore next */
                        if (!schema) return;
                        /* v8 ignore next */
                        const typeName = getTypeScriptType(
                            schema as SwaggerDefinition,
                            this.config,
                            knownTypes,
                        ).replace(/\[\]| \| null/g, '');
                        /* v8 ignore next */
                        if (isDataTypeInterface(typeName)) {
                            /* v8 ignore next */
                            modelImports.add(typeName);
                        }
                    });
                }
            }

            /* v8 ignore next */
            op.parameters!.forEach(param => {
                /* v8 ignore next */
                const paramType = getTypeScriptType(param.schema as SwaggerDefinition, this.config, knownTypes).replace(
                    /\[\]| \| null/g,
                    '',
                );
                /* v8 ignore next */
                if (isDataTypeInterface(paramType)) {
                    /* v8 ignore next */
                    modelImports.add(paramType);
                }
            });

            /* v8 ignore next */
            if (op.requestBody?.content?.['application/json']?.schema) {
                /* v8 ignore next */
                const bodyType = getTypeScriptType(
                    op.requestBody.content['application/json'].schema as SwaggerDefinition,
                    this.config,
                    knownTypes,
                ).replace(/\[\]| \| null/g, '');
                /* v8 ignore next */
                if (isDataTypeInterface(bodyType)) {
                    /* v8 ignore next */
                    modelImports.add(bodyType);
                }
            }
        }

        /* v8 ignore next */
        const validModels = Array.from(modelImports).filter(
            /* v8 ignore next */
            (m: string) => /^[A-Z]/.test(m) && !['Date', 'Blob', 'File'].includes(m),
        );
        /* v8 ignore next */
        if (validModels.length > 0) {
            /* v8 ignore next */
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
        /* v8 ignore next */
        const className = `${pascalCase(controllerName)}Service`;

        /* v8 ignore next */
        const serviceClass = sourceFile.addClass({
            name: className,
            isExported: true,
        });

        /* v8 ignore next */
        this.addPropertiesAndHelpers(serviceClass);

        /* v8 ignore next */
        for (const op of operations) {
            /* v8 ignore next */
            this.methodGenerator.addServiceMethod(serviceClass, op);
        }
    }

    /**
     * Injects the standard variables (e.g. `basePath`, `axiosInstance`) and constructor logic.
     * @param serviceClass The `ts-morph` class representation of the service.
     */
    private addPropertiesAndHelpers(serviceClass: ClassDeclaration): void {
        /* v8 ignore next */
        serviceClass.addProperty({
            name: 'basePath',
            scope: Scope.Private,
            initializer: '""',
        });

        /* v8 ignore next */
        serviceClass.addProperty({
            name: 'axiosInstance',
            scope: Scope.Private,
            type: 'AxiosInstance',
        });

        /* v8 ignore next */
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
