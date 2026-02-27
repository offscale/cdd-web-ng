import { ClassDeclaration, Project, Scope, SourceFile } from 'ts-morph';
import { SwaggerParser } from '@src/openapi/parse.js';
import { GeneratorConfig, PathInfo, SwaggerDefinition } from '@src/core/types/index.js';
import { getTypeScriptType, isDataTypeInterface, pascalCase } from '@src/functions/utils.js';
import { AbstractServiceGenerator } from '../../../functions/emit_service.js';
import { NodeServiceMethodGenerator } from './service-method.generator.js';

/**
 * Specialized Service Generator for the Node.js implementation.
 * It produces an ES class containing node methods for all mapped OpenAPI endpoints.
 */
export class NodeServiceGenerator extends AbstractServiceGenerator {
    private methodGenerator: NodeServiceMethodGenerator;

    /**
     * Instantiates an NodeServiceGenerator.
     * @param parser The OpenAPI specification parser.
     * @param project The ts-morph project holding the AST.
     * @param config The global generator config object.
     */
    constructor(parser: SwaggerParser, project: Project, config: GeneratorConfig) {
        super(parser, project, config);
        this.methodGenerator = new NodeServiceMethodGenerator(this.config, this.parser);
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
            moduleSpecifier: 'node:http',
            namespaceImport: 'http',
        });

        sourceFile.addImportDeclaration({
            moduleSpecifier: 'node:https',
            namespaceImport: 'https',
        });

        sourceFile.addImportDeclaration({
            moduleSpecifier: 'node:url',
            namedImports: ['URL'],
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
     * Injects the standard variables (e.g. `basePath`) and constructor logic.
     * @param serviceClass The `ts-morph` class representation of the service.
     */
    private addPropertiesAndHelpers(serviceClass: ClassDeclaration): void {
        serviceClass.addProperty({
            name: 'basePath',
            scope: Scope.Private,
            initializer: '""',
        });

        serviceClass.addConstructor({
            parameters: [{ name: 'basePath', type: 'string', hasQuestionToken: true }],
            statements: ['this.basePath = basePath || getServerUrl(0, {});'],
        });
    }
}
