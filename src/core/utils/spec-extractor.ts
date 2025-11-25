import { BodyParameter, Parameter as SwaggerOfficialParameter, Response } from "swagger-schema-official";
import {
    HeaderObject,
    Parameter,
    PathInfo,
    PathItem,
    RequestBody,
    SpecOperation,
    SwaggerDefinition,
    SwaggerResponse
} from "../types/index.js";
import { camelCase, normalizeSecurityKey, pascalCase } from "./index.js";
import { SwaggerParser } from "@src/core/parser.js";

// Union type handling both Swagger 2.0 and OpenAPI 3.x property names
type UnifiedParameter = SwaggerOfficialParameter & {
    schema?: SwaggerDefinition | { $ref: string },
    type?: string,
    format?: string,
    items?: SwaggerDefinition | { $ref: string }
    collectionFormat?: 'csv' | 'ssv' | 'tsv' | 'pipes' | 'multi' | string,
    style?: string,
    explode?: boolean,
    allowReserved?: boolean,
    allowEmptyValue?: boolean,
    content?: Record<string, { schema?: SwaggerDefinition }>,
    deprecated?: boolean
    [key: string]: any;
};

/**
 * Flattens the nested `paths` object from an OpenAPI spec into a linear array of `PathInfo` objects.
 * This function handles:
 * - Merging path-level and operation-level parameters.
 * - Resolving references (if a resolver is provided).
 * - Normalizing Swagger 2.0 properties to OpenAPI 3.0 compatible structures.
 *
 * @param swaggerPaths The raw `paths` object from the specification.
 * @param resolveRef Optional callback to resolve `$ref` pointers within path items.
 * @returns An array of normalized `PathInfo` objects ready for analysis.
 */
export function extractPaths(
    swaggerPaths: { [p: string]: PathItem } | undefined,
    resolveRef?: (ref: string) => PathItem | undefined
): PathInfo[] {
    if (!swaggerPaths) {
        return [];
    }

    const paths: PathInfo[] = [];
    const methods = ["get", "post", "put", "patch", "delete", "options", "head", "query"];

    for (const [path, rawPathItem] of Object.entries(swaggerPaths)) {
        let pathItem = rawPathItem;

        if (pathItem.$ref && resolveRef) {
            const resolved = resolveRef(pathItem.$ref);
            if (resolved) {
                const localOverrides = { ...pathItem };
                delete localOverrides.$ref;
                pathItem = { ...resolved, ...localOverrides };
            }
        }

        /** Defensive: ensure top-level pathParameters is always an array */
        const pathParameters: UnifiedParameter[] = Array.isArray(pathItem.parameters)
            ? pathItem.parameters.filter(Boolean)
            : [];

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
                if (p) paramsMap.set(`${p.name}:${p.in}`, p);
            });
            (Array.isArray(operation.parameters) ? operation.parameters : []).forEach(p => {
                if (p) paramsMap.set(`${p.name}:${p.in}`, p);
            });

            const allParams = Array.from(paramsMap.values()).filter(Boolean);
            const nonBodyParams = allParams.filter(p => p && p.in !== 'body');
            const bodyParam = allParams.find(p => p && p.in === 'body') as BodyParameter | undefined;

            const parameters = nonBodyParams
                .filter((p) => p !== undefined && p !== null)
                .map((p): Parameter => {
                    let finalSchema = p.schema;

                    if (p.content) {
                        const contentType = Object.keys(p.content)[0];
                        if (contentType && p.content[contentType].schema) {
                            finalSchema = p.content[contentType].schema;
                        }
                    }

                    if (!finalSchema) {
                        const baseSchema: SwaggerDefinition = {};
                        if (p.type !== undefined) baseSchema.type = p.type as Exclude<SwaggerDefinition['type'], undefined>;
                        if (p.format !== undefined) baseSchema.format = p.format;
                        if (p.items !== undefined) baseSchema.items = p.items as SwaggerDefinition | SwaggerDefinition[];
                        finalSchema = baseSchema;
                    }

                    const param: Parameter = {
                        name: p.name,
                        // Explicit cast is safe here as we've filtered/processed known 'in' types
                        in: p.in as "query" | "path" | "header" | "cookie" | "querystring",
                        schema: finalSchema as SwaggerDefinition,
                    };

                    if (p.content) param.content = p.content as Record<string, { schema?: SwaggerDefinition; }>;
                    if (p.style !== undefined) param.style = p.style;
                    if (p.explode !== undefined) param.explode = p.explode;
                    if (p.allowReserved !== undefined) param.allowReserved = p.allowReserved;
                    if (p.allowEmptyValue !== undefined) param.allowEmptyValue = p.allowEmptyValue;
                    if (p.deprecated !== undefined) param.deprecated = p.deprecated;

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

                    if (p.required !== undefined) param.required = p.required;
                    if (p.description) param.description = p.description;

                    Object.keys(p).forEach(key => {
                        if (key.startsWith('x-')) {
                            (param as any)[key] = (p as any)[key];
                        }
                    });

                    return param;
                });

            const requestBody = operation.requestBody
                || (bodyParam ? { content: { 'application/json': { schema: bodyParam.schema } } } : undefined);

            const normalizedResponses: Record<string, SwaggerResponse> = {};
            if (operation.responses) {
                for (const [code, resp] of Object.entries(operation.responses)) {
                    const swagger2Response = resp as Response;
                    const headers = (resp as any).headers as Record<string, HeaderObject>;

                    if (swagger2Response && swagger2Response.schema) {
                        normalizedResponses[code] = {
                            description: swagger2Response.description,
                            headers: headers,
                            content: {
                                'application/json': { schema: swagger2Response.schema as unknown as SwaggerDefinition }
                            }
                        }
                    } else {
                        normalizedResponses[code] = {
                            ...(resp as SwaggerResponse),
                            headers: headers
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
                        normalizedReq[normalizeSecurityKey(key)] = req[key];
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
            if (operation.consumes) pathInfo.consumes = operation.consumes;
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
    return path.split('/').filter(Boolean).map(segment => {
        if (segment.startsWith('{') && segment.endsWith('}')) {
            return `By${pascalCase(segment.slice(1, -1))}`;
        }
        return pascalCase(segment);
    }).join('');
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
    const allOperations = extractPaths(parser.getSpec().paths);
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
