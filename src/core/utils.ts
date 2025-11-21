// src/core/utils.ts

/**
 * @fileoverview
 * This file contains core utility functions used throughout the generator.
 * It includes functions for string manipulation (case conversion), TypeScript type resolution from
 * OpenAPI schemas, OpenAPI spec parsing helpers, and functions for generating unique DI token names.
 * These utilities are pure, dependency-free helpers that form the building blocks of the generation logic.
 */

import { MethodDeclaration } from 'ts-morph';
import {
    GeneratorConfig,
    HeaderObject,
    Parameter,
    PathInfo,
    PathItem,
    RequestBody,
    SpecOperation,
    SwaggerDefinition,
    SwaggerResponse
} from './types.js';
import { BodyParameter, Parameter as SwaggerOfficialParameter, Response } from "swagger-schema-official";

// Re-export runtime expressions
export * from './runtime-expressions.js';

// --- String Manipulation Utilities ---

/**
 * A simple singularization function for English words. Handles common plural endings.
 * @param str The plural string to singularize.
 * @returns The singular form of the string.
 */
export function singular(str: string): string {
    if (str.endsWith('ies')) {
        return str.slice(0, -3) + 'y';
    }
    if (str.endsWith('s')) {
        return str.slice(0, -1);
    }
    return str;
}

/**
 * Normalizes a string for case conversion by removing special characters,
 * splitting on camelCase boundaries, and standardizing spacing.
 * @param str The input string.
 * @returns A space-separated, lowercased, and trimmed string.
 * @private
 */
function normalizeString(str: string): string {
    if (!str) return '';
    return str
        .replace(/[^a-zA-Z0-9\s_-]/g, ' ')
        .replace(/^[_-]+|[-_]+$/g, '')
        // Handles helloWorld -> hello World, and MyAPI -> My API, and OpId -> Op Id
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * Converts a string to camelCase.
 * @param str The input string (e.g., "hello world", "Hello-World").
 * @returns The camelCased string (e.g., "helloWorld").
 */
export function camelCase(str: string): string {
    const normalized = normalizeString(str);
    if (!normalized) return '';
    return normalized.replace(/\s(.)/g, (_: string, char: string): string => char.toUpperCase());
}

/**
 * Converts a string to PascalCase (UpperCamelCase).
 * @param str The input string (e.g., "hello world", "hello-world").
 * @returns The PascalCased string (e.g., "HelloWorld").
 */
export function pascalCase(str: string): string {
    const normalized = normalizeString(str);
    if (!normalized) return '';
    return normalized.replace(/(^|\s)(.)/g, (_: string, __: string, char: string): string => char.toUpperCase());
}

/**
 * Converts a string to kebab-case.
 * @param str The input string (e.g., "helloWorld", "Hello World").
 * @returns The kebab-cased string (e.g., "hello-world").
 */
export function kebabCase(str: string): string {
    if (!str) return '';
    return str
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2') // Insert hyphen before uppercase letters that follow a lowercase letter or digit
        .toLowerCase()
        .replace(/[\s_]+/g, '-')    // Replace spaces and underscores with hyphens
        .replace(/^-+|-+$/g, '');        // Trim leading/trailing hyphens
}

// --- TypeScript Type Resolution ---

/**
 * Recursively resolves an OpenAPI schema object into a TypeScript type string.
 * This is the core of the type generation logic, handling references, compositions,
 * primitives, and object structures.
 *
 * @param schema The OpenAPI schema definition to process. If `null` or `undefined`, 'any' is returned.
 * @param config The generator configuration, used to determine date types and other options.
 * @param knownTypes An array of all defined schema names, used to validate `$ref`s.
 * @returns A string representing the corresponding TypeScript type.
 */
export function getTypeScriptType(schema: SwaggerDefinition | undefined | null, config: GeneratorConfig, knownTypes: string[] = []): string {
    if (!schema) {
        return 'any';
    }

    if (schema!.type === 'file') {
        return 'any';
    }

    if (schema.$ref) {
        const typeName = pascalCase(schema.$ref.split('/').pop() || '');
        return typeName && knownTypes.includes(typeName) ? typeName : 'any';
    }

    // JSON Schema 'const' keyword support (OAS 3.1)
    if (schema.const !== undefined) {
        const val = schema.const;
        if (val === null) return 'null';
        if (typeof val === 'string') return `'${val.replace(/'/g, "\\'")}'`;
        if (typeof val === 'number' || typeof val === 'boolean') return String(val);
        return 'any';
    }

    // JSON Schema 2020-12 / OpenAPI 3.1 Tuple Support
    if (schema.prefixItems && Array.isArray(schema.prefixItems)) {
        const tupleTypes = schema.prefixItems.map(s => getTypeScriptType(s, config, knownTypes));
        // If `items` exists alongside prefixItems, it signifies the type for additional items (rest element)
        if (schema.items && !Array.isArray(schema.items)) {
            const restType = getTypeScriptType(schema.items as SwaggerDefinition, config, knownTypes);
            return `[${tupleTypes.join(', ')}, ...${restType}[]]`;
        }
        return `[${tupleTypes.join(', ')}]`;
    }

    if (schema.allOf) {
        const parts = schema.allOf
            .map(s => getTypeScriptType(s, config, knownTypes))
            .filter(p => p && p !== 'any');
        return parts.length > 0 ? parts.join(' & ') : 'any';
    }

    if (schema.anyOf || schema.oneOf) {
        const parts = (schema.anyOf || schema.oneOf)!
            .map(s => getTypeScriptType(s, config, knownTypes))
            .filter(Boolean);
        return parts.length > 0 ? parts.join(' | ') : 'any';
    }

    // Handling for 'not' keyword: Exclude<any, Type> or Exclude<KnownType, Type>
    if (schema.not) {
        const notType = getTypeScriptType(schema.not, config, knownTypes);
        return `Exclude<any, ${notType}>`;
    }

    if (schema.enum) {
        return schema.enum.map(v => typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : v).join(' | ');
    }

    let type: string;

    switch (schema.type) {
        case 'string':
            type = (schema.format === 'date' || schema.format === 'date-time') && config.options.dateType === 'Date' ? 'Date' : 'string';
            // OAS 3.1 support: contentMediaType implies binary data -> Blob
            if (schema.format === 'binary' || schema.contentMediaType) {
                type = 'Blob';
            }
            break;
        case 'number':
        case 'integer':
            type = 'number';
            break;
        case 'boolean':
            type = 'boolean';
            break;
        case 'array':
            const itemType = schema.items ? getTypeScriptType(schema.items as SwaggerDefinition, config, knownTypes) : 'any';
            type = `${itemType}[]`;
            break;
        case 'object':
            // We build a single object signature.
            const parts: string[] = [];

            if (schema.properties) {
                const props = Object.entries(schema.properties).map(([key, propDef]) => {
                    const optional = schema.required?.includes(key) ? '' : '?';
                    const propName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
                    return `${propName}${optional}: ${getTypeScriptType(propDef, config, knownTypes)}`;
                });
                parts.push(...props);
            }

            const indexValueTypes: string[] = [];

            if (schema.patternProperties) {
                Object.values(schema.patternProperties).forEach(def => {
                    indexValueTypes.push(getTypeScriptType(def, config, knownTypes));
                });
            }

            if (schema.additionalProperties) {
                const valueType = schema.additionalProperties === true
                    ? 'any'
                    : getTypeScriptType(schema.additionalProperties as SwaggerDefinition, config, knownTypes);
                indexValueTypes.push(valueType);
            }

            if (indexValueTypes.length > 0) {
                const joined = Array.from(new Set(indexValueTypes)).join(' | ');
                parts.push(`[key: string]: ${joined}`);
            }

            if (parts.length > 0) {
                type = `{ ${parts.join('; ')} }`;
            } else {
                type = 'Record<string, any>';
            }
            break;
        default:
            type = 'any';
    }
    return schema.nullable ? `${type} | null` : type;
}

/**
 * Checks if a TypeScript type string represents a named interface (a generated model),
 * as opposed to a primitive, a built-in type, or a structural type.
 * @param type The TypeScript type string (e.g., "User", "string", "number[]").
 * @returns `true` if the type is likely a generated model interface, `false` otherwise.
 */
export function isDataTypeInterface(type: string): boolean {
    const primitiveOrBuiltIn = /^(any|File|Blob|string|number|boolean|object|unknown|null|undefined|Date|void)$/;
    const isArray = /\[\]$/;
    const isUnion = / \| /;
    return !primitiveOrBuiltIn.test(type) && !isArray.test(type) && !isUnion.test(type) && !type.startsWith('{') && !type.startsWith('Record');
}

// --- General & OpenAPI Helpers ---

/**
 * Checks if a string is a valid URL.
 * @param input The string to check.
 * @returns `true` if the string can be parsed as a URL, `false` otherwise.
 */
export function isUrl(input: string): boolean {
    try {
        new URL(input);
        return true;
    } catch {
        return false;
    }
}

/**
 * Checks for duplicate method names in an array of ts-morph MethodDeclaration objects.
 * @param methods An array of MethodDeclaration instances.
 * @returns `true` if duplicates are found, `false` otherwise.
 */
export function hasDuplicateFunctionNames(methods: MethodDeclaration[]): boolean {
    const names = methods.map(m => m.getName());
    return new Set(names).size !== names.length;
}

// Helper type to handle union of Swagger 2.0 and OpenAPI 3.x parameter definitions
type UnifiedParameter = SwaggerOfficialParameter & {
    schema?: SwaggerDefinition | { $ref: string },
    type?: string,
    format?: string,
    items?: SwaggerDefinition | { $ref: string }
    // Additions for OAS3 and Swagger2 compatibility
    collectionFormat?: 'csv' | 'ssv' | 'tsv' | 'pipes' | 'multi' | string,
    style?: string,
    explode?: boolean,
    allowReserved?: boolean,
    allowEmptyValue?: boolean,
    content?: Record<string, { schema?: SwaggerDefinition }>,
    deprecated?: boolean
};

/**
 * Flattens the nested `paths` object from an OpenAPI spec into a linear array of `PathInfo` objects.
 * It merges path-level and operation-level parameters and normalizes Swagger 2.0 `body` parameters
 * and `responses` into the `requestBody` and response formats of OpenAPI 3.
 *
 * @param swaggerPaths The `paths` object from the OpenAPI specification a.k.a `SwaggerSpec['paths']`.
 * @returns An array of processed `PathInfo` objects, or an empty array if `swaggerPaths` is undefined.
 */
export function extractPaths(swaggerPaths: { [p: string]: PathItem } | undefined): PathInfo[] {
    if (!swaggerPaths) {
        return [];
    }

    const paths: PathInfo[] = [];
    // Added 'query' to the supported methods list for OAS 3.2 compliance.
    const methods = ["get", "post", "put", "patch", "delete", "options", "head", "query"];

    for (const [path, pathItem] of Object.entries(swaggerPaths)) {
        const pathParameters: UnifiedParameter[] = (pathItem.parameters as UnifiedParameter[]) || [];

        // Capture path-level servers (OAS 3)
        const pathServers = pathItem.servers;

        for (const method of methods) {
            // Swagger 2.0 Path object is loosely typed here, and doesn't necessarily have 'query' prop.
            // However, for OAS 3.2, if it exists, we want it.
            const operation = (pathItem as any)[method] as SpecOperation;
            if (operation) {
                const paramsMap = new Map<string, UnifiedParameter>();
                pathParameters.forEach(p => paramsMap.set(`${p.name}:${p.in}`, p));
                ((operation.parameters as UnifiedParameter[]) || []).forEach(p => paramsMap.set(`${p.name}:${p.in}`, p));

                const allParams = Array.from(paramsMap.values());

                const nonBodyParams = allParams.filter(p => p.in !== 'body');
                const bodyParam = allParams.find(p => p.in === 'body') as BodyParameter | undefined;

                const parameters = nonBodyParams.map((p): Parameter => {
                    const finalSchema = p.schema || {
                        type: p.type as SwaggerDefinition['type'],
                        format: p.format,
                        items: p.items,
                    };

                    const param: Parameter = {
                        name: p.name,
                        in: p.in as "query" | "path" | "header" | "cookie" | "querystring",
                        schema: finalSchema as SwaggerDefinition,
                    };

                    if (p.content) {
                        param.content = p.content as any;
                    }

                    // Carry over OAS3 style properties if they exist, but only if they're not undefined to satisfy `exactOptionalPropertyTypes`.
                    if (p.style !== undefined) {
                        param.style = p.style;
                    }
                    if (p.explode !== undefined) {
                        param.explode = p.explode;
                    }
                    if (p.allowReserved !== undefined) {
                        param.allowReserved = p.allowReserved;
                    }
                    if (p.allowEmptyValue !== undefined) {
                        param.allowEmptyValue = p.allowEmptyValue;
                    }
                    if (p.deprecated !== undefined) {
                        param.deprecated = p.deprecated;
                    }

                    // Swagger 2.0 collectionFormat translation
                    const collectionFormat = p.collectionFormat;
                    if (collectionFormat) {
                        switch (collectionFormat) {
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

                    if (p.required !== undefined) {
                        param.required = p.required;
                    }
                    if (p.description) {
                        param.description = p.description;
                    }

                    return param;
                });

                const requestBody = operation.requestBody
                    || (bodyParam ? { content: { 'application/json': { schema: bodyParam.schema } } } : undefined);

                const normalizedResponses: Record<string, SwaggerResponse> = {};
                if (operation.responses) {
                    for (const [code, resp] of Object.entries(operation.responses)) {
                        const swagger2Response = resp as Response;
                        // In OAS 3, headers are a record. In Swagger 2, they are Header Objects.
                        const headers = (resp as any).headers as Record<string, HeaderObject>;

                        if (swagger2Response.schema) {
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

                // Resolve servers: Operation > Path > undefined (Global fallback happens in generator)
                const effectiveServers = operation.servers || pathServers;

                const pathInfo: PathInfo = {
                    path,
                    method: method.toUpperCase(),
                    parameters,
                    requestBody: requestBody as RequestBody,
                    responses: normalizedResponses,
                    servers: effectiveServers,
                    callbacks: operation.callbacks
                };
                if (operation.operationId) pathInfo.operationId = operation.operationId;
                if (operation.summary) pathInfo.summary = operation.summary;
                if (operation.description) pathInfo.description = operation.description;
                if (operation.tags) pathInfo.tags = operation.tags;
                if (operation.consumes) pathInfo.consumes = operation.consumes;
                if (operation.deprecated) pathInfo.deprecated = operation.deprecated; // Copy deprecated flag
                // Add external documentation info from operation
                if (operation.externalDocs) pathInfo.externalDocs = operation.externalDocs;
                // Capture security if present
                if (operation.security) pathInfo.security = operation.security;

                paths.push(pathInfo);
            }
        }
    }
    return paths;
}

/**
 * Extracts the TypeScript type for a request body from a PathInfo object.
 * @param requestBody The request body object from a PathInfo.
 * @param config The generator configuration.
 * @param knownTypes An array of known schema names for type resolution.
 * @returns A string representing the TypeScript type for the request body.
 * @internal
 */
export function getRequestBodyType(requestBody: RequestBody | undefined, config: GeneratorConfig, knownTypes: string[]): string {
    if (!requestBody?.content) return 'any';
    const schema = requestBody.content[Object.keys(requestBody.content)[0]]?.schema;
    return getTypeScriptType(schema as SwaggerDefinition, config, knownTypes);
}

/**
 * Extracts the TypeScript type for a successful response from a PathInfo object.
 * @param response The response object from a PathInfo.
 * @param config The generator configuration.
 * @param knownTypes An array of known schema names for type resolution.
 * @returns A string representing the TypeScript type for the response body.
 * @internal
 */
export function getResponseType(response: SwaggerResponse | undefined, config: GeneratorConfig, knownTypes: string[]): string {
    const schema = response?.content?.['application/json']?.schema;
    return getTypeScriptType(schema as SwaggerDefinition, config, knownTypes);
}

// --- DI Token Name Generators ---

/**
 * Generates a unique, client-specific name for the base path `InjectionToken`.
 * @param clientName The name of the API client, used to namespace the token. Defaults to "default".
 * @returns The generated token name string (e.g., `BASE_PATH_MY_CLIENT`).
 */
export function getBasePathTokenName(clientName = "default"): string {
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    return `BASE_PATH_${clientSuffix}`;
}

/**
 * Generates a unique, client-specific name for the client context `HttpContextToken`.
 * @param clientName The name of the API client, used to namespace the token. Defaults to "default".
 * @returns The generated token name string (e.g., `CLIENT_CONTEXT_TOKEN_MY_CLIENT`).
 */
export function getClientContextTokenName(clientName = "default"): string {
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    return `CLIENT_CONTEXT_TOKEN_${clientSuffix}`;
}

/**
 * Generates a unique, client-specific name for the interceptors `InjectionToken`.
 * @param clientName The name of the API client, used to namespace the token. Defaults to "default".
 * @returns The generated token name string (e.g., `HTTP_INTERCEPTORS_MY_CLIENT`).
 */
export function getInterceptorsTokenName(clientName = "default"): string {
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    return `HTTP_INTERCEPTORS_${clientSuffix}`;
}
