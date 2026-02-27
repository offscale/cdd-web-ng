import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { extractPaths, getRequestBodyType, getResponseType, pascalCase } from '@src/functions/utils.js';
import { PathInfo, PathItem } from '@src/core/types/index.js';

/**
 * Generates the `callbacks.ts` file.
 * This file exports TypeScript interfaces for all Callbacks defined in the OAS spec.
 * This allows consumers to strongly type the data they receive from webhooks.
 */
export class CallbackGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, 'callbacks.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        // Import models needed for callback payloads
        const requiredModels = new Set<string>();
        const registerModel = (type: string) => {
            // Rudimentary check if it looks like a model (PascalCase)
            if (
                type &&
                type !== 'any' &&
                /^[A-Z]/.test(type) &&
                !['Date', 'Blob', 'File'].includes(type) &&
                !type.includes('{')
            ) {
                // Strip array [] suffixes
                const modelName = type.replace(/\[\]/g, '');
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
        }[] = [];
        const declaredTypeAliases = new Set<string>();

        const addTypeAliasOnce = (name: string, type: string, docs: string[]) => {
            if (declaredTypeAliases.has(name)) return;
            declaredTypeAliases.add(name);
            sourceFile.addTypeAlias({
                isExported: true,
                name,
                type,
                docs,
            });
        };

        const processCallbackMap = (
            callbackName: string,
            callbackMapOrRef: PathItem | { $ref: string } | Record<string, PathItem>,
            scope: 'component' | 'operation',
        ) => {
            const resolved = this.parser.resolve(callbackMapOrRef as any) as Record<string, PathItem>;
            if (!resolved) return;

            // A callback Map is URL Expression -> Path Item.
            Object.entries(resolved).forEach(([urlExpression, pathItemObj]) => {
                const callbackPathItem = pathItemObj as PathItem;
                const subPaths = this.processCallbackPathItem(urlExpression, callbackPathItem);

                subPaths.forEach(sub => {
                    const requestType = getRequestBodyType(
                        sub.requestBody,
                        this.parser.config,
                        this.parser.schemas.map(s => s.name),
                    );
                    const responseKeys = Object.keys(sub.responses!);
                    const responseType = getResponseType(
                        sub.responses![responseKeys[0]],
                        this.parser.config,
                        this.parser.schemas.map(s => s.name),
                    );

                    registerModel(requestType);

                    const interfaceName = `${pascalCase(callbackName)}${pascalCase(sub.method)}Payload`;
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

                    addTypeAliasOnce(interfaceName, requestType, [
                        `Payload definition for callback '${callbackName}' (${sub.method}).`,
                    ]);
                });
            });
        };

        // Iterate all operations to find callbacks
        this.parser.operations.forEach(op => {
            if (!op.callbacks) return;
            Object.entries(op.callbacks).forEach(([callbackName, pathItemOrRef]) => {
                processCallbackMap(callbackName, pathItemOrRef as any, 'operation');
            });
        });

        // Include component-level callbacks (OAS 3.2)
        const componentCallbacks = this.parser.spec.components?.callbacks ?? {};
        Object.entries(componentCallbacks).forEach(([callbackName, callbackOrRef]) => {
            processCallbackMap(callbackName, callbackOrRef as any, 'component');
        });

        if (callbacksFound.length > 0) {
            const modelsImport = Array.from(requiredModels);
            if (modelsImport.length > 0) {
                sourceFile.addImportDeclaration({
                    moduleSpecifier: './models',
                    namedImports: modelsImport,
                });
            }

            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: 'API_CALLBACKS',
                        initializer: JSON.stringify(
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
            sourceFile.addStatements('export {};');
        }

        sourceFile.formatText();
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }

    private processCallbackPathItem(urlKey: string, pathItem: PathItem): PathInfo[] {
        const tempMap = { [urlKey]: pathItem };
        // Pass the main components to ensure security resolution logic within callbacks
        // follows similar rules, although callbacks rarely define security schemes inline implicitly.
        const resolveRef = (ref: string) => this.parser.resolveReference(ref);
        const resolveObj = (obj: unknown) => this.parser.resolve(obj as any);
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
