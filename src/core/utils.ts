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
import { Path, Operation, Parameter as SwaggerOfficialParameter } from "swagger-schema-official";

// --- String Manipulation Utilities ---

/**
 * A simple singularization function for English words.
 * @param str The plural string.
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
 * A private helper to normalize a string for case conversion by removing special characters and standardizing spacing.
 * @param str The input string.
 * @returns A space-separated, lowercased, and trimmed string.
 */
function normalizeString(str: string): string {
    if (!str) return '';
    return str
        .replace(/[^a-zA-Z0-9\s_-]/g, ' ')
        .replace(/^[_-]+|[-_]+$/g, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * Converts a string to camelCase.
 * @param str The input string.
 * @returns The camelCased string.
 */
export function camelCase(str: string): string {
    const normalized = normalizeString(str);
    if (!normalized) return '';
    return normalized.replace(/\s(.)/g, (_, char) => char.toUpperCase());
}

/**
 * Converts a string to PascalCase.
 * @param str The input string.
 * @returns The PascalCased string.
 */
export function pascalCase(str: string): string {
    const normalized = normalizeString(str);
    if (!normalized) return '';
    return normalized.replace(/(^|\s)(.)/g, (_, __, char) => char.toUpperCase());
}

/**
 * Converts a string to kebab-case.
 * @param str The input string.
 * @returns The kebab-cased string.
 */
export function kebabCase(str: string): string {
    if (!str) return '';
    return str
        .replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2')
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// --- TypeScript Type Resolution ---

/**
 * Recursively resolves an OpenAPI schema object into a TypeScript type string.
 * This is the core of the type generation logic.
 *
 * @param schema The OpenAPI schema definition to process.
 * @param config The generator configuration, used to determine date types.
 * @param knownTypes An array of all defined schema names, used to validate `$ref`s.
 * @returns A string representing the TypeScript type.
 */
export function getTypeScriptType(schema: SwaggerDefinition | undefined, config: GeneratorConfig, knownTypes: string[] = []): string {
    if (!schema) {
        return 'any';
    }

    if (schema.$ref) {
        const typeName = pascalCase(schema.$ref.split('/').pop()!);
        // If the referenced type is a known schema, use its name. Otherwise, it's a broken ref, so use 'any'.
        return knownTypes.includes(typeName) ? typeName : 'any';
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
 * Checks if a TypeScript type string represents a named interface (a generated model).
 * @param type The TypeScript type string (e.g., "User", "string", "number[]").
 * @returns True if the type is a named interface, false otherwise.
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
 */
export function hasDuplicateFunctionNames(methods: MethodDeclaration[]): boolean {
    const names = methods.map(m => m.getName());
    return new Set(names).size !== names.length;
}

/**
 * Flattens the nested `paths` object from an OpenAPI spec into a linear array of `PathInfo` objects.
 * It merges path-level and operation-level parameters and normalizes Swagger 2.0 `body` parameters.
 * @param swaggerPaths The `paths` object from the OpenAPI specification.
 * @returns An array of processed `PathInfo` objects.
 */
export function extractPaths(swaggerPaths: { [p: string]: Path } = {}): PathInfo[] {
    if (!swaggerPaths) {
        return [];
    }

    const paths: PathInfo[] = [];
    const methods = ["get", "post", "put", "patch", "delete", "options", "head"];

    for (const [path, pathItem] of Object.entries(swaggerPaths)) {
        const pathParameters = (pathItem.parameters as SwaggerOfficialParameter[]) || [];
        for (const method of methods) {
            const operation = pathItem[method as keyof Path] as Operation;
            if (operation) {
                const paramsMap = new Map<string, SwaggerOfficialParameter>();
                pathParameters.forEach(p => paramsMap.set(`${p.name}:${p.in}`, p));
                (operation.parameters as SwaggerOfficialParameter[] || []).forEach(p => paramsMap.set(`${p.name}:${p.in}`, p));

                const allParams = Array.from(paramsMap.values());
                const nonBodyParams = allParams.filter(p => p.in !== 'body');
                const bodyParam = allParams.find(p => p.in === 'body');

                const parameters = nonBodyParams.map((p): Parameter => ({
                    name: p.name,
                    in: p.in as "query" | "path" | "header" | "cookie",
                    required: p.required,
                    schema: (p as any).schema || p,
                    description: p.description
                }));

                const requestBody = (operation as any).requestBody || (bodyParam ? { content: { 'application/json': { schema: (bodyParam as any).schema } } } : undefined);

                paths.push({
                    path,
                    method: method.toUpperCase(),
                    operationId: operation.operationId,
                    summary: operation.summary,
                    description: operation.description,
                    tags: operation.tags || [],
                    parameters,
                    requestBody: requestBody as RequestBody | undefined,
                    responses: operation.responses as Record<string, SwaggerResponse> | undefined,
                });
            }
        }
    }
    return paths;
}

/**
 * Helper to get the TypeScript type for a request body.
 */
export function getRequestBodyType(requestBody: RequestBody | undefined, config: GeneratorConfig, knownTypes: string[]): string {
    const schema = requestBody?.content?.['application/json']?.schema;
    return getTypeScriptType(schema as SwaggerDefinition, config, knownTypes);
}

/**
 * Helper to get the TypeScript type for a response.
 */
export function getResponseType(response: SwaggerResponse | undefined, config: GeneratorConfig, knownTypes: string[]): string {
    const schema = response?.content?.['application/json']?.schema;
    return getTypeScriptType(schema as SwaggerDefinition, config, knownTypes);
}

// --- DI Token Name Generators ---

/**
 * Generates a unique, client-specific name for the base path `InjectionToken`.
 */
export function getBasePathTokenName(clientName = "default"): string {
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    return `BASE_PATH_${clientSuffix}`;
}

/**
 * Generates a unique, client-specific name for the client context `HttpContextToken`.
 */
export function getClientContextTokenName(clientName = "default"): string {
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    return `CLIENT_CONTEXT_TOKEN_${clientSuffix}`;
}

/**
 * Generates a unique, client-specific name for the interceptors `InjectionToken`.
 */
export function getInterceptorsTokenName(clientName = "default"): string {
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    return `HTTP_INTERCEPTORS_${clientSuffix}`;
}
