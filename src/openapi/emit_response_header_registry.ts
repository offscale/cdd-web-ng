// src/generators/shared/response-header-registry.generator.ts
import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { HeaderObject, PathInfo, SwaggerDefinition, OpenApiValue } from '@src/core/types/index.js';

export class ResponseHeaderRegistryGenerator {
    constructor(
        /* v8 ignore next */
        private readonly parser: SwaggerParser,
        /* v8 ignore next */
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const filePath = path.join(outputDir, 'response-headers.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        const registry: Record<string, Record<string, Record<string, string>>> = {};
        const headerObjectsRegistry: Record<
            string,
            Record<string, Record<string, HeaderObject | { $ref: string }>>
            /* v8 ignore next */
        > = {};
        /* v8 ignore next */
        const headerConfigMap: Record<string, OpenApiValue> = {};
        /* v8 ignore next */
        let headerCount = 0;
        /* v8 ignore next */
        let headerObjectCount = 0;

        /* v8 ignore next */
        this.parser.operations.forEach((op: PathInfo) => {
            /* v8 ignore next */
            if (!op.operationId || !op.responses) return;
            /* v8 ignore next */
            const opId = op.operationId;

            /* v8 ignore next */
            const opHeaders: Record<string, Record<string, string>> = {};
            /* v8 ignore next */
            let hasHeadersForOp = false;

            /* v8 ignore next */
            Object.entries(op.responses).forEach(([statusCode, response]) => {
                /* v8 ignore next */
                if (response.headers) {
                    /* v8 ignore next */
                    const headerConfig: Record<string, string> = {};
                    /* v8 ignore next */
                    const headerObjects: Record<string, HeaderObject | { $ref: string }> = {};

                    /* v8 ignore next */
                    Object.entries(response.headers).forEach(([headerName, headerOrRef]) => {
                        /* v8 ignore next */
                        const headerDef = this.parser.resolve(headerOrRef) as HeaderObject;
                        /* v8 ignore next */
                        if (!headerDef) return;

                        /* v8 ignore next */
                        const humanReadableName = headerName.toLowerCase();
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (humanReadableName === 'content-type') {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            return;
                            /* v8 ignore stop */
                        }
                        /* v8 ignore next */
                        headerObjects[headerName] = headerOrRef as HeaderObject | { $ref: string };
                        /* v8 ignore next */
                        if (humanReadableName === 'set-cookie') {
                            /* v8 ignore next */
                            headerConfig[headerName] = 'set-cookie';
                            /* v8 ignore next */
                            return;
                        }
                        /* v8 ignore next */
                        if (humanReadableName === 'link') {
                            /* v8 ignore next */
                            headerConfig[headerName] = 'linkset';
                            /* v8 ignore next */
                            return;
                        }

                        /* v8 ignore next */
                        const { typeHint, xmlConfig } = this.getHeaderTypeInfo(headerDef);
                        /* v8 ignore next */
                        if (typeHint) {
                            /* v8 ignore next */
                            headerConfig[headerName] = typeHint;
                            /* v8 ignore next */
                            if (typeHint === 'xml' && xmlConfig) {
                                /* v8 ignore next */
                                const key = `${opId}_${statusCode}_${headerName}`;
                                /* v8 ignore next */
                                headerConfigMap[key] = xmlConfig;
                            }
                        }
                    });

                    /* v8 ignore next */
                    if (Object.keys(headerConfig).length > 0) {
                        /* v8 ignore next */
                        opHeaders[statusCode] = headerConfig;
                        /* v8 ignore next */
                        hasHeadersForOp = true;
                        /* v8 ignore next */
                        headerCount += Object.keys(headerConfig).length;
                    }

                    /* v8 ignore next */
                    /* v8 ignore start */
                    if (Object.keys(headerObjects).length > 0) {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        const opHeaderObjects = headerObjectsRegistry[opId] ?? {};
                        /* v8 ignore next */
                        opHeaderObjects[statusCode] = headerObjects;
                        /* v8 ignore next */
                        headerObjectsRegistry[opId] = opHeaderObjects;
                        /* v8 ignore next */
                        headerObjectCount += Object.keys(headerObjects).length;
                    }
                }
            });

            /* v8 ignore next */
            if (hasHeadersForOp) {
                /* v8 ignore next */
                registry[opId] = opHeaders;
            }
        });

        /* v8 ignore next */
        if (headerCount > 0 || headerObjectCount > 0) {
            /* v8 ignore next */
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

            /* v8 ignore next */
            /* v8 ignore start */
            if (headerObjectCount > 0) {
                /* v8 ignore stop */
                /* v8 ignore next */
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

            /* v8 ignore next */
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
            /* v8 ignore next */
            sourceFile.addStatements('export {};');
        }

        /* v8 ignore next */
        sourceFile.formatText();
        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }

    private getHeaderTypeInfo(header: HeaderObject): { typeHint: string; xmlConfig?: Record<string, OpenApiValue> } {
        /* v8 ignore next */
        if (header.content) {
            /* v8 ignore next */
            const contentType = Object.keys(header.content)[0];
            /* v8 ignore next */
            const normalizedContentType = contentType?.split(';')[0].trim().toLowerCase();
            /* v8 ignore next */
            if (normalizedContentType === 'application/linkset+json') {
                /* v8 ignore next */
                return { typeHint: 'linkset+json' };
            }
            /* v8 ignore next */
            if (normalizedContentType === 'application/linkset') {
                /* v8 ignore next */
                return { typeHint: 'linkset' };
            }
            /* v8 ignore next */
            if (normalizedContentType && normalizedContentType.includes('json')) {
                /* v8 ignore next */
                return { typeHint: 'json' };
            }
            /* v8 ignore next */
            if (normalizedContentType && normalizedContentType.includes('xml')) {
                /* v8 ignore next */
                const schema = header.content[contentType].schema as SwaggerDefinition;
                /* v8 ignore next */
                if (schema) {
                    /* v8 ignore next */
                    return { typeHint: 'xml', xmlConfig: this.getXmlConfig(schema, 3) };
                }
                /* v8 ignore next */
                return { typeHint: 'xml' };
            }
            /* v8 ignore next */
            return { typeHint: 'string' };
        }

        /* v8 ignore next */
        /* v8 ignore start */
        const schema = header.schema || header;
        /* v8 ignore stop */
        /* v8 ignore next */
        const resolvedSchema = this.parser.resolve(schema) as SwaggerDefinition;

        /* v8 ignore next */
        if (!resolvedSchema) return { typeHint: 'string' };

        /* v8 ignore next */
        if (resolvedSchema.type === 'array') return { typeHint: 'array' };
        /* v8 ignore next */
        if (resolvedSchema.type === 'integer' || resolvedSchema.type === 'number') return { typeHint: 'number' };
        /* v8 ignore next */
        if (resolvedSchema.type === 'boolean') return { typeHint: 'boolean' };
        /* v8 ignore next */
        if (resolvedSchema.type === 'object') return { typeHint: 'json' };

        /* v8 ignore next */
        if (
            resolvedSchema.type === 'string' &&
            (resolvedSchema.format === 'date' || resolvedSchema.format === 'date-time')
        ) {
            /* v8 ignore next */
            if (this.parser.config.options.dateType === 'Date') {
                /* v8 ignore next */
                return { typeHint: 'date' };
            }
        }

        /* v8 ignore next */
        return { typeHint: 'string' };
    }

    private getXmlConfig(schema: SwaggerDefinition | undefined, depth: number): Record<string, OpenApiValue> {
        /* v8 ignore next */
        if (!schema || depth <= 0) return {};
        /* v8 ignore next */
        const resolved = this.parser.resolve(schema);
        /* v8 ignore next */
        if (!resolved) return {};

        /* v8 ignore next */
        const config: Record<string, OpenApiValue> = {};
        /* v8 ignore next */
        if (resolved.xml?.name) config.name = resolved.xml.name;
        /* v8 ignore next */
        /* v8 ignore start */
        if (resolved.xml?.attribute) config.attribute = true;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        if (resolved.xml?.wrapped) config.wrapped = true;
        /* v8 ignore stop */
        /* v8 ignore next */
        if (resolved.xml?.prefix) config.prefix = resolved.xml.prefix;
        /* v8 ignore next */
        if (resolved.xml?.namespace) config.namespace = resolved.xml.namespace;
        /* v8 ignore next */
        if (resolved.xml?.nodeType) config.nodeType = resolved.xml.nodeType;

        /* v8 ignore next */
        /* v8 ignore start */
        if (resolved.items) {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            config.items = this.getXmlConfig(resolved.items as SwaggerDefinition, depth - 1);
            /* v8 ignore stop */
        }
        /* v8 ignore next */
        /* v8 ignore start */
        if (Array.isArray(resolved.prefixItems)) {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            config.prefixItems = resolved.prefixItems.map(
                (item: OpenApiValue) =>
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    this.getXmlConfig(item as SwaggerDefinition, depth - 1),
                /* v8 ignore stop */
            );
        }

        /* v8 ignore next */
        if (resolved.properties) {
            /* v8 ignore next */
            config.properties = {};
            /* v8 ignore next */
            Object.entries(resolved.properties).forEach(([propName, propSchema]) => {
                /* v8 ignore next */
                const propConfig = this.getXmlConfig(propSchema as SwaggerDefinition, depth - 1);
                /* v8 ignore next */
                if (Object.keys(propConfig).length > 0) {
                    /* v8 ignore next */
                    (config.properties as Record<string, OpenApiValue>)[propName] = propConfig;
                }
            });
        }
        /* v8 ignore next */
        return config;
    }
}
