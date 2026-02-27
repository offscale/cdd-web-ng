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
    SwaggerResponse,
} from '../core/types/index.js';
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
    example?: unknown;
    examples?: Record<string, unknown>;
    [key: string]: unknown;
};

export function groupPathsByController(parser: { operations: PathInfo[] }): Record<string, PathInfo[]> {
    const groups: Record<string, PathInfo[]> = {};
    for (const op of parser.operations) {
        let group = 'Default';
        if (Array.isArray(op.tags) && op.tags.length > 0 && op.tags[0]) {
            group = pascalCase(op.tags[0].toString());
        } else {
            const firstSegment = op.path.split('/').filter(Boolean)[0];
            if (firstSegment) {
                group = pascalCase(firstSegment);
            }
        }
        if (!groups[group]) groups[group] = [];
        groups[group].push(op);
    }
    return groups;
}

export function extractPaths(
    swaggerPaths: { [p: string]: PathItem } | undefined,
    resolveRef?: (ref: string) => unknown,
    components?: { securitySchemes?: Record<string, unknown> } | undefined,
    options?: { isOpenApi3?: boolean; defaultConsumes?: string[]; defaultProduces?: string[] },
    resolveObj?: (obj: unknown) => unknown,
): PathInfo[] {
    if (!swaggerPaths) {
        return [];
    }

    const isOpenApi3 = options?.isOpenApi3 === true;
    const defaultConsumes = options?.defaultConsumes;
    const defaultProduces = options?.defaultProduces;
    const reservedHeaderNames = new Set(['accept', 'content-type', 'authorization']);

    const paths: PathInfo[] = [];
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace', 'query'];

    const resolveMaybeRef = <T>(
        obj: T | { $ref?: string; $dynamicRef?: string; summary?: string; description?: string } | undefined | null,
    ): T | undefined => {
        if (!obj) return undefined;
        if (!resolveRef && !resolveObj) return obj as T;

        if (resolveObj && typeof obj === 'object') {
            const resolvedObj = resolveObj(obj);
            if (resolvedObj !== undefined) return resolvedObj as T;
        }

        if (!resolveRef || typeof obj !== 'object') return obj as T;

        const objRec = obj as { $ref?: string; $dynamicRef?: string; summary?: string; description?: string };
        const ref = objRec.$ref || objRec.$dynamicRef;
        if (typeof ref !== 'string') return obj as T;

        const resolved = resolveRef(ref) as T | undefined;
        if (!resolved) return obj as T;

        const summary = objRec.summary;
        const description = objRec.description;
        if (summary !== undefined || description !== undefined) {
            return {
                ...(resolved as object),
                ...(summary !== undefined ? { summary } : {}),
                ...(description !== undefined ? { description } : {}),
            } as T;
        }
        return resolved;
    };

    const resolveHeaders = (
        headers:
            | Record<string, HeaderObject | { $ref?: string; $dynamicRef?: string; description?: string }>
            | undefined,
    ): Record<string, HeaderObject> | undefined => {
        if (!headers) return undefined;
        const resolvedHeaders: Record<string, HeaderObject> = {};
        for (const [name, header] of Object.entries(headers)) {
            if (name.toLowerCase() === 'content-type') {
                continue;
            }
            const resolvedHeader = resolveMaybeRef<HeaderObject>(header);
            if (resolvedHeader) {
                resolvedHeaders[name] = resolvedHeader;
            }
        }
        return resolvedHeaders;
    };

    const resolveContentMap = (
        content: Record<string, MediaTypeObject | { $ref?: string; $dynamicRef?: string }> | undefined,
    ): Record<string, MediaTypeObject> | undefined => {
        if (!content) return undefined;
        const resolvedContent: Record<string, MediaTypeObject> = {};
        for (const [mediaType, mediaObj] of Object.entries(content)) {
            const resolvedMedia = resolveMaybeRef<MediaTypeObject>(mediaObj);
            if (resolvedMedia) {
                resolvedContent[mediaType] = resolvedMedia;
            }
        }
        return Object.keys(resolvedContent).length > 0 ? resolvedContent : undefined;
    };

    const securitySchemeNames = new Set(components?.securitySchemes ? Object.keys(components.securitySchemes) : []);

    for (const [path, rawPathItem] of Object.entries(swaggerPaths)) {
        let pathItem = rawPathItem;

        if (pathItem.$ref && (resolveObj || resolveRef)) {
            const resolvedByObj =
                resolveObj && typeof pathItem === 'object' ? (resolveObj(pathItem) as PathItem | undefined) : undefined;
            const resolved =
                resolvedByObj ?? (resolveRef ? (resolveRef(pathItem.$ref) as PathItem | undefined) : undefined);
            if (resolved) {
                const localOverrides = { ...pathItem };
                delete localOverrides.$ref;
                pathItem = { ...resolved, ...localOverrides };
            }
        }

        const rawPathParameters: UnifiedParameter[] = Array.isArray(pathItem.parameters)
            ? (pathItem.parameters.filter(Boolean) as UnifiedParameter[])
            : [];
        const pathParameters: UnifiedParameter[] = rawPathParameters
            .map(param => resolveMaybeRef<UnifiedParameter>(param))
            .filter((param): param is UnifiedParameter => !!param && 'name' in param && 'in' in param);

        const pathServers = pathItem.servers;
        const operationsToProcess: { method: string; operation: SpecOperation }[] = [];

        const pathItemRec = pathItem as Record<string, unknown>;

        for (const method of methods) {
            const operation = pathItemRec[method] as SpecOperation | undefined;
            if (operation) {
                operationsToProcess.push({ method, operation });
            }
        }

        if (pathItem.additionalOperations) {
            for (const [method, operation] of Object.entries(
                pathItem.additionalOperations as Record<string, SpecOperation>,
            )) {
                operationsToProcess.push({ method, operation });
            }
        }

        for (const { method, operation } of operationsToProcess) {
            const paramsMap = new Map<string, UnifiedParameter>();
            pathParameters.forEach(p => {
                paramsMap.set(`${p.name}:${p.in}`, p);
            });
            (Array.isArray(operation.parameters) ? operation.parameters : []).forEach(p => {
                const resolvedParam = resolveMaybeRef<UnifiedParameter>(p as UnifiedParameter);
                if (resolvedParam && 'name' in resolvedParam && 'in' in resolvedParam) {
                    paramsMap.set(`${resolvedParam.name}:${resolvedParam.in}`, resolvedParam);
                }
            });

            const allParams = Array.from(paramsMap.values()).filter(Boolean);
            const nonBodyParams = allParams.filter(p => p && p.in !== 'body');
            const bodyParam = allParams.find(p => p && p.in === 'body') as BodyParameter | undefined;

            const parameters = nonBodyParams
                .filter(p => p !== undefined && p !== null)
                .map((p): Parameter => {
                    let finalSchema: SwaggerDefinition | boolean | undefined = p.schema as
                        | SwaggerDefinition
                        | boolean
                        | undefined;

                    const resolvedContent = resolveContentMap(p.content as Record<string, MediaTypeObject>);
                    if (resolvedContent) {
                        const contentType = Object.keys(resolvedContent)[0];
                        if (contentType && resolvedContent[contentType].schema !== undefined) {
                            finalSchema = resolvedContent[contentType].schema;
                        }
                    } else if (p.content) {
                        const contentType = Object.keys(p.content)[0];
                        if (contentType && p.content[contentType].schema !== undefined) {
                            finalSchema = p.content[contentType].schema;
                        }
                    }

                    if (finalSchema === undefined) {
                        const baseSchema: SwaggerDefinition = {};
                        if (p.type !== undefined)
                            baseSchema.type = p.type as Exclude<SwaggerDefinition['type'], undefined>;
                        if (p.format !== undefined) baseSchema.format = p.format;
                        if (p.items !== undefined)
                            baseSchema.items = p.items as SwaggerDefinition | SwaggerDefinition[];
                        finalSchema = baseSchema;
                    }

                    const param: Parameter = {
                        name: p.name,
                        in: p.in as 'query' | 'path' | 'header' | 'cookie' | 'querystring',
                        schema: finalSchema,
                    };

                    if (resolvedContent) {
                        param.content = resolvedContent;
                    } else if (p.content) {
                        param.content = p.content as Record<string, MediaTypeObject>;
                    }

                    if (p.style !== undefined) param.style = p.style;
                    if (p.explode !== undefined) param.explode = p.explode;
                    if (p.allowReserved !== undefined) param.allowReserved = p.allowReserved;
                    if (p.allowEmptyValue !== undefined) param.allowEmptyValue = p.allowEmptyValue;
                    if (p.deprecated !== undefined) param.deprecated = p.deprecated;

                    if (p.example !== undefined) param.example = p.example;
                    if (p.examples !== undefined) param.examples = p.examples as Record<string, ExampleObject>;

                    if (p.collectionFormat) {
                        switch (p.collectionFormat) {
                            case 'csv':
                                param.style = 'form';
                                param.explode = false;
                                break;
                            case 'ssv':
                                param.style = 'spaceDelimited';
                                param.explode = false;
                                break;
                            case 'tsv':
                                param.style = 'tabDelimited';
                                param.explode = false;
                                break;
                            case 'pipes':
                                param.style = 'pipeDelimited';
                                param.explode = false;
                                break;
                            case 'multi':
                                param.style = 'form';
                                param.explode = true;
                                break;
                        }
                    }

                    if (!param.style) {
                        if (param.in === 'query' || param.in === 'cookie') {
                            param.style = 'form';
                        } else if (param.in === 'path' || param.in === 'header') {
                            param.style = 'simple';
                        }
                    }

                    if (param.explode === undefined) {
                        param.explode = param.style === 'form';
                    }

                    if (p.required !== undefined) param.required = p.required;

                    if (p.description) param.description = p.description;

                    Object.keys(p).forEach(key => {
                        if (key.startsWith('x-')) {
                            (param as Record<string, unknown>)[key] = p[key];
                        }
                    });

                    return param;
                })
                .filter(param => {
                    if (!isOpenApi3) return true;
                    if (param.in !== 'header') return true;
                    return !reservedHeaderNames.has(param.name.toLowerCase());
                });

            let requestBody: RequestBody | undefined;

            if (operation.requestBody !== undefined) {
                requestBody =
                    resolveMaybeRef<RequestBody>(operation.requestBody as RequestBody) ??
                    (operation.requestBody as RequestBody);
            } else if (bodyParam) {
                const consumes = (operation.consumes && operation.consumes.length > 0
                    ? operation.consumes
                    : defaultConsumes) || ['application/json'];

                const content: Record<string, MediaTypeObject> = {};
                consumes.forEach(mediaType => {
                    content[mediaType] = { schema: bodyParam.schema as unknown as SwaggerDefinition };
                });

                requestBody = { content };

                if (bodyParam.description) requestBody.description = bodyParam.description;
                if (bodyParam.required !== undefined) requestBody.required = bodyParam.required;
            }

            if (requestBody?.content) {
                const resolvedContent = resolveContentMap(requestBody.content as Record<string, MediaTypeObject>);
                if (resolvedContent) {
                    requestBody = { ...requestBody, content: resolvedContent };
                }
            }

            const normalizedResponses: Record<string, SwaggerResponse> = {};
            if (operation.responses) {
                for (const [code, resp] of Object.entries(operation.responses)) {
                    const resolvedResp =
                        resolveMaybeRef<SwaggerResponse | Response>(resp as SwaggerResponse | Response) ??
                        (resp as SwaggerResponse);
                    const swagger2Response = resolvedResp as Response;
                    const headers = resolveHeaders(
                        (resolvedResp as Record<string, unknown>).headers as Record<string, HeaderObject>,
                    );

                    if (swagger2Response && swagger2Response.schema !== undefined) {
                        const produces = (operation.produces && operation.produces.length > 0
                            ? operation.produces
                            : defaultProduces) || ['application/json'];

                        const content: Record<string, MediaTypeObject> = {};
                        produces.forEach(mediaType => {
                            content[mediaType] = {
                                schema: swagger2Response.schema as unknown as SwaggerDefinition,
                            };
                        });

                        normalizedResponses[code] = {
                            description: swagger2Response.description || '',
                            ...(headers ? { headers } : {}),
                            content,
                        };
                    } else {
                        const resolvedContent = resolveContentMap(
                            (resolvedResp as SwaggerResponse).content as Record<string, MediaTypeObject>,
                        );
                        normalizedResponses[code] = {
                            ...(resolvedResp as SwaggerResponse),
                            ...(headers ? { headers } : {}),
                            ...(resolvedContent ? { content: resolvedContent } : {}),
                        };
                    }
                }
            }

            const effectiveServers = operation.servers !== undefined ? operation.servers : pathServers;
            let effectiveSecurity = operation.security;
            if (effectiveSecurity) {
                effectiveSecurity = effectiveSecurity.map(req => {
                    const normalizedReq: { [key: string]: string[] } = {};
                    Object.keys(req).forEach(key => {
                        if (securitySchemeNames.has(key)) {
                            normalizedReq[key] = req[key];
                        } else if (isUriReference(key)) {
                            normalizedReq[key] = req[key];
                        } else {
                            normalizedReq[normalizeSecurityKey(key)] = req[key];
                        }
                    });

                    return normalizedReq;
                });
            }

            const pathInfo: PathInfo = {
                path,
                method: method.toUpperCase(),
                parameters,
                requestBody: requestBody as RequestBody,
                responses: normalizedResponses,
            };

            if (effectiveServers !== undefined) pathInfo.servers = effectiveServers;
            if (operation.callbacks) pathInfo.callbacks = operation.callbacks as Record<string, PathItem>;
            if (operation.operationId) pathInfo.operationId = operation.operationId;

            const summary = operation.summary || pathItem.summary;
            if (summary) pathInfo.summary = summary;
            const description = operation.description || pathItem.description;
            if (description) pathInfo.description = description;

            if (operation.tags) pathInfo.tags = operation.tags;
            if (operation.consumes) {
                pathInfo.consumes = operation.consumes;
            } else if (!isOpenApi3 && defaultConsumes) {
                pathInfo.consumes = defaultConsumes;
            }

            if (operation.produces) {
                pathInfo.produces = operation.produces;
            } else if (!isOpenApi3 && defaultProduces) {
                pathInfo.produces = defaultProduces;
            }

            if (operation.deprecated) pathInfo.deprecated = operation.deprecated;
            if (operation.externalDocs) pathInfo.externalDocs = operation.externalDocs;
            if (effectiveSecurity) pathInfo.security = effectiveSecurity;

            Object.keys(operation).forEach(key => {
                const piRec = pathInfo as Record<string, unknown>;
                const opRec = operation as Record<string, unknown>;
                if (key.startsWith('x-') && !(key in piRec)) {
                    piRec[key] = opRec[key];
                }
            });

            paths.push(pathInfo);
        }
    }

    return paths;
}
