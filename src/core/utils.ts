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
 * A simple utility to convert a plural word to its singular form.
 * This is a heuristic and may not cover all English pluralization rules.
 * @param str The plural string.
 * @returns The singular string.
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
 * Normalizes a string by trimming separators, handling camelCase boundaries, and replacing separators with spaces.
 * This is a private helper function for camelCase and pascalCase conversions.
 * @param str The string to normalize.
 * @returns A space-separated, lower-cased string.
 * @private
 */
function normalizeString(str: string): string {
    if (!str) return '';
    return str
        .replace(/^[_-]+|[-_]+$/g, '') // Remove leading/trailing separators
        .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space before uppercase letters for camelCase inputs
        .replace(/[_-]+/g, ' ') // Replace separators with spaces
        .replace(/\s+/g, ' ') // Collapse multiple spaces
        .trim()
        .toLowerCase();
}

/**
 * Converts a string to camelCase representation.
 * Handles various separators like spaces, hyphens, and underscores.
 * e.g., 'hello world' -> 'helloWorld', '__FOO_BAR__' -> 'fooBar'.
 * @param str The input string.
 * @returns The camelCased string.
 */
export function camelCase(str: string): string {
    const normalized = normalizeString(str);
    if (!normalized) return '';
    return normalized.replace(/\s(.)/g, (_, char) => char.toUpperCase());
}

/**
 * Converts a string to PascalCase (or UpperCamelCase) representation.
 * e.g., 'hello world' -> 'HelloWorld', '__FOO_BAR__' -> 'FooBar'.
 * @param str The input string.
 * @returns The PascalCased string.
 */
export function pascalCase(str: string): string {
    const normalized = normalizeString(str);
    if (!normalized) return '';
    return normalized.replace(/(^|\s)(.)/g, (_, __, char) => char.toUpperCase());
}

/**
 * Converts a string to KebabCase
 * e.g., 'hello world' -> 'hello-world'
 * @param str The input string.
 * @returns The KebabCased string.
 */
export function kebabCase(str: string): string {
    return str
        .replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2')
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// --- TypeScript Type Resolution ---

/**
 * Resolves an OpenAPI schema definition into a TypeScript type string.
 * This function handles primitive types, references, enums, arrays, objects,
 * and special formats like 'date-time' and 'binary'.
 * @param schema The OpenAPI schema object.
 * @param config The generator configuration, used to determine date type handling.
 * @returns A string representing the corresponding TypeScript type.
 */
export function getTypeScriptType(
    schema: SwaggerDefinition | undefined,
    config: GeneratorConfig,
): string {
    if (!schema) return 'any';
    if (schema.$ref) return pascalCase(schema.$ref.split('/').pop()!);
    if (schema.enum) return schema.enum.map(v => typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : v).join(' | ');

    let type: string;
    switch (schema.type) {
        case 'string':
            type = (schema.format === 'date' || schema.format === 'date-time') && config.options.dateType === 'Date' ? 'Date' : 'string';
            if (schema.format === 'binary') type = 'Blob';
            break;
        case 'number':
        case 'integer':
            type = 'number';
            break;
        case 'boolean':
            type = 'boolean';
            break;
        case 'array':
            const itemType = schema.items ? getTypeScriptType(schema.items as SwaggerDefinition, config) : 'any';
            type = `${itemType}[]`;
            break;
        case 'object':
            if (schema.properties) {
                const props = Object.entries(schema.properties).map(([key, propDef]) => {
                    const optional = schema.required?.includes(key) ? '' : '?';
                    // Quote keys that are not valid identifiers
                    const propName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
                    return `${propName}${optional}: ${getTypeScriptType(propDef, config)}`;
                }).join('; ');
                type = `{ ${props} }`;
            } else if (schema.additionalProperties) {
                const valueType = schema.additionalProperties === true ? 'any' : getTypeScriptType(schema.additionalProperties, config);
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
 * Determines if a given TypeScript type string likely represents a data interface
 * rather than a primitive, built-in type, or array.
 * @param type The TypeScript type string.
 * @returns True if the type is likely a custom interface.
 */
export function isDataTypeInterface(type: string): boolean {
    const primitiveOrBuiltIn = /^(any|File|Blob|string|number|boolean|object|unknown|null|undefined|Date|void)$/;
    const isArray = /\[\]$/;
    // A simple check: if it's not a known primitive and not an array, it's likely an interface.
    return !primitiveOrBuiltIn.test(type) && !isArray.test(type) && !type.startsWith('{') && !type.startsWith('Record');
}

// --- General & OpenAPI Helpers ---

/**
 * Checks if a given string is a valid URL.
 * @param input The string to check.
 * @returns True if the string is a valid URL, false otherwise.
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
 * Detects if there are duplicate method names in an array of ts-morph MethodDeclaration objects.
 * This is crucial for preventing compilation errors in generated services.
 * @param methods An array of MethodDeclaration objects.
 * @returns True if duplicates are found, false otherwise.
 */
export function hasDuplicateFunctionNames(methods: MethodDeclaration[]): boolean {
    const names = methods.map(m => m.getName());
    return new Set(names).size !== names.length;
}

/**
 * Transforms the `paths` object from an OpenAPI specification into a flattened
 * array of `PathInfo` objects, making it easier to process.
 * @param swaggerPaths The `paths` object from the OpenAPI spec.
 * @returns An array of `PathInfo` objects, one for each operation.
 */
export function extractPaths(swaggerPaths: { [p: string]: Path } = {}): PathInfo[] {
    const paths: PathInfo[] = [];
    const methods = ["get", "post", "put", "patch", "delete", "options", "head"];

    for (const [path, pathItem] of Object.entries(swaggerPaths)) {
        for (const method of methods) {
            const operation = pathItem[method as keyof Path] as Operation;
            if (operation) {
                // Normalize Swagger 2.0 and OpenAPI 3.0 parameters into a single format.
                const parameters = (operation.parameters as SwaggerOfficialParameter[] || [])
                    .filter(p => p.in !== 'body') // Body parameters are handled separately via requestBody
                    .map((p): Parameter => ({
                        name: p.name,
                        in: p.in as "query" | "path" | "header" | "cookie",
                        required: p.required,
                        schema: p as any, // Simplified for this context
                        description: p.description
                    }));

                // Normalize Swagger 2.0 body parameter into an OpenAPI 3.0 requestBody object.
                const bodyParam = (operation.parameters as SwaggerOfficialParameter[] || []).find(p => p.in === 'body');
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
 * Extracts and resolves the TypeScript type for a request body.
 * @param requestBody The `requestBody` object from a `PathInfo` object.
 * @param config The generator configuration.
 * @returns A TypeScript type string.
 */
export function getRequestBodyType(requestBody: RequestBody | undefined, config: GeneratorConfig): string {
    const schema = requestBody?.content?.['application/json']?.schema;
    return getTypeScriptType(schema as SwaggerDefinition, config);
}

/**
 * Extracts and resolves the TypeScript type for a successful response (200 or 201).
 * @param response The `response` object from a `PathInfo` object.
 * @param config The generator configuration.
 * @returns A TypeScript type string.
 */
export function getResponseType(response: SwaggerResponse | undefined, config: GeneratorConfig): string {
    const schema = response?.content?.['application/json']?.schema;
    return getTypeScriptType(schema as SwaggerDefinition, config);
}

// --- DI Token Name Generators ---

/**
 * Generates a unique, client-specific name for the base path `InjectionToken`.
 * e.g., 'myClient' -> 'BASE_PATH_MYCLIENT'.
 * @param clientName The name of the API client. Defaults to 'default'.
 * @returns The generated token name string.
 */
export function getBasePathTokenName(clientName = "default"): string {
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    return `BASE_PATH_${clientSuffix}`;
}

/**
 * Generates a unique, client-specific name for the client context `HttpContextToken`.
 * e.g., 'myClient' -> 'CLIENT_CONTEXT_TOKEN_MYCLIENT'.
 * @param clientName The name of the API client. Defaults to 'default'.
 * @returns The generated token name string.
 */
export function getClientContextTokenName(clientName = "default"): string {
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    return `CLIENT_CONTEXT_TOKEN_${clientSuffix}`;
}

/**
 * Generates a unique, client-specific name for the custom interceptors `InjectionToken`.
 * e.g., 'myClient' -> 'HTTP_INTERCEPTORS_MYCLIENT'.
 * @param clientName The name of the API client. Defaults to 'default'.
 * @returns The generated token name string.
 */
export function getInterceptorsTokenName(clientName = "default"): string {
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    return `HTTP_INTERCEPTORS_${clientSuffix}`;
}
