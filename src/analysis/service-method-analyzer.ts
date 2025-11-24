import {
    GeneratorConfig,
    Parameter,
    PathInfo,
    SwaggerDefinition
} from '@src/core/types/index.js';
import {
    camelCase,
    getTypeScriptType,
    isDataTypeInterface
} from '@src/core/utils/index.js';
import { SwaggerParser } from '@src/core/parser.js';
import { OptionalKind, ParameterDeclarationStructure } from 'ts-morph';
import { BodyVariant, ParamSerialization, ServiceMethodModel } from './service-method-types.js';

export class ServiceMethodAnalyzer {
    constructor(
        private config: GeneratorConfig,
        private parser: SwaggerParser
    ) {}

    public analyze(operation: PathInfo): ServiceMethodModel | null {
        if (!operation.methodName) return null;

        const knownTypes = this.parser.schemas.map(s => s.name);
        const responseType = this.analyzeResponseType(operation, knownTypes);
        const parameters = this.analyzeParameters(operation, knownTypes);

        const pathParams: ParamSerialization[] = [];
        const queryParams: ParamSerialization[] = [];
        const headerParams: ParamSerialization[] = [];
        const cookieParams: ParamSerialization[] = [];

        // Distribute parameters into their serialization buckets
        (operation.parameters || []).forEach(p => {
            const paramName = camelCase(p.name);
            // Check if this parameter is actually the body (sometimes tagged poorly in OAS2)
            // But typically parameters array items are distinct from requestBody logic in OAS3
            const serialization: ParamSerialization = {
                paramName: this.isXmlContent(p) ? `${paramName}Serialized` : paramName,
                originalName: p.name,
                explode: p.explode ?? (p.in === 'cookie' ? true : false), // Cookie default explode is true
                allowReserved: p.allowReserved ?? false,
                serializationLink: this.isJsonContent(p) ? 'json' : undefined,
                ...(p.style != null && {style: p.style})
            };

            switch (p.in) {
                case 'path': pathParams.push(serialization); break;
                case 'query': queryParams.push(serialization); break;
                case 'header': headerParams.push(serialization); break;
                case 'cookie': cookieParams.push(serialization); break;
                case 'querystring' as any: queryParams.push(serialization); break; // Internal mapping
            }
        });

        // Body Analysis
        const body = this.analyzeBody(operation, parameters);

        // Security
        const specSecurity = this.parser.getSpec().security;
        const opSecurity = operation.security;
        const effectiveSecurity = opSecurity !== undefined ? opSecurity : (specSecurity || []);

        // Servers
        let basePath: string | undefined;
        if (operation.servers && operation.servers.length > 0) {
            const s = operation.servers[0];
            basePath = s.url;
            if (s.variables) {
                Object.entries(s.variables).forEach(([key, variable]) => {
                    basePath = basePath!.replace(`{${key}}`, variable.default);
                });
            }
        }

        // Documentation
        let docText = (operation.summary || operation.description || `Performs a ${operation.method} request to ${operation.path}.`) +
            (operation.description && operation.summary ? `\n\n${operation.description}` : '');
        if (operation.externalDocs?.url) {
            docText += `\n\n@see ${operation.externalDocs.url} ${operation.externalDocs.description || ''}`.trimEnd();
        }
        if (operation.deprecated) {
            docText += `\n\n@deprecated`;
        }

        return {
            methodName: operation.methodName,
            httpMethod: operation.method.toUpperCase(),
            urlTemplate: operation.path,
            docs: docText,
            isDeprecated: !!operation.deprecated,
            parameters,
            responseType,
            pathParams,
            queryParams,
            headerParams,
            cookieParams,
            security: effectiveSecurity,
            hasServers: !!basePath,
            ...(body != null && { body }),
            ...(basePath != null && { basePath })
        };
    }

    private analyzeResponseType(operation: PathInfo, knownTypes: string[]): string {
        if (!operation.responses) return 'any';
        const responses = operation.responses;
        if (responses['204']) return 'void';

        const targetCode = Object.keys(responses).find(code => /^2\d{2}$/.test(code))
            || (responses['2XX'] ? '2XX' : undefined)
            || (responses['default'] ? 'default' : undefined);

        if (targetCode) {
            const schema = responses[targetCode]?.content?.['application/json']?.schema;
            if (schema) return getTypeScriptType(schema as SwaggerDefinition, this.config, knownTypes);
        }

        // Request schema fallback (rare/legacy strategy)
        const reqSchema = operation.requestBody?.content?.['application/json']?.schema;
        if (reqSchema) return getTypeScriptType(reqSchema as SwaggerDefinition, this.config, knownTypes);

        return 'any';
    }

    private analyzeParameters(operation: PathInfo, knownTypes: string[]): OptionalKind<ParameterDeclarationStructure>[] {
        const parameters: OptionalKind<ParameterDeclarationStructure>[] = [];

        // 1. Standard Params
        (operation.parameters ?? []).forEach(param => {
            let effectiveSchema = param.schema;
            if (param.content) {
                const firstType = Object.keys(param.content)[0];
                if (firstType && param.content[firstType].schema) {
                    effectiveSchema = param.content[firstType].schema as SwaggerDefinition;
                }
            }
            const paramType = getTypeScriptType(effectiveSchema, this.config, knownTypes);
            parameters.push({
                name: camelCase(param.name),
                type: paramType,
                hasQuestionToken: !param.required,
                ...(param.deprecated && {leadingTrivia: [`/** @deprecated */ `]})
            });
        });

        // 2. Request Body Param
        const requestBody = operation.requestBody;
        if (requestBody) {
            let contentType = Object.keys(requestBody.content || {})[0];
            // Prioritize specific types
            if (requestBody.content?.['application/json']) contentType = 'application/json';
            else if (requestBody.content?.['application/xml']) contentType = 'application/xml';
            else if (requestBody.content?.['multipart/form-data']) contentType = 'multipart/form-data';
            else if (requestBody.content?.['application/x-www-form-urlencoded']) contentType = 'application/x-www-form-urlencoded';

            const content = requestBody.content?.[contentType!];
            if (content?.schema) {
                let bodyType = getTypeScriptType(content.schema as SwaggerDefinition, this.config, knownTypes);

                // Handle ReadOnly/WriteOnly Model Transformation
                const rawBodyType = bodyType.replace(/\[\]| \| null/g, '');
                if (knownTypes.includes(rawBodyType)) {
                    const schemaObj = this.parser.schemas.find(s => s.name === rawBodyType);
                    const definition = schemaObj?.definition;
                    if (definition && this.needsRequestType(definition)) {
                        bodyType = bodyType.replace(rawBodyType, `${rawBodyType}Request`);
                    }
                }
                // Determine decent variable name (e.g. 'user' instead of 'body' if type is User)
                const bodyName = isDataTypeInterface(rawBodyType) ? camelCase(rawBodyType) : 'body';
                parameters.push({ name: bodyName, type: bodyType, hasQuestionToken: !requestBody.required });
            } else {
                parameters.push({ name: 'body', type: 'unknown', hasQuestionToken: !requestBody.required });
            }
        }

        return parameters.sort((a, b) => (a.hasQuestionToken ? 1 : 0) - (b.hasQuestionToken ? 1 : 0));
    }

    private analyzeBody(operation: PathInfo, parameters: OptionalKind<ParameterDeclarationStructure>[]): BodyVariant | undefined {
        // Find the actual parameter name chosen for the body
        const nonBodyOpParams = new Set((operation.parameters ?? []).map(p => camelCase(p.name)));
        const bodyParamDef = parameters.find(p => !nonBodyOpParams.has(p.name!));

        // Legacy Swagger 2 FormData (not requestBody)
        const formDataParams = operation.parameters?.filter(p => (p as any).in === 'formData');
        if (formDataParams && formDataParams.length > 0) {
            const isMulti = operation.consumes?.includes('multipart/form-data');
            if (isMulti) {
                // Native form data append loop will be generated
                return { type: 'encoded-form-data', paramName: 'formData', mappings: [] }; // Simplified for now, generator handles loop logic based on type
            } else {
                // URLEncoded loop
                return { type: 'encoded-form-data', paramName: 'formBody', mappings: [] };
            }
        }

        if (!bodyParamDef) return undefined; // No body param found

        const bodyParamName = bodyParamDef.name;
        const rb = operation.requestBody;
        if (!rb || !rb.content) return { type: 'raw', paramName: bodyParamName };

        if (rb.content['multipart/form-data']) {
            return {
                type: 'multipart',
                paramName: bodyParamName,
                config: rb.content['multipart/form-data'].encoding || {}
            };
        }

        if (rb.content['application/x-www-form-urlencoded']) {
            return {
                type: 'urlencoded',
                paramName: bodyParamName,
                config: rb.content['application/x-www-form-urlencoded'].encoding || {}
            };
        }

        if (rb.content['application/xml']) {
            const schema = rb.content['application/xml'].schema as SwaggerDefinition;
            const rootName = schema.xml?.name || 'root';
            const xmlConfig = this.getXmlConfig(schema, 5);
            return {
                type: 'xml',
                paramName: bodyParamName,
                rootName,
                config: xmlConfig
            };
        }

        return { type: 'json', paramName: bodyParamName };
    }

    private isJsonContent(p: Parameter): boolean {
        if (!p.content) return false;
        const keys = Object.keys(p.content);
        return keys.some(k => k.includes('application/json') || k.includes('*/*'));
    }

    private isXmlContent(p: Parameter): boolean {
        if (!p.content) return false;
        const keys = Object.keys(p.content);
        return keys.some(k => k.includes('application/xml'));
    }

    private needsRequestType(definition: SwaggerDefinition): boolean {
        if (!definition.properties) return false;
        return Object.values(definition.properties).some(p => p.readOnly || p.writeOnly);
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

        if (resolved.type === 'array' && resolved.items) {
            config.items = this.getXmlConfig(resolved.items as SwaggerDefinition, depth - 1);
        }

        if (resolved.properties) {
            config.properties = {};
            Object.entries(resolved.properties).forEach(([propName, propSchema]) => {
                const propConfig = this.getXmlConfig(propSchema, depth - 1);
                if (Object.keys(propConfig).length > 0) {
                    config.properties[propName] = propConfig;
                }
            });
        }

        if (resolved.allOf) {
            resolved.allOf.forEach(sub => {
                const subConfig = this.getXmlConfig(sub, depth - 1);
                if (subConfig.properties) {
                    config.properties = { ...config.properties, ...subConfig.properties };
                }
            });
        }
        return config;
    }
}
