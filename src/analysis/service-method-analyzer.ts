// src/analysis/service-method-analyzer.ts
import {
    EncodingProperty,
    GeneratorConfig,
    MediaTypeObject,
    Parameter,
    PathInfo,
    SwaggerDefinition,
    SwaggerResponse,
} from '@src/core/types/index.js';
import { camelCase, getTypeScriptType, isDataTypeInterface, sanitizeComment } from '@src/core/utils/index.js';
import { SwaggerParser } from '@src/core/parser.js';
import { OptionalKind, ParameterDeclarationStructure } from 'ts-morph';
import {
    BodyVariant,
    ErrorResponseInfo,
    ParamSerialization,
    ResponseSerialization,
    ResponseVariant,
    ServiceMethodModel,
} from './service-method-types.js';

export class ServiceMethodAnalyzer {
    constructor(
        private config: GeneratorConfig,
        private parser: SwaggerParser,
    ) {}

    public analyze(operation: PathInfo): ServiceMethodModel | null {
        if (!operation.methodName) return null;

        const knownTypes = this.parser.schemas.map(s => s.name);
        const { variants: responseVariants, successCode } = this.analyzeResponse(operation, knownTypes);

        const defaultVariant = responseVariants.find(v => v.isDefault) ||
            responseVariants[0] || {
                mediaType: 'application/json',
                type: 'any',
                serialization: 'json',
                isDefault: true,
            };

        const errorResponses = this.analyzeErrorResponses(operation, knownTypes, successCode);

        const parameters = this.analyzeParameters(operation, knownTypes);

        const pathParams: ParamSerialization[] = [];
        const queryParams: ParamSerialization[] = [];
        const headerParams: ParamSerialization[] = [];
        const cookieParams: ParamSerialization[] = [];

        (operation.parameters || []).forEach(p => {
            if (this.isIgnoredHeaderParam(p)) return;
            const paramName = camelCase(p.name);

            const effectiveStyle = p.style || (p.in === 'query' || p.in === 'cookie' ? 'form' : 'simple');
            const defaultExplode = effectiveStyle === 'form' || effectiveStyle === 'cookie';
            const explode = p.explode ?? defaultExplode;

            const explicitJson = this.isJsonContent(p);
            const implicitJson = this.isJsonContentMediaType(p);
            const { contentType, encoding } = this.getParameterContent(p);
            const paramSchema = this.getParameterSchema(p, contentType);
            const encoderConfig = this.getEncodingConfig(paramSchema);
            const hasEncoderConfig = Object.keys(encoderConfig).length > 0;

            let serializationLink: 'json' | 'json-subset' | undefined;
            if (explicitJson) serializationLink = 'json';
            else if (implicitJson) serializationLink = 'json';

            const serialization: ParamSerialization = {
                paramName: this.isXmlContent(p) ? `${paramName}Serialized` : paramName,
                originalName: p.name,
                explode: explode,
                allowReserved: p.allowReserved ?? false,
                serializationLink,
                ...(p.style != null && { style: p.style }),
                ...(contentType ? { contentType } : {}),
                ...(encoding ? { encoding } : {}),
                ...(hasEncoderConfig ? { contentEncoderConfig: encoderConfig } : {}),
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
                case 'querystring' as string:
                    queryParams.push(serialization);
                    break;
            }
        });

        const body = this.analyzeBody(operation, parameters);
        const requestContentType = this.getRequestBodyContentType(operation.requestBody);

        let requestEncodingConfig: Record<string, unknown> | undefined = undefined;
        if (
            body &&
            (body.type === 'json' ||
                body.type === 'json-lines' ||
                body.type === 'json-seq' ||
                body.type === 'urlencoded')
        ) {
            const rbContent = operation.requestBody?.content;
            if (rbContent) {
                const contentType = this.selectRequestBodyContentType(
                    rbContent as Record<string, { schema?: SwaggerDefinition }>,
                );
                if (contentType && rbContent[contentType]?.schema !== undefined) {
                    const cfg = this.getEncodingConfig(rbContent[contentType]!.schema as SwaggerDefinition);
                    if (Object.keys(cfg).length > 0) {
                        requestEncodingConfig = cfg;
                    }
                }
            }
        }

        const specSecurity = this.parser.getSpec().security;
        const opSecurity = operation.security;
        const effectiveSecurity = opSecurity !== undefined ? opSecurity : specSecurity || [];

        const extensions: Record<string, unknown> = {};
        Object.keys(operation).forEach(key => {
            if (key.startsWith('x-')) {
                extensions[key] = (operation as Record<string, unknown>)[key];
            }
        });

        let basePath: string | undefined;
        const operationServers = operation.servers && operation.servers.length > 0 ? operation.servers : undefined;
        if (operationServers && operationServers.length > 0) {
            const s = operationServers[0]!;
            basePath = s.url;
            if (s.variables) {
                Object.entries(s.variables).forEach(([key, variable]) => {
                    basePath = basePath!.replace(`{${key}}`, variable.default);
                });
            }
        }

        const rawDescription = operation.description || '';
        const rawSummary = operation.summary || '';

        let docText =
            (rawSummary || rawDescription || `Performs a ${operation.method} request to ${operation.path}.`) +
            (rawDescription && rawSummary ? `\n\n${rawDescription}` : '');

        docText = sanitizeComment(docText);

        if (operation.externalDocs?.url) {
            const cleanDesc = sanitizeComment(operation.externalDocs.description || '');
            docText += `\n\n@see ${operation.externalDocs.url} ${cleanDesc}`.trimEnd();
        }
        if (operation.tags && operation.tags.length > 0) {
            const tagList = operation.tags.map(tag => sanitizeComment(tag)).filter(Boolean);
            if (tagList.length > 0) {
                docText += `\n\n@tags ${tagList.join(', ')}`;
            }
        }
        if (operation.servers && operation.servers.length > 0) {
            operation.servers.forEach(server => {
                docText += `\n\n@server ${JSON.stringify(server)}`;
            });
        }
        if (opSecurity && opSecurity.length > 0) {
            docText += `\n\n@security ${JSON.stringify(opSecurity)}`;
        }
        if (Object.keys(extensions).length > 0) {
            Object.entries(extensions).forEach(([key, value]) => {
                if (!key.startsWith('x-')) return;
                const serialized = value === undefined ? 'true' : JSON.stringify(value);
                docText += `\n\n@${key} ${serialized}`;
            });
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

            responseType: defaultVariant.type,
            responseSerialization: defaultVariant.serialization,
            ...(defaultVariant.xmlConfig ? { responseXmlConfig: defaultVariant.xmlConfig } : {}),
            ...(defaultVariant.decodingConfig ? { responseDecodingConfig: defaultVariant.decodingConfig } : {}),
            ...(defaultVariant.sseMode ? { sseMode: defaultVariant.sseMode as 'event' | 'data' } : {}),

            responseVariants,

            ...(requestEncodingConfig ? { requestEncodingConfig } : {}),
            errorResponses,
            pathParams,
            queryParams,
            headerParams,
            cookieParams,
            ...(requestContentType ? { requestContentType } : {}),
            security: effectiveSecurity,
            extensions,
            hasServers: !!basePath,
            ...(body != null && { body }),
            ...(basePath != null && { basePath }),
            ...(operationServers ? { operationServers } : {}),
        };
    }

    private analyzeResponse(
        operation: PathInfo,
        knownTypes: string[],
    ): {
        variants: ResponseVariant[];
        successCode?: string;
    } {
        const variants: ResponseVariant[] = [];

        if (!operation.responses || Object.keys(operation.responses).length === 0) {
            const reqSchema = operation.requestBody?.content?.['application/json']?.schema;
            if (reqSchema !== undefined) {
                variants.push({
                    mediaType: 'application/json',
                    type: getTypeScriptType(reqSchema as SwaggerDefinition, this.config, knownTypes),
                    serialization: 'json',
                    isDefault: true,
                });
            }
            return { variants };
        }

        const responses = operation.responses;

        const explicitSuccessCodes = Object.keys(responses).filter(code => /^2\d{2}$/.test(code));
        const rangeSuccessCodes = Object.keys(responses).filter(code => code === '2XX');
        let codesToProcess = explicitSuccessCodes.length > 0 ? explicitSuccessCodes : rangeSuccessCodes;
        let successCode: string | undefined = undefined;

        if (codesToProcess.length === 0) {
            if (responses['default']) {
                codesToProcess = ['default'];
                successCode = 'default';
            } else {
                return { variants };
            }
        }

        const addVariant = (variant: ResponseVariant) => {
            const key = `${variant.mediaType}|${variant.type}|${variant.serialization}`;
            const existing = variants.find(v => `${v.mediaType}|${v.type}|${v.serialization}` === key);
            if (existing) {
                existing.isDefault = existing.isDefault || variant.isDefault;
                return;
            }
            variants.push(variant);
        };

        const processResponseContent = (responseObj: SwaggerResponse) => {
            if (!responseObj?.content) {
                return;
            }

            Object.entries(responseObj.content).forEach(([mediaType, mediaObj]) => {
                if (!mediaObj) return;
                const normalized = this.normalizeMediaType(mediaType);
                const hasSchema =
                    (mediaObj as MediaTypeObject).schema !== undefined ||
                    (mediaObj as MediaTypeObject).itemSchema !== undefined;

                if (normalized.includes('json') || normalized === '*/*') {
                    if (!hasSchema) return;
                    let serialization: ResponseSerialization = 'json';
                    let type = 'any';
                    let decodingConfig: Record<string, unknown> | undefined = undefined;

                    const sequentialKind = this.inferSequentialJsonKind(normalized, mediaObj as MediaTypeObject);
                    const sequentialSchema =
                        (mediaObj as MediaTypeObject).itemSchema !== undefined
                            ? (mediaObj as MediaTypeObject).itemSchema
                            : (mediaObj as MediaTypeObject).schema !== undefined
                              ? (((mediaObj as MediaTypeObject).schema as Record<string, unknown>)?.items ??
                                (mediaObj as MediaTypeObject).schema)
                              : undefined;

                    if (sequentialKind) {
                        serialization = sequentialKind === 'json-seq' ? 'json-seq' : 'json-lines';
                        const itemType = this.resolveType(sequentialSchema, knownTypes);
                        type = `(${itemType})[]`;
                    } else {
                        const schema = (mediaObj as MediaTypeObject).schema;
                        if (schema !== undefined) {
                            type = getTypeScriptType(schema as SwaggerDefinition, this.config, knownTypes);
                            const dConf = this.getDecodingConfig(schema as SwaggerDefinition);
                            if (Object.keys(dConf).length > 0) decodingConfig = dConf;
                        } else {
                            type = 'any';
                        }
                    }

                    addVariant({
                        mediaType,
                        type,
                        serialization,
                        isDefault: false,
                        ...(decodingConfig ? { decodingConfig } : {}),
                    });
                    return;
                }

                if (normalized === 'application/xml' || normalized.endsWith('+xml')) {
                    const schema = (mediaObj as MediaTypeObject).schema as SwaggerDefinition;
                    if (schema !== undefined) {
                        const xmlConfig = this.getXmlConfig(schema, 5);
                        const type = getTypeScriptType(schema, this.config, knownTypes);
                        addVariant({
                            mediaType,
                            type,
                            serialization: 'xml',
                            isDefault: false,
                            ...(xmlConfig ? { xmlConfig } : {}),
                        });
                    } else {
                        addVariant({ mediaType, type: 'string', serialization: 'text', isDefault: false });
                    }
                    return;
                }

                if (normalized === 'text/event-stream') {
                    const effectiveSchema =
                        (mediaObj as MediaTypeObject).schema !== undefined
                            ? (mediaObj as MediaTypeObject).schema
                            : (mediaObj as MediaTypeObject).itemSchema !== undefined
                              ? (mediaObj as MediaTypeObject).itemSchema
                              : undefined;
                    const itemType =
                        effectiveSchema !== undefined
                            ? getTypeScriptType(effectiveSchema as SwaggerDefinition, this.config, knownTypes)
                            : 'any';
                    const decodingConfig =
                        effectiveSchema !== undefined
                            ? this.getDecodingConfig(effectiveSchema as SwaggerDefinition)
                            : undefined;
                    const sseMode =
                        effectiveSchema !== undefined ? this.getSseMode(effectiveSchema as SwaggerDefinition) : 'data';
                    addVariant({
                        mediaType,
                        type: itemType,
                        serialization: 'sse',
                        isDefault: false,
                        ...(decodingConfig ? { decodingConfig } : {}),
                        ...(sseMode ? { sseMode } : {}),
                    });
                    return;
                }

                if (normalized.startsWith('text/')) {
                    addVariant({ mediaType, type: 'string', serialization: 'text', isDefault: false });
                    return;
                }

                addVariant({ mediaType, type: 'Blob', serialization: 'blob', isDefault: false });
            });
        };

        if (responses['204']) {
            addVariant({ mediaType: '', type: 'void', serialization: 'json', isDefault: false });
        }

        codesToProcess.forEach(code => {
            const responseObj = responses[code];
            if (!responseObj) return;
            if (code === '204') return;
            processResponseContent(responseObj as SwaggerResponse);
        });

        if (variants.length === 0) {
            const reqSchema = operation.requestBody?.content?.['application/json']?.schema;
            if (reqSchema !== undefined) {
                addVariant({
                    mediaType: 'application/json',
                    type: getTypeScriptType(reqSchema as SwaggerDefinition, this.config, knownTypes),
                    serialization: 'json',
                    isDefault: true,
                });
            }
        }

        if (variants.length > 0) {
            const scored = variants.map(variant => ({
                variant,
                normalized: this.normalizeMediaType(variant.mediaType),
            }));
            scored.sort((a, b) => {
                const specDiff =
                    this.getMediaTypeSpecificity(b.normalized) - this.getMediaTypeSpecificity(a.normalized);
                if (specDiff !== 0) return specDiff;
                const prefDiff = this.getMediaTypePreference(a.normalized) - this.getMediaTypePreference(b.normalized);
                if (prefDiff !== 0) return prefDiff;
                return 0;
            });

            variants.forEach(v => {
                v.isDefault = false;
            });
            if (scored[0]) scored[0].variant.isDefault = true;
        }

        return { variants, ...(successCode ? { successCode } : {}) };
    }

    private resolveType(schema: unknown, knownTypes: string[]): string {
        return schema !== undefined ? getTypeScriptType(schema as SwaggerDefinition, this.config, knownTypes) : 'any';
    }

    private analyzeErrorResponses(
        operation: PathInfo,
        knownTypes: string[],
        successCode?: string,
    ): ErrorResponseInfo[] {
        if (!operation.responses) return [];

        const errors: ErrorResponseInfo[] = [];
        const pickJsonSchema = (
            content: Record<string, { schema?: SwaggerDefinition }>,
        ): SwaggerDefinition | undefined => {
            const direct = content['application/json']?.schema;
            if (direct !== undefined) return direct as SwaggerDefinition;

            const jsonLikeEntry = Object.entries(content).find(([mediaType, obj]) => {
                const normalized = this.normalizeMediaType(mediaType);
                if (normalized === '*/*') return false;
                return this.isJsonMediaType(normalized) && obj?.schema !== undefined;
            });
            if (jsonLikeEntry) return jsonLikeEntry[1]!.schema as SwaggerDefinition;

            const wildcard = content['*/*']?.schema;
            return wildcard as SwaggerDefinition | undefined;
        };
        const pickXmlSchema = (
            content: Record<string, { schema?: SwaggerDefinition }>,
        ): SwaggerDefinition | undefined => {
            const entries = Object.entries(content);
            for (const [mediaType, obj] of entries) {
                const normalized = this.normalizeMediaType(mediaType);
                if (!this.isXmlMediaType(normalized)) continue;
                if (obj?.schema !== undefined) return obj.schema as SwaggerDefinition;
            }
            return undefined;
        };

        for (const [code, responseObj] of Object.entries(operation.responses)) {
            if (code === successCode) continue;
            if (/^2\d{2}$/.test(code) || code === '2XX') continue;

            let type = 'unknown';
            if ((responseObj as SwaggerResponse).content) {
                const content = (responseObj as SwaggerResponse).content!;
                const jsonSchema = pickJsonSchema(content as Record<string, { schema?: SwaggerDefinition }>);
                if (jsonSchema !== undefined) {
                    type = getTypeScriptType(jsonSchema as SwaggerDefinition, this.config, knownTypes);
                } else {
                    const xmlSchema = pickXmlSchema(content as Record<string, { schema?: SwaggerDefinition }>);
                    if (xmlSchema !== undefined) {
                        type = getTypeScriptType(xmlSchema as SwaggerDefinition, this.config, knownTypes);
                    } else if (Object.keys(content).some(mt => this.isTextMediaType(this.normalizeMediaType(mt)))) {
                        type = 'string';
                    } else {
                        const nonTextMedia = Object.keys(content).find(mt => {
                            const normalized = this.normalizeMediaType(mt);
                            return (
                                normalized !== '' &&
                                !this.isJsonMediaType(normalized) &&
                                !this.isXmlMediaType(normalized) &&
                                !this.isTextMediaType(normalized)
                            );
                        });
                        if (nonTextMedia) {
                            type = 'Blob';
                        }
                    }
                }
            } else if (!(responseObj as SwaggerResponse).content && (code === '401' || code === '403')) {
                type = 'void';
            }

            errors.push({
                code,
                type,
                ...((responseObj as SwaggerResponse).description && {
                    description: sanitizeComment((responseObj as SwaggerResponse).description),
                }),
            });
        }

        return errors;
    }

    private analyzeParameters(
        operation: PathInfo,
        knownTypes: string[],
    ): OptionalKind<ParameterDeclarationStructure>[] {
        const parameters: OptionalKind<ParameterDeclarationStructure>[] = [];

        (operation.parameters ?? []).forEach(param => {
            if (this.isIgnoredHeaderParam(param)) return;
            let effectiveSchema = param.schema;
            if (param.content) {
                const firstType = Object.keys(param.content)[0];
                if (firstType && param.content[firstType]!.schema !== undefined) {
                    effectiveSchema = param.content[firstType]!.schema as SwaggerDefinition;
                }
            }
            const paramType = getTypeScriptType(effectiveSchema, this.config, knownTypes);
            parameters.push({
                name: camelCase(param.name),
                type: paramType,
                hasQuestionToken: !param.required,
                ...(param.deprecated && { leadingTrivia: [`/** @deprecated */ `] }),
            });
        });

        const requestBody = operation.requestBody;
        if (requestBody) {
            const contentMap = requestBody.content || {};
            const contentType = this.selectRequestBodyContentType(
                contentMap as Record<string, { schema?: SwaggerDefinition }>,
            );
            const normalized = contentType ? this.normalizeMediaType(contentType) : undefined;

            const content = contentType ? contentMap[contentType] : undefined;
            const effectiveSchema =
                (content as MediaTypeObject)?.schema !== undefined
                    ? (content as MediaTypeObject).schema
                    : (content as MediaTypeObject)?.itemSchema !== undefined
                      ? (content as MediaTypeObject).itemSchema
                      : undefined;

            const sequentialKind = normalized
                ? this.inferSequentialJsonKind(normalized, content as MediaTypeObject | undefined)
                : undefined;

            if (contentType && normalized && sequentialKind) {
                const itemSchema =
                    (content as MediaTypeObject)?.itemSchema !== undefined
                        ? (content as MediaTypeObject).itemSchema
                        : (content as MediaTypeObject)?.schema &&
                            typeof (content as MediaTypeObject).schema === 'object' &&
                            ((content as MediaTypeObject).schema as Record<string, unknown>).items
                          ? ((content as MediaTypeObject).schema as Record<string, unknown>).items
                          : (content as MediaTypeObject)?.schema !== undefined
                            ? (content as MediaTypeObject).schema
                            : undefined;
                const itemType = itemSchema
                    ? getTypeScriptType(itemSchema as SwaggerDefinition, this.config, knownTypes)
                    : 'any';
                const needsParens = itemType.includes('|') || itemType.includes('&');
                let bodyType = `${needsParens ? `(${itemType})` : itemType}[]`;

                const rawBodyType = itemType.replace(/\[]| \| null/g, '');
                if (knownTypes.includes(rawBodyType)) {
                    const schemaObj = this.parser.schemas.find(s => s.name === rawBodyType);
                    const definition = schemaObj?.definition;
                    if (definition && typeof definition === 'object' && this.needsRequestType(definition)) {
                        bodyType = bodyType.replace(rawBodyType, `${rawBodyType}Request`);
                    }
                }
                const bodyName = isDataTypeInterface(rawBodyType) ? camelCase(rawBodyType) : 'body';
                parameters.push({ name: bodyName, type: bodyType, hasQuestionToken: !requestBody.required });
            } else if (contentType && normalized && this.isJsonMediaType(normalized) && effectiveSchema !== undefined) {
                let bodyType = getTypeScriptType(effectiveSchema as SwaggerDefinition, this.config, knownTypes);

                if (
                    content &&
                    (content as MediaTypeObject).schema === undefined &&
                    (content as MediaTypeObject).itemSchema !== undefined
                ) {
                    bodyType = `(${bodyType})[]`;
                }

                const rawBodyType = bodyType.replace(/\[]| \| null/g, '');
                if (knownTypes.includes(rawBodyType)) {
                    const schemaObj = this.parser.schemas.find(s => s.name === rawBodyType);
                    const definition = schemaObj?.definition;
                    if (definition && typeof definition === 'object' && this.needsRequestType(definition)) {
                        bodyType = bodyType.replace(rawBodyType, `${rawBodyType}Request`);
                    }
                }
                const bodyName = isDataTypeInterface(rawBodyType) ? camelCase(rawBodyType) : 'body';
                parameters.push({ name: bodyName, type: bodyType, hasQuestionToken: !requestBody.required });
            } else if (normalized && this.isMultipartMediaType(normalized)) {
                parameters.push({
                    name: 'body',
                    type: 'FormData | any[] | any',
                    hasQuestionToken: !requestBody.required,
                });
            } else if (normalized && this.isXmlMediaType(normalized)) {
                const rawBodyType = effectiveSchema
                    ? getTypeScriptType(effectiveSchema as SwaggerDefinition, this.config, knownTypes)
                    : 'string';
                const bodyType = rawBodyType.includes('|') ? `(${rawBodyType})` : rawBodyType;
                const bodyName = isDataTypeInterface(rawBodyType) ? camelCase(rawBodyType) : 'body';
                parameters.push({ name: bodyName, type: bodyType, hasQuestionToken: !requestBody.required });
            } else if (normalized && this.isTextMediaType(normalized)) {
                parameters.push({ name: 'body', type: 'string', hasQuestionToken: !requestBody.required });
            } else if (normalized && this.isFormUrlEncodedMediaType(normalized)) {
                const rawBodyType = effectiveSchema
                    ? getTypeScriptType(effectiveSchema as SwaggerDefinition, this.config, knownTypes)
                    : 'any';
                const bodyType = rawBodyType.includes('|') ? `(${rawBodyType})` : rawBodyType;
                const bodyName = isDataTypeInterface(rawBodyType) ? camelCase(rawBodyType) : 'body';
                parameters.push({ name: bodyName, type: bodyType, hasQuestionToken: !requestBody.required });
            } else if (contentType && normalized) {
                const rawBodyType = effectiveSchema
                    ? getTypeScriptType(effectiveSchema as SwaggerDefinition, this.config, knownTypes)
                    : this.isBinaryMediaType(normalized)
                      ? 'Blob'
                      : 'unknown';
                const bodyType = rawBodyType.includes('|') ? `(${rawBodyType})` : rawBodyType;
                const bodyName = isDataTypeInterface(rawBodyType) ? camelCase(rawBodyType) : 'body';
                parameters.push({ name: bodyName, type: bodyType, hasQuestionToken: !requestBody.required });
            } else {
                parameters.push({ name: 'body', type: 'unknown', hasQuestionToken: !requestBody.required });
            }
        }

        return parameters.sort((a, b) => (a.hasQuestionToken ? 1 : 0) - (b.hasQuestionToken ? 1 : 0));
    }

    private isIgnoredHeaderParam(param: Parameter): boolean {
        if (param.in !== 'header') return false;
        const name = String(param.name || '').toLowerCase();
        return name === 'accept' || name === 'content-type' || name === 'authorization';
    }

    private analyzeBody(
        operation: PathInfo,
        parameters: OptionalKind<ParameterDeclarationStructure>[],
    ): BodyVariant | undefined {
        const nonBodyOpParams = new Set((operation.parameters ?? []).map(p => camelCase(p.name)));
        const bodyParamDef = parameters.find(p => !nonBodyOpParams.has(p.name!));

        const formDataParams = operation.parameters?.filter(p => (p as Record<string, unknown>).in === 'formData');
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

        const selectedContentType = this.selectRequestBodyContentType(
            rb.content as Record<string, { schema?: SwaggerDefinition }>,
        );
        if (!selectedContentType) return { type: 'raw', paramName: bodyParamName };

        const normalizedContentType = this.normalizeMediaType(selectedContentType);

        const multipartKey =
            normalizedContentType === 'multipart/form-data' || normalizedContentType === 'multipart/mixed'
                ? normalizedContentType
                : normalizedContentType === 'multipart/byteranges'
                  ? normalizedContentType
                  : normalizedContentType.startsWith('multipart/')
                    ? normalizedContentType
                    : undefined;

        if (multipartKey) {
            const mediaType = rb.content[selectedContentType];
            const schema = (mediaType as MediaTypeObject).schema as SwaggerDefinition | boolean | undefined;

            const multipartConfig: {
                mediaType?: string;
                encoding?: Record<string, EncodingProperty>;
                prefixEncoding?: EncodingProperty[];
                itemEncoding?: EncodingProperty;
            } = { mediaType: multipartKey };

            if ((mediaType as MediaTypeObject).encoding) {
                multipartConfig.encoding = { ...(mediaType as MediaTypeObject).encoding };
            }
            if ((mediaType as MediaTypeObject).prefixEncoding) {
                multipartConfig.prefixEncoding = [...(mediaType as MediaTypeObject).prefixEncoding!];
            }
            if ((mediaType as MediaTypeObject).itemEncoding) {
                multipartConfig.itemEncoding = { ...(mediaType as MediaTypeObject).itemEncoding };
            }

            if (schema && typeof schema === 'object' && schema.properties) {
                if (!multipartConfig.encoding) {
                    multipartConfig.encoding = {};
                }

                Object.entries(schema.properties).forEach(([propName, propSchema]) => {
                    this.enrichEncodingConfig(propSchema, multipartConfig.encoding!, propName);
                });
            }

            if (
                schema &&
                typeof schema === 'object' &&
                (schema.type === 'array' || schema.items || schema.prefixItems)
            ) {
                if (schema.prefixItems && Array.isArray(schema.prefixItems)) {
                    if (!multipartConfig.prefixEncoding) {
                        multipartConfig.prefixEncoding = [];
                    }
                    schema.prefixItems.forEach((prefixItemSchema, index) => {
                        if (!multipartConfig.prefixEncoding![index]) {
                            multipartConfig.prefixEncoding![index] = {};
                        }
                        const wrapper = { temp: multipartConfig.prefixEncoding![index]! };
                        this.enrichEncodingConfig(prefixItemSchema as SwaggerDefinition | boolean, wrapper, 'temp');
                    });
                }

                if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
                    if (!multipartConfig.itemEncoding) {
                        multipartConfig.itemEncoding = {};
                    }
                    const wrapper = { temp: multipartConfig.itemEncoding };
                    this.enrichEncodingConfig(schema.items as SwaggerDefinition, wrapper, 'temp');
                }
            }

            if (
                multipartConfig.mediaType === 'multipart/form-data' &&
                multipartConfig.encoding &&
                !multipartConfig.prefixEncoding &&
                !multipartConfig.itemEncoding
            ) {
                return {
                    type: 'multipart',
                    paramName: bodyParamName,
                    config: multipartConfig.encoding,
                };
            }

            return {
                type: 'multipart',
                paramName: bodyParamName,
                config: multipartConfig,
            };
        }

        if (this.isFormUrlEncodedMediaType(normalizedContentType)) {
            const encodingConfig: Record<string, EncodingProperty> = {
                ...((rb.content[selectedContentType] as MediaTypeObject)?.encoding || {}),
            };
            const schema = (rb.content[selectedContentType] as MediaTypeObject)?.schema as
                | SwaggerDefinition
                | boolean
                | undefined;

            if (schema && typeof schema === 'object' && schema.properties) {
                Object.entries(schema.properties).forEach(([propName, propSchema]) => {
                    if (!encodingConfig[propName]) {
                        encodingConfig[propName] = {};
                    }
                    const entry = encodingConfig[propName]!;
                    const hasSerializationHints =
                        entry.style !== undefined || entry.explode !== undefined || entry.allowReserved !== undefined;
                    if (!hasSerializationHints) {
                        this.enrichEncodingConfig(propSchema, encodingConfig, propName);
                    }
                });
            }

            return {
                type: 'urlencoded',
                paramName: bodyParamName,
                config: encodingConfig,
            };
        }

        if (this.isXmlMediaType(normalizedContentType)) {
            const schema = (rb.content[selectedContentType] as MediaTypeObject)?.schema as
                | SwaggerDefinition
                | boolean
                | undefined;
            if (schema && typeof schema === 'object') {
                const rootName = schema.xml?.name || 'root';
                const xmlConfig = this.getXmlConfig(schema, 5);
                return {
                    type: 'xml',
                    paramName: bodyParamName,
                    rootName,
                    config: xmlConfig,
                };
            }
            return { type: 'raw', paramName: bodyParamName };
        }

        if (this.isTextMediaType(normalizedContentType)) {
            return { type: 'raw', paramName: bodyParamName };
        }

        const sequentialKind = this.inferSequentialJsonKind(
            normalizedContentType,
            rb.content[selectedContentType] as MediaTypeObject | undefined,
        );
        if (sequentialKind) {
            return { type: sequentialKind, paramName: bodyParamName };
        }

        if (!this.isJsonMediaType(normalizedContentType)) {
            return { type: 'raw', paramName: bodyParamName };
        }

        return { type: 'json', paramName: bodyParamName };
    }

    private enrichEncodingConfig(
        propSchema: SwaggerDefinition | boolean,
        configMap: Record<string, EncodingProperty>,
        key: string,
    ) {
        const resolvedProp = this.parser.resolve(propSchema as SwaggerDefinition);
        if (!resolvedProp || typeof resolvedProp !== 'object') return;
        if (!configMap[key]) {
            configMap[key] = {};
        }

        if (!configMap[key]!.contentType) {
            if (resolvedProp?.type === 'object' || resolvedProp?.type === 'array') {
                configMap[key]!.contentType = 'application/json';
            }
        }

        if (resolvedProp?.contentEncoding) {
            if (!configMap[key]!.headers) {
                configMap[key]!.headers = {};
            }
            const headers = configMap[key]!.headers as Record<string, unknown>;
            const hasTransferHeader = Object.keys(headers).some(h => h.toLowerCase() === 'content-transfer-encoding');
            if (!hasTransferHeader) {
                headers['Content-Transfer-Encoding'] = resolvedProp.contentEncoding;
            }
        }
    }

    private isJsonContent(p: Parameter): boolean {
        if (!p.content) return false;
        const keys = Object.keys(p.content);
        return keys.some(k => this.isJsonMediaType(this.normalizeMediaType(k)));
    }

    private getParameterContent(p: Parameter): { contentType?: string; encoding?: Record<string, unknown> } {
        if (!p.content) return {};
        const keys = Object.keys(p.content);
        if (keys.length === 0) return {};
        const contentType = keys[0]!;
        const encoding = (p.content as Record<string, { encoding?: Record<string, unknown> }>)?.[contentType]?.encoding;
        return {
            ...(contentType ? { contentType } : {}),
            ...(encoding ? { encoding } : {}),
        };
    }

    private getParameterSchema(p: Parameter, contentType?: string): SwaggerDefinition | boolean | undefined {
        if (p.schema !== undefined) return p.schema as SwaggerDefinition | boolean;
        if (!p.content) return undefined;
        const key = contentType ?? Object.keys(p.content)[0];
        if (!key) return undefined;
        const entry = (p.content as Record<string, { schema?: SwaggerDefinition | boolean }>)?.[key];
        return entry?.schema;
    }

    private isJsonContentMediaType(p: Parameter): boolean {
        if (p.schema === undefined || typeof p.schema !== 'object') return false;

        if (
            (p.schema as SwaggerDefinition).contentMediaType &&
            this.isJsonMediaType(this.normalizeMediaType((p.schema as SwaggerDefinition).contentMediaType!))
        ) {
            return true;
        }

        const resolved = this.parser.resolve(p.schema as SwaggerDefinition);
        return !!(
            resolved &&
            resolved.contentMediaType &&
            this.isJsonMediaType(this.normalizeMediaType(resolved.contentMediaType))
        );
    }

    private isXmlContent(p: Parameter): boolean {
        return this.getXmlContentEntry(p) !== undefined;
    }

    private getXmlContentEntry(p: Parameter): { mediaType: string; schema: SwaggerDefinition | boolean } | undefined {
        if (!p.content) return undefined;
        for (const [mediaType, mediaObj] of Object.entries(p.content)) {
            const normalized = this.normalizeMediaType(mediaType);
            if (!this.isXmlMediaType(normalized)) continue;
            if (!mediaObj || typeof mediaObj !== 'object') continue;
            const schema = (mediaObj as MediaTypeObject).schema;
            if (schema === undefined) continue;
            return { mediaType, schema };
        }
        return undefined;
    }

    private getRequestBodyContentType(requestBody: PathInfo['requestBody']): string | undefined {
        if (!requestBody || !requestBody.content) return undefined;
        return this.selectRequestBodyContentType(requestBody.content as Record<string, { schema?: SwaggerDefinition }>);
    }

    private selectRequestBodyContentType(content: Record<string, { schema?: SwaggerDefinition }>): string | undefined {
        const entries = Object.keys(content).map(key => ({
            raw: key,
            normalized: this.normalizeMediaType(key),
        }));
        if (entries.length === 0) return undefined;

        entries.sort((a, b) => {
            const specDiff = this.getMediaTypeSpecificity(b.normalized) - this.getMediaTypeSpecificity(a.normalized);
            if (specDiff !== 0) return specDiff;
            const prefDiff = this.getMediaTypePreference(a.normalized) - this.getMediaTypePreference(b.normalized);
            if (prefDiff !== 0) return prefDiff;
            return 0;
        });

        return entries[0]?.raw;
    }

    private normalizeMediaType(mediaType: string): string {
        return mediaType.split(';')[0]!.trim().toLowerCase();
    }

    private getMediaTypeSpecificity(normalized: string): number {
        if (!normalized) return 0;
        const [type, subtype] = normalized.split('/');
        if (!type || !subtype) return 0;
        if (type === '*' && subtype === '*') return 0;
        if (subtype === '*') return 1;
        return 2;
    }

    private getMediaTypePreference(normalized: string): number {
        if (!normalized) return 100;
        if (normalized === 'application/json') return 0;
        if (
            normalized === 'application/json-seq' ||
            normalized.endsWith('+json-seq') ||
            normalized === 'application/jsonl' ||
            normalized === 'application/x-ndjson'
        ) {
            return 1;
        }
        if (normalized.endsWith('+json')) return 2;
        if (normalized === 'application/xml') return 3;
        if (normalized.endsWith('+xml')) return 4;
        if (normalized === 'text/plain') return 5;
        if (normalized.startsWith('text/')) return 6;
        if (normalized === 'application/x-www-form-urlencoded') return 7;
        if (normalized.startsWith('multipart/')) return 8;
        if (normalized === '*/*') return 99;
        return 50;
    }

    private isJsonMediaType(mediaType: string): boolean {
        if (!mediaType) return false;
        return mediaType === '*/*' || mediaType.includes('json') || mediaType.endsWith('+json');
    }

    private isXmlMediaType(mediaType: string): boolean {
        if (!mediaType) return false;
        return mediaType === 'application/xml' || mediaType.endsWith('+xml') || mediaType.includes('/xml');
    }

    private isTextMediaType(mediaType: string): boolean {
        return !!mediaType && mediaType.startsWith('text/');
    }

    private isFormUrlEncodedMediaType(mediaType: string): boolean {
        return mediaType === 'application/x-www-form-urlencoded';
    }

    private isMultipartMediaType(mediaType: string): boolean {
        return !!mediaType && mediaType.startsWith('multipart/');
    }

    private getSequentialJsonKind(mediaType: string): 'json-lines' | 'json-seq' | undefined {
        if (!mediaType) return undefined;
        if (mediaType === 'application/json-seq' || mediaType.endsWith('+json-seq')) return 'json-seq';
        if (mediaType === 'application/jsonl' || mediaType === 'application/x-ndjson') return 'json-lines';
        return undefined;
    }

    private inferSequentialJsonKind(
        normalizedMediaType: string,
        mediaObj?: MediaTypeObject,
    ): 'json-lines' | 'json-seq' | undefined {
        const known = this.getSequentialJsonKind(normalizedMediaType);
        if (known) return known;
        if (!mediaObj || mediaObj.itemSchema === undefined) return undefined;
        if (!this.isJsonMediaType(normalizedMediaType)) return undefined;
        if (normalizedMediaType === 'application/json' || normalizedMediaType === '*/*') return undefined;
        return 'json-lines';
    }

    private isBinaryMediaType(mediaType: string): boolean {
        if (!mediaType) return false;
        if (mediaType.startsWith('image/') || mediaType.startsWith('audio/') || mediaType.startsWith('video/')) {
            return true;
        }
        return (
            mediaType === 'application/octet-stream' ||
            mediaType === 'application/pdf' ||
            mediaType.endsWith('+octet-stream')
        );
    }

    private needsRequestType(definition: SwaggerDefinition): boolean {
        if (!definition.properties) return false;
        const properties = Object.values(definition.properties).filter(
            p => p !== null && typeof p === 'object',
        ) as SwaggerDefinition[];
        return properties.some(p => p.readOnly || p.writeOnly);
    }

    private getXmlConfig(schema: SwaggerDefinition | boolean | undefined, depth: number): Record<string, unknown> {
        if (!schema || typeof schema !== 'object' || depth <= 0) return {};
        const resolved = this.parser.resolve(schema as SwaggerDefinition);
        if (!resolved) return {};

        const config: Record<string, unknown> = {};
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
            const isRef =
                !!(schema as Record<string, unknown>)?.$ref || !!(schema as Record<string, unknown>)?.$dynamicRef;
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
        if (Array.isArray(resolved.prefixItems)) {
            config.prefixItems = resolved.prefixItems.map(item =>
                this.getXmlConfig(item as SwaggerDefinition, depth - 1),
            );
        }

        if (resolved.properties) {
            config.properties = {};
            Object.entries(resolved.properties).forEach(([propName, propSchema]) => {
                const propConfig = this.getXmlConfig(propSchema as SwaggerDefinition | boolean, depth - 1);
                if (Object.keys(propConfig).length > 0) {
                    (config.properties as Record<string, unknown>)[propName] = propConfig;
                }
            });
        }

        if (resolved.allOf) {
            resolved.allOf.forEach(sub => {
                const subConfig = this.getXmlConfig(sub as SwaggerDefinition | boolean, depth - 1);
                if (subConfig.properties) {
                    config.properties = {
                        ...(config.properties as Record<string, unknown>),
                        ...(subConfig.properties as Record<string, unknown>),
                    };
                }
            });
        }
        return config;
    }

    private getDecodingConfig(
        schema: SwaggerDefinition | boolean | undefined,
        depth: number = 5,
    ): Record<string, unknown> {
        if (!schema || typeof schema !== 'object' || depth <= 0) return {};
        const resolved = this.parser.resolve(schema as SwaggerDefinition);
        if (!resolved) return {};

        const config: Record<string, unknown> = {};

        if (resolved.contentEncoding) {
            config.contentEncoding = resolved.contentEncoding;
        }

        if (resolved.contentSchema && resolved.type === 'string') {
            if (resolved.contentMediaType && resolved.contentMediaType.includes('xml')) {
                config.decode = 'xml';
                config.xmlConfig = this.getXmlConfig(resolved.contentSchema as SwaggerDefinition | boolean, 5);
            } else {
                config.decode = true;
            }
            return config;
        }

        if (resolved.type === 'array' && resolved.items) {
            const itemConfig = this.getDecodingConfig(resolved.items as SwaggerDefinition, depth - 1);
            if (Object.keys(itemConfig).length > 0) {
                config.items = itemConfig;
            }
        }

        if (resolved.properties) {
            const propConfigs: Record<string, unknown> = {};
            Object.entries(resolved.properties).forEach(([propName, propSchema]) => {
                const pConfig = this.getDecodingConfig(propSchema as SwaggerDefinition | boolean, depth - 1);
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
                const subConfig = this.getDecodingConfig(sub as SwaggerDefinition | boolean, depth - 1);
                if (subConfig.properties) {
                    config.properties = {
                        ...((config.properties as Record<string, unknown>) || {}),
                        ...(subConfig.properties as Record<string, unknown>),
                    };
                }
            });
        }

        return config;
    }

    private getSseMode(schema: SwaggerDefinition | boolean | undefined): 'event' | 'data' {
        if (!schema || typeof schema !== 'object') return 'data';
        const resolved = this.parser.resolve(schema as SwaggerDefinition) ?? schema;
        if (!resolved || typeof resolved !== 'object') return 'data';

        const hasDataProperty = (node: SwaggerDefinition | boolean | undefined, depth: number = 5): boolean => {
            if (!node || typeof node !== 'object' || depth <= 0) return false;
            const resolvedNode = this.parser.resolve(node as SwaggerDefinition) ?? node;
            if (!resolvedNode || typeof resolvedNode !== 'object') return false;

            const props = (resolvedNode as SwaggerDefinition).properties;
            if (props && Object.prototype.hasOwnProperty.call(props, 'data')) return true;

            const allOf = (resolvedNode as SwaggerDefinition).allOf;
            if (Array.isArray(allOf)) {
                if (allOf.some(sub => hasDataProperty(sub as SwaggerDefinition | boolean, depth - 1))) return true;
            }
            const anyOf = (resolvedNode as SwaggerDefinition).anyOf;
            if (Array.isArray(anyOf)) {
                if (anyOf.some(sub => hasDataProperty(sub as SwaggerDefinition | boolean, depth - 1))) return true;
            }
            const oneOf = (resolvedNode as SwaggerDefinition).oneOf;
            if (Array.isArray(oneOf)) {
                if (oneOf.some(sub => hasDataProperty(sub as SwaggerDefinition | boolean, depth - 1))) return true;
            }

            return false;
        };

        return hasDataProperty(resolved as SwaggerDefinition | boolean) ? 'event' : 'data';
    }

    private getEncodingConfig(
        schema: SwaggerDefinition | boolean | undefined,
        depth: number = 5,
    ): Record<string, unknown> {
        if (!schema || typeof schema !== 'object' || depth <= 0) return {};
        const resolved = this.parser.resolve(schema as SwaggerDefinition);
        if (!resolved) return {};

        const config: Record<string, unknown> = {};

        if (resolved.contentMediaType) {
            config.contentMediaType = resolved.contentMediaType;
        }

        if (resolved.contentEncoding) {
            config.contentEncoding = resolved.contentEncoding;
        }

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
            const propConfigs: Record<string, unknown> = {};
            Object.entries(resolved.properties).forEach(([propName, propSchema]) => {
                const pConfig = this.getEncodingConfig(propSchema as SwaggerDefinition | boolean, depth - 1);
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
                const subConfig = this.getEncodingConfig(sub as SwaggerDefinition | boolean, depth - 1);
                if (subConfig.properties) {
                    config.properties = {
                        ...((config.properties as Record<string, unknown>) || {}),
                        ...(subConfig.properties as Record<string, unknown>),
                    };
                }
            });
        }

        return config;
    }
}
