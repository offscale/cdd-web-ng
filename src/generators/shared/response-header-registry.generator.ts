import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../core/constants.js';
import { SwaggerParser } from '@src/core/parser.js';
import { HeaderObject, PathInfo, SwaggerDefinition } from '@src/core/types/index.js';

export class ResponseHeaderRegistryGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, 'response-headers.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        const registry: Record<string, Record<string, Record<string, string>>> = {};
        const headerObjectsRegistry: Record<
            string,
            Record<string, Record<string, HeaderObject | { $ref: string }>>
        > = {};
        const headerConfigMap: Record<string, any> = {};
        let headerCount = 0;
        let headerObjectCount = 0;

        this.parser.operations.forEach((op: PathInfo) => {
            if (!op.operationId || !op.responses) return;
            const opId = op.operationId;

            const opHeaders: Record<string, Record<string, string>> = {};
            let hasHeadersForOp = false;

            Object.entries(op.responses).forEach(([statusCode, response]) => {
                if (response.headers) {
                    const headerConfig: Record<string, string> = {};
                    const headerObjects: Record<string, HeaderObject | { $ref: string }> = {};

                    Object.entries(response.headers).forEach(([headerName, headerOrRef]) => {
                        const headerDef = this.parser.resolve(headerOrRef) as HeaderObject;
                        if (!headerDef) return;

                        const humanReadableName = headerName.toLowerCase();
                        if (humanReadableName === 'content-type') {
                            return;
                        }
                        headerObjects[headerName] = headerOrRef as HeaderObject | { $ref: string };
                        if (humanReadableName === 'set-cookie') {
                            headerConfig[headerName] = 'set-cookie';
                            return;
                        }
                        if (humanReadableName === 'link') {
                            headerConfig[headerName] = 'linkset';
                            return;
                        }

                        const { typeHint, xmlConfig } = this.getHeaderTypeInfo(headerDef);
                        if (typeHint) {
                            headerConfig[headerName] = typeHint;
                            if (typeHint === 'xml' && xmlConfig) {
                                const key = `${opId}_${statusCode}_${headerName}`;
                                headerConfigMap[key] = xmlConfig;
                            }
                        }
                    });

                    if (Object.keys(headerConfig).length > 0) {
                        opHeaders[statusCode] = headerConfig;
                        hasHeadersForOp = true;
                        headerCount += Object.keys(headerConfig).length;
                    }

                    if (Object.keys(headerObjects).length > 0) {
                        const opHeaderObjects = headerObjectsRegistry[opId] ?? {};
                        opHeaderObjects[statusCode] = headerObjects;
                        headerObjectsRegistry[opId] = opHeaderObjects;
                        headerObjectCount += Object.keys(headerObjects).length;
                    }
                }
            });

            if (hasHeadersForOp) {
                registry[opId] = opHeaders;
            }
        });

        if (headerCount > 0 || headerObjectCount > 0) {
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: 'API_RESPONSE_HEADERS',
                        initializer: JSON.stringify(registry, null, 2),
                    },
                ],
                docs: ['Registry of Response Headers defined in the API.'],
            });

            if (headerObjectCount > 0) {
                sourceFile.addVariableStatement({
                    isExported: true,
                    declarationKind: VariableDeclarationKind.Const,
                    declarations: [
                        {
                            name: 'API_RESPONSE_HEADER_OBJECTS',
                            initializer: JSON.stringify(headerObjectsRegistry, null, 2),
                        },
                    ],
                    docs: ['Full Response Header Objects for reverse OpenAPI generation.'],
                });
            }

            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: 'API_HEADER_XML_CONFIGS',
                        initializer:
                            Object.keys(headerConfigMap).length > 0 ? JSON.stringify(headerConfigMap, null, 2) : '{}',
                    },
                ],
                docs: ['Registry of XML Configurations for Response Headers.'],
            });
        } else {
            sourceFile.addStatements('export {};');
        }

        sourceFile.formatText();
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }

    private getHeaderTypeInfo(header: HeaderObject): { typeHint: string; xmlConfig?: any } {
        if (header.content) {
            const contentType = Object.keys(header.content)[0];
            const normalizedContentType = contentType?.split(';')[0].trim().toLowerCase();
            if (normalizedContentType === 'application/linkset+json') {
                return { typeHint: 'linkset+json' };
            }
            if (normalizedContentType === 'application/linkset') {
                return { typeHint: 'linkset' };
            }
            if (normalizedContentType && normalizedContentType.includes('json')) {
                return { typeHint: 'json' };
            }
            if (normalizedContentType && normalizedContentType.includes('xml')) {
                const schema = header.content[contentType].schema as SwaggerDefinition;
                if (schema) {
                    return { typeHint: 'xml', xmlConfig: this.getXmlConfig(schema, 3) };
                }
                return { typeHint: 'xml' };
            }
            return { typeHint: 'string' };
        }

        const schema = header.schema || header;
        const resolvedSchema = this.parser.resolve(schema) as SwaggerDefinition;

        if (!resolvedSchema) return { typeHint: 'string' };

        if (resolvedSchema.type === 'array') return { typeHint: 'array' };
        if (resolvedSchema.type === 'integer' || resolvedSchema.type === 'number') return { typeHint: 'number' };
        if (resolvedSchema.type === 'boolean') return { typeHint: 'boolean' };
        if (resolvedSchema.type === 'object') return { typeHint: 'json' };

        if (
            resolvedSchema.type === 'string' &&
            (resolvedSchema.format === 'date' || resolvedSchema.format === 'date-time')
        ) {
            if (this.parser.config.options.dateType === 'Date') {
                return { typeHint: 'date' };
            }
        }

        return { typeHint: 'string' };
    }

    private getXmlConfig(schema: SwaggerDefinition | undefined, depth: number): any {
        if (!schema || depth <= 0) return {};
        const resolved = this.parser.resolve(schema);
        if (!resolved) return {};

        const config: any = {};
        if (resolved.xml?.name) config.name = resolved.xml.name;
        if (resolved.xml?.attribute) config.attribute = true;
        if (resolved.xml?.wrapped) config.wrapped = true;
        if (resolved.xml?.prefix) config.prefix = resolved.xml.prefix;
        if (resolved.xml?.namespace) config.namespace = resolved.xml.namespace;
        if (resolved.xml?.nodeType) config.nodeType = resolved.xml.nodeType;

        if (resolved.items) {
            config.items = this.getXmlConfig(resolved.items as SwaggerDefinition, depth - 1);
        }
        if (Array.isArray(resolved.prefixItems)) {
            config.prefixItems = resolved.prefixItems.map(item =>
                this.getXmlConfig(item as SwaggerDefinition, depth - 1),
            );
        }

        if (resolved.properties) {
            config.properties = {};
            Object.entries(resolved.properties).forEach(([propName, propSchema]) => {
                const propConfig = this.getXmlConfig(propSchema as SwaggerDefinition, depth - 1);
                if (Object.keys(propConfig).length > 0) {
                    config.properties[propName] = propConfig;
                }
            });
        }
        return config;
    }
}
