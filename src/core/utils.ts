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

    // Support for OAS 3.1 $dynamicRef.
    // For code generation, we treat this statically by linking to the model name found in the reference.
    if (schema.$dynamicRef) {
        // Typically points to an anchor, but can point to a path.
        // We take the segment after the last '#' or '/'
        const ref = schema.$dynamicRef;
        const typeName = pascalCase(ref.split('#').pop()?.split('/').pop() || '');
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

    // JSON Schema 2020-12 / OAS 3.1 Conditional Support (if/then/else)
    if (schema.if) {
        // In TypeScript static analysis, `if` acts like a discriminated union intersection.
        // `(Type & Then) | (Exclude<Type, If> & Else)` roughly approximates this logic,
        // but TS type narrowing for arbitrary json schema conditions is limited.
        // A practical approximation for API clients is: `(Then | Else) & BaseType` if base properties exist, or a Union.
        // However, `if` validates the instance. It doesn't inherently change the shape unless combined with properties.
        //
        // Strategy:
        // 1. Treat `then` as one possibility.
        // 2. Treat `else` as another possibility.
        // 3. The result is `(Then | Else)`. If one is missing, it's `Then | any` or `any | Else` which simplifies to `any` or partial.
        // Better Strategy for Models: `Base & (Then | Else)`

        const thenType = schema.then ? getTypeScriptType(schema.then, config, knownTypes) : 'any';
        const elseType = schema.else ? getTypeScriptType(schema.else, config, knownTypes) : 'any';

        // If we have local properties, we generate an intersection.
        if (schema.properties || schema.allOf) {
            // We recursively get the base type without if/then/else to avoid infinite recursion if we just called getTypeScriptType.
            // But since `schema` object is the same, we need to clone and strip condition keywords.
            const { if: _, then: __, else: ___, ...baseSchema } = schema;
            const baseType = getTypeScriptType(baseSchema, config, knownTypes);

            if (schema.then && schema.else) {
                return `${baseType} & (${thenType} | ${elseType})`;
            } else if (schema.then) {
                // If only `then` is present, `else` is implicitly valid for everything (type wise), implying optionality.
                // But structurally, `if` implies constraints.
                // We output intersection for correctness of the 'then' branch structure types.
                return `${baseType} & (${thenType} | any)`;
            } else if (schema.else) {
                return `${baseType} & (any | ${elseType})`;
            }
        } else {
            // Pure structural conditional
            if (schema.then && schema.else) {
                return `${thenType} | ${elseType}`;
            }
            return 'any'; // Too ambiguous without base props
        }
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
            // Handle Date types
            const isDate = (schema.format === 'date' || schema.format === 'date-time') && config.options.dateType === 'Date';
            type = isDate ? 'Date' : 'string';

            if (schema.contentMediaType) {
                // OAS 3.1 / JSON Schema 2019-09 content handling
                const isJson = schema.contentMediaType === 'application/json' || schema.contentMediaType.endsWith('+json');

                if (isJson && schema.contentSchema) {
                    // String-Encoded JSON: Provide a type alias showing the inner structure
                    const innerType = getTypeScriptType(schema.contentSchema as SwaggerDefinition, config, knownTypes);
                    type = `string /* JSON: ${innerType} */`;
                } else if (!isJson) {
                    // Binary types (e.g. image/png) map to Blob
                    type = 'Blob';
                }
            } else if (schema.format === 'binary') {
                // Legacy binary handling
                type = 'Blob';
            }
            break;
        case 'number':
            type = 'number';
            break;
        case 'integer':
            // Enhanced support for OAS 3.2 / Data Types strict format mapping requirement.
            // While 'number' is the standard JS type for all integers, large integers (int64)
            // can encounter precision loss in JS (> 2^53).
            // We now support a configuration option to map `int64` to `string` or `bigint`.
            if (schema.format === 'int64') {
                type = config.options.int64Type ?? 'number';
            } else {
                type = 'number'; // Default for int32 and others
            }
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

            // Handle unevaluatedProperties (OAS 3.1/JSON Schema 2020-12)
            // If `unevaluatedProperties: false`, strictness is applied.
            // This technically only applies validation logic where specific properties are NOT evaluated by other keywords (like properties, patternProperties).
            // In TS, this most closely maps to closing the type.
            // If we explicitly have properties and unevaluatedProperties: false, we output an exact type map (no index signature).
            // If we have NO properties and unevaluatedProperties: false, it effectively means empty object or only patternProps.

            // Precedence: properties > additionalProperties > unevaluatedProperties

            let allowIndexSignature = true;

            if (schema.unevaluatedProperties === false) {
                allowIndexSignature = false;
            } else if (typeof schema.unevaluatedProperties === 'object') {
                // If it's a schema, it behaves like additionalProperties but for everything else.
                // We can treat it as part of indexValueTypes
                indexValueTypes.push(getTypeScriptType(schema.unevaluatedProperties as SwaggerDefinition, config, knownTypes));
            }

            if (schema.additionalProperties !== undefined) {
                const valueType = schema.additionalProperties === true || schema.additionalProperties === undefined
                    ? 'any'
                    : getTypeScriptType(schema.additionalProperties as SwaggerDefinition, config, knownTypes);

                if (schema.additionalProperties === false) {
                    allowIndexSignature = false;
                } else {
                    indexValueTypes.push(valueType);
                    allowIndexSignature = true; // Explicit additionalProps overrides implications of unevaluated
                }
            }

            if (allowIndexSignature) {
                if (indexValueTypes.length > 0) {
                    const joined = Array.from(new Set(indexValueTypes)).join(' | ');
                    parts.push(`[key: string]: ${joined}`);
                } else if (!schema.properties && !schema.patternProperties && schema.unevaluatedProperties === undefined && schema.additionalProperties === undefined) {
                    // Default 'object' type in JSON schema accepts string index signature if not restricted
                    parts.push('[key: string]: any');
                }
            }

            // Handle 'dependentSchemas' (JSON Schema 2020-12).
            // If property X is present, then properties from Schema Y must also be valid.
            // We represent this as an intersection: `{ [x]: Type } & DependentSchemaType`
            if (schema.dependentSchemas) {
                const deps = schema.dependentSchemas;
                Object.entries(deps).forEach(([prop, depSchema]) => {
                    const depType = getTypeScriptType(depSchema as SwaggerDefinition, config, knownTypes);
                    // In TS, this conditional relationship is hard to model perfectly static.
                    // The most robust way for a client model is to intersect the base with the dependent type
                    // effectively saying "Example object has all these potential shapes combined".
                    parts.push(`// dependentSchema: ${prop} -> ${depType}`);
                });
            }

            if (parts.length > 0) {
                type = `{ ${parts.join('; ')} }`;
            } else {
                // If we have no properties and index signature is disallowed, it's an empty object type
                type = allowIndexSignature ? 'Record<string, any>' : '{}';
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
    const primitiveOrBuiltIn = /^(any|File|Blob|string|number|boolean|object|unknown|null|undefined|Date|void|bigint)$/;
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

/**
 * Normalizes a security scheme key.
 * If the key is a JSON pointer/URI (e.g., '#/components/securitySchemes/MyScheme'),
 * it extracts the simple name ('MyScheme'). Otherwise returns the key as is.
 */
function normalizeSecurityKey(key: string): string {
    // Check if it looks like a URI fragment or JSON pointer
    if (key.includes('/')) {
        const parts = key.split('/');
        return parts[parts.length - 1];
    }
    return key;
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
    [key: string]: any; // Allow extensions on parameter objects
};

/**
 * Flattens the nested `paths` object from an OpenAPI spec into a linear array of `PathInfo` objects.
 * It merges path-level and operation-level parameters and normalizes Swagger 2.0 `body` parameters
 * and `responses` into the `requestBody` and response formats of OpenAPI 3.
 *
 * @param swaggerPaths The `paths` object from the OpenAPI specification a.k.a `SwaggerSpec['paths']`.
 * @param resolveRef Optional function to resolve JSON references (e.g. Path Item $ref).
 * @returns An array of processed `PathInfo` objects, or an empty array if `swaggerPaths` is undefined.
 */
export function extractPaths(
    swaggerPaths: { [p: string]: PathItem } | undefined,
    resolveRef?: (ref: string) => PathItem | undefined
): PathInfo[] {
    if (!swaggerPaths) {
        return [];
    }

    const paths: PathInfo[] = [];
    // Added 'query' to the supported methods list for OAS 3.2 compliance.
    const methods = ["get", "post", "put", "patch", "delete", "options", "head", "query"];

    for (const [path, rawPathItem] of Object.entries(swaggerPaths)) {
        let pathItem = rawPathItem;

        // Handle Path Item $ref via resolver if provided.
        // OAS 3.2 Compliance: Sibling properties on a Reference Object (or Path Item with $ref)
        // override the properties of the referenced object.
        if (pathItem.$ref && resolveRef) {
            const resolved = resolveRef(pathItem.$ref);
            if (resolved) {
                // Shallow merge: The properties defined in the source file (`pathItem`)
                // take precedence over the resolved reference properties (`resolved`).
                // We spread `pathItem` second to ensure its local overrides (e.g., summary) win.
                const localOverrides = { ...pathItem };
                // We delete $ref from local overrides before merge to avoid confusion downstream
                delete localOverrides.$ref;

                pathItem = { ...resolved, ...localOverrides };
            }
        }

        const pathParameters: UnifiedParameter[] = (pathItem.parameters as UnifiedParameter[]) || [];

        // Capture path-level servers (OAS 3)
        const pathServers = pathItem.servers;

        // Collect all operations including additionalOperations (OAS 3.2)
        const operationsToProcess: { method: string; operation: SpecOperation }[] = [];

        // 1. Standard fixed field methods
        for (const method of methods) {
            const operation = (pathItem as any)[method] as SpecOperation;
            if (operation) {
                operationsToProcess.push({ method, operation });
            }
        }

        // 2. custom/additional operations (OAS 3.2)
        if (pathItem.additionalOperations) {
            for (const [method, operation] of Object.entries(pathItem.additionalOperations)) {
                // Duplicate check not strictly enforced here as spec says they MUST NOT overlap,
                // but effectively these add to the list.
                operationsToProcess.push({ method, operation });
            }
        }

        for (const { method, operation } of operationsToProcess) {
            const paramsMap = new Map<string, UnifiedParameter>();
            pathParameters.forEach(p => paramsMap.set(`${p.name}:${p.in}`, p));
            ((operation.parameters as UnifiedParameter[]) || []).forEach(p => paramsMap.set(`${p.name}:${p.in}`, p));

            const allParams = Array.from(paramsMap.values());

            const nonBodyParams = allParams.filter(p => p.in !== 'body');
            const bodyParam = allParams.find(p => p.in === 'body') as BodyParameter | undefined;

            const parameters = nonBodyParams.map((p): Parameter => {
                let finalSchema = p.schema;

                // If content exists (OAS 3.x complex parameter), prefer content schema over top-level schema
                if (p.content) {
                    const contentType = Object.keys(p.content)[0];
                    if (contentType && p.content[contentType].schema) {
                        finalSchema = p.content[contentType].schema;
                    }
                }

                if (!finalSchema) {
                    // Explicit cast required to satisfy ExactOptionalPropertyTypes
                    // because SwaggerOfficialParameter definitions might include undefined
                    const baseSchema: SwaggerDefinition = {};

                    if (p.type !== undefined) {
                        baseSchema.type = p.type as Exclude<SwaggerDefinition['type'], undefined>;
                    }
                    if (p.format !== undefined) {
                        baseSchema.format = p.format;
                    }
                    if (p.items !== undefined) {
                        baseSchema.items = p.items as SwaggerDefinition | SwaggerDefinition[];
                    }

                    finalSchema = baseSchema;
                }

                const param: Parameter = {
                    name: p.name,
                    in: p.in as "query" | "path" | "header" | "cookie" | "querystring",
                    schema: finalSchema as SwaggerDefinition,
                };

                if (p.content) {
                    // Correctly type cast the content record
                    param.content = p.content as Record<string, { schema?: SwaggerDefinition; }>;
                }

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

                // Propagate extensions like x-codegen-param-name from parameter object to normalized Parameter
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

            const effectiveServers = operation.servers || pathServers;

            // Normalize Security Requirements (OAS 3.2 allows URI references as keys)
            // e.g. '#/components/securitySchemes/MyScheme' -> 'MyScheme'
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

            // Merge Summary/Description from PathItem if not present on Operation
            // The order here ensures explicit Op overrides > Path Item overrides > Original ref properties
            const summary = operation.summary || pathItem.summary
            if (summary) pathInfo.summary = summary;
            const description = operation.description || pathItem.description;
            if (description) pathInfo.description = description;

            if (operation.tags) pathInfo.tags = operation.tags;
            if (operation.consumes) pathInfo.consumes = operation.consumes;
            if (operation.deprecated) pathInfo.deprecated = operation.deprecated;
            if (operation.externalDocs) pathInfo.externalDocs = operation.externalDocs;
            if (effectiveSecurity) pathInfo.security = effectiveSecurity;

            // Propagate custom extensions (x-custom-field) from the operation to PathInfo
            // This allows generators to access vendor specific metadata on the operation level
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
