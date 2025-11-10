// src/core/utils.ts

/**
 * @fileoverview
 * This file contains core utility functions used throughout the OpenAPI Angular generator.
 * It includes functions for string manipulation (case conversion), TypeScript type resolution from
 * OpenAPI schemas, OpenAPI spec parsing helpers, and functions for generating unique DI token names.
 * These utilities are pure, dependency-free helpers that form the building blocks of the generation logic.
 */

import { MethodDeclaration } from 'ts-morph';
import { GeneratorConfig, Parameter, PathInfo, RequestBody, SwaggerDefinition, SwaggerResponse } from './types.js';
import { Path, Operation, Parameter as SwaggerOfficialParameter, BodyParameter, Response } from "swagger-schema-official";

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
    return normalized.replace(/\s(.)/g, (_, char) => char.toUpperCase());
}

/**
 * Converts a string to PascalCase (UpperCamelCase).
 * @param str The input string (e.g., "hello world", "hello-world").
 * @returns The PascalCased string (e.g., "HelloWorld").
 */
export function pascalCase(str: string): string {
    const normalized = normalizeString(str);
    if (!normalized) return '';
    return normalized.replace(/(^|\s)(.)/g, (_, __, char) => char.toUpperCase());
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

    if ((schema as any).type === 'file') {
        return 'any';
    }

    if (schema.$ref) {
        const typeName = pascalCase(schema.$ref.split('/').pop() || '');
        return typeName && knownTypes.includes(typeName) ? typeName : 'any';
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

    if (schema.enum) {
        return schema.enum.map(v => typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : v).join(' | ');
    }

    let type: string;

    switch (schema.type) {
        case 'string':
            type = (schema.format === 'date' || schema.format === 'date-time') && config.options.dateType === 'Date' ? 'Date' : 'string';
            if (schema.format === 'binary') {
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
            if (schema.properties) {
                const props = Object.entries(schema.properties).map(([key, propDef]) => {
                    const optional = schema.required?.includes(key) ? '' : '?';
                    const propName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
                    return `${propName}${optional}: ${getTypeScriptType(propDef, config, knownTypes)}`;
                }).join('; ');
                type = `{ ${props} }`;
            } else if (schema.additionalProperties) {
                const valueType = schema.additionalProperties === true ? 'any' : getTypeScriptType(schema.additionalProperties as SwaggerDefinition, config, knownTypes);
                type = `Record<string, ${valueType}>`;
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
type UnifiedParameter = SwaggerOfficialParameter & { schema?: SwaggerDefinition | { $ref: string }, type?: string, format?: string, items?: any };

/**
 * Flattens the nested `paths` object from an OpenAPI spec into a linear array of `PathInfo` objects.
 * It merges path-level and operation-level parameters and normalizes Swagger 2.0 `body` parameters
 * and `responses` into the `requestBody` and response formats of OpenAPI 3.
 *
 * @param swaggerPaths The `paths` object from the OpenAPI specification a.k.a `SwaggerSpec['paths']`.
 * @returns An array of processed `PathInfo` objects, or an empty array if `swaggerPaths` is undefined.
 */
export function extractPaths(swaggerPaths: { [p: string]: Path } | undefined): PathInfo[] {
    if (!swaggerPaths) {
        return [];
    }

    const paths: PathInfo[] = [];
    const methods = ["get", "post", "put", "patch", "delete", "options", "head"];

    for (const [path, pathItem] of Object.entries(swaggerPaths)) {
        const pathParameters: UnifiedParameter[] = (pathItem.parameters as UnifiedParameter[]) || [];
        for (const method of methods) {
            const operation = pathItem[method as keyof Path] as Operation;
            if (operation) {
                const paramsMap = new Map<string, UnifiedParameter>();
                pathParameters.forEach(p => paramsMap.set(`${p.name}:${p.in}`, p));
                ((operation.parameters as UnifiedParameter[]) || []).forEach(p => paramsMap.set(`${p.name}:${p.in}`, p));

                const allParams = Array.from(paramsMap.values());

                const nonBodyParams = allParams.filter(p => p.in !== 'body');
                const bodyParam = allParams.find(p => p.in === 'body') as BodyParameter | undefined;

                const parameters = nonBodyParams.map((p): Parameter => {
                    // **THE FIX**: This logic correctly uses the OAS3 `schema` property if it exists,
                    // and falls back to constructing a schema object from OAS2 properties otherwise.
                    const finalSchema = p.schema || {
                        type: p.type as any,
                        format: p.format,
                        items: p.items,
                    };

                    return {
                        name: p.name,
                        in: p.in as "query" | "path" | "header" | "cookie",
                        required: p.required,
                        schema: finalSchema as SwaggerDefinition,
                        description: p.description
                    };
                });

                const requestBody = (operation as any).requestBody
                    || (bodyParam ? { content: { 'application/json': { schema: bodyParam.schema } } } : undefined);

                const normalizedResponses: Record<string, SwaggerResponse> = {};
                if (operation.responses) {
                    for (const [code, resp] of Object.entries(operation.responses)) {
                        const swagger2Response = resp as Response;
                        if (swagger2Response.schema) {
                            normalizedResponses[code] = {
                                description: swagger2Response.description,
                                content: {
                                    'application/json': { schema: swagger2Response.schema as SwaggerDefinition }
                                }
                            }
                        } else {
                            normalizedResponses[code] = resp as SwaggerResponse;
                        }
                    }
                }

                paths.push({
                    path,
                    ...operation,
                    method: method.toUpperCase(),
                    parameters,
                    requestBody: requestBody as RequestBody | undefined,
                    responses: normalizedResponses,
                });
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
