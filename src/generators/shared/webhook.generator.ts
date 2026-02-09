import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../core/constants.js';
import { SwaggerParser } from '@src/core/parser.js';
import { extractPaths, getRequestBodyType, getResponseType, pascalCase } from '@src/core/utils/index.js';
import { PathInfo, PathItem } from '@src/core/types/index.js';

export class WebhookGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, 'webhooks.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        const requiredModels = new Set<string>();
        const registerModel = (type: string) => {
            if (
                type &&
                type !== 'any' &&
                /^[A-Z]/.test(type) &&
                !['Date', 'Blob', 'File'].includes(type) &&
                !type.includes('{') &&
                !type.includes('<')
            ) {
                const modelName = type.replace(/\[\]/g, '');
                requiredModels.add(modelName);
            }
        };

        const webhooksFound: {
            name: string;
            interfaceName: string;
            method: string;
            requestType: string;
            responseType: string;
        }[] = [];
        const webhooks = this.parser.spec.webhooks || {};

        Object.entries(webhooks).forEach(([webhookName, pathItemOrRef]) => {
            const resolved = this.parser.resolve(pathItemOrRef) as PathItem;
            if (!resolved) return;

            const subPaths = this.processWebhookPathItem(webhookName, resolved);

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

                const interfaceName = `${pascalCase(webhookName)}${pascalCase(sub.method)}Payload`;
                webhooksFound.push({
                    name: webhookName,
                    method: sub.method,
                    interfaceName,
                    requestType,
                    responseType,
                });

                sourceFile.addTypeAlias({
                    isExported: true,
                    name: interfaceName,
                    type: requestType,
                    docs: [`Payload definition for webhook '${webhookName}' (${sub.method}).`],
                });
            });
        });

        if (webhooksFound.length > 0) {
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
                        name: 'API_WEBHOOKS',
                        initializer: JSON.stringify(
                            webhooksFound.map(c => ({
                                name: c.name,
                                method: c.method,
                                interfaceName: c.interfaceName,
                            })),
                            null,
                            2,
                        ),
                    },
                ],
                docs: ['Metadata registry for identified webhooks.'],
            });
        } else {
            sourceFile.addStatements('export {};');
        }

        sourceFile.formatText();
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }

    private processWebhookPathItem(name: string, pathItem: PathItem): PathInfo[] {
        const tempMap = { [name]: pathItem };
        // Pass the main components to ensure strict resolution if webhooks define security
        return extractPaths(tempMap, undefined, this.parser.spec.components);
    }
}
