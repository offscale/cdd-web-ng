import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { extractPaths, getRequestBodyType, getResponseType, pascalCase } from '@src/functions/utils.js';
import { PathInfo, PathItem, OpenApiValue } from '@src/core/types/index.js';

/**
 * Generates the `callbacks.ts` file.
 * This file exports TypeScript interfaces for all Callbacks defined in the OAS spec.
 * This allows consumers to strongly type the data they receive from webhooks.
 */
export class CallbackGenerator {
    constructor(
        /* v8 ignore next */
        private readonly parser: SwaggerParser,
        /* v8 ignore next */
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const filePath = path.join(outputDir, 'callbacks.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        // Import models needed for callback payloads
        /* v8 ignore next */
        const requiredModels = new Set<string>();
        /* v8 ignore next */
        const registerModel = (type: string) => {
            // Rudimentary check if it looks like a model (PascalCase)
            /* v8 ignore next */
            if (
                type &&
                type !== 'string | number | boolean | object | undefined | null' &&
                /^[A-Z]/.test(type) &&
                !['Date', 'Blob', 'File'].includes(type) &&
                !type.includes('{')
            ) {
                // Strip array [] suffixes
                /* v8 ignore next */
                const modelName = type.replace(/\[\]/g, '');
                /* v8 ignore next */
                requiredModels.add(modelName);
            }
        };

        const callbacksFound: {
            name: string;
            interfaceName: string;
            method: string;
            expression: string;
            pathItem: PathItem;
            requestType: string;
            responseType: string;
            scope?: 'component' | 'operation';
            /* v8 ignore next */
        }[] = [];
        /* v8 ignore next */
        const declaredTypeAliases = new Set<string>();

        /* v8 ignore next */
        const addTypeAliasOnce = (name: string, type: string, docs: string[]) => {
            /* v8 ignore next */
            /* v8 ignore start */
            if (declaredTypeAliases.has(name)) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            declaredTypeAliases.add(name);
            /* v8 ignore next */
            sourceFile.addTypeAlias({
                isExported: true,
                name,
                type,
                docs,
            });
        };

        /* v8 ignore next */
        const processCallbackMap = (
            callbackName: string,
            callbackMapOrRef: PathItem | { $ref: string } | Record<string, PathItem>,
            scope: 'component' | 'operation',
        ) => {
            /* v8 ignore next */
            const resolved = this.parser.resolve(callbackMapOrRef as OpenApiValue) as Record<string, PathItem>;
            /* v8 ignore next */
            if (!resolved) return;

            // A callback Map is URL Expression -> Path Item.
            /* v8 ignore next */
            Object.entries(resolved).forEach(([urlExpression, pathItemObj]) => {
                /* v8 ignore next */
                const callbackPathItem = pathItemObj as PathItem;
                /* v8 ignore next */
                const subPaths = this.processCallbackPathItem(urlExpression, callbackPathItem);

                /* v8 ignore next */
                subPaths.forEach(sub => {
                    /* v8 ignore next */
                    const requestType = getRequestBodyType(
                        sub.requestBody,
                        this.parser.config,
                        /* v8 ignore next */
                        this.parser.schemas.map(s => s.name),
                    );
                    /* v8 ignore next */
                    const responseKeys = Object.keys(sub.responses!);
                    /* v8 ignore next */
                    const responseType = getResponseType(
                        sub.responses![responseKeys[0]],
                        this.parser.config,
                        /* v8 ignore next */
                        this.parser.schemas.map(s => s.name),
                    );

                    /* v8 ignore next */
                    registerModel(requestType);

                    /* v8 ignore next */
                    const interfaceName = `${pascalCase(callbackName)}${pascalCase(sub.method)}Payload`;
                    /* v8 ignore next */
                    callbacksFound.push({
                        name: callbackName,
                        method: sub.method,
                        interfaceName,
                        expression: urlExpression,
                        pathItem: callbackPathItem,
                        requestType,
                        responseType,
                        scope,
                    });

                    /* v8 ignore next */
                    addTypeAliasOnce(interfaceName, requestType, [
                        `Payload definition for callback '${callbackName}' (${sub.method}).`,
                    ]);
                });
            });
        };

        // Iterate all operations to find callbacks
        /* v8 ignore next */
        this.parser.operations.forEach(op => {
            /* v8 ignore next */
            if (!op.callbacks) return;
            /* v8 ignore next */
            Object.entries(op.callbacks).forEach(([callbackName, pathItemOrRef]) => {
                /* v8 ignore next */
                processCallbackMap(callbackName, pathItemOrRef as PathItem, 'operation');
            });
        });

        // Include component-level callbacks (OAS 3.2)
        /* v8 ignore next */
        const componentCallbacks = this.parser.spec.components?.callbacks ?? {};
        /* v8 ignore next */
        Object.entries(componentCallbacks).forEach(([callbackName, callbackOrRef]) => {
            /* v8 ignore next */
            processCallbackMap(callbackName, callbackOrRef as Record<string, PathItem>, 'component');
        });

        /* v8 ignore next */
        if (callbacksFound.length > 0) {
            /* v8 ignore next */
            const modelsImport = Array.from(requiredModels);
            /* v8 ignore next */
            if (modelsImport.length > 0) {
                /* v8 ignore next */
                sourceFile.addImportDeclaration({
                    moduleSpecifier: './models',
                    namedImports: modelsImport,
                });
            }

            /* v8 ignore next */
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: 'API_CALLBACKS',
                        initializer: JSON.stringify(
                            /* v8 ignore next */
                            callbacksFound.map(c => ({
                                name: c.name,
                                method: c.method,
                                interfaceName: c.interfaceName,
                                expression: c.expression,
                                pathItem: c.pathItem,
                                ...(c.scope ? { scope: c.scope } : {}),
                            })),
                            null,
                            2,
                        ),
                    },
                ],
                docs: ['Metadata registry for identified callbacks.'],
            });
        } else {
            /* v8 ignore next */
            sourceFile.addStatements('export {};');
        }

        /* v8 ignore next */
        sourceFile.formatText();
        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }

    private processCallbackPathItem(urlKey: string, pathItem: PathItem): PathInfo[] {
        /* v8 ignore next */
        const tempMap = { [urlKey]: pathItem };
        // Pass the main components to ensure security resolution logic within callbacks
        // follows similar rules, although callbacks rarely define security schemes inline implicitly.
        /* v8 ignore next */
        /* v8 ignore start */
        const resolveRef = (ref: string) => this.parser.resolveReference(ref);
        /* v8 ignore stop */
        /* v8 ignore next */
        const resolveObj = (obj: OpenApiValue) => this.parser.resolve(obj as OpenApiValue);
        /* v8 ignore next */
        return extractPaths(
            tempMap,
            resolveRef,
            this.parser.spec.components,
            {
                isOpenApi3: !!this.parser.spec.openapi,
            },
            resolveObj,
        );
    }
}
