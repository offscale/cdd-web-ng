import { EncodingProperty, GeneratorConfig, Parameter, PathInfo, SwaggerDefinition } from '@src/core/types/index.js';
import { camelCase, getTypeScriptType, isDataTypeInterface } from '@src/core/utils/index.js';
import { SwaggerParser } from '@src/core/parser.js';
import { OptionalKind, ParameterDeclarationStructure } from 'ts-morph';
import {
    BodyVariant,
    ErrorResponseInfo,
    ParamSerialization,
    ResponseSerialization,
    ServiceMethodModel
} from './service-method-types.js';

export class ServiceMethodAnalyzer {
    constructor(
        private config: GeneratorConfig,
        private parser: SwaggerParser
    ) {
    }

    public analyze(operation: PathInfo): ServiceMethodModel | null {
        if (!operation.methodName) return null;

        const knownTypes = this.parser.schemas.map(s => s.name);
        const {
            type: responseType,
            serialization: responseSerialization,
            xmlConfig: responseXmlConfig,
            decodingConfig: responseDecodingConfig,
            successCode
        } = this.analyzeResponse(operation, knownTypes);
        const errorResponses = this.analyzeErrorResponses(operation, knownTypes, successCode);

        const parameters = this.analyzeParameters(operation, knownTypes);

        const pathParams: ParamSerialization[] = [];
        const queryParams: ParamSerialization[] = [];
        const headerParams: ParamSerialization[] = [];
        const cookieParams: ParamSerialization[] = [];

        // Distribute parameters into their serialization buckets
        (operation.parameters || []).forEach(p => {
            const paramName = camelCase(p.name);

            // Normalize explode using spec rules if not already done by extractor (defensive)
            const effectiveStyle = p.style || ((p.in === 'query' || p.in === 'cookie') ? 'form' : 'simple');
            const defaultExplode = effectiveStyle === 'form' || effectiveStyle === 'cookie';
            const explode = p.explode ?? defaultExplode;

            // Check for explicit JSON content or implicit contentMediaType JSON
            const explicitJson = this.isJsonContent(p);
            const implicitJson = this.isJsonContentMediaType(p);

            // If explicit, we use 'json' (full content negotiation logic usually implied).
            // If only contentMediaType='application/json' on a string/param, we treat it as 'json',
            // instructing the builder to stringify it.
            let serializationLink: 'json' | 'json-subset' | undefined;
            if (explicitJson) serializationLink = 'json';
            else if (implicitJson) serializationLink = 'json';

            const serialization: ParamSerialization = {
                paramName: this.isXmlContent(p) ? `${paramName}Serialized` : paramName,
                originalName: p.name,
                explode: explode,
                allowReserved: p.allowReserved ?? false,
                serializationLink,
                ...(p.style != null && { style: p.style })
            };

            switch (p.in) {
                case 'path':
                    pathParams.push(serialization);
                    break;
                case 'query':
                    queryParams.push(serialization);
                    break;
                case 'header':
                    headerParams.push(serialization);
                    break;
                case 'cookie':
                    cookieParams.push(serialization);
                    break;
                case 'querystring' as any:
                    queryParams.push(serialization);
                    break; // Internal mapping
            }
        });

        // Body Analysis
        const body = this.analyzeBody(operation, parameters);

        // Request Body Encoding Analysis (OAS 3.1 auto-encoding support)
        let requestEncodingConfig: any = undefined;
        if (body && (body.type === 'json' || body.type === 'urlencoded')) {
            const rbContent = operation.requestBody?.content;
            // For URL Encoded, analyze the schema inside; for JSON, same.
            const contentType = Object.keys(rbContent || {})[0];
            if (contentType && rbContent?.[contentType]?.schema) {
                const cfg = this.getEncodingConfig(rbContent[contentType].schema as SwaggerDefinition);
                if (Object.keys(cfg).length > 0) {
                    requestEncodingConfig = cfg;
                }
            }
        }

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
            responseSerialization,
            responseXmlConfig,
            responseDecodingConfig,
            requestEncodingConfig,
            errorResponses,
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

    private analyzeResponse(operation: PathInfo, knownTypes: string[]): {
        type: string,
        serialization: ResponseSerialization,
        xmlConfig?: any,
        decodingConfig?: any,
        successCode?: string
    } {
        const defaultResult = { type: 'any', serialization: 'json' as ResponseSerialization };

        if (!operation.responses) return defaultResult;
        const responses = operation.responses;
        if (responses['204']) return { type: 'void', serialization: 'json', successCode: '204' };

        const targetCode = Object.keys(responses).find(code => /^2\d{2}$/.test(code))
            || (responses['2XX'] ? '2XX' : undefined)
            || (responses['default'] ? 'default' : undefined);

        if (targetCode) {
            const responseObj = responses[targetCode];
            if (!responseObj.content) return { ...defaultResult, successCode: targetCode };

            // 1. Server-Sent Events
            if (responseObj.content['text/event-stream']) {
                const sseSchema = responseObj.content['text/event-stream'].schema;
                // OAS 3.2: Fallback to itemSchema if schema missing
                const effectiveSchema = sseSchema || responseObj.content['text/event-stream'].itemSchema;
                const itemType = effectiveSchema ? getTypeScriptType(effectiveSchema as SwaggerDefinition, this.config, knownTypes) : 'any';
                return { type: itemType, serialization: 'sse', successCode: targetCode };
            }

            // 2. Sequential JSON (OAS 3.2)
            // application/json-seq (RFC 7464)
            if (responseObj.content['application/json-seq']) {
                const seqSchema = responseObj.content['application/json-seq'];
                const effectiveSchema = seqSchema.schema || seqSchema.itemSchema;
                const itemType = effectiveSchema ? getTypeScriptType(effectiveSchema as SwaggerDefinition, this.config, knownTypes) : 'any';
                return { type: `(${itemType})[]`, serialization: 'json-seq', successCode: targetCode };
            }

            // application/jsonl or application/x-ndjson
            const jsonlSchema = responseObj.content['application/jsonl'] || responseObj.content['application/x-ndjson'];
            if (jsonlSchema) {
                const effectiveSchema = jsonlSchema.schema || jsonlSchema.itemSchema;
                const itemType = effectiveSchema ? getTypeScriptType(effectiveSchema as SwaggerDefinition, this.config, knownTypes) : 'any';
                return { type: `(${itemType})[]`, serialization: 'json-lines', successCode: targetCode };
            }

            // 3. Standard JSON
            if (responseObj.content['application/json']) {
                const schema = responseObj.content['application/json']?.schema;
                if (schema) {
                    const decodingConfig = this.getDecodingConfig(schema as SwaggerDefinition);
                    return {
                        type: getTypeScriptType(schema as SwaggerDefinition, this.config, knownTypes),
                        serialization: 'json',
                        decodingConfig: Object.keys(decodingConfig).length > 0 ? decodingConfig : undefined,
                        successCode: targetCode
                    };
                }
            }

            // 4. XML Response Parsing
            if (responseObj.content['application/xml']) {
                const schema = responseObj.content['application/xml'].schema as SwaggerDefinition;
                if (schema) {
                    const xmlConfig = this.getXmlConfig(schema, 5);
                    return {
                        type: getTypeScriptType(schema, this.config, knownTypes),
                        serialization: 'xml',
                        xmlConfig,
                        successCode: targetCode
                    };
                }
            }
        }

        // Request schema fallback (rare/legacy strategy)
        const reqSchema = operation.requestBody?.content?.['application/json']?.schema;
        if (reqSchema) {
            return {
                type: getTypeScriptType(reqSchema as SwaggerDefinition, this.config, knownTypes),
                serialization: 'json'
            };
        }

        return defaultResult;
    }

    private analyzeErrorResponses(operation: PathInfo, knownTypes: string[], successCode?: string): ErrorResponseInfo[] {
        if (!operation.responses) return [];

        const errors: ErrorResponseInfo[] = [];

        for (const [code, responseObj] of Object.entries(operation.responses)) {
            // Skip the identified success code
            if (code === successCode) continue;

            // Skip other 2xx codes if we already picked one, effectively standardizing on one success path structure for simple services
            if (/^2\d{2}$/.test(code) || code === '2XX') continue;

            // If successCode was defined, 'default' represents an error.
            // If successCode was NOT defined (no 2xx), then 'default' was treated as success in analyzeResponse and passed as successCode.
            // So we don't need extra logic for 'default' here, just processing what remains.

            let type = 'unknown';
            if (responseObj.content) {
                const content = responseObj.content;
                // Prioritize JSON for errors
                const jsonSchema = content['application/json']?.schema || content['*/*']?.schema;
                if (jsonSchema) {
                    type = getTypeScriptType(jsonSchema as SwaggerDefinition, this.config, knownTypes);
                } else if (content['application/xml']?.schema) {
                    // XML Error support
                    type = getTypeScriptType(content['application/xml'].schema as SwaggerDefinition, this.config, knownTypes);
                } else if (content['text/plain']) {
                    type = 'string';
                }
            } else if (!responseObj.content && (code === '401' || code === '403')) {
                // Infer void/unknown for auth errors without content
                type = 'void';
            }

            errors.push({
                code,
                type,
                ...(responseObj.description && { description: responseObj.description })
            });
        }

        return errors;
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
                ...(param.deprecated && { leadingTrivia: [`/** @deprecated */ `] })
            });
        });

        // 2. Request Body Param
        const requestBody = operation.requestBody;
        if (requestBody) {
            const contentMap = requestBody.content || {};
            let contentType = Object.keys(contentMap)[0];

            // Prioritize specific types
            if (contentMap['application/json']) contentType = 'application/json';
            else if (contentMap['application/xml']) contentType = 'application/xml';
            else if (contentMap['multipart/form-data']) contentType = 'multipart/form-data';
            else if (contentMap['multipart/mixed']) contentType = 'multipart/mixed';
            else if (contentMap['multipart/byteranges']) contentType = 'multipart/byteranges';
            else if (contentMap['application/x-www-form-urlencoded']) contentType = 'application/x-www-form-urlencoded';

            const content = contentMap[contentType!];
            const effectiveSchema = content?.schema || content?.itemSchema;

            if (effectiveSchema) {
                let bodyType = getTypeScriptType(effectiveSchema as SwaggerDefinition, this.config, knownTypes);

                if (!content.schema && content.itemSchema) {
                    bodyType = `(${bodyType})[]`;
                }

                const rawBodyType = bodyType.replace(/\[\]| \| null/g, '');
                if (knownTypes.includes(rawBodyType)) {
                    const schemaObj = this.parser.schemas.find(s => s.name === rawBodyType);
                    const definition = schemaObj?.definition;
                    if (definition && this.needsRequestType(definition)) {
                        bodyType = bodyType.replace(rawBodyType, `${rawBodyType}Request`);
                    }
                }
                const bodyName = isDataTypeInterface(rawBodyType) ? camelCase(rawBodyType) : 'body';
                parameters.push({ name: bodyName, type: bodyType, hasQuestionToken: !requestBody.required });
            } else if (contentType && (contentType.startsWith('multipart/') || contentType === 'multipart/form-data' || contentType === 'multipart/mixed')) {
                parameters.push({
                    name: 'body',
                    type: 'FormData | any[] | any',
                    hasQuestionToken: !requestBody.required
                });
            } else {
                parameters.push({ name: 'body', type: 'unknown', hasQuestionToken: !requestBody.required });
            }
        }

        return parameters.sort((a, b) => (a.hasQuestionToken ? 1 : 0) - (b.hasQuestionToken ? 1 : 0));
    }

    private analyzeBody(operation: PathInfo, parameters: OptionalKind<ParameterDeclarationStructure>[]): BodyVariant | undefined {
        const nonBodyOpParams = new Set((operation.parameters ?? []).map(p => camelCase(p.name)));
        const bodyParamDef = parameters.find(p => !nonBodyOpParams.has(p.name!));

        const formDataParams = operation.parameters?.filter(p => (p as any).in === 'formData');
        if (formDataParams && formDataParams.length > 0) {
            const isMulti = operation.consumes?.includes('multipart/form-data');
            if (isMulti) {
                return { type: 'encoded-form-data', paramName: 'formData', mappings: [] };
            } else {
                return { type: 'encoded-form-data', paramName: 'formBody', mappings: [] };
            }
        }

        if (!bodyParamDef) return undefined;

        const bodyParamName = bodyParamDef.name!;
        const rb = operation.requestBody;
        if (!rb || !rb.content) return { type: 'raw', paramName: bodyParamName };

        const multipartKey = rb.content['multipart/form-data']
            ? 'multipart/form-data'
            : (rb.content['multipart/mixed']
                ? 'multipart/mixed'
                : (rb.content['multipart/byteranges'] ? 'multipart/byteranges' : undefined));

        if (multipartKey) {
            const mediaType = rb.content[multipartKey];
            const schema = mediaType.schema as SwaggerDefinition;

            const multipartConfig: {
                mediaType?: string;
                encoding?: Record<string, EncodingProperty>;
                prefixEncoding?: EncodingProperty[];
                itemEncoding?: EncodingProperty;
            } = { mediaType: multipartKey };

            if (mediaType.encoding) {
                multipartConfig.encoding = { ...mediaType.encoding };
            }
            if (mediaType.prefixEncoding) {
                multipartConfig.prefixEncoding = [...mediaType.prefixEncoding];
            }
            if (mediaType.itemEncoding) {
                multipartConfig.itemEncoding = { ...mediaType.itemEncoding };
            }

            if (schema && schema.properties) {
                if (!multipartConfig.encoding) {
                    multipartConfig.encoding = {};
                }

                Object.entries(schema.properties).forEach(([propName, propSchema]) => {
                    this.enrichEncodingConfig(propSchema, multipartConfig.encoding!, propName);
                });
            }

            if (schema && (schema.type === 'array' || schema.items || schema.prefixItems)) {
                if (schema.prefixItems && Array.isArray(schema.prefixItems)) {
                    if (!multipartConfig.prefixEncoding) {
                        multipartConfig.prefixEncoding = [];
                    }
                    schema.prefixItems.forEach((prefixItemSchema, index) => {
                        if (!multipartConfig.prefixEncoding![index]) {
                            multipartConfig.prefixEncoding![index] = {};
                        }
                        const wrapper = { 'temp': multipartConfig.prefixEncoding![index] };
                        this.enrichEncodingConfig(prefixItemSchema, wrapper, 'temp');
                    });
                }

                if (schema.items && !Array.isArray(schema.items)) {
                    if (!multipartConfig.itemEncoding) {
                        multipartConfig.itemEncoding = {};
                    }
                    const wrapper = { 'temp': multipartConfig.itemEncoding };
                    this.enrichEncodingConfig(schema.items as SwaggerDefinition, wrapper, 'temp');
                }
            }

            // Optimization: If no array-specific encoding and default form-data structure, simplify
            if (multipartConfig.mediaType === 'multipart/form-data' && multipartConfig.encoding && !multipartConfig.prefixEncoding && !multipartConfig.itemEncoding) {
                return {
                    type: 'multipart',
                    paramName: bodyParamName,
                    config: multipartConfig.encoding
                };
            }

            return {
                type: 'multipart',
                paramName: bodyParamName,
                config: multipartConfig
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

    private enrichEncodingConfig(propSchema: SwaggerDefinition, configMap: Record<string, EncodingProperty>, key: string) {
        const resolvedProp = this.parser.resolve(propSchema);
        if (!configMap[key]) {
            configMap[key] = {};
        }

        if (!configMap[key].contentType) {
            if (resolvedProp?.type === 'object' || resolvedProp?.type === 'array') {
                configMap[key].contentType = 'application/json';
            }
        }

        if (resolvedProp?.contentEncoding) {
            if (!configMap[key].headers) {
                configMap[key].headers = {};
            }
            const headers = configMap[key].headers as any;
            const hasTransferHeader = Object.keys(headers).some(h => h.toLowerCase() === 'content-transfer-encoding');
            if (!hasTransferHeader) {
                headers['Content-Transfer-Encoding'] = resolvedProp.contentEncoding;
            }
        }
    }

    private isJsonContent(p: Parameter): boolean {
        if (!p.content) return false;
        const keys = Object.keys(p.content);
        return keys.some(k => k.includes('application/json') || k.includes('*/*'));
    }

    private isJsonContentMediaType(p: Parameter): boolean {
        if (!p.schema) return false;

        // Direct ContentMediaType (OAS 3.1)
        if ((p.schema as SwaggerDefinition).contentMediaType && (p.schema as SwaggerDefinition).contentMediaType!.includes('application/json')) {
            return true;
        }

        // Look inside resolved schema
        const resolved = this.parser.resolve(p.schema);
        if (resolved && resolved.contentMediaType && resolved.contentMediaType.includes('application/json')) {
            return true;
        }

        return false;
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

        if (resolved.xml?.nodeType) {
            config.nodeType = resolved.xml.nodeType;
        } else if (resolved.xml?.wrapped) {
            config.nodeType = 'element';
        } else {
            const isRef = !!(schema as any)?.$ref || !!(schema as any)?.$dynamicRef;
            const isArray = resolved.type === 'array';

            if (isRef || isArray) {
                config.nodeType = 'none';
            } else {
                config.nodeType = 'element';
            }
        }

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

    private getDecodingConfig(schema: SwaggerDefinition | undefined, depth: number = 5): any {
        if (!schema || depth <= 0) return {};
        const resolved = this.parser.resolve(schema);
        if (!resolved) return {};

        const config: any = {};

        // Direct content schema on a string field
        if (resolved.contentSchema && resolved.type === 'string') {
            config.decode = true;
            return config;
        }

        if (resolved.type === 'array' && resolved.items) {
            const itemConfig = this.getDecodingConfig(resolved.items as SwaggerDefinition, depth - 1);
            if (Object.keys(itemConfig).length > 0) {
                config.items = itemConfig;
            }
        }

        if (resolved.properties) {
            const propConfigs: Record<string, any> = {};
            Object.entries(resolved.properties).forEach(([propName, propSchema]) => {
                const pConfig = this.getDecodingConfig(propSchema, depth - 1);
                if (Object.keys(pConfig).length > 0) {
                    propConfigs[propName] = pConfig;
                }
            });
            if (Object.keys(propConfigs).length > 0) {
                config.properties = propConfigs;
            }
        }

        if (resolved.allOf) {
            resolved.allOf.forEach(sub => {
                const subConfig = this.getDecodingConfig(sub, depth - 1);
                if (subConfig.properties) {
                    config.properties = { ...config.properties || {}, ...subConfig.properties };
                }
            });
        }

        return config;
    }

    /**
     * Builds the encoding configuration for a request body, allowing for
     * auto-encoding of JSON strings nested within the body.
     */
    private getEncodingConfig(schema: SwaggerDefinition | undefined, depth: number = 5): any {
        if (!schema || depth <= 0) return {};
        const resolved = this.parser.resolve(schema);
        if (!resolved) return {};

        const config: any = {};

        // Check if this property is a string that should contain JSON (OAS 3.1)
        if (resolved.type === 'string' && resolved.contentMediaType && resolved.contentMediaType.includes('json')) {
            config.encode = true;
            return config;
        }

        if (resolved.type === 'array' && resolved.items) {
            const itemConfig = this.getEncodingConfig(resolved.items as SwaggerDefinition, depth - 1);
            if (Object.keys(itemConfig).length > 0) {
                config.items = itemConfig;
            }
        }

        if (resolved.properties) {
            const propConfigs: Record<string, any> = {};
            Object.entries(resolved.properties).forEach(([propName, propSchema]) => {
                const pConfig = this.getEncodingConfig(propSchema, depth - 1);
                if (Object.keys(pConfig).length > 0) {
                    propConfigs[propName] = pConfig;
                }
            });
            if (Object.keys(propConfigs).length > 0) {
                config.properties = propConfigs;
            }
        }

        // Handle allOf inheritance
        if (resolved.allOf) {
            resolved.allOf.forEach(sub => {
                const subConfig = this.getEncodingConfig(sub, depth - 1);
                if (subConfig.properties) {
                    config.properties = { ...config.properties || {}, ...subConfig.properties };
                }
            });
        }

        return config;
    }
}
