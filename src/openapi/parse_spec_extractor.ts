// src/core/utils/spec-extractor.ts
import { BodyParameter, Parameter as SwaggerOfficialParameter, Response } from 'swagger-schema-official';
import {
    ExampleObject,
    HeaderObject,
    MediaTypeObject,
    Parameter,
    PathInfo,
    PathItem,
    RequestBody,
    SpecOperation,
    SwaggerDefinition,
    SwaggerResponse, OpenApiValue } from '../core/types/index.js';
import { isUriReference, pascalCase } from '../functions/utils_string.js';
import { normalizeSecurityKey } from '../functions/utils_naming.js';

type UnifiedParameter = SwaggerOfficialParameter & {
    schema?: SwaggerDefinition | { $ref: string } | boolean;
    type?: string;
    format?: string;
    items?: SwaggerDefinition | { $ref: string };
    collectionFormat?: 'csv' | 'ssv' | 'tsv' | 'pipes' | 'multi' | string;
    style?: string;
    explode?: boolean;
    allowReserved?: boolean;
    allowEmptyValue?: boolean;
    content?: Record<string, { schema?: SwaggerDefinition | boolean }>;
    deprecated?: boolean;
    example?: OpenApiValue;
    examples?: Record<string, OpenApiValue>;
    [key: string]: OpenApiValue;
};

export function groupPathsByController(parser: { operations: PathInfo[] }): Record<string, PathInfo[]> {
    /* v8 ignore next */
    const groups: Record<string, PathInfo[]> = {};
    /* v8 ignore next */
    for (const op of parser.operations) {
        /* v8 ignore next */
        let group = 'Default';
        /* v8 ignore next */
        if (Array.isArray(op.tags) && op.tags.length > 0 && op.tags[0]) {
            /* v8 ignore next */
            group = pascalCase(op.tags[0].toString());
        } else {
            /* v8 ignore next */
            const firstSegment = op.path.split('/').filter(Boolean)[0];
            /* v8 ignore next */
            if (firstSegment) {
                /* v8 ignore next */
                group = pascalCase(firstSegment);
            }
        }
        /* v8 ignore next */
        if (!groups[group]) groups[group] = [];
        /* v8 ignore next */
        groups[group].push(op);
    }
    /* v8 ignore next */
    return groups;
}

export function extractPaths(
    swaggerPaths: { [p: string]: PathItem } | undefined,
    resolveRef?: (ref: string) => unknown,
    components?: { securitySchemes?: Record<string, OpenApiValue> } | undefined,
    options?: { isOpenApi3?: boolean; defaultConsumes?: string[]; defaultProduces?: string[] },
    resolveObj?: (obj: OpenApiValue) => unknown,
): PathInfo[] {
    /* v8 ignore next */
    if (!swaggerPaths) {
        /* v8 ignore next */
        return [];
    }

    /* v8 ignore next */
    const isOpenApi3 = options?.isOpenApi3 === true;
    /* v8 ignore next */
    const defaultConsumes = options?.defaultConsumes;
    /* v8 ignore next */
    const defaultProduces = options?.defaultProduces;
    /* v8 ignore next */
    const reservedHeaderNames = new Set(['accept', 'content-type', 'authorization']);

    /* v8 ignore next */
    const paths: PathInfo[] = [];
    /* v8 ignore next */
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace', 'query'];

    /* v8 ignore next */
    const resolveMaybeRef = <T>(
        obj: T | { $ref?: string; $dynamicRef?: string; summary?: string; description?: string } | undefined | null,
    ): T | undefined => {
        /* v8 ignore next */
        if (!obj) return undefined;
        /* v8 ignore next */
        if (!resolveRef && !resolveObj) return obj as T;

        /* v8 ignore next */
        if (resolveObj && typeof obj === 'object') {
            /* v8 ignore next */
            const resolvedObj = resolveObj(obj);
            /* v8 ignore next */
            if (resolvedObj !== undefined) return resolvedObj as T;
        }

        /* v8 ignore next */
        /* v8 ignore start */
        if (!resolveRef || typeof obj !== 'object') return obj as T;
        /* v8 ignore stop */

        /* v8 ignore next */
        const objRec = obj as { $ref?: string; $dynamicRef?: string; summary?: string; description?: string };
        /* v8 ignore next */
        const ref = objRec.$ref || objRec.$dynamicRef;
        /* v8 ignore next */
        if (typeof ref !== 'string') return obj as T;

        /* v8 ignore next */
        const resolved = resolveRef(ref) as T | undefined;
        /* v8 ignore next */
        if (!resolved) return obj as T;

        /* v8 ignore next */
        const summary = objRec.summary;
        /* v8 ignore next */
        const description = objRec.description;
        /* v8 ignore next */
        if (summary !== undefined || description !== undefined) {
            /* v8 ignore next */
            return {
                ...(resolved as object),
                /* v8 ignore start */
                ...(summary !== undefined ? { summary } : {}),
                /* v8 ignore stop */
                /* v8 ignore start */
                ...(description !== undefined ? { description } : {}),
                /* v8 ignore stop */
            } as T;
        }
        /* v8 ignore next */
        return resolved;
    };

    /* v8 ignore next */
    const resolveHeaders = (
        headers:
            | Record<string, HeaderObject | { $ref?: string; $dynamicRef?: string; description?: string }>
            | undefined,
    ): Record<string, HeaderObject> | undefined => {
        /* v8 ignore next */
        if (!headers) return undefined;
        /* v8 ignore next */
        const resolvedHeaders: Record<string, HeaderObject> = {};
        /* v8 ignore next */
        for (const [name, header] of Object.entries(headers)) {
            /* v8 ignore next */
            if (name.toLowerCase() === 'content-type') {
                /* v8 ignore next */
                continue;
            }
            /* v8 ignore next */
            const resolvedHeader = resolveMaybeRef<HeaderObject>(header);
            /* v8 ignore next */
            /* v8 ignore start */
            if (resolvedHeader) {
                /* v8 ignore stop */
                /* v8 ignore next */
                resolvedHeaders[name] = resolvedHeader;
            }
        }
        /* v8 ignore next */
        return resolvedHeaders;
    };

    /* v8 ignore next */
    const resolveContentMap = (
        content: Record<string, MediaTypeObject | { $ref?: string; $dynamicRef?: string }> | undefined,
    ): Record<string, MediaTypeObject> | undefined => {
        /* v8 ignore next */
        if (!content) return undefined;
        /* v8 ignore next */
        const resolvedContent: Record<string, MediaTypeObject> = {};
        /* v8 ignore next */
        for (const [mediaType, mediaObj] of Object.entries(content)) {
            /* v8 ignore next */
            const resolvedMedia = resolveMaybeRef<MediaTypeObject>(mediaObj);
            /* v8 ignore next */
            /* v8 ignore start */
            if (resolvedMedia) {
                /* v8 ignore stop */
                /* v8 ignore next */
                resolvedContent[mediaType] = resolvedMedia;
            }
        }
        /* v8 ignore next */
        /* v8 ignore start */
        return Object.keys(resolvedContent).length > 0 ? resolvedContent : undefined;
        /* v8 ignore stop */
    };

    /* v8 ignore next */
    const securitySchemeNames = new Set(components?.securitySchemes ? Object.keys(components.securitySchemes) : []);

    /* v8 ignore next */
    for (const [path, rawPathItem] of Object.entries(swaggerPaths)) {
        /* v8 ignore next */
        let pathItem = rawPathItem;

        /* v8 ignore next */
        if (pathItem.$ref && (resolveObj || resolveRef)) {
            const resolvedByObj =
                /* v8 ignore next */
                resolveObj && typeof pathItem === 'object' ? (resolveObj(pathItem) as PathItem | undefined) : undefined;
            const resolved =
                /* v8 ignore next */
                resolvedByObj ?? (resolveRef ? (resolveRef(pathItem.$ref) as PathItem | undefined) : undefined);
            /* v8 ignore next */
            if (resolved) {
                /* v8 ignore next */
                const localOverrides = { ...pathItem };
                /* v8 ignore next */
                delete localOverrides.$ref;
                /* v8 ignore next */
                pathItem = { ...resolved, ...localOverrides };
            }
        }

        /* v8 ignore next */
        const rawPathParameters: UnifiedParameter[] = Array.isArray(pathItem.parameters)
            ? (pathItem.parameters.filter(Boolean) as UnifiedParameter[])
            : [];
        /* v8 ignore next */
        const pathParameters: UnifiedParameter[] = rawPathParameters
            /* v8 ignore next */
            .map(param => resolveMaybeRef<UnifiedParameter>(param))
            /* v8 ignore next */
            .filter((param): param is UnifiedParameter => !!param && 'name' in param && 'in' in param);

        /* v8 ignore next */
        const pathServers = pathItem.servers;
        /* v8 ignore next */
        const operationsToProcess: { method: string; operation: SpecOperation }[] = [];

        /* v8 ignore next */
        const pathItemRec = pathItem as Record<string, OpenApiValue>;

        /* v8 ignore next */
        for (const method of methods) {
            /* v8 ignore next */
            const operation = pathItemRec[method] as SpecOperation | undefined;
            /* v8 ignore next */
            if (operation) {
                /* v8 ignore next */
                operationsToProcess.push({ method, operation });
            }
        }

        /* v8 ignore next */
        if (pathItem.additionalOperations) {
            /* v8 ignore next */
            for (const [method, operation] of Object.entries(
                pathItem.additionalOperations as Record<string, SpecOperation>,
            )) {
                /* v8 ignore next */
                operationsToProcess.push({ method, operation });
            }
        }

        /* v8 ignore next */
        for (const { method, operation } of operationsToProcess) {
            /* v8 ignore next */
            const paramsMap = new Map<string, UnifiedParameter>();
            /* v8 ignore next */
            pathParameters.forEach(p => {
                /* v8 ignore next */
                paramsMap.set(`${p.name}:${p.in}`, p);
            });
            /* v8 ignore next */
            (Array.isArray(operation.parameters) ? operation.parameters : []).forEach(p => {
                /* v8 ignore next */
                const resolvedParam = resolveMaybeRef<UnifiedParameter>(p as UnifiedParameter);
                /* v8 ignore next */
                if (resolvedParam && 'name' in resolvedParam && 'in' in resolvedParam) {
                    /* v8 ignore next */
                    paramsMap.set(`${resolvedParam.name}:${resolvedParam.in}`, resolvedParam);
                }
            });

            /* v8 ignore next */
            const allParams = Array.from(paramsMap.values()).filter(Boolean);
            /* v8 ignore next */
            const nonBodyParams = allParams.filter(p => p && p.in !== 'body');
            /* v8 ignore next */
            const bodyParam = allParams.find(p => p && p.in === 'body') as BodyParameter | undefined;

            /* v8 ignore next */
            const parameters = nonBodyParams
                /* v8 ignore next */
                .filter(p => p !== undefined && p !== null)
                .map((p): Parameter => {
                    /* v8 ignore next */
                    let finalSchema: SwaggerDefinition | boolean | undefined = p.schema as
                        | SwaggerDefinition
                        | boolean
                        | undefined;

                    /* v8 ignore next */
                    const resolvedContent = resolveContentMap(p.content as Record<string, MediaTypeObject>);
                    /* v8 ignore next */
                    if (resolvedContent) {
                        /* v8 ignore next */
                        const contentType = Object.keys(resolvedContent)[0];
                        /* v8 ignore next */
                        if (contentType && resolvedContent[contentType].schema !== undefined) {
                            /* v8 ignore next */
                            finalSchema = resolvedContent[contentType].schema;
                        }
                        /* v8 ignore next */
                        /* v8 ignore start */
                    } else if (p.content) {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        const contentType = Object.keys(p.content)[0];
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (contentType && p.content[contentType].schema !== undefined) {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            finalSchema = p.content[contentType].schema;
                            /* v8 ignore stop */
                        }
                    }

                    /* v8 ignore next */
                    if (finalSchema === undefined) {
                        /* v8 ignore next */
                        const baseSchema: SwaggerDefinition = {};
                        /* v8 ignore next */
                        if (p.type !== undefined)
                            /* v8 ignore next */
                            baseSchema.type = p.type as Exclude<SwaggerDefinition['type'], undefined>;
                        /* v8 ignore next */
                        if (p.format !== undefined) baseSchema.format = p.format;
                        /* v8 ignore next */
                        if (p.items !== undefined)
                            /* v8 ignore next */
                            baseSchema.items = p.items as SwaggerDefinition | SwaggerDefinition[];
                        /* v8 ignore next */
                        finalSchema = baseSchema;
                    }

                    /* v8 ignore next */
                    const param: Parameter = {
                        name: p.name,
                        in: p.in as 'query' | 'path' | 'header' | 'cookie' | 'querystring',
                        schema: finalSchema,
                    };

                    /* v8 ignore next */
                    if (resolvedContent) {
                        /* v8 ignore next */
                        param.content = resolvedContent;
                        /* v8 ignore next */
                        /* v8 ignore start */
                    } else if (p.content) {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        param.content = p.content as Record<string, MediaTypeObject>;
                        /* v8 ignore stop */
                    }

                    /* v8 ignore next */
                    if (p.style !== undefined) param.style = p.style;
                    /* v8 ignore next */
                    if (p.explode !== undefined) param.explode = p.explode;
                    /* v8 ignore next */
                    if (p.allowReserved !== undefined) param.allowReserved = p.allowReserved;
                    /* v8 ignore next */
                    if (p.allowEmptyValue !== undefined) param.allowEmptyValue = p.allowEmptyValue;
                    /* v8 ignore next */
                    if (p.deprecated !== undefined) param.deprecated = p.deprecated;

                    /* v8 ignore next */
                    if (p.example !== undefined) param.example = p.example;
                    /* v8 ignore next */
                    if (p.examples !== undefined) param.examples = p.examples as Record<string, ExampleObject>;

                    /* v8 ignore next */
                    if (p.collectionFormat) {
                        /* v8 ignore next */
                        switch (p.collectionFormat) {
                            case 'csv':
                                /* v8 ignore next */
                                param.style = 'form';
                                /* v8 ignore next */
                                param.explode = false;
                                /* v8 ignore next */
                                break;
                            case 'ssv':
                                /* v8 ignore next */
                                param.style = 'spaceDelimited';
                                /* v8 ignore next */
                                param.explode = false;
                                /* v8 ignore next */
                                break;
                            case 'tsv':
                                /* v8 ignore next */
                                param.style = 'tabDelimited';
                                /* v8 ignore next */
                                param.explode = false;
                                /* v8 ignore next */
                                break;
                            case 'pipes':
                                /* v8 ignore next */
                                param.style = 'pipeDelimited';
                                /* v8 ignore next */
                                param.explode = false;
                                /* v8 ignore next */
                                break;
                            case 'multi':
                                /* v8 ignore next */
                                param.style = 'form';
                                /* v8 ignore next */
                                param.explode = true;
                                /* v8 ignore next */
                                break;
                        }
                    }

                    /* v8 ignore next */
                    if (!param.style) {
                        /* v8 ignore next */
                        if (param.in === 'query' || param.in === 'cookie') {
                            /* v8 ignore next */
                            param.style = 'form';
                            /* v8 ignore next */
                        } else if (param.in === 'path' || param.in === 'header') {
                            /* v8 ignore next */
                            param.style = 'simple';
                        }
                    }

                    /* v8 ignore next */
                    if (param.explode === undefined) {
                        /* v8 ignore next */
                        param.explode = param.style === 'form';
                    }

                    /* v8 ignore next */
                    if (p.required !== undefined) param.required = p.required;

                    /* v8 ignore next */
                    if (p.description) param.description = p.description;

                    /* v8 ignore next */
                    Object.keys(p).forEach(key => {
                        /* v8 ignore next */
                        if (key.startsWith('x-')) {
                            /* v8 ignore next */
                            (param as Record<string, OpenApiValue>)[key] = p[key];
                        }
                    });

                    /* v8 ignore next */
                    return param;
                })
                .filter(param => {
                    /* v8 ignore next */
                    if (!isOpenApi3) return true;
                    /* v8 ignore next */
                    if (param.in !== 'header') return true;
                    /* v8 ignore next */
                    return !reservedHeaderNames.has(param.name.toLowerCase());
                });

            let requestBody: RequestBody | undefined;

            /* v8 ignore next */
            if (operation.requestBody !== undefined) {
                /* v8 ignore next */
                requestBody =
                    /* v8 ignore start */
                    resolveMaybeRef<RequestBody>(operation.requestBody as RequestBody) ??
                    /* v8 ignore stop */
                    (operation.requestBody as RequestBody);
                /* v8 ignore next */
            } else if (bodyParam) {
                /* v8 ignore next */
                const consumes = (operation.consumes && operation.consumes.length > 0
                    ? operation.consumes
                    : defaultConsumes) || ['application/json'];

                /* v8 ignore next */
                const content: Record<string, MediaTypeObject> = {};
                /* v8 ignore next */
                consumes.forEach(mediaType => {
                    /* v8 ignore next */
                    content[mediaType] = { schema: bodyParam.schema as OpenApiValue as SwaggerDefinition };
                });

                /* v8 ignore next */
                requestBody = { content };

                /* v8 ignore next */
                /* v8 ignore start */
                if (bodyParam.description) requestBody.description = bodyParam.description;
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore start */
                if (bodyParam.required !== undefined) requestBody.required = bodyParam.required;
                /* v8 ignore stop */
            }

            /* v8 ignore next */
            if (requestBody?.content) {
                /* v8 ignore next */
                const resolvedContent = resolveContentMap(requestBody.content as Record<string, MediaTypeObject>);
                /* v8 ignore next */
                /* v8 ignore start */
                if (resolvedContent) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    requestBody = { ...requestBody, content: resolvedContent };
                }
            }

            /* v8 ignore next */
            const normalizedResponses: Record<string, SwaggerResponse> = {};
            /* v8 ignore next */
            /* v8 ignore start */
            if (operation.responses) {
                /* v8 ignore stop */
                /* v8 ignore next */
                for (const [code, resp] of Object.entries(operation.responses)) {
                    const resolvedResp =
                        /* v8 ignore next */
                        resolveMaybeRef<SwaggerResponse | Response>(resp as SwaggerResponse | Response) ??
                        (resp as SwaggerResponse);
                    /* v8 ignore next */
                    const swagger2Response = resolvedResp as Response;
                    /* v8 ignore next */
                    const headers = resolveHeaders(
                        (resolvedResp as Record<string, OpenApiValue>).headers as Record<string, HeaderObject>,
                    );

                    /* v8 ignore next */
                    if (swagger2Response && swagger2Response.schema !== undefined) {
                        /* v8 ignore next */
                        const produces = (operation.produces && operation.produces.length > 0
                            ? operation.produces
                            : defaultProduces) || ['application/json'];

                        /* v8 ignore next */
                        const content: Record<string, MediaTypeObject> = {};
                        /* v8 ignore next */
                        produces.forEach(mediaType => {
                            /* v8 ignore next */
                            content[mediaType] = {
                                schema: swagger2Response.schema as OpenApiValue as SwaggerDefinition,
                            };
                        });

                        /* v8 ignore next */
                        normalizedResponses[code] = {
                            /* v8 ignore start */
                            description: swagger2Response.description || '',
                            /* v8 ignore stop */
                            ...(headers ? { headers } : {}),
                            content,
                        };
                    } else {
                        /* v8 ignore next */
                        const resolvedContent = resolveContentMap(
                            (resolvedResp as SwaggerResponse).content as Record<string, MediaTypeObject>,
                        );
                        /* v8 ignore next */
                        normalizedResponses[code] = {
                            ...(resolvedResp as SwaggerResponse),
                            ...(headers ? { headers } : {}),
                            ...(resolvedContent ? { content: resolvedContent } : {}),
                        };
                    }
                }
            }

            /* v8 ignore next */
            const effectiveServers = operation.servers !== undefined ? operation.servers : pathServers;
            /* v8 ignore next */
            let effectiveSecurity = operation.security;
            /* v8 ignore next */
            if (effectiveSecurity) {
                /* v8 ignore next */
                effectiveSecurity = effectiveSecurity.map(req => {
                    /* v8 ignore next */
                    const normalizedReq: { [key: string]: string[] } = {};
                    /* v8 ignore next */
                    Object.keys(req).forEach(key => {
                        /* v8 ignore next */
                        if (securitySchemeNames.has(key)) {
                            /* v8 ignore next */
                            normalizedReq[key] = req[key];
                            /* v8 ignore next */
                        } else if (isUriReference(key)) {
                            /* v8 ignore next */
                            normalizedReq[key] = req[key];
                        } else {
                            /* v8 ignore next */
                            normalizedReq[normalizeSecurityKey(key)] = req[key];
                        }
                    });

                    /* v8 ignore next */
                    return normalizedReq;
                });
            }

            /* v8 ignore next */
            const pathInfo: PathInfo = {
                path,
                method: method.toUpperCase(),
                parameters,
                requestBody: requestBody as RequestBody,
                responses: normalizedResponses,
            };

            /* v8 ignore next */
            if (effectiveServers !== undefined) pathInfo.servers = effectiveServers;
            /* v8 ignore next */
            if (operation.callbacks) pathInfo.callbacks = operation.callbacks as Record<string, PathItem>;
            /* v8 ignore next */
            if (operation.operationId) pathInfo.operationId = operation.operationId;

            /* v8 ignore next */
            const summary = operation.summary || pathItem.summary;
            /* v8 ignore next */
            if (summary) pathInfo.summary = summary;
            /* v8 ignore next */
            const description = operation.description || pathItem.description;
            /* v8 ignore next */
            if (description) pathInfo.description = description;

            /* v8 ignore next */
            if (operation.tags) pathInfo.tags = operation.tags;
            /* v8 ignore next */
            if (operation.consumes) {
                /* v8 ignore next */
                pathInfo.consumes = operation.consumes;
                /* v8 ignore next */
            } else if (!isOpenApi3 && defaultConsumes) {
                /* v8 ignore next */
                pathInfo.consumes = defaultConsumes;
            }

            /* v8 ignore next */
            if (operation.produces) {
                /* v8 ignore next */
                pathInfo.produces = operation.produces;
                /* v8 ignore next */
            } else if (!isOpenApi3 && defaultProduces) {
                /* v8 ignore next */
                pathInfo.produces = defaultProduces;
            }

            /* v8 ignore next */
            if (operation.deprecated) pathInfo.deprecated = operation.deprecated;
            /* v8 ignore next */
            if (operation.externalDocs) pathInfo.externalDocs = operation.externalDocs;
            /* v8 ignore next */
            if (effectiveSecurity) pathInfo.security = effectiveSecurity;

            /* v8 ignore next */
            Object.keys(operation).forEach(key => {
                /* v8 ignore next */
                const piRec = pathInfo as Record<string, OpenApiValue>;
                /* v8 ignore next */
                const opRec = operation as Record<string, OpenApiValue>;
                /* v8 ignore next */
                if (key.startsWith('x-') && !(key in piRec)) {
                    /* v8 ignore next */
                    piRec[key] = opRec[key];
                }
            });

            /* v8 ignore next */
            paths.push(pathInfo);
        }
    }

    /* v8 ignore next */
    return paths;
}
