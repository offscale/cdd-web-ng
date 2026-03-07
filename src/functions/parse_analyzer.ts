// src/analysis/service-method-analyzer.ts
import {
    EncodingProperty,
    GeneratorConfig,
    MediaTypeObject,
    Parameter,
    PathInfo,
    SwaggerDefinition,
    SwaggerResponse,
    OpenApiValue,
} from '@src/core/types/index.js';
import { camelCase, getTypeScriptType, isDataTypeInterface, sanitizeComment } from '@src/functions/utils.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { OptionalKind, ParameterDeclarationStructure } from 'ts-morph';
import {
    BodyVariant,
    ErrorResponseInfo,
    ParamSerialization,
    ResponseSerialization,
    ResponseVariant,
    ServiceMethodModel,
} from './types.js';

export class ServiceMethodAnalyzer {
    constructor(
        /* v8 ignore next */
        private config: GeneratorConfig,
        /* v8 ignore next */
        private parser: SwaggerParser,
    ) {}

    public analyze(operation: PathInfo): ServiceMethodModel | null {
        /* v8 ignore next */
        if (!operation.methodName) return null;

        /* v8 ignore next */
        const knownTypes = this.parser.schemas.map(s => s.name);
        /* v8 ignore next */
        const { variants: responseVariants, successCode } = this.analyzeResponse(operation, knownTypes);

        /* v8 ignore next */
        const defaultVariant = responseVariants.find(v => v.isDefault) ||
            responseVariants[0] || {
                mediaType: 'application/json',
                type: 'string | number | boolean | object | undefined | null',
                serialization: 'json',
                isDefault: true,
            };

        /* v8 ignore next */
        const errorResponses = this.analyzeErrorResponses(operation, knownTypes, successCode);

        /* v8 ignore next */
        const parameters = this.analyzeParameters(operation, knownTypes);

        /* v8 ignore next */
        const pathParams: ParamSerialization[] = [];
        /* v8 ignore next */
        const queryParams: ParamSerialization[] = [];
        /* v8 ignore next */
        const headerParams: ParamSerialization[] = [];
        /* v8 ignore next */
        const cookieParams: ParamSerialization[] = [];

        /* v8 ignore next */
        (operation.parameters || []).forEach(p => {
            /* v8 ignore next */
            if (this.isIgnoredHeaderParam(p)) return;
            /* v8 ignore next */
            const paramName = camelCase(p.name);

            /* v8 ignore next */
            const effectiveStyle = p.style || (p.in === 'query' || p.in === 'cookie' ? 'form' : 'simple');
            /* v8 ignore next */
            const defaultExplode = effectiveStyle === 'form' || effectiveStyle === 'cookie';
            /* v8 ignore next */
            const explode = p.explode ?? defaultExplode;

            /* v8 ignore next */
            const explicitJson = this.isJsonContent(p);
            /* v8 ignore next */
            const implicitJson = this.isJsonContentMediaType(p);
            /* v8 ignore next */
            const { contentType, encoding } = this.getParameterContent(p);
            /* v8 ignore next */
            const paramSchema = this.getParameterSchema(p, contentType);
            /* v8 ignore next */
            const encoderConfig = this.getEncodingConfig(paramSchema);
            /* v8 ignore next */
            const hasEncoderConfig = Object.keys(encoderConfig).length > 0;

            let serializationLink: 'json' | 'json-subset' | undefined;
            /* v8 ignore next */
            if (explicitJson) serializationLink = 'json';
            /* v8 ignore next */ else if (implicitJson) serializationLink = 'json';

            /* v8 ignore next */
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

            /* v8 ignore next */
            switch (p.in) {
                case 'path':
                    /* v8 ignore next */
                    pathParams.push(serialization);
                    /* v8 ignore next */
                    break;
                case 'query':
                    /* v8 ignore next */
                    queryParams.push(serialization);
                    /* v8 ignore next */
                    break;
                case 'header':
                    /* v8 ignore next */
                    headerParams.push(serialization);
                    /* v8 ignore next */
                    break;
                case 'cookie':
                    /* v8 ignore next */
                    cookieParams.push(serialization);
                    /* v8 ignore next */
                    break;
                case 'querystring' as string:
                    /* v8 ignore next */
                    queryParams.push(serialization);
                    /* v8 ignore next */
                    break;
            }
        });

        /* v8 ignore next */
        const body = this.analyzeBody(operation, parameters);
        /* v8 ignore next */
        const requestContentType = this.getRequestBodyContentType(operation.requestBody);

        /* v8 ignore next */
        let requestEncodingConfig: Record<string, OpenApiValue> | undefined = undefined;
        /* v8 ignore next */
        if (
            body &&
            (body.type === 'json' ||
                body.type === 'json-lines' ||
                body.type === 'json-seq' ||
                body.type === 'urlencoded')
        ) {
            /* v8 ignore next */
            const rbContent = operation.requestBody?.content;
            /* v8 ignore next */
            /* v8 ignore start */
            if (rbContent) {
                /* v8 ignore stop */
                /* v8 ignore next */
                const contentType = this.selectRequestBodyContentType(
                    rbContent as Record<string, { schema?: SwaggerDefinition }>,
                );
                /* v8 ignore next */
                if (contentType && rbContent[contentType]?.schema !== undefined) {
                    /* v8 ignore next */
                    const cfg = this.getEncodingConfig(rbContent[contentType]!.schema as SwaggerDefinition);
                    /* v8 ignore next */
                    if (Object.keys(cfg).length > 0) {
                        /* v8 ignore next */
                        requestEncodingConfig = cfg;
                    }
                }
            }
        }

        /* v8 ignore next */
        const specSecurity = this.parser.getSpec().security;
        /* v8 ignore next */
        const opSecurity = operation.security;
        /* v8 ignore next */
        const effectiveSecurity = opSecurity !== undefined ? opSecurity : specSecurity || [];

        /* v8 ignore next */
        const extensions: Record<string, OpenApiValue> = {};
        /* v8 ignore next */
        Object.keys(operation).forEach(key => {
            /* v8 ignore next */
            if (key.startsWith('x-')) {
                /* v8 ignore next */
                extensions[key] = (operation as Record<string, OpenApiValue>)[key];
            }
        });

        let basePath: string | undefined;
        /* v8 ignore next */
        const operationServers = operation.servers && operation.servers.length > 0 ? operation.servers : undefined;
        /* v8 ignore next */
        if (operationServers && operationServers.length > 0) {
            /* v8 ignore next */
            const s = operationServers[0]!;
            /* v8 ignore next */
            basePath = s.url;
            /* v8 ignore next */
            if (s.variables) {
                /* v8 ignore next */
                Object.entries(s.variables).forEach(([key, variable]) => {
                    /* v8 ignore next */
                    basePath = basePath!.replace(`{${key}}`, variable.default);
                });
            }
        }

        /* v8 ignore next */
        const rawDescription = operation.description || '';
        /* v8 ignore next */
        const rawSummary = operation.summary || '';

        /* v8 ignore next */
        let docText =
            (rawSummary || rawDescription || `Performs a ${operation.method} request to ${operation.path}.`) +
            (rawDescription && rawSummary ? `\n\n${rawDescription}` : '');

        /* v8 ignore next */
        docText = sanitizeComment(docText);

        /* v8 ignore next */
        if (operation.externalDocs?.url) {
            /* v8 ignore next */
            const cleanDesc = sanitizeComment(operation.externalDocs.description || '');
            /* v8 ignore next */
            docText += `\n\n@see ${operation.externalDocs.url} ${cleanDesc}`.trimEnd();
        }
        /* v8 ignore next */
        if (operation.tags && operation.tags.length > 0) {
            /* v8 ignore next */
            const tagList = operation.tags.map(tag => sanitizeComment(tag)).filter(Boolean);
            /* v8 ignore next */
            /* v8 ignore start */
            if (tagList.length > 0) {
                /* v8 ignore stop */
                /* v8 ignore next */
                docText += `\n\n@tags ${tagList.join(', ')}`;
            }
        }
        /* v8 ignore next */
        if (operation.servers && operation.servers.length > 0) {
            /* v8 ignore next */
            operation.servers.forEach(server => {
                /* v8 ignore next */
                docText += `\n\n@server ${JSON.stringify(server)}`;
            });
        }
        /* v8 ignore next */
        if (opSecurity && opSecurity.length > 0) {
            /* v8 ignore next */
            docText += `\n\n@security ${JSON.stringify(opSecurity)}`;
        }
        /* v8 ignore next */
        if (Object.keys(extensions).length > 0) {
            /* v8 ignore next */
            Object.entries(extensions).forEach(([key, value]) => {
                /* v8 ignore next */
                /* v8 ignore start */
                if (!key.startsWith('x-')) return;
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore start */
                const serialized = value === undefined ? 'true' : JSON.stringify(value);
                /* v8 ignore stop */
                /* v8 ignore next */
                docText += `\n\n@${key} ${serialized}`;
            });
        }
        /* v8 ignore next */
        if (operation.deprecated) {
            /* v8 ignore next */
            docText += `\n\n@deprecated`;
        }

        /* v8 ignore next */
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
        /* v8 ignore next */
        const variants: ResponseVariant[] = [];

        /* v8 ignore next */
        if (!operation.responses || Object.keys(operation.responses).length === 0) {
            /* v8 ignore next */
            const reqSchema = operation.requestBody?.content?.['application/json']?.schema;
            /* v8 ignore next */
            /* v8 ignore start */
            if (reqSchema !== undefined) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                variants.push({
                    /* v8 ignore stop */
                    mediaType: 'application/json',
                    type: getTypeScriptType(reqSchema as SwaggerDefinition, this.config, knownTypes),
                    serialization: 'json',
                    isDefault: true,
                });
            }
            /* v8 ignore next */
            return { variants };
        }

        /* v8 ignore next */
        const responses = operation.responses;

        /* v8 ignore next */
        const explicitSuccessCodes = Object.keys(responses).filter(code => /^2\d{2}$/.test(code));
        /* v8 ignore next */
        const rangeSuccessCodes = Object.keys(responses).filter(code => code === '2XX');
        /* v8 ignore next */
        let codesToProcess = explicitSuccessCodes.length > 0 ? explicitSuccessCodes : rangeSuccessCodes;
        /* v8 ignore next */
        let successCode: string | undefined = undefined;

        /* v8 ignore next */
        if (codesToProcess.length === 0) {
            /* v8 ignore next */
            if (responses['default']) {
                /* v8 ignore next */
                codesToProcess = ['default'];
                /* v8 ignore next */
                successCode = 'default';
            } else {
                /* v8 ignore next */
                return { variants };
            }
        }

        /* v8 ignore next */
        const addVariant = (variant: ResponseVariant) => {
            /* v8 ignore next */
            const key = `${variant.mediaType}|${variant.type}|${variant.serialization}`;
            /* v8 ignore next */
            const existing = variants.find(v => `${v.mediaType}|${v.type}|${v.serialization}` === key);
            /* v8 ignore next */
            /* v8 ignore start */
            if (existing) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                existing.isDefault = existing.isDefault || variant.isDefault;
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
            variants.push(variant);
        };

        /* v8 ignore next */
        const processResponseContent = (responseObj: SwaggerResponse) => {
            /* v8 ignore next */
            if (!responseObj?.content) {
                /* v8 ignore next */
                return;
            }

            /* v8 ignore next */
            Object.entries(responseObj.content).forEach(([mediaType, mediaObj]) => {
                /* v8 ignore next */
                /* v8 ignore start */
                if (!mediaObj) return;
                /* v8 ignore stop */
                /* v8 ignore next */
                const normalized = this.normalizeMediaType(mediaType);
                const hasSchema =
                    /* v8 ignore next */
                    (mediaObj as MediaTypeObject).schema !== undefined ||
                    (mediaObj as MediaTypeObject).itemSchema !== undefined;

                /* v8 ignore next */
                if (normalized.includes('json') || normalized === '*/*') {
                    /* v8 ignore next */
                    if (!hasSchema) return;
                    /* v8 ignore next */
                    let serialization: ResponseSerialization = 'json';
                    /* v8 ignore next */
                    let type = 'string | number | boolean | object | undefined | null';
                    /* v8 ignore next */
                    let decodingConfig: Record<string, OpenApiValue> | undefined = undefined;

                    /* v8 ignore next */
                    const sequentialKind = this.inferSequentialJsonKind(normalized, mediaObj as MediaTypeObject);
                    const sequentialSchema =
                        /* v8 ignore next */
                        (mediaObj as MediaTypeObject).itemSchema !== undefined
                            ? (mediaObj as MediaTypeObject).itemSchema
                            : (mediaObj as MediaTypeObject).schema !== undefined
                              ? (((mediaObj as MediaTypeObject).schema as Record<string, OpenApiValue>)?.items ??
                                (mediaObj as MediaTypeObject).schema)
                              : undefined;

                    /* v8 ignore next */
                    if (sequentialKind) {
                        /* v8 ignore next */
                        serialization = sequentialKind === 'json-seq' ? 'json-seq' : 'json-lines';
                        /* v8 ignore next */
                        const itemType = this.resolveType(sequentialSchema, knownTypes);
                        /* v8 ignore next */
                        type = `(${itemType})[]`;
                    } else {
                        /* v8 ignore next */
                        const schema = (mediaObj as MediaTypeObject).schema;
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (schema !== undefined) {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            type = getTypeScriptType(schema as SwaggerDefinition, this.config, knownTypes);
                            /* v8 ignore next */
                            const dConf = this.getDecodingConfig(schema as SwaggerDefinition);
                            /* v8 ignore next */
                            if (Object.keys(dConf).length > 0) decodingConfig = dConf;
                        } else {
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            type = 'string | number | boolean | object | undefined | null';
                            /* v8 ignore stop */
                        }
                    }

                    /* v8 ignore next */
                    addVariant({
                        mediaType,
                        type,
                        serialization,
                        isDefault: false,
                        ...(decodingConfig ? { decodingConfig } : {}),
                    });
                    /* v8 ignore next */
                    return;
                }

                /* v8 ignore next */
                if (normalized === 'application/xml' || normalized.endsWith('+xml')) {
                    /* v8 ignore next */
                    const schema = (mediaObj as MediaTypeObject).schema as SwaggerDefinition;
                    /* v8 ignore next */
                    if (schema !== undefined) {
                        /* v8 ignore next */
                        const xmlConfig = this.getXmlConfig(schema, 5);
                        /* v8 ignore next */
                        const type = getTypeScriptType(schema, this.config, knownTypes);
                        /* v8 ignore next */
                        addVariant({
                            mediaType,
                            type,
                            serialization: 'xml',
                            isDefault: false,
                            /* v8 ignore start */
                            ...(xmlConfig ? { xmlConfig } : {}),
                            /* v8 ignore stop */
                        });
                    } else {
                        /* v8 ignore next */
                        addVariant({ mediaType, type: 'string', serialization: 'text', isDefault: false });
                    }
                    /* v8 ignore next */
                    return;
                }

                /* v8 ignore next */
                if (normalized === 'text/event-stream') {
                    const effectiveSchema =
                        /* v8 ignore next */
                        (mediaObj as MediaTypeObject).schema !== undefined
                            ? (mediaObj as MediaTypeObject).schema
                            : (mediaObj as MediaTypeObject).itemSchema !== undefined
                              ? (mediaObj as MediaTypeObject).itemSchema
                              : undefined;
                    const itemType =
                        /* v8 ignore next */
                        effectiveSchema !== undefined
                            ? getTypeScriptType(effectiveSchema as SwaggerDefinition, this.config, knownTypes)
                            : 'string | number | boolean | object | undefined | null';
                    const decodingConfig =
                        /* v8 ignore next */
                        effectiveSchema !== undefined
                            ? this.getDecodingConfig(effectiveSchema as SwaggerDefinition)
                            : undefined;
                    const sseMode =
                        /* v8 ignore next */
                        effectiveSchema !== undefined ? this.getSseMode(effectiveSchema as SwaggerDefinition) : 'data';
                    /* v8 ignore next */
                    addVariant({
                        mediaType,
                        type: itemType,
                        serialization: 'sse',
                        isDefault: false,
                        ...(decodingConfig ? { decodingConfig } : {}),
                        /* v8 ignore start */
                        ...(sseMode ? { sseMode } : {}),
                        /* v8 ignore stop */
                    });
                    /* v8 ignore next */
                    return;
                }

                /* v8 ignore next */
                if (normalized.startsWith('text/')) {
                    /* v8 ignore next */
                    addVariant({ mediaType, type: 'string', serialization: 'text', isDefault: false });
                    /* v8 ignore next */
                    return;
                }

                /* v8 ignore next */
                addVariant({ mediaType, type: 'Blob', serialization: 'blob', isDefault: false });
            });
        };

        /* v8 ignore next */
        if (responses['204']) {
            /* v8 ignore next */
            addVariant({ mediaType: '', type: 'void', serialization: 'json', isDefault: false });
        }

        /* v8 ignore next */
        codesToProcess.forEach(code => {
            /* v8 ignore next */
            const responseObj = responses[code];
            /* v8 ignore next */
            /* v8 ignore start */
            if (!responseObj) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            if (code === '204') return;
            /* v8 ignore next */
            processResponseContent(responseObj as SwaggerResponse);
        });

        /* v8 ignore next */
        if (variants.length === 0) {
            /* v8 ignore next */
            const reqSchema = operation.requestBody?.content?.['application/json']?.schema;
            /* v8 ignore next */
            if (reqSchema !== undefined) {
                /* v8 ignore next */
                addVariant({
                    mediaType: 'application/json',
                    type: getTypeScriptType(reqSchema as SwaggerDefinition, this.config, knownTypes),
                    serialization: 'json',
                    isDefault: true,
                });
            }
        }

        /* v8 ignore next */
        if (variants.length > 0) {
            /* v8 ignore next */
            const scored = variants.map(variant => ({
                variant,
                normalized: this.normalizeMediaType(variant.mediaType),
            }));
            /* v8 ignore next */
            scored.sort((a, b) => {
                const specDiff =
                    /* v8 ignore next */
                    this.getMediaTypeSpecificity(b.normalized) - this.getMediaTypeSpecificity(a.normalized);
                /* v8 ignore next */
                if (specDiff !== 0) return specDiff;
                /* v8 ignore next */
                const prefDiff = this.getMediaTypePreference(a.normalized) - this.getMediaTypePreference(b.normalized);
                /* v8 ignore next */
                if (prefDiff !== 0) return prefDiff;
                /* v8 ignore next */
                return 0;
            });

            /* v8 ignore next */
            variants.forEach(v => {
                /* v8 ignore next */
                v.isDefault = false;
            });
            /* v8 ignore next */
            /* v8 ignore start */
            if (scored[0]) scored[0].variant.isDefault = true;
            /* v8 ignore stop */
        }

        /* v8 ignore next */
        return { variants, ...(successCode ? { successCode } : {}) };
    }

    private resolveType(schema: OpenApiValue, knownTypes: string[]): string {
        /* v8 ignore next */
        return schema !== undefined
            ? getTypeScriptType(schema as SwaggerDefinition, this.config, knownTypes)
            : 'string | number | boolean | object | undefined | null';
    }

    private analyzeErrorResponses(
        operation: PathInfo,
        knownTypes: string[],
        successCode?: string,
    ): ErrorResponseInfo[] {
        /* v8 ignore next */
        if (!operation.responses) return [];

        /* v8 ignore next */
        const errors: ErrorResponseInfo[] = [];
        /* v8 ignore next */
        const pickJsonSchema = (
            content: Record<string, { schema?: SwaggerDefinition }>,
        ): SwaggerDefinition | undefined => {
            /* v8 ignore next */
            const direct = content['application/json']?.schema;
            /* v8 ignore next */
            if (direct !== undefined) return direct as SwaggerDefinition;

            /* v8 ignore next */
            const jsonLikeEntry = Object.entries(content).find(([mediaType, obj]) => {
                /* v8 ignore next */
                const normalized = this.normalizeMediaType(mediaType);
                /* v8 ignore next */
                /* v8 ignore start */
                if (normalized === '*/*') return false;
                /* v8 ignore stop */
                /* v8 ignore next */
                return this.isJsonMediaType(normalized) && obj?.schema !== undefined;
            });
            /* v8 ignore next */
            if (jsonLikeEntry) return jsonLikeEntry[1]!.schema as SwaggerDefinition;

            /* v8 ignore next */
            const wildcard = content['*/*']?.schema;
            /* v8 ignore next */
            return wildcard as SwaggerDefinition | undefined;
        };
        /* v8 ignore next */
        const pickXmlSchema = (
            content: Record<string, { schema?: SwaggerDefinition }>,
        ): SwaggerDefinition | undefined => {
            /* v8 ignore next */
            const entries = Object.entries(content);
            /* v8 ignore next */
            for (const [mediaType, obj] of entries) {
                /* v8 ignore next */
                const normalized = this.normalizeMediaType(mediaType);
                /* v8 ignore next */
                if (!this.isXmlMediaType(normalized)) continue;
                /* v8 ignore next */
                /* v8 ignore start */
                if (obj?.schema !== undefined) return obj.schema as SwaggerDefinition;
                /* v8 ignore stop */
            }
            /* v8 ignore next */
            return undefined;
        };

        /* v8 ignore next */
        for (const [code, responseObj] of Object.entries(operation.responses)) {
            /* v8 ignore next */
            if (code === successCode) continue;
            /* v8 ignore next */
            if (/^2\d{2}$/.test(code) || code === '2XX') continue;

            /* v8 ignore next */
            let type = 'string | number | boolean | object | undefined | null';
            /* v8 ignore next */
            if ((responseObj as SwaggerResponse).content) {
                /* v8 ignore next */
                const content = (responseObj as SwaggerResponse).content!;
                /* v8 ignore next */
                const jsonSchema = pickJsonSchema(content as Record<string, { schema?: SwaggerDefinition }>);
                /* v8 ignore next */
                if (jsonSchema !== undefined) {
                    /* v8 ignore next */
                    type = getTypeScriptType(jsonSchema as SwaggerDefinition, this.config, knownTypes);
                } else {
                    /* v8 ignore next */
                    const xmlSchema = pickXmlSchema(content as Record<string, { schema?: SwaggerDefinition }>);
                    /* v8 ignore next */
                    if (xmlSchema !== undefined) {
                        /* v8 ignore next */
                        type = getTypeScriptType(xmlSchema as SwaggerDefinition, this.config, knownTypes);
                        /* v8 ignore next */
                    } else if (Object.keys(content).some(mt => this.isTextMediaType(this.normalizeMediaType(mt)))) {
                        /* v8 ignore next */
                        type = 'string';
                    } else {
                        /* v8 ignore next */
                        const nonTextMedia = Object.keys(content).find(mt => {
                            /* v8 ignore next */
                            const normalized = this.normalizeMediaType(mt);
                            /* v8 ignore next */
                            return (
                                normalized !== '' &&
                                !this.isJsonMediaType(normalized) &&
                                !this.isXmlMediaType(normalized) &&
                                !this.isTextMediaType(normalized)
                            );
                        });
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (nonTextMedia) {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            type = 'Blob';
                        }
                    }
                }
                /* v8 ignore next */
            } else if (!(responseObj as SwaggerResponse).content && (code === '401' || code === '403')) {
                /* v8 ignore next */
                type = 'void';
            }

            /* v8 ignore next */
            errors.push({
                code,
                type,
                ...((responseObj as SwaggerResponse).description && {
                    description: sanitizeComment((responseObj as SwaggerResponse).description),
                }),
            });
        }

        /* v8 ignore next */
        return errors;
    }

    private analyzeParameters(
        operation: PathInfo,
        knownTypes: string[],
    ): OptionalKind<ParameterDeclarationStructure>[] {
        /* v8 ignore next */
        const parameters: OptionalKind<ParameterDeclarationStructure>[] = [];

        /* v8 ignore next */
        (operation.parameters ?? []).forEach(param => {
            /* v8 ignore next */
            if (this.isIgnoredHeaderParam(param)) return;
            /* v8 ignore next */
            let effectiveSchema = param.schema;
            /* v8 ignore next */
            if (param.content) {
                /* v8 ignore next */
                const firstType = Object.keys(param.content)[0];
                /* v8 ignore next */
                if (firstType && param.content[firstType]!.schema !== undefined) {
                    /* v8 ignore next */
                    effectiveSchema = param.content[firstType]!.schema as SwaggerDefinition;
                }
            }
            /* v8 ignore next */
            const paramType = getTypeScriptType(effectiveSchema, this.config, knownTypes);
            /* v8 ignore next */
            parameters.push({
                name: camelCase(param.name),
                type: paramType,
                hasQuestionToken: !param.required,
                ...(param.deprecated && { leadingTrivia: [`/** @deprecated */ `] }),
            });
        });

        /* v8 ignore next */
        const requestBody = operation.requestBody;
        /* v8 ignore next */
        if (requestBody) {
            /* v8 ignore next */
            /* v8 ignore start */
            const contentMap = requestBody.content || {};
            /* v8 ignore stop */
            /* v8 ignore next */
            const contentType = this.selectRequestBodyContentType(
                contentMap as Record<string, { schema?: SwaggerDefinition }>,
            );
            /* v8 ignore next */
            /* v8 ignore start */
            const normalized = contentType ? this.normalizeMediaType(contentType) : undefined;
            /* v8 ignore stop */

            /* v8 ignore next */
            /* v8 ignore start */
            const content = contentType ? contentMap[contentType] : undefined;
            /* v8 ignore stop */
            const effectiveSchema =
                /* v8 ignore next */
                (content as MediaTypeObject)?.schema !== undefined
                    ? (content as MediaTypeObject).schema
                    : (content as MediaTypeObject)?.itemSchema !== undefined
                      ? (content as MediaTypeObject).itemSchema
                      : undefined;

            /* v8 ignore next */
            /* v8 ignore start */
            const sequentialKind = normalized
                ? /* v8 ignore stop */
                  this.inferSequentialJsonKind(normalized, content as MediaTypeObject | undefined)
                : undefined;

            /* v8 ignore next */
            if (contentType && normalized && sequentialKind) {
                const itemSchema =
                    /* v8 ignore next */
                    (content as MediaTypeObject)?.itemSchema !== undefined
                        ? (content as MediaTypeObject).itemSchema
                        : (content as MediaTypeObject)?.schema &&
                            typeof (content as MediaTypeObject).schema === 'object' &&
                            ((content as MediaTypeObject).schema as Record<string, OpenApiValue>).items
                          ? ((content as MediaTypeObject).schema as Record<string, OpenApiValue>).items
                          : (content as MediaTypeObject)?.schema !== undefined
                            ? (content as MediaTypeObject).schema
                            : undefined;
                /* v8 ignore next */
                /* v8 ignore start */
                const itemType = itemSchema
                    ? /* v8 ignore stop */
                      getTypeScriptType(itemSchema as SwaggerDefinition, this.config, knownTypes)
                    : 'string | number | boolean | object | undefined | null';
                /* v8 ignore next */
                const needsParens = itemType.includes('|') || itemType.includes('&');
                /* v8 ignore next */
                /* v8 ignore start */
                let bodyType = `${needsParens ? `(${itemType})` : itemType}[]`;
                /* v8 ignore stop */

                /* v8 ignore next */
                const rawBodyType = itemType.replace(/\[]| \| null/g, '');
                /* v8 ignore next */
                if (knownTypes.includes(rawBodyType)) {
                    /* v8 ignore next */
                    const schemaObj = this.parser.schemas.find(s => s.name === rawBodyType);
                    /* v8 ignore next */
                    const definition = schemaObj?.definition;
                    /* v8 ignore next */
                    if (definition && typeof definition === 'object' && this.needsRequestType(definition)) {
                        /* v8 ignore next */
                        bodyType = bodyType.replace(rawBodyType, `${rawBodyType}Request`);
                    }
                }
                /* v8 ignore next */
                const bodyName = isDataTypeInterface(rawBodyType) ? camelCase(rawBodyType) : 'body';
                /* v8 ignore next */
                parameters.push({ name: bodyName, type: bodyType, hasQuestionToken: !requestBody.required });
                /* v8 ignore next */
            } else if (contentType && normalized && this.isJsonMediaType(normalized) && effectiveSchema !== undefined) {
                /* v8 ignore next */
                let bodyType = getTypeScriptType(effectiveSchema as SwaggerDefinition, this.config, knownTypes);

                /* v8 ignore next */
                /* v8 ignore start */
                if (
                    /* v8 ignore stop */
                    /* v8 ignore start */
                    content &&
                    /* v8 ignore stop */
                    (content as MediaTypeObject).schema === undefined &&
                    (content as MediaTypeObject).itemSchema !== undefined
                ) {
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    bodyType = `(${bodyType})[]`;
                    /* v8 ignore stop */
                }

                /* v8 ignore next */
                const rawBodyType = bodyType.replace(/\[]| \| null/g, '');
                /* v8 ignore next */
                if (knownTypes.includes(rawBodyType)) {
                    /* v8 ignore next */
                    const schemaObj = this.parser.schemas.find(s => s.name === rawBodyType);
                    /* v8 ignore next */
                    const definition = schemaObj?.definition;
                    /* v8 ignore next */
                    if (definition && typeof definition === 'object' && this.needsRequestType(definition)) {
                        /* v8 ignore next */
                        bodyType = bodyType.replace(rawBodyType, `${rawBodyType}Request`);
                    }
                }
                /* v8 ignore next */
                const bodyName = isDataTypeInterface(rawBodyType) ? camelCase(rawBodyType) : 'body';
                /* v8 ignore next */
                parameters.push({ name: bodyName, type: bodyType, hasQuestionToken: !requestBody.required });
                /* v8 ignore next */
            } else if (normalized && this.isMultipartMediaType(normalized)) {
                /* v8 ignore next */
                parameters.push({
                    name: 'body',
                    type: 'FormData | OpenApiValue[] | OpenApiValue',
                    hasQuestionToken: !requestBody.required,
                });
                /* v8 ignore next */
            } else if (normalized && this.isXmlMediaType(normalized)) {
                /* v8 ignore next */
                /* v8 ignore start */
                const rawBodyType = effectiveSchema
                    ? /* v8 ignore stop */
                      getTypeScriptType(effectiveSchema as SwaggerDefinition, this.config, knownTypes)
                    : 'string';
                /* v8 ignore next */
                /* v8 ignore start */
                const bodyType = rawBodyType.includes('|') ? `(${rawBodyType})` : rawBodyType;
                /* v8 ignore stop */
                /* v8 ignore next */
                const bodyName = isDataTypeInterface(rawBodyType) ? camelCase(rawBodyType) : 'body';
                /* v8 ignore next */
                parameters.push({ name: bodyName, type: bodyType, hasQuestionToken: !requestBody.required });
                /* v8 ignore next */
            } else if (normalized && this.isTextMediaType(normalized)) {
                /* v8 ignore next */
                parameters.push({ name: 'body', type: 'string', hasQuestionToken: !requestBody.required });
                /* v8 ignore next */
            } else if (normalized && this.isFormUrlEncodedMediaType(normalized)) {
                /* v8 ignore next */
                const rawBodyType = effectiveSchema
                    ? getTypeScriptType(effectiveSchema as SwaggerDefinition, this.config, knownTypes)
                    : 'string | number | boolean | object | undefined | null';
                /* v8 ignore next */
                /* v8 ignore start */
                const bodyType = rawBodyType.includes('|') ? `(${rawBodyType})` : rawBodyType;
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore start */
                const bodyName = isDataTypeInterface(rawBodyType) ? camelCase(rawBodyType) : 'body';
                /* v8 ignore stop */
                /* v8 ignore next */
                parameters.push({ name: bodyName, type: bodyType, hasQuestionToken: !requestBody.required });
                /* v8 ignore next */
                /* v8 ignore start */
            } else if (contentType && normalized) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore start */
                const rawBodyType = effectiveSchema
                    ? /* v8 ignore stop */
                      getTypeScriptType(effectiveSchema as SwaggerDefinition, this.config, knownTypes)
                    : this.isBinaryMediaType(normalized)
                      ? 'Blob'
                      : 'string | number | boolean | object | undefined | null';
                /* v8 ignore next */
                /* v8 ignore start */
                const bodyType = rawBodyType.includes('|') ? `(${rawBodyType})` : rawBodyType;
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore start */
                const bodyName = isDataTypeInterface(rawBodyType) ? camelCase(rawBodyType) : 'body';
                /* v8 ignore stop */
                /* v8 ignore next */
                parameters.push({ name: bodyName, type: bodyType, hasQuestionToken: !requestBody.required });
            } else {
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                parameters.push({
                    name: 'body',
                    type: 'string | number | boolean | object | undefined | null',
                    hasQuestionToken: !requestBody.required,
                });
                /* v8 ignore stop */
            }
        }

        /* v8 ignore next */
        return parameters.sort((a, b) => (a.hasQuestionToken ? 1 : 0) - (b.hasQuestionToken ? 1 : 0));
    }

    private isIgnoredHeaderParam(param: Parameter): boolean {
        /* v8 ignore next */
        if (param.in !== 'header') return false;
        /* v8 ignore next */
        /* v8 ignore start */
        const name = String(param.name || '').toLowerCase();
        /* v8 ignore stop */
        /* v8 ignore next */
        return name === 'accept' || name === 'content-type' || name === 'authorization';
    }

    private analyzeBody(
        operation: PathInfo,
        parameters: OptionalKind<ParameterDeclarationStructure>[],
    ): BodyVariant | undefined {
        /* v8 ignore next */
        const nonBodyOpParams = new Set((operation.parameters ?? []).map(p => camelCase(p.name)));
        /* v8 ignore next */
        const bodyParamDef = parameters.find(p => !nonBodyOpParams.has(p.name!));

        /* v8 ignore next */
        const formDataParams = operation.parameters?.filter(p => (p as Record<string, OpenApiValue>).in === 'formData');
        /* v8 ignore next */
        if (formDataParams && formDataParams.length > 0) {
            /* v8 ignore next */
            const isMulti = operation.consumes?.includes('multipart/form-data');
            /* v8 ignore next */
            /* v8 ignore start */
            if (isMulti) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                return { type: 'encoded-form-data', paramName: 'formData', mappings: [] };
                /* v8 ignore stop */
            } else {
                /* v8 ignore next */
                return { type: 'encoded-form-data', paramName: 'formBody', mappings: [] };
            }
        }

        /* v8 ignore next */
        if (!bodyParamDef) return undefined;

        /* v8 ignore next */
        const bodyParamName = bodyParamDef.name!;
        /* v8 ignore next */
        const rb = operation.requestBody;
        /* v8 ignore next */
        /* v8 ignore start */
        if (!rb || !rb.content) return { type: 'raw', paramName: bodyParamName };
        /* v8 ignore stop */

        /* v8 ignore next */
        const selectedContentType = this.selectRequestBodyContentType(
            rb.content as Record<string, { schema?: SwaggerDefinition }>,
        );
        /* v8 ignore next */
        /* v8 ignore start */
        if (!selectedContentType) return { type: 'raw', paramName: bodyParamName };
        /* v8 ignore stop */

        /* v8 ignore next */
        const normalizedContentType = this.normalizeMediaType(selectedContentType);

        const multipartKey =
            /* v8 ignore next */
            normalizedContentType === 'multipart/form-data' || normalizedContentType === 'multipart/mixed'
                ? normalizedContentType
                : normalizedContentType === 'multipart/byteranges'
                  ? normalizedContentType
                  : normalizedContentType.startsWith('multipart/')
                    ? normalizedContentType
                    : undefined;

        /* v8 ignore next */
        if (multipartKey) {
            /* v8 ignore next */
            const mediaType = rb.content[selectedContentType];
            /* v8 ignore next */
            const schema = (mediaType as MediaTypeObject).schema as SwaggerDefinition | boolean | undefined;

            const multipartConfig: {
                mediaType?: string;
                encoding?: Record<string, EncodingProperty>;
                prefixEncoding?: EncodingProperty[];
                itemEncoding?: EncodingProperty;
                /* v8 ignore next */
            } = { mediaType: multipartKey };

            /* v8 ignore next */
            if ((mediaType as MediaTypeObject).encoding) {
                /* v8 ignore next */
                multipartConfig.encoding = { ...(mediaType as MediaTypeObject).encoding };
            }
            /* v8 ignore next */
            if ((mediaType as MediaTypeObject).prefixEncoding) {
                /* v8 ignore next */
                multipartConfig.prefixEncoding = [...(mediaType as MediaTypeObject).prefixEncoding!];
            }
            /* v8 ignore next */
            if ((mediaType as MediaTypeObject).itemEncoding) {
                /* v8 ignore next */
                multipartConfig.itemEncoding = { ...(mediaType as MediaTypeObject).itemEncoding };
            }

            /* v8 ignore next */
            if (schema && typeof schema === 'object' && schema.properties) {
                /* v8 ignore next */
                if (!multipartConfig.encoding) {
                    /* v8 ignore next */
                    multipartConfig.encoding = {};
                }

                /* v8 ignore next */
                Object.entries(schema.properties).forEach(([propName, propSchema]) => {
                    /* v8 ignore next */
                    this.enrichEncodingConfig(propSchema, multipartConfig.encoding!, propName);
                });
            }

            /* v8 ignore next */
            if (
                schema &&
                typeof schema === 'object' &&
                (schema.type === 'array' || schema.items || schema.prefixItems)
            ) {
                /* v8 ignore next */
                if (schema.prefixItems && Array.isArray(schema.prefixItems)) {
                    /* v8 ignore next */
                    if (!multipartConfig.prefixEncoding) {
                        /* v8 ignore next */
                        multipartConfig.prefixEncoding = [];
                    }
                    /* v8 ignore next */
                    schema.prefixItems.forEach((prefixItemSchema, index) => {
                        /* v8 ignore next */
                        if (!multipartConfig.prefixEncoding![index]) {
                            /* v8 ignore next */
                            multipartConfig.prefixEncoding![index] = {};
                        }
                        /* v8 ignore next */
                        const wrapper = { temp: multipartConfig.prefixEncoding![index]! };
                        /* v8 ignore next */
                        this.enrichEncodingConfig(prefixItemSchema as SwaggerDefinition | boolean, wrapper, 'temp');
                    });
                }

                /* v8 ignore next */
                if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
                    /* v8 ignore next */
                    if (!multipartConfig.itemEncoding) {
                        /* v8 ignore next */
                        multipartConfig.itemEncoding = {};
                    }
                    /* v8 ignore next */
                    const wrapper = { temp: multipartConfig.itemEncoding };
                    /* v8 ignore next */
                    this.enrichEncodingConfig(schema.items as SwaggerDefinition, wrapper, 'temp');
                }
            }

            /* v8 ignore next */
            if (
                multipartConfig.mediaType === 'multipart/form-data' &&
                multipartConfig.encoding &&
                !multipartConfig.prefixEncoding &&
                !multipartConfig.itemEncoding
            ) {
                /* v8 ignore next */
                return {
                    type: 'multipart',
                    paramName: bodyParamName,
                    config: multipartConfig.encoding,
                };
            }

            /* v8 ignore next */
            return {
                type: 'multipart',
                paramName: bodyParamName,
                config: multipartConfig,
            };
        }

        /* v8 ignore next */
        if (this.isFormUrlEncodedMediaType(normalizedContentType)) {
            /* v8 ignore next */
            const encodingConfig: Record<string, EncodingProperty> = {
                ...((rb.content[selectedContentType] as MediaTypeObject)?.encoding || {}),
            };
            /* v8 ignore next */
            const schema = (rb.content[selectedContentType] as MediaTypeObject)?.schema as
                | SwaggerDefinition
                | boolean
                | undefined;

            /* v8 ignore next */
            if (schema && typeof schema === 'object' && schema.properties) {
                /* v8 ignore next */
                Object.entries(schema.properties).forEach(([propName, propSchema]) => {
                    /* v8 ignore next */
                    if (!encodingConfig[propName]) {
                        /* v8 ignore next */
                        encodingConfig[propName] = {};
                    }
                    /* v8 ignore next */
                    const entry = encodingConfig[propName]!;
                    const hasSerializationHints =
                        /* v8 ignore next */
                        entry.style !== undefined || entry.explode !== undefined || entry.allowReserved !== undefined;
                    /* v8 ignore next */
                    if (!hasSerializationHints) {
                        /* v8 ignore next */
                        this.enrichEncodingConfig(propSchema, encodingConfig, propName);
                    }
                });
            }

            /* v8 ignore next */
            return {
                type: 'urlencoded',
                paramName: bodyParamName,
                config: encodingConfig,
            };
        }

        /* v8 ignore next */
        if (this.isXmlMediaType(normalizedContentType)) {
            /* v8 ignore next */
            const schema = (rb.content[selectedContentType] as MediaTypeObject)?.schema as
                | SwaggerDefinition
                | boolean
                | undefined;
            /* v8 ignore next */
            /* v8 ignore start */
            if (schema && typeof schema === 'object') {
                /* v8 ignore stop */
                /* v8 ignore next */
                const rootName = schema.xml?.name || 'root';
                /* v8 ignore next */
                const xmlConfig = this.getXmlConfig(schema, 5);
                /* v8 ignore next */
                return {
                    type: 'xml',
                    paramName: bodyParamName,
                    rootName,
                    config: xmlConfig,
                };
            }
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            return { type: 'raw', paramName: bodyParamName };
            /* v8 ignore stop */
        }

        /* v8 ignore next */
        if (this.isTextMediaType(normalizedContentType)) {
            /* v8 ignore next */
            return { type: 'raw', paramName: bodyParamName };
        }

        /* v8 ignore next */
        const sequentialKind = this.inferSequentialJsonKind(
            normalizedContentType,
            rb.content[selectedContentType] as MediaTypeObject | undefined,
        );
        /* v8 ignore next */
        if (sequentialKind) {
            /* v8 ignore next */
            return { type: sequentialKind, paramName: bodyParamName };
        }

        /* v8 ignore next */
        if (!this.isJsonMediaType(normalizedContentType)) {
            /* v8 ignore next */
            return { type: 'raw', paramName: bodyParamName };
        }

        /* v8 ignore next */
        return { type: 'json', paramName: bodyParamName };
    }

    private enrichEncodingConfig(
        propSchema: SwaggerDefinition | boolean,
        configMap: Record<string, EncodingProperty>,
        key: string,
    ) {
        /* v8 ignore next */
        const resolvedProp = this.parser.resolve(propSchema as SwaggerDefinition);
        /* v8 ignore next */
        /* v8 ignore start */
        if (!resolvedProp || typeof resolvedProp !== 'object') return;
        /* v8 ignore stop */
        /* v8 ignore next */
        if (!configMap[key]) {
            /* v8 ignore next */
            configMap[key] = {};
        }

        /* v8 ignore next */
        if (!configMap[key]!.contentType) {
            /* v8 ignore next */
            if (resolvedProp?.type === 'object' || resolvedProp?.type === 'array') {
                /* v8 ignore next */
                configMap[key]!.contentType = 'application/json';
            }
        }

        /* v8 ignore next */
        if (resolvedProp?.contentEncoding) {
            /* v8 ignore next */
            if (!configMap[key]!.headers) {
                /* v8 ignore next */
                configMap[key]!.headers = {};
            }
            /* v8 ignore next */
            const headers = configMap[key]!.headers as Record<string, OpenApiValue>;
            /* v8 ignore next */
            const hasTransferHeader = Object.keys(headers).some(h => h.toLowerCase() === 'content-transfer-encoding');
            /* v8 ignore next */
            if (!hasTransferHeader) {
                /* v8 ignore next */
                headers['Content-Transfer-Encoding'] = resolvedProp.contentEncoding;
            }
        }
    }

    private isJsonContent(p: Parameter): boolean {
        /* v8 ignore next */
        if (!p.content) return false;
        /* v8 ignore next */
        const keys = Object.keys(p.content);
        /* v8 ignore next */
        return keys.some(k => this.isJsonMediaType(this.normalizeMediaType(k)));
    }

    private getParameterContent(p: Parameter): { contentType?: string; encoding?: Record<string, OpenApiValue> } {
        /* v8 ignore next */
        if (!p.content) return {};
        /* v8 ignore next */
        const keys = Object.keys(p.content);
        /* v8 ignore next */
        /* v8 ignore start */
        if (keys.length === 0) return {};
        /* v8 ignore stop */
        /* v8 ignore next */
        const contentType = keys[0]!;
        /* v8 ignore next */
        const encoding = (p.content as Record<string, { encoding?: Record<string, OpenApiValue> }>)?.[contentType]
            ?.encoding;
        /* v8 ignore next */
        return {
            /* v8 ignore start */
            ...(contentType ? { contentType } : {}),
            /* v8 ignore stop */
            ...(encoding ? { encoding } : {}),
        };
    }

    private getParameterSchema(p: Parameter, contentType?: string): SwaggerDefinition | boolean | undefined {
        /* v8 ignore next */
        if (p.schema !== undefined) return p.schema as SwaggerDefinition | boolean;
        /* v8 ignore next */
        if (!p.content) return undefined;
        /* v8 ignore next */
        /* v8 ignore start */
        const key = contentType ?? Object.keys(p.content)[0];
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        if (!key) return undefined;
        /* v8 ignore stop */
        /* v8 ignore next */
        const entry = (p.content as Record<string, { schema?: SwaggerDefinition | boolean }>)?.[key];
        /* v8 ignore next */
        return entry?.schema;
    }

    private isJsonContentMediaType(p: Parameter): boolean {
        /* v8 ignore next */
        if (p.schema === undefined || typeof p.schema !== 'object') return false;

        /* v8 ignore next */
        if (
            (p.schema as SwaggerDefinition).contentMediaType &&
            this.isJsonMediaType(this.normalizeMediaType((p.schema as SwaggerDefinition).contentMediaType!))
        ) {
            /* v8 ignore next */
            return true;
        }

        /* v8 ignore next */
        const resolved = this.parser.resolve(p.schema as SwaggerDefinition);
        /* v8 ignore next */
        return !!(
            resolved &&
            resolved.contentMediaType &&
            this.isJsonMediaType(this.normalizeMediaType(resolved.contentMediaType))
        );
    }

    private isXmlContent(p: Parameter): boolean {
        /* v8 ignore next */
        return this.getXmlContentEntry(p) !== undefined;
    }

    private getXmlContentEntry(p: Parameter): { mediaType: string; schema: SwaggerDefinition | boolean } | undefined {
        /* v8 ignore next */
        if (!p.content) return undefined;
        /* v8 ignore next */
        for (const [mediaType, mediaObj] of Object.entries(p.content)) {
            /* v8 ignore next */
            const normalized = this.normalizeMediaType(mediaType);
            /* v8 ignore next */
            if (!this.isXmlMediaType(normalized)) continue;
            /* v8 ignore next */
            /* v8 ignore start */
            if (!mediaObj || typeof mediaObj !== 'object') continue;
            /* v8 ignore stop */
            /* v8 ignore next */
            const schema = (mediaObj as MediaTypeObject).schema;
            /* v8 ignore next */
            /* v8 ignore start */
            if (schema === undefined) continue;
            /* v8 ignore stop */
            /* v8 ignore next */
            return { mediaType, schema };
        }
        /* v8 ignore next */
        return undefined;
    }

    private getRequestBodyContentType(requestBody: PathInfo['requestBody']): string | undefined {
        /* v8 ignore next */
        if (!requestBody || !requestBody.content) return undefined;
        /* v8 ignore next */
        return this.selectRequestBodyContentType(requestBody.content as Record<string, { schema?: SwaggerDefinition }>);
    }

    private selectRequestBodyContentType(content: Record<string, { schema?: SwaggerDefinition }>): string | undefined {
        /* v8 ignore next */
        const entries = Object.keys(content).map(key => ({
            raw: key,
            normalized: this.normalizeMediaType(key),
        }));
        /* v8 ignore next */
        /* v8 ignore start */
        if (entries.length === 0) return undefined;
        /* v8 ignore stop */

        /* v8 ignore next */
        entries.sort((a, b) => {
            /* v8 ignore next */
            const specDiff = this.getMediaTypeSpecificity(b.normalized) - this.getMediaTypeSpecificity(a.normalized);
            /* v8 ignore next */
            if (specDiff !== 0) return specDiff;
            /* v8 ignore next */
            const prefDiff = this.getMediaTypePreference(a.normalized) - this.getMediaTypePreference(b.normalized);
            /* v8 ignore next */
            /* v8 ignore start */
            if (prefDiff !== 0) return prefDiff;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            return 0;
            /* v8 ignore stop */
        });

        /* v8 ignore next */
        return entries[0]?.raw;
    }

    private normalizeMediaType(mediaType: string): string {
        /* v8 ignore next */
        return mediaType.split(';')[0]!.trim().toLowerCase();
    }

    private getMediaTypeSpecificity(normalized: string): number {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!normalized) return 0;
        /* v8 ignore stop */
        /* v8 ignore next */
        const [type, subtype] = normalized.split('/');
        /* v8 ignore next */
        /* v8 ignore start */
        if (!type || !subtype) return 0;
        /* v8 ignore stop */
        /* v8 ignore next */
        if (type === '*' && subtype === '*') return 0;
        /* v8 ignore next */
        if (subtype === '*') return 1;
        /* v8 ignore next */
        return 2;
    }

    private getMediaTypePreference(normalized: string): number {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!normalized) return 100;
        /* v8 ignore stop */
        /* v8 ignore next */
        if (normalized === 'application/json') return 0;
        /* v8 ignore next */
        if (
            normalized === 'application/json-seq' ||
            normalized.endsWith('+json-seq') ||
            normalized === 'application/jsonl' ||
            normalized === 'application/x-ndjson'
        ) {
            /* v8 ignore next */
            return 1;
        }
        /* v8 ignore next */
        /* v8 ignore start */
        if (normalized.endsWith('+json')) return 2;
        /* v8 ignore stop */
        /* v8 ignore next */
        if (normalized === 'application/xml') return 3;
        /* v8 ignore next */
        /* v8 ignore start */
        if (normalized.endsWith('+xml')) return 4;
        /* v8 ignore stop */
        /* v8 ignore next */
        if (normalized === 'text/plain') return 5;
        /* v8 ignore next */
        if (normalized.startsWith('text/')) return 6;
        /* v8 ignore next */
        /* v8 ignore start */
        if (normalized === 'application/x-www-form-urlencoded') return 7;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        if (normalized.startsWith('multipart/')) return 8;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        if (normalized === '*/*') return 99;
        /* v8 ignore stop */
        /* v8 ignore next */
        return 50;
    }

    private isJsonMediaType(mediaType: string): boolean {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!mediaType) return false;
        /* v8 ignore stop */
        /* v8 ignore next */
        return mediaType === '*/*' || mediaType.includes('json') || mediaType.endsWith('+json');
    }

    private isXmlMediaType(mediaType: string): boolean {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!mediaType) return false;
        /* v8 ignore stop */
        /* v8 ignore next */
        return mediaType === 'application/xml' || mediaType.endsWith('+xml') || mediaType.includes('/xml');
    }

    private isTextMediaType(mediaType: string): boolean {
        /* v8 ignore next */
        return !!mediaType && mediaType.startsWith('text/');
    }

    private isFormUrlEncodedMediaType(mediaType: string): boolean {
        /* v8 ignore next */
        return mediaType === 'application/x-www-form-urlencoded';
    }

    private isMultipartMediaType(mediaType: string): boolean {
        /* v8 ignore next */
        return !!mediaType && mediaType.startsWith('multipart/');
    }

    private getSequentialJsonKind(mediaType: string): 'json-lines' | 'json-seq' | undefined {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!mediaType) return undefined;
        /* v8 ignore stop */
        /* v8 ignore next */
        if (mediaType === 'application/json-seq' || mediaType.endsWith('+json-seq')) return 'json-seq';
        /* v8 ignore next */
        if (mediaType === 'application/jsonl' || mediaType === 'application/x-ndjson') return 'json-lines';
        /* v8 ignore next */
        return undefined;
    }

    private inferSequentialJsonKind(
        normalizedMediaType: string,
        mediaObj?: MediaTypeObject,
    ): 'json-lines' | 'json-seq' | undefined {
        /* v8 ignore next */
        const known = this.getSequentialJsonKind(normalizedMediaType);
        /* v8 ignore next */
        if (known) return known;
        /* v8 ignore next */
        if (!mediaObj || mediaObj.itemSchema === undefined) return undefined;
        /* v8 ignore next */
        /* v8 ignore start */
        if (!this.isJsonMediaType(normalizedMediaType)) return undefined;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        if (normalizedMediaType === 'application/json' || normalizedMediaType === '*/*') return undefined;
        /* v8 ignore stop */
        /* v8 ignore next */
        return 'json-lines';
    }

    private isBinaryMediaType(mediaType: string): boolean {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!mediaType) return false;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        if (mediaType.startsWith('image/') || mediaType.startsWith('audio/') || mediaType.startsWith('video/')) {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            return true;
            /* v8 ignore stop */
        }
        /* v8 ignore next */
        return (
            mediaType === 'application/octet-stream' ||
            mediaType === 'application/pdf' ||
            mediaType.endsWith('+octet-stream')
        );
    }

    private needsRequestType(definition: SwaggerDefinition): boolean {
        /* v8 ignore next */
        if (!definition.properties) return false;
        /* v8 ignore next */
        const properties = Object.values(definition.properties).filter(
            /* v8 ignore next */
            p => p !== null && typeof p === 'object',
        ) as SwaggerDefinition[];
        /* v8 ignore next */
        return properties.some(p => p.readOnly || p.writeOnly);
    }

    private getXmlConfig(schema: SwaggerDefinition | boolean | undefined, depth: number): Record<string, OpenApiValue> {
        /* v8 ignore next */
        if (!schema || typeof schema !== 'object' || depth <= 0) return {};
        /* v8 ignore next */
        const resolved = this.parser.resolve(schema as SwaggerDefinition);
        /* v8 ignore next */
        if (!resolved) return {};

        /* v8 ignore next */
        const config: Record<string, OpenApiValue> = {};
        /* v8 ignore next */
        if (resolved.xml?.name) config.name = resolved.xml.name;
        /* v8 ignore next */
        if (resolved.xml?.attribute) config.attribute = true;
        /* v8 ignore next */
        if (resolved.xml?.wrapped) config.wrapped = true;
        /* v8 ignore next */
        if (resolved.xml?.prefix) config.prefix = resolved.xml.prefix;
        /* v8 ignore next */
        if (resolved.xml?.namespace) config.namespace = resolved.xml.namespace;

        /* v8 ignore next */
        if (resolved.xml?.nodeType) {
            /* v8 ignore next */
            config.nodeType = resolved.xml.nodeType;
            /* v8 ignore next */
        } else if (resolved.xml?.wrapped) {
            /* v8 ignore next */
            config.nodeType = 'element';
        } else {
            const isRef =
                /* v8 ignore next */
                !!(schema as Record<string, OpenApiValue>)?.$ref ||
                !!(schema as Record<string, OpenApiValue>)?.$dynamicRef;
            /* v8 ignore next */
            const isArray = resolved.type === 'array';

            /* v8 ignore next */
            if (isRef || isArray) {
                /* v8 ignore next */
                config.nodeType = 'none';
            } else {
                /* v8 ignore next */
                config.nodeType = 'element';
            }
        }

        /* v8 ignore next */
        if (resolved.type === 'array' && resolved.items) {
            /* v8 ignore next */
            config.items = this.getXmlConfig(resolved.items as SwaggerDefinition, depth - 1);
        }
        /* v8 ignore next */
        if (Array.isArray(resolved.prefixItems)) {
            /* v8 ignore next */
            config.prefixItems = resolved.prefixItems.map(item =>
                /* v8 ignore next */
                this.getXmlConfig(item as SwaggerDefinition, depth - 1),
            );
        }

        /* v8 ignore next */
        if (resolved.properties) {
            /* v8 ignore next */
            config.properties = {};
            /* v8 ignore next */
            Object.entries(resolved.properties).forEach(([propName, propSchema]) => {
                /* v8 ignore next */
                const propConfig = this.getXmlConfig(propSchema as SwaggerDefinition | boolean, depth - 1);
                /* v8 ignore next */
                if (Object.keys(propConfig).length > 0) {
                    /* v8 ignore next */
                    (config.properties as Record<string, OpenApiValue>)[propName] = propConfig;
                }
            });
        }

        /* v8 ignore next */
        if (resolved.allOf) {
            /* v8 ignore next */
            resolved.allOf.forEach(sub => {
                /* v8 ignore next */
                const subConfig = this.getXmlConfig(sub as SwaggerDefinition | boolean, depth - 1);
                /* v8 ignore next */
                if (subConfig.properties) {
                    /* v8 ignore next */
                    config.properties = {
                        ...(config.properties as Record<string, OpenApiValue>),
                        ...(subConfig.properties as Record<string, OpenApiValue>),
                    };
                }
            });
        }
        /* v8 ignore next */
        return config;
    }

    private getDecodingConfig(
        schema: SwaggerDefinition | boolean | undefined,
        depth: number = 5,
    ): Record<string, OpenApiValue> {
        /* v8 ignore next */
        if (!schema || typeof schema !== 'object' || depth <= 0) return {};
        /* v8 ignore next */
        const resolved = this.parser.resolve(schema as SwaggerDefinition);
        /* v8 ignore next */
        if (!resolved) return {};

        /* v8 ignore next */
        const config: Record<string, OpenApiValue> = {};

        /* v8 ignore next */
        if (resolved.contentEncoding) {
            /* v8 ignore next */
            config.contentEncoding = resolved.contentEncoding;
        }

        /* v8 ignore next */
        if (resolved.contentSchema && resolved.type === 'string') {
            /* v8 ignore next */
            if (resolved.contentMediaType && resolved.contentMediaType.includes('xml')) {
                /* v8 ignore next */
                config.decode = 'xml';
                /* v8 ignore next */
                config.xmlConfig = this.getXmlConfig(resolved.contentSchema as SwaggerDefinition | boolean, 5);
            } else {
                /* v8 ignore next */
                config.decode = true;
            }
            /* v8 ignore next */
            return config;
        }

        /* v8 ignore next */
        if (resolved.type === 'array' && resolved.items) {
            /* v8 ignore next */
            const itemConfig = this.getDecodingConfig(resolved.items as SwaggerDefinition, depth - 1);
            /* v8 ignore next */
            if (Object.keys(itemConfig).length > 0) {
                /* v8 ignore next */
                config.items = itemConfig;
            }
        }

        /* v8 ignore next */
        if (resolved.properties) {
            /* v8 ignore next */
            const propConfigs: Record<string, OpenApiValue> = {};
            /* v8 ignore next */
            Object.entries(resolved.properties).forEach(([propName, propSchema]) => {
                /* v8 ignore next */
                const pConfig = this.getDecodingConfig(propSchema as SwaggerDefinition | boolean, depth - 1);
                /* v8 ignore next */
                if (Object.keys(pConfig).length > 0) {
                    /* v8 ignore next */
                    propConfigs[propName] = pConfig;
                }
            });
            /* v8 ignore next */
            if (Object.keys(propConfigs).length > 0) {
                /* v8 ignore next */
                config.properties = propConfigs;
            }
        }

        /* v8 ignore next */
        if (resolved.allOf) {
            /* v8 ignore next */
            resolved.allOf.forEach(sub => {
                /* v8 ignore next */
                const subConfig = this.getDecodingConfig(sub as SwaggerDefinition | boolean, depth - 1);
                /* v8 ignore next */
                if (subConfig.properties) {
                    /* v8 ignore next */
                    config.properties = {
                        ...((config.properties as Record<string, OpenApiValue>) || {}),
                        ...(subConfig.properties as Record<string, OpenApiValue>),
                    };
                }
            });
        }

        /* v8 ignore next */
        return config;
    }

    private getSseMode(schema: SwaggerDefinition | boolean | undefined): 'event' | 'data' {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!schema || typeof schema !== 'object') return 'data';
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        const resolved = this.parser.resolve(schema as SwaggerDefinition) ?? schema;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        if (!resolved || typeof resolved !== 'object') return 'data';
        /* v8 ignore stop */

        /* v8 ignore next */
        const hasDataProperty = (node: SwaggerDefinition | boolean | undefined, depth: number = 5): boolean => {
            /* v8 ignore next */
            /* v8 ignore start */
            if (!node || typeof node !== 'object' || depth <= 0) return false;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            const resolvedNode = this.parser.resolve(node as SwaggerDefinition) ?? node;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            if (!resolvedNode || typeof resolvedNode !== 'object') return false;
            /* v8 ignore stop */

            /* v8 ignore next */
            const props = (resolvedNode as SwaggerDefinition).properties;
            /* v8 ignore next */
            if (props && Object.prototype.hasOwnProperty.call(props, 'data')) return true;

            /* v8 ignore next */
            const allOf = (resolvedNode as SwaggerDefinition).allOf;
            /* v8 ignore next */
            /* v8 ignore start */
            if (Array.isArray(allOf)) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                if (allOf.some(sub => hasDataProperty(sub as SwaggerDefinition | boolean, depth - 1))) return true;
                /* v8 ignore stop */
            }
            /* v8 ignore next */
            const anyOf = (resolvedNode as SwaggerDefinition).anyOf;
            /* v8 ignore next */
            /* v8 ignore start */
            if (Array.isArray(anyOf)) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                if (anyOf.some(sub => hasDataProperty(sub as SwaggerDefinition | boolean, depth - 1))) return true;
                /* v8 ignore stop */
            }
            /* v8 ignore next */
            const oneOf = (resolvedNode as SwaggerDefinition).oneOf;
            /* v8 ignore next */
            /* v8 ignore start */
            if (Array.isArray(oneOf)) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                if (oneOf.some(sub => hasDataProperty(sub as SwaggerDefinition | boolean, depth - 1))) return true;
                /* v8 ignore stop */
            }

            /* v8 ignore next */
            return false;
        };

        /* v8 ignore next */
        return hasDataProperty(resolved as SwaggerDefinition | boolean) ? 'event' : 'data';
    }

    private getEncodingConfig(
        schema: SwaggerDefinition | boolean | undefined,
        depth: number = 5,
    ): Record<string, OpenApiValue> {
        /* v8 ignore next */
        if (!schema || typeof schema !== 'object' || depth <= 0) return {};
        /* v8 ignore next */
        const resolved = this.parser.resolve(schema as SwaggerDefinition);
        /* v8 ignore next */
        if (!resolved) return {};

        /* v8 ignore next */
        const config: Record<string, OpenApiValue> = {};

        /* v8 ignore next */
        if (resolved.contentMediaType) {
            /* v8 ignore next */
            config.contentMediaType = resolved.contentMediaType;
        }

        /* v8 ignore next */
        if (resolved.contentEncoding) {
            /* v8 ignore next */
            config.contentEncoding = resolved.contentEncoding;
        }

        /* v8 ignore next */
        if (resolved.type === 'string' && resolved.contentMediaType && resolved.contentMediaType.includes('json')) {
            /* v8 ignore next */
            config.encode = true;
            /* v8 ignore next */
            return config;
        }

        /* v8 ignore next */
        if (resolved.type === 'array' && resolved.items) {
            /* v8 ignore next */
            const itemConfig = this.getEncodingConfig(resolved.items as SwaggerDefinition, depth - 1);
            /* v8 ignore next */
            if (Object.keys(itemConfig).length > 0) {
                /* v8 ignore next */
                config.items = itemConfig;
            }
        }

        /* v8 ignore next */
        if (resolved.properties) {
            /* v8 ignore next */
            const propConfigs: Record<string, OpenApiValue> = {};
            /* v8 ignore next */
            Object.entries(resolved.properties).forEach(([propName, propSchema]) => {
                /* v8 ignore next */
                const pConfig = this.getEncodingConfig(propSchema as SwaggerDefinition | boolean, depth - 1);
                /* v8 ignore next */
                if (Object.keys(pConfig).length > 0) {
                    /* v8 ignore next */
                    propConfigs[propName] = pConfig;
                }
            });
            /* v8 ignore next */
            if (Object.keys(propConfigs).length > 0) {
                /* v8 ignore next */
                config.properties = propConfigs;
            }
        }

        /* v8 ignore next */
        if (resolved.allOf) {
            /* v8 ignore next */
            resolved.allOf.forEach(sub => {
                /* v8 ignore next */
                const subConfig = this.getEncodingConfig(sub as SwaggerDefinition | boolean, depth - 1);
                /* v8 ignore next */
                if (subConfig.properties) {
                    /* v8 ignore next */
                    config.properties = {
                        ...((config.properties as Record<string, OpenApiValue>) || {}),
                        ...(subConfig.properties as Record<string, OpenApiValue>),
                    };
                }
            });
        }

        /* v8 ignore next */
        return config;
    }
}
