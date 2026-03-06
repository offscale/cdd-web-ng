import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { extractPaths, getRequestBodyType, getResponseType, pascalCase } from '@src/functions/utils.js';
import { PathInfo, PathItem, OpenApiValue } from '@src/core/types/index.js';

export class WebhookGenerator {
    constructor(
        /* v8 ignore next */
        private readonly parser: SwaggerParser,
        /* v8 ignore next */
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const filePath = path.join(outputDir, 'webhooks.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        const requiredModels = new Set<string>();
        /* v8 ignore next */
        const registerModel = (type: string) => {
            /* v8 ignore next */
            if (
                type &&
                type !== 'unknown' &&
                /^[A-Z]/.test(type) &&
                !['Date', 'Blob', 'File'].includes(type) &&
                !type.includes('{') &&
                !type.includes('<')
            ) {
                /* v8 ignore next */
                const modelName = type.replace(/\[\]/g, '');
                /* v8 ignore next */
                requiredModels.add(modelName);
            }
        };

        const webhooksFound: {
            name: string;
            interfaceName: string;
            method: string;
            pathItem: PathItem;
            requestType: string;
            responseType: string;
            scope?: 'root' | 'component';
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
        const processWebhookEntry = (
            webhookName: string,
            pathItemOrRef: PathItem | { $ref: string },
            scope: 'root' | 'component',
        ) => {
            /* v8 ignore next */
            const resolved = this.parser.resolve(pathItemOrRef) as PathItem;
            /* v8 ignore next */
            if (!resolved) return;

            /* v8 ignore next */
            const webhookPathItem = resolved;
            /* v8 ignore next */
            const subPaths = this.processWebhookPathItem(webhookName, webhookPathItem);

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
                const interfaceName = `${pascalCase(webhookName)}${pascalCase(sub.method)}Payload`;
                /* v8 ignore next */
                webhooksFound.push({
                    name: webhookName,
                    method: sub.method,
                    interfaceName,
                    pathItem: webhookPathItem,
                    requestType,
                    responseType,
                    scope,
                });

                /* v8 ignore next */
                addTypeAliasOnce(interfaceName, requestType, [
                    `Payload definition for webhook '${webhookName}' (${sub.method}).`,
                ]);
            });
        };

        /* v8 ignore next */
        const rootWebhooks = this.parser.spec.webhooks || {};
        /* v8 ignore next */
        Object.entries(rootWebhooks).forEach(([webhookName, pathItemOrRef]) => {
            /* v8 ignore next */
            processWebhookEntry(webhookName, pathItemOrRef as PathItem, 'root');
        });

        /* v8 ignore next */
        const componentWebhooks = this.parser.spec.components?.webhooks || {};
        /* v8 ignore next */
        Object.entries(componentWebhooks).forEach(([webhookName, pathItemOrRef]) => {
            /* v8 ignore next */
            processWebhookEntry(webhookName, pathItemOrRef as PathItem, 'component');
        });

        /* v8 ignore next */
        if (webhooksFound.length > 0) {
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
                        name: 'API_WEBHOOKS',
                        initializer: JSON.stringify(
                            /* v8 ignore next */
                            webhooksFound.map(c => ({
                                name: c.name,
                                method: c.method,
                                interfaceName: c.interfaceName,
                                pathItem: c.pathItem,
                                ...(c.scope ? { scope: c.scope } : {}),
                            })),
                            null,
                            2,
                        ),
                    },
                ],
                docs: ['Metadata registry for identified webhooks.'],
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

    private processWebhookPathItem(name: string, pathItem: PathItem): PathInfo[] {
        /* v8 ignore next */
        const tempMap = { [name]: pathItem };
        // Pass the main components to ensure strict resolution if webhooks define security
        /* v8 ignore next */
        /* v8 ignore start */
        const resolveRef = (ref: string) => this.parser.resolveReference(ref);
        /* v8 ignore stop */
        /* v8 ignore next */
        const resolveObj = (obj: OpenApiValue) => this.parser.resolve(obj as OpenApiValue);
        /* v8 ignore next */
        return extractPaths(tempMap, resolveRef, this.parser.spec.components, undefined, resolveObj);
    }
}
