import { BodyParameter, Parameter as SwaggerOfficialParameter, Response } from 'swagger-schema-official';
import {
    HeaderObject,
    MediaTypeObject,
    Parameter,
    PathInfo,
    PathItem,
    RequestBody,
    SpecOperation,
    SwaggerDefinition,
    SwaggerResponse,
} from '../types/index.js';
import { camelCase, normalizeSecurityKey, pascalCase } from './index.js';
import { SwaggerParser } from '@src/core/parser.js';

// Union type handling both Swagger 2.0 and OpenAPI 3.x property names
type UnifiedParameter = SwaggerOfficialParameter & {
    schema?: SwaggerDefinition | { $ref: string };
    type?: string;
    format?: string;
    items?: SwaggerDefinition | { $ref: string };
    collectionFormat?: 'csv' | 'ssv' | 'tsv' | 'pipes' | 'multi' | string;
    style?: string;
    explode?: boolean;
    allowReserved?: boolean;
    allowEmptyValue?: boolean;
    content?: Record<string, { schema?: SwaggerDefinition }>;
    deprecated?: boolean;
    example?: any;
    examples?: Record<string, any>;
    [key: string]: any;
};

/**
 * Flattens the nested `paths` object from an OpenAPI spec into a linear array of `PathInfo` objects.
 * This function handles:
 * - Merging path-level and operation-level parameters.
 * - Resolving references (if a resolver is provided).
 * - Normalizing Swagger 2.0 properties to OpenAPI 3.0 compatible structures.
 * - Applying OAS 3.2 default serialization rules (style/explode).
 *
 * @param swaggerPaths The raw `paths` object from the specification.
 * @param resolveRef Optional callback to resolve `$ref` pointers within path items.
 * @param components Optional components object for resolving security precedence.
 * @param options Optional flags (e.g., `isOpenApi3`) and Swagger 2 defaults to enable OAS-specific behavior.
 * @returns An array of normalized `PathInfo` objects ready for analysis.
 */
export function extractPaths(
    swaggerPaths: { [p: string]: PathItem } | undefined,
    resolveRef?: (ref: string) => unknown,
    components?: { securitySchemes?: Record<string, any> } | undefined,
    options?: { isOpenApi3?: boolean; defaultConsumes?: string[]; defaultProduces?: string[] },
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

    const resolveMaybeRef = <T extends { summary?: string; description?: string }>(
        obj: T | { $ref?: string; $dynamicRef?: string; summary?: string; description?: string } | undefined | null,
    ): T | undefined => {
        if (!obj) return undefined;
        if (!resolveRef || typeof obj !== 'object') return obj as T;

        const ref = (obj as any).$ref || (obj as any).$dynamicRef;
        if (typeof ref !== 'string') return obj as T;

        const resolved = resolveRef(ref) as T | undefined;
        if (!resolved) return obj as T;

        const summary = (obj as any).summary;
        const description = (obj as any).description;
        if (summary !== undefined || description !== undefined) {
            return {
                ...(resolved as any),
                ...(summary !== undefined ? { summary } : {}),
                ...(description !== undefined ? { description } : {}),
            } as T;
        }
        return resolved;
    };

    const resolveHeaders = (
        headers: Record<string, HeaderObject | { $ref?: string; $dynamicRef?: string; description?: string }> | undefined,
    ): Record<string, HeaderObject> | undefined => {
        if (!headers) return undefined;
        const resolvedHeaders: Record<string, HeaderObject> = {};
        for (const [name, header] of Object.entries(headers)) {
            if (name.toLowerCase() === 'content-type') {
                // OAS 3.2: Response header definitions named "Content-Type" are ignored.
                continue;
            }
            const resolvedHeader = resolveMaybeRef<HeaderObject>(header as any);
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
            const resolvedMedia = resolveMaybeRef<MediaTypeObject>(mediaObj as any);
            if (resolvedMedia) {
                resolvedContent[mediaType] = resolvedMedia;
            }
        }
        return Object.keys(resolvedContent).length > 0 ? resolvedContent : undefined;
    };

    // Create a lookup Set for security schemes to enforce precedence rules (OAS 3.2 Security Requirements)
    const securitySchemeNames = new Set(components?.securitySchemes ? Object.keys(components.securitySchemes) : []);

    for (const [path, rawPathItem] of Object.entries(swaggerPaths)) {
        let pathItem = rawPathItem;

        if (pathItem.$ref && resolveRef) {
            const resolved = resolveRef(pathItem.$ref) as PathItem | undefined;
            if (resolved) {
                const localOverrides = { ...pathItem };
                delete localOverrides.$ref;
                pathItem = { ...resolved, ...localOverrides };
            }
        }

        /** Defensive: ensure top-level pathParameters is always an array */
        const rawPathParameters: UnifiedParameter[] = Array.isArray(pathItem.parameters)
            ? pathItem.parameters.filter(Boolean)
            : [];
        const pathParameters: UnifiedParameter[] = rawPathParameters
            .map(param => resolveMaybeRef<UnifiedParameter>(param as any))
            .filter((param): param is UnifiedParameter => !!param && 'name' in param && 'in' in param);

        const pathServers = pathItem.servers;
        const operationsToProcess: { method: string; operation: SpecOperation }[] = [];

        // Fixed Methods
        for (const method of methods) {
            const operation = (pathItem as any)[method] as SpecOperation;
            if (operation) {
                operationsToProcess.push({ method, operation });
            }
        }

        // Additional Operations (OAS 3.2)
        if (pathItem.additionalOperations) {
            for (const [method, operation] of Object.entries(pathItem.additionalOperations)) {
                operationsToProcess.push({ method, operation });
            }
        }

        for (const { method, operation } of operationsToProcess) {
            const paramsMap = new Map<string, UnifiedParameter>();
            pathParameters.forEach(p => {
                paramsMap.set(`${p.name}:${p.in}`, p);
            });
            (Array.isArray(operation.parameters) ? operation.parameters : []).forEach(p => {
                const resolvedParam = resolveMaybeRef<UnifiedParameter>(p as any);
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
                    let finalSchema = p.schema;

                    const resolvedContent = resolveContentMap(p.content as any);
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
                        // Explicit cast is safe here as we've filtered/processed known 'in' types
                        in: p.in as 'query' | 'path' | 'header' | 'cookie' | 'querystring',
                        schema: finalSchema as SwaggerDefinition,
                    };

                    if (resolvedContent) {
                        param.content = resolvedContent as Record<string, { schema?: SwaggerDefinition }>;
                    } else if (p.content) {
                        param.content = p.content as Record<string, { schema?: SwaggerDefinition }>;
                    }
                    if (p.style !== undefined) param.style = p.style;
                    if (p.explode !== undefined) param.explode = p.explode;
                    if (p.allowReserved !== undefined) param.allowReserved = p.allowReserved;
                    if (p.allowEmptyValue !== undefined) param.allowEmptyValue = p.allowEmptyValue;
                    if (p.deprecated !== undefined) param.deprecated = p.deprecated;

                    // --- Fix for Parameter Examples (OAS 3.0 support) ---
                    if (p.example !== undefined) param.example = p.example;
                    if (p.examples !== undefined) param.examples = p.examples;

                    // Normalize swagger 2 collectionFormat to style/explode
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

                    // OAS 3.2 Serialization Defaults
                    if (!param.style) {
                        if (param.in === 'query' || param.in === 'cookie') {
                            param.style = 'form';
                        } else if (param.in === 'path' || param.in === 'header') {
                            param.style = 'simple';
                        }
                    }

                    if (param.explode === undefined) {
                        // "When style is form, the default value is true. For all other styles, the default value is false."
                        // Note: This applies to cookie style='form' as well.
                        param.explode = param.style === 'form';
                    }

                    if (p.required !== undefined) param.required = p.required;
                    if (p.description) param.description = p.description;

                    Object.keys(p).forEach(key => {
                        if (key.startsWith('x-')) {
                            (param as any)[key] = (p as any)[key];
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
                    resolveMaybeRef<RequestBody>(operation.requestBody as any) ??
                    (operation.requestBody as RequestBody);
            } else if (bodyParam) {
                const consumes =
                    (operation.consumes && operation.consumes.length > 0
                        ? operation.consumes
                        : defaultConsumes) || ['application/json'];

                const content: Record<string, MediaTypeObject> = {};
                consumes.forEach(mediaType => {
                    content[mediaType] = { schema: bodyParam.schema as SwaggerDefinition };
                });

                requestBody = { content };

                if (bodyParam.description) requestBody.description = bodyParam.description;
                if (bodyParam.required !== undefined) requestBody.required = bodyParam.required;
            }
            if (requestBody?.content) {
                const resolvedContent = resolveContentMap(requestBody.content as any);
                if (resolvedContent) {
                    requestBody = { ...requestBody, content: resolvedContent };
                }
            }

            const normalizedResponses: Record<string, SwaggerResponse> = {};
            if (operation.responses) {
                for (const [code, resp] of Object.entries(operation.responses)) {
                    const resolvedResp =
                        resolveMaybeRef<SwaggerResponse | Response>(resp as any) ?? (resp as SwaggerResponse);
                    const swagger2Response = resolvedResp as Response;
                    const headers = resolveHeaders((resolvedResp as any).headers as Record<string, HeaderObject>);

                    if (swagger2Response && swagger2Response.schema !== undefined) {
                        const produces =
                            (operation.produces && operation.produces.length > 0
                                ? operation.produces
                                : defaultProduces) || ['application/json'];

                        const content: Record<string, MediaTypeObject> = {};
                        produces.forEach(mediaType => {
                            content[mediaType] = {
                                schema: swagger2Response.schema as unknown as SwaggerDefinition,
                            };
                        });

                        normalizedResponses[code] = {
                            description: swagger2Response.description,
                            headers: headers,
                            content,
                        };
                    } else {
                        const resolvedContent = resolveContentMap((resolvedResp as SwaggerResponse).content as any);
                        normalizedResponses[code] = {
                            ...(resolvedResp as SwaggerResponse),
                            headers: headers,
                            ...(resolvedContent ? { content: resolvedContent } : {}),
                        };
                    }
                }
            }

            const effectiveServers = operation.servers || pathServers;
            let effectiveSecurity = operation.security;
            if (effectiveSecurity) {
                effectiveSecurity = effectiveSecurity.map(req => {
                    const normalizedReq: { [key: string]: string[] } = {};
                    Object.keys(req).forEach(key => {
                        // OAS 3.2 Precedence: If key matches a component name exactly, assume it is a Component Name.
                        // Otherwise, treat as URI reference (used for splitting last segment).
                        // This prevents ambiguity when a Component Name looks like a URI (e.g. "http://auth")
                        if (securitySchemeNames.has(key)) {
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

            if (effectiveServers) pathInfo.servers = effectiveServers;
            if (operation.callbacks) pathInfo.callbacks = operation.callbacks;
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
                if (key.startsWith('x-') && !(key in pathInfo)) {
                    pathInfo[key] = operation[key];
                }
            });

            paths.push(pathInfo);
        }
    }
    return paths;
}

/**
 * Derives a controller name from an operation (PathInfo).
 * Prefers the first tag, falls back to first non-param path segment, then "Default".
 */
function getControllerName(operation: PathInfo): string {
    if (Array.isArray(operation.tags) && typeof operation.tags[0] === 'string' && operation.tags[0]) {
        return pascalCase(operation.tags[0]);
    }
    const pathSegment = operation.path.split('/').filter(p => p && !p.startsWith('{'))[0];
    if (pathSegment) return pascalCase(pathSegment);
    return 'Default';
}

/**
 * Helper function to generate a method name from a URL path.
 */
function path_to_method_name_suffix(path: string): string {
    return path
        .split('/')
        .filter(Boolean)
        .map(segment => {
            if (segment.startsWith('{') && segment.endsWith('}')) {
                return `By${pascalCase(segment.slice(1, -1))}`;
            }
            return pascalCase(segment);
        })
        .join('');
}

/**
 * Groups all API operations by controller name and ensures method names are unique.
 * The controller name is derived from tag or path, and all operations are assigned a unique `methodName`.
 *
 * @param parser The SwaggerParser instance containing the spec.
 * @returns A record mapping controller names to lists of path operations.
 */
export function groupPathsByController(parser: SwaggerParser): Record<string, PathInfo[]> {
    const usedMethodNames = new Set<string>();
    // Use parser.operations which is already extracted
    const allOperations = parser.operations;
    const groups: Record<string, PathInfo[]> = {};

    for (const operation of allOperations) {
        const customizer = parser.config.options?.customizeMethodName;
        let baseMethodName: string;
        if (customizer && operation.operationId) {
            baseMethodName = customizer(operation.operationId);
        } else {
            baseMethodName = operation.operationId
                ? camelCase(operation.operationId)
                : `${operation.method.toLowerCase()}${path_to_method_name_suffix(operation.path)}`;
        }
        let uniqueMethodName = baseMethodName;
        let counter = 1;
        while (usedMethodNames.has(uniqueMethodName)) {
            uniqueMethodName = `${baseMethodName}${++counter}`;
        }
        usedMethodNames.add(uniqueMethodName);
        operation.methodName = uniqueMethodName;

        const controllerName = getControllerName(operation);
        if (!groups[controllerName]) {
            groups[controllerName] = [];
        }
        groups[controllerName].push(operation);
    }
    return groups;
}
