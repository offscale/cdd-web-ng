import * as path from "node:path";
import { Project, VariableDeclarationKind } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../core/constants.js";
import { SwaggerParser } from '@src/core/parser.js';
import { HeaderObject, PathInfo, SwaggerDefinition } from "@src/core/types/index.js";

export class ResponseHeaderRegistryGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project
    ) {
    }

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, "response-headers.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        const registry: Record<string, Record<string, Record<string, string>>> = {};
        const headerConfigMap: Record<string, any> = {};
        let headerCount = 0;

        this.parser.operations.forEach((op: PathInfo) => {
            if (!op.operationId || !op.responses) return;

            const opHeaders: Record<string, Record<string, string>> = {};
            let hasHeadersForOp = false;

            Object.entries(op.responses).forEach(([statusCode, response]) => {
                if (response.headers) {
                    const headerConfig: Record<string, string> = {};

                    Object.entries(response.headers).forEach(([headerName, headerOrRef]) => {
                        const headerDef = this.parser.resolve(headerOrRef) as HeaderObject;
                        if (!headerDef) return;

                        const { typeHint, xmlConfig } = this.getHeaderTypeInfo(headerDef);
                        if (typeHint) {
                            headerConfig[headerName] = typeHint;
                            // Store XML config if present, keyed uniquely by context
                            if (typeHint === 'xml' && xmlConfig) {
                                const key = `${op.operationId}_${statusCode}_${headerName}`;
                                headerConfigMap[key] = xmlConfig;
                            }
                        }
                    });

                    if (Object.keys(headerConfig).length > 0) {
                        opHeaders[statusCode] = headerConfig;
                        hasHeadersForOp = true;
                        headerCount += Object.keys(headerConfig).length;
                    }
                }
            });

            if (hasHeadersForOp) {
                registry[op.operationId] = opHeaders;
            }
        });

        if (headerCount > 0) {
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [{
                    name: "API_RESPONSE_HEADERS",
                    initializer: JSON.stringify(registry, null, 2)
                }],
                docs: ["Registry of Response Headers defined in the API."]
            });

            // If we have any XML configs, export them.
            // We always export the variable to simplify imports in the service, defaulting to empty object.
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [{
                    name: "API_HEADER_XML_CONFIGS",
                    initializer: Object.keys(headerConfigMap).length > 0
                        ? JSON.stringify(headerConfigMap, null, 2)
                        : "{}"
                }],
                docs: ["Registry of XML Configurations for Response Headers."]
            });
        } else {
            sourceFile.addStatements("export {};");
        }

        sourceFile.formatText();
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }

    private getHeaderTypeInfo(header: HeaderObject): { typeHint: string, xmlConfig?: any } {
        if (header.content) {
            const contentType = Object.keys(header.content)[0];
            if (contentType && contentType.includes('json')) {
                return { typeHint: 'json' };
            }
            if (contentType && contentType.includes('xml')) {
                const schema = header.content[contentType].schema as SwaggerDefinition;
                if (schema) {
                    return { typeHint: 'xml', xmlConfig: this.getXmlConfig(schema, 3) };
                }
                return { typeHint: 'xml' };
            }
            return { typeHint: 'string' };
        }

        // Swagger 2.0 / OAS 3.0 simple schema support
        const schema = header.schema || header;
        const resolvedSchema = this.parser.resolve(schema) as SwaggerDefinition;

        if (!resolvedSchema) return { typeHint: 'string' };

        if (resolvedSchema.type === 'array') return { typeHint: 'array' };
        if (resolvedSchema.type === 'integer' || resolvedSchema.type === 'number') return { typeHint: 'number' };
        if (resolvedSchema.type === 'boolean') return { typeHint: 'boolean' };
        if (resolvedSchema.type === 'object') return { typeHint: 'json' };

        return { typeHint: 'string' };
    }

    /**
     * Recursively extracts XML configuration from a schema definition.
     * Used to configure the runtime XmlParser.
     */
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

        if (resolved.properties) {
            config.properties = {};
            Object.entries(resolved.properties).forEach(([propName, propSchema]) => {
                const propConfig = this.getXmlConfig(propSchema, depth - 1);
                if (Object.keys(propConfig).length > 0) {
                    config.properties[propName] = propConfig;
                }
            });
        }
        return config;
    }
}
