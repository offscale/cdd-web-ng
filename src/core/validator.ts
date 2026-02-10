// src/core/validator.ts

import { Parameter, ServerObject, SwaggerSpec, TagObject } from '@src/core/types/index.js';
import { isUrl } from '@src/core/utils/index.js';

/**
 * Error thrown when the OpenAPI specification fails validation.
 */
export class SpecValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SpecValidationError';
    }
}

/**
 * Normalizes a path template to a generic signature for collision detection.
 *
 * Example:
 * - "/users/{id}/details" -> "/users/{}/details"
 * - "/users/{name}/details" -> "/users/{}/details"
 *
 * @param path The URL template path.
 * @returns A normalized signature string.
 */
function getPathTemplateSignature(path: string): string {
    return path
        .split('/')
        .map(segment => {
            if (segment.startsWith('{') && segment.endsWith('}')) {
                return '{}';
            }
            return segment;
        })
        .join('/');
}

function getPathTemplateParams(path: string): string[] {
    const params: string[] = [];
    const regex = /\{([^}]+)\}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(path)) !== null) {
        if (match[1]) params.push(match[1]);
    }
    return params;
}

function isUriReference(value: string): boolean {
    if (!value || typeof value !== 'string') return false;
    if (/\s/.test(value)) return false;
    if (isUrl(value)) return true;
    // RFC3986 unreserved + reserved + percent encoding
    return /^[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+$/.test(value);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getServerTemplateVariables(url: string): string[] {
    const vars = new Set<string>();
    const regex = /\{([^}]+)\}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(url)) !== null) {
        if (match[1]) vars.add(match[1]);
    }
    return Array.from(vars);
}

function validateServers(servers: ServerObject[] | undefined, location: string): void {
    if (!servers || servers.length === 0) return;

    const seenNames = new Set<string>();

    servers.forEach((server, index) => {
        const url = server.url;
        if (typeof url !== 'string' || url.length === 0) {
            throw new SpecValidationError(`Server url must be a non-empty string at ${location}[${index}].`);
        }
        if (url.includes('?') || url.includes('#')) {
            throw new SpecValidationError(
                `Server url MUST NOT include query or fragment at ${location}[${index}]. Value: "${url}"`,
            );
        }

        if (server.name) {
            if (seenNames.has(server.name)) {
                throw new SpecValidationError(
                    `Server name "${server.name}" must be unique at ${location}. Duplicate found.`,
                );
            }
            seenNames.add(server.name);
        }

        const templateVars = getServerTemplateVariables(url);
        if (templateVars.length > 0 && !server.variables) {
            throw new SpecValidationError(
                `Server url defines template variables but 'variables' is missing at ${location}[${index}].`,
            );
        }

        templateVars.forEach(varName => {
            if (!server.variables || !server.variables[varName]) {
                throw new SpecValidationError(
                    `Server url variable "${varName}" is not defined in variables at ${location}[${index}].`,
                );
            }
        });

        if (server.variables) {
            Object.entries(server.variables).forEach(([varName, variable]) => {
                if (variable.enum && variable.enum.length === 0) {
                    throw new SpecValidationError(
                        `Server variable "${varName}" enum MUST NOT be empty at ${location}[${index}].`,
                    );
                }
                if (variable.enum && !variable.enum.includes(variable.default)) {
                    throw new SpecValidationError(
                        `Server variable "${varName}" default MUST be present in enum at ${location}[${index}].`,
                    );
                }

                const token = `{${varName}}`;
                const occurrences = url.match(new RegExp(escapeRegExp(token), 'g'))?.length ?? 0;
                if (occurrences > 1) {
                    throw new SpecValidationError(
                        `Server variable "${varName}" appears more than once in url at ${location}[${index}].`,
                    );
                }
            });
        }
    });
}

function isRefLike(obj: unknown): obj is { $ref?: string; $dynamicRef?: string } {
    if (!obj || typeof obj !== 'object') return false;
    return '$ref' in obj || '$dynamicRef' in obj;
}

function validateMediaTypeObject(mediaObj: unknown, location: string): void {
    if (!mediaObj || typeof mediaObj !== 'object' || isRefLike(mediaObj)) return;

    const media = mediaObj as {
        example?: unknown;
        examples?: unknown;
        encoding?: unknown;
        prefixEncoding?: unknown;
        itemEncoding?: unknown;
    };

    if (media.example !== undefined && media.examples !== undefined) {
        throw new SpecValidationError(
            `Media Type Object at '${location}' contains both 'example' and 'examples'. These fields are mutually exclusive.`,
        );
    }

    const hasEncoding = media.encoding !== undefined;
    const hasPrefixEncoding = media.prefixEncoding !== undefined;
    const hasItemEncoding = media.itemEncoding !== undefined;
    if (hasEncoding && (hasPrefixEncoding || hasItemEncoding)) {
        throw new SpecValidationError(
            `Media Type Object at '${location}' defines 'encoding' alongside 'prefixEncoding' or 'itemEncoding'. These fields are mutually exclusive.`,
        );
    }
}

function validateContentMap(content: Record<string, unknown> | undefined, location: string): void {
    if (!content) return;
    for (const [mediaType, mediaObj] of Object.entries(content)) {
        validateMediaTypeObject(mediaObj, `${location}.${mediaType}`);
    }
}

function validateHeaderObject(headerObj: unknown, location: string): void {
    if (!headerObj || typeof headerObj !== 'object' || isRefLike(headerObj)) return;
    const header = headerObj as {
        name?: unknown;
        in?: unknown;
        style?: unknown;
        allowEmptyValue?: unknown;
        schema?: unknown;
        content?: Record<string, unknown>;
        example?: unknown;
        examples?: unknown;
    };

    if (header.name !== undefined) {
        throw new SpecValidationError(`Header Object at '${location}' MUST NOT define a 'name' field.`);
    }
    if (header.in !== undefined) {
        throw new SpecValidationError(`Header Object at '${location}' MUST NOT define an 'in' field.`);
    }
    if (header.allowEmptyValue !== undefined) {
        throw new SpecValidationError(`Header Object at '${location}' MUST NOT define 'allowEmptyValue'.`);
    }
    if (header.style !== undefined && header.style !== 'simple') {
        throw new SpecValidationError(
            `Header Object at '${location}' has invalid 'style'. The only allowed value is 'simple'.`,
        );
    }
    if (header.example !== undefined && header.examples !== undefined) {
        throw new SpecValidationError(
            `Header Object at '${location}' contains both 'example' and 'examples'. These fields are mutually exclusive.`,
        );
    }
    if (header.schema !== undefined && header.content !== undefined) {
        throw new SpecValidationError(
            `Header Object at '${location}' contains both 'schema' and 'content'. These fields are mutually exclusive.`,
        );
    }
    if (header.content && Object.keys(header.content).length !== 1) {
        throw new SpecValidationError(
            `Header Object at '${location}' has an invalid 'content' map. It MUST contain exactly one entry.`,
        );
    }
    if (header.content) {
        validateContentMap(header.content, `${location}.content`);
    }
}

function validateHeadersMap(headers: Record<string, unknown> | undefined, location: string): void {
    if (!headers) return;
    for (const [headerName, headerObj] of Object.entries(headers)) {
        validateHeaderObject(headerObj, `${location}.${headerName}`);
    }
}

function validateLinkObject(linkObj: unknown, location: string): void {
    if (!linkObj || typeof linkObj !== 'object' || isRefLike(linkObj)) return;
    const link = linkObj as { operationId?: unknown; operationRef?: unknown };
    const hasOperationId = typeof link.operationId === 'string' && link.operationId.length > 0;
    const hasOperationRef = typeof link.operationRef === 'string' && link.operationRef.length > 0;

    if (hasOperationId && hasOperationRef) {
        throw new SpecValidationError(
            `Link Object at '${location}' defines both 'operationId' and 'operationRef'. These fields are mutually exclusive.`,
        );
    }
    if (!hasOperationId && !hasOperationRef) {
        throw new SpecValidationError(
            `Link Object at '${location}' must define either 'operationId' or 'operationRef'.`,
        );
    }
}

function validateLinksMap(links: Record<string, unknown> | undefined, location: string): void {
    if (!links) return;
    for (const [linkName, linkObj] of Object.entries(links)) {
        validateLinkObject(linkObj, `${location}.${linkName}`);
    }
}

function validateRequestBody(requestBody: unknown, location: string): void {
    if (!requestBody || typeof requestBody !== 'object' || isRefLike(requestBody)) return;
    const body = requestBody as { content?: Record<string, unknown> };
    if (body.content) {
        validateContentMap(body.content, `${location}.content`);
    }
}

function validateResponses(responses: Record<string, unknown> | undefined, location: string): void {
    if (!responses) return;
    for (const [status, responseObj] of Object.entries(responses)) {
        if (!responseObj || typeof responseObj !== 'object' || isRefLike(responseObj)) continue;
        const response = responseObj as {
            headers?: Record<string, unknown>;
            content?: Record<string, unknown>;
            links?: Record<string, unknown>;
        };
        if (response.headers) {
            validateHeadersMap(response.headers, `${location}.${status}.headers`);
        }
        if (response.content) {
            validateContentMap(response.content, `${location}.${status}.content`);
        }
        if (response.links) {
            validateLinksMap(response.links, `${location}.${status}.links`);
        }
    }
}

function validateOperationsContent(paths: Record<string, unknown> | undefined, locationPrefix: string): void {
    if (!paths) return;
    const operationKeys = ['get', 'post', 'put', 'delete', 'options', 'head', 'patch', 'trace', 'query'];

    for (const [pathKey, pathItem] of Object.entries(paths)) {
        if (!pathItem || typeof pathItem !== 'object') continue;

        for (const method of operationKeys) {
            const operation = (pathItem as any)[method];
            if (operation) {
                validateRequestBody(
                    operation.requestBody,
                    `${locationPrefix}${pathKey}.${method}.requestBody`,
                );
                validateResponses(
                    operation.responses as Record<string, unknown>,
                    `${locationPrefix}${pathKey}.${method}.responses`,
                );
            }
        }

        if ((pathItem as any).additionalOperations) {
            for (const [method, operation] of Object.entries((pathItem as any).additionalOperations)) {
                validateRequestBody(
                    (operation as any)?.requestBody,
                    `${locationPrefix}${pathKey}.additionalOperations.${method}.requestBody`,
                );
                validateResponses(
                    (operation as any)?.responses as Record<string, unknown>,
                    `${locationPrefix}${pathKey}.additionalOperations.${method}.responses`,
                );
            }
        }
    }
}

/**
 * Validates that a parsed object conforms to the basic structure of a Swagger 2.0 or OpenAPI 3.x specification.
 * Checks for:
 * - Valid version string ('swagger: "2.x"' or 'openapi: "3.x"')
 * - "info" object with "title" and "version"
 * - At least one functional root property ("paths", "components", or "webhooks")
 * - License Object constraints (mutually exclusive `url` and `identifier`)
 * - Strict regex compliance for component keys (OAS 3.x)
 * - Path Template Hierarchy collisions (OAS 3.2)
 * - Parameter exclusivity rules (OAS 3.2):
 *    - `in: "query"` is exclusive with `in: "querystring"` in same operation.
 *    - `example` and `examples` are mutually exclusive on Parameter/Object.
 *    - `content` and `schema` are mutually exclusive on Parameter Objects.
 *    - `in: "querystring"` MUST NOT have `style`, `explode`, or `allowReserved` present.
 *    - `content` map MUST have exactly one entry.
 *    - `allowEmptyValue` behavior restrictions (only for query, not with style).
 * - `jsonSchemaDialect` MUST be a URI.
 *
 * @param spec The parsed specification object.
 * @throws {SpecValidationError} if the specification is invalid.
 */
export function validateSpec(spec: SwaggerSpec): void {
    if (!spec) {
        throw new SpecValidationError('Specification cannot be null or undefined.');
    }

    // 1. Check Version Header
    const isSwag2 = typeof spec.swagger === 'string' && spec.swagger.startsWith('2.');
    const isOpenApi3 = typeof spec.openapi === 'string' && spec.openapi.startsWith('3.');

    if (!isSwag2 && !isOpenApi3) {
        throw new SpecValidationError(
            'Unsupported or missing OpenAPI/Swagger version. Specification must contain \'swagger: "2.x"\' or \'openapi: "3.x"\'.',
        );
    }

    // 2. Check Info Object
    if (!spec.info) {
        throw new SpecValidationError("Specification must contain an 'info' object.");
    }
    if (!spec.info.title || typeof spec.info.title !== 'string') {
        throw new SpecValidationError("Specification info object must contain a required string field: 'title'.");
    }
    if (!spec.info.version || typeof spec.info.version !== 'string') {
        throw new SpecValidationError("Specification info object must contain a required string field: 'version'.");
    }

    // 3. Check License Object Constraints (OAS 3.1+)
    // "The `identifier` field is mutually exclusive of the `url` field."
    if (spec.info.license) {
        // OAS 3.2/3.1 Strictness: checking logical existence rather than falsy values to avoid edge cases with empty strings,
        // though empty strings would be invalid URIs anyway.
        const hasUrl = spec.info.license.url !== undefined && spec.info.license.url !== null;
        const hasIdentifier = spec.info.license.identifier !== undefined && spec.info.license.identifier !== null;

        if (hasUrl && hasIdentifier) {
            throw new SpecValidationError(
                "License object cannot contain both 'url' and 'identifier' fields. They are mutually exclusive.",
            );
        }
    }

    // 3b. Check $self URI Reference (OAS 3.2)
    if (isOpenApi3 && spec.$self !== undefined) {
        if (typeof spec.$self !== 'string' || !isUriReference(spec.$self)) {
            throw new SpecValidationError(
                `OpenAPI '$self' must be a valid URI reference. Value: "${String(spec.$self)}"`,
            );
        }
    }

    const operationKeys = ['get', 'post', 'put', 'delete', 'options', 'head', 'patch', 'trace', 'query'];
    const operationIdLocations = new Map<string, string[]>();

    const recordOperationId = (operationId: string, location: string) => {
        const existing = operationIdLocations.get(operationId);
        if (existing) {
            existing.push(location);
        } else {
            operationIdLocations.set(operationId, [location]);
        }
    };

    const collectOperationIds = (paths: Record<string, any> | undefined, locationPrefix: string) => {
        if (!paths) return;
        for (const [pathKey, pathItem] of Object.entries(paths)) {
            if (!pathItem || typeof pathItem !== 'object') continue;

            for (const method of operationKeys) {
                const operation = (pathItem as any)[method];
                if (operation?.operationId) {
                    recordOperationId(operation.operationId, `${locationPrefix}${pathKey} ${method.toUpperCase()}`);
                }
            }

            if ((pathItem as any).additionalOperations) {
                for (const [method, operation] of Object.entries((pathItem as any).additionalOperations)) {
                    if ((operation as any)?.operationId) {
                        recordOperationId((operation as any).operationId, `${locationPrefix}${pathKey} ${method}`);
                    }
                }
            }
        }
    };

    if (spec.paths) {
        const signatures = new Map<string, string>(); // Signature -> Original Path key

        for (const pathKey of Object.keys(spec.paths)) {
            const pathItem = spec.paths[pathKey];
            const templateParams = getPathTemplateParams(pathKey);
            const templateParamSet = new Set(templateParams);
            const hasTemplateParams = templateParams.length > 0;
            const skipPathTemplateValidation = !!(pathItem as any)?.$ref;

            // 3.2 AdditionalOperations guard: disallow fixed HTTP methods in the map.
            if (isOpenApi3 && (pathItem as any)?.additionalOperations) {
                const additionalOps = (pathItem as any).additionalOperations;
                for (const methodKey of Object.keys(additionalOps)) {
                    const normalized = methodKey.toLowerCase();
                    if (operationKeys.includes(normalized)) {
                        throw new SpecValidationError(
                            `Path '${pathKey}' defines additionalOperations method "${methodKey}" which conflicts with a fixed HTTP method. ` +
                                `Use the corresponding fixed field (e.g. "${normalized}") instead.`,
                        );
                    }
                }
            }

            // 4. Path Template Hierarchy Validation (OAS 3.2 Requirement)
            // "Templated paths with the same hierarchy but different templated names MUST NOT exist as they are identical."
            // This check applies generally to avoid ambiguity in router generation for both OAS 3 and Swagger 2.
            const signature = getPathTemplateSignature(pathKey);

            // If the path doesn't contain templates, collision logic strictly relies on identical strings which JSON parse handles (last wins).
            // However, we primarily care about {a} vs {b}.
            if (signature.includes('{}')) {
                if (signatures.has(signature)) {
                    const existingPath = signatures.get(signature)!;
                    throw new SpecValidationError(
                        `Ambiguous path definition detected. OAS 3.2 forbids identical path hierarchies with different parameter names.\n` +
                            `Path 1: "${existingPath}"\n` +
                            `Path 2: "${pathKey}"`,
                    );
                }
                signatures.set(signature, pathKey);
            }

            // 5. Parameter Validation (OAS 3.2 Strictness)
            const pathParams = (pathItem.parameters || []) as Parameter[];

            const validatePathParam = (param: Parameter, location: string) => {
                if (param.in !== 'path') return;
                if (!templateParamSet.has(param.name)) {
                    throw new SpecValidationError(
                        `Path parameter '${param.name}' in '${location}' does not match any template variable in path '${pathKey}'.`,
                    );
                }
                if (param.required !== true) {
                    throw new SpecValidationError(
                        `Path parameter '${param.name}' in '${location}' must be marked as required: true.`,
                    );
                }
            };

            for (const method of operationKeys) {
                const operation = (pathItem as any)[method];
                if (operation) {
                    const opParams = (operation.parameters || []) as Parameter[];
                    const allParams = [...pathParams, ...opParams];

                    // 5a. Path Template Parameter Validation
                    // Each template variable MUST be defined as a path parameter in the path-item or operation.
                    if (hasTemplateParams && !skipPathTemplateValidation) {
                        for (const name of templateParamSet) {
                            const hasParam = allParams.some(
                                p => !!p && typeof p === 'object' && (p as any).in === 'path' && (p as any).name === name,
                            );
                            if (!hasParam) {
                                throw new SpecValidationError(
                                    `Path template '{${name}}' in '${method.toUpperCase()} ${pathKey}' is missing a corresponding 'in: path' parameter definition.`,
                                );
                            }
                        }
                    }

                    // 5a. Query vs Querystring Exclusivity
                    const hasQuery = allParams.some(p => p.in === 'query');
                    const hasQuerystring = allParams.some(p => p.in === 'querystring');

                    if (hasQuery && hasQuerystring) {
                        throw new SpecValidationError(
                            `Operation '${method.toUpperCase()} ${pathKey}' contains both 'query' and 'querystring' parameters. These are mutually exclusive.`,
                        );
                    }

                    for (const param of allParams) {
                        if (!param || typeof param !== 'object') continue;
                        if (!skipPathTemplateValidation && (param as any).in === 'path' && (param as any).name) {
                            validatePathParam(param as Parameter, `${method.toUpperCase()} ${pathKey}`);
                        }
                        // 5b. Examples Exclusivity
                        if (param.example !== undefined && param.examples !== undefined) {
                            throw new SpecValidationError(
                                `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' contains both 'example' and 'examples'. These fields are mutually exclusive.`,
                            );
                        }

                        if (isOpenApi3) {
                            // 5c. Schema vs Content Exclusivity (OAS 3.2)
                            // "Parameter Objects MUST include either a content field or a schema field, but not both."
                            if (param.schema !== undefined && param.content !== undefined) {
                                throw new SpecValidationError(
                                    `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' contains both 'schema' and 'content'. These fields are mutually exclusive.`,
                                );
                            }

                            // strict content map check (OAS 3.2)
                            // "The map MUST only contain one entry."
                            if (param.content) {
                                if (Object.keys(param.content).length !== 1) {
                                    throw new SpecValidationError(
                                        `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' has an invalid 'content' map. It MUST contain exactly one entry.`,
                                    );
                                }
                            }

                            // strict allowEmptyValue checks (OAS 3.2)
                            if (param.allowEmptyValue) {
                                if (param.in !== 'query') {
                                    throw new SpecValidationError(
                                        `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' defines 'allowEmptyValue' but location is not 'query'.`,
                                    );
                                }
                                // "If style is used... the value of allowEmptyValue SHALL be ignored." -> We treat explicit definition as error/warning territory in strict mode
                                // or interpret "SHALL be ignored" as "SHOULD NOT be present together".
                                // The requirement "forbidden if style is used" comes from the prompt description.
                                if (param.style) {
                                    throw new SpecValidationError(
                                        `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' defines 'allowEmptyValue' alongside 'style'. This is forbidden.`,
                                    );
                                }
                            }
                        }

                        // 5d. Querystring Strictness (OAS 3.2)
                        // "These fields MUST NOT be used with in: 'querystring'."
                        if (param.in === 'querystring') {
                            if (
                                param.style !== undefined ||
                                param.explode !== undefined ||
                                param.allowReserved !== undefined
                            ) {
                                throw new SpecValidationError(
                                    `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' has location 'querystring' but defines style/explode/allowReserved, which are forbidden.`,
                                );
                            }
                        }

                        if (isOpenApi3 && param.content) {
                            validateContentMap(
                                param.content as Record<string, unknown>,
                                `paths.${pathKey}.${method}.parameters.${param.name}.content`,
                            );
                        }
                    }

                    if (isOpenApi3) {
                        validateRequestBody(
                            (operation as any).requestBody,
                            `paths.${pathKey}.${method}.requestBody`,
                        );
                        validateResponses(
                            (operation as any).responses as Record<string, unknown>,
                            `paths.${pathKey}.${method}.responses`,
                        );
                    }
                }
            }
        }
    }

    if (isOpenApi3) {
        validateOperationsContent(spec.webhooks as Record<string, unknown> | undefined, 'webhooks.');
    }

    if (isOpenApi3) {
        // 5e. Server Object Validation (OAS 3.x)
        validateServers(spec.servers, 'servers');

        const validateServerLocations = (paths: Record<string, any> | undefined, locationPrefix: string) => {
            if (!paths) return;
            for (const [pathKey, pathItem] of Object.entries(paths)) {
                if (!pathItem || typeof pathItem !== 'object') continue;

                if ((pathItem as any).servers) {
                    validateServers((pathItem as any).servers as ServerObject[], `${locationPrefix}${pathKey}.servers`);
                }

                for (const method of operationKeys) {
                    const operation = (pathItem as any)[method];
                    if (operation?.servers) {
                        validateServers(
                            operation.servers as ServerObject[],
                            `${locationPrefix}${pathKey}.${method}.servers`,
                        );
                    }
                }

                if ((pathItem as any).additionalOperations) {
                    for (const [method, operation] of Object.entries((pathItem as any).additionalOperations)) {
                        if ((operation as any)?.servers) {
                            validateServers(
                                (operation as any).servers as ServerObject[],
                                `${locationPrefix}${pathKey}.additionalOperations.${method}.servers`,
                            );
                        }
                    }
                }
            }
        };

        validateServerLocations(spec.paths, 'paths.');
        validateServerLocations(spec.webhooks as Record<string, any> | undefined, 'webhooks.');
    }

    // 6. OperationId Uniqueness (OpenAPI/Swagger)
    // "The operationId MUST be unique among all operations described in the API."
    collectOperationIds(spec.paths, '');
    collectOperationIds(spec.webhooks as Record<string, any> | undefined, 'webhooks:');

    for (const [operationId, locations] of operationIdLocations.entries()) {
        if (locations.length > 1) {
            throw new SpecValidationError(
                `Duplicate operationId "${operationId}" found in multiple operations: ${locations.join(', ')}`,
            );
        }
    }

    // 7. Check Components Parameters Exclusivity (OAS 3.x)
    if (isOpenApi3 && spec.components?.parameters) {
        for (const [name, param] of Object.entries(spec.components.parameters)) {
            if (!param || typeof param !== 'object') continue;
            if ('$ref' in param || '$dynamicRef' in param) continue;
            // We can only check direct definitions, not refs here easily.
            // Assuming direct objects has example/examples.
            if (param.example !== undefined && param.examples !== undefined) {
                throw new SpecValidationError(
                    `Component parameter '${name}' contains both 'example' and 'examples'. These fields are mutually exclusive.`,
                );
            }

            // OAS 3.2 check for component parameter schema vs content exclusivity
            if (param.schema !== undefined && param.content !== undefined) {
                throw new SpecValidationError(
                    `Component parameter '${name}' contains both 'schema' and 'content'. These fields are mutually exclusive.`,
                );
            }

            // strict content map check
            if (param.content) {
                if (Object.keys(param.content).length !== 1) {
                    throw new SpecValidationError(
                        `Component parameter '${name}' has an invalid 'content' map. It MUST contain exactly one entry.`,
                    );
                }
            }

            // strict allowEmptyValue checks
            if (param.allowEmptyValue) {
                if (param.in !== 'query') {
                    throw new SpecValidationError(
                        `Component parameter '${name}' defines 'allowEmptyValue' but location is not 'query'.`,
                    );
                }
                if (param.style) {
                    throw new SpecValidationError(
                        `Component parameter '${name}' defines 'allowEmptyValue' alongside 'style'. This is forbidden.`,
                    );
                }
            }

            // OAS 3.2 check for component parameter querystring constraints
            if (param.in === 'querystring') {
                if (param.style !== undefined || param.explode !== undefined || param.allowReserved !== undefined) {
                    throw new SpecValidationError(
                        `Component parameter '${name}' has location 'querystring' but defines style/explode/allowReserved, which are forbidden.`,
                    );
                }
            }

            if (param.content) {
                validateContentMap(
                    param.content as Record<string, unknown>,
                    `components.parameters.${name}.content`,
                );
            }
        }
    }

    if (isOpenApi3 && spec.components) {
        if (spec.components.headers) {
            validateHeadersMap(spec.components.headers as Record<string, unknown>, 'components.headers');
        }
        if (spec.components.links) {
            validateLinksMap(spec.components.links as Record<string, unknown>, 'components.links');
        }
        if (spec.components.mediaTypes) {
            for (const [name, mediaObj] of Object.entries(spec.components.mediaTypes)) {
                validateMediaTypeObject(mediaObj, `components.mediaTypes.${name}`);
            }
        }
        if (spec.components.requestBodies) {
            for (const [name, requestBody] of Object.entries(spec.components.requestBodies)) {
                validateRequestBody(requestBody, `components.requestBodies.${name}`);
            }
        }
        if (spec.components.responses) {
            validateResponses(spec.components.responses as Record<string, unknown>, 'components.responses');
        }
    }

    // 8. Check Structural Root
    // Per OAS 3.2: "at least one of the components, paths, or webhooks fields MUST be present."
    // For Swagger 2.0: 'paths' is technically required.

    // Note: We treat empty objects as "present" for the sake of validation,
    // as empty APIs are technically valid (though useless).
    const hasPaths = spec.paths !== undefined && spec.paths !== null;
    const hasComponents = !!spec.components;
    const hasWebhooks = !!spec.webhooks;

    if (isOpenApi3) {
        if (!hasPaths && !hasComponents && !hasWebhooks) {
            throw new SpecValidationError(
                "OpenAPI 3.x specification must contain at least one of: 'paths', 'components', or 'webhooks'.",
            );
        }

        // 9. Check Component Key Constraints (OAS 3.x)
        // "All the fixed fields declared above are objects that MUST use keys that match the regular expression: ^[a-zA-Z0-9\.\-_]+$."
        if (spec.components) {
            const componentTypes = [
                'schemas',
                'responses',
                'parameters',
                'examples',
                'requestBodies',
                'headers',
                'securitySchemes',
                'links',
                'callbacks',
                'pathItems',
                'mediaTypes',
                'webhooks',
            ];
            const validKeyRegex = /^[a-zA-Z0-9\.\-_]+$/;

            for (const type of componentTypes) {
                const componentGroup = (spec.components as any)[type];
                if (componentGroup) {
                    for (const key of Object.keys(componentGroup)) {
                        if (!validKeyRegex.test(key)) {
                            throw new SpecValidationError(
                                `Invalid component key "${key}" in "components.${type}". Keys must match regex: ^[a-zA-Z0-9\\.\\-_]+$`,
                            );
                        }
                    }
                }
            }
        }

        // 9b. Tag parent validation (OAS 3.2)
        if (spec.tags && spec.tags.length > 0) {
            const tagNames = new Set(spec.tags.map(t => t.name));
            const parentMap = new Map<string, string>();

            spec.tags.forEach((tag: TagObject) => {
                if (tag.parent) {
                    if (!tagNames.has(tag.parent)) {
                        throw new SpecValidationError(
                            `Tag "${tag.name}" has parent "${tag.parent}" which does not exist in tags array.`,
                        );
                    }
                    parentMap.set(tag.name, tag.parent);
                }
            });

            // Detect circular references
            for (const tag of spec.tags) {
                const seen = new Set<string>();
                let current: string | undefined = tag.name;
                while (current && parentMap.has(current)) {
                    if (seen.has(current)) {
                        throw new SpecValidationError(`Circular tag parent reference detected at "${current}".`);
                    }
                    seen.add(current);
                    current = parentMap.get(current);
                }
            }
        }

        // 10. Check jsonSchemaDialect (OAS 3.1+)
        if (spec.jsonSchemaDialect) {
            if (typeof spec.jsonSchemaDialect !== 'string') {
                throw new SpecValidationError("Field 'jsonSchemaDialect' must be a string.");
            }
            // Spec: "This MUST be in the form of a URI."
            if (!isUrl(spec.jsonSchemaDialect)) {
                // Fallback regex for simple URI scheme check if 'new URL()' is too strict contextually/environmentally
                // Check for scheme (alpha + alphanumeric/+-.) followed by colon
                if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(spec.jsonSchemaDialect)) {
                    throw new SpecValidationError(
                        `Field 'jsonSchemaDialect' must be a valid URI. Value: "${spec.jsonSchemaDialect}"`,
                    );
                }
            }
        }
    } else {
        // Swagger 2.0 strictness
        if (!hasPaths) {
            throw new SpecValidationError("Swagger 2.0 specification must contain a 'paths' object.");
        }
    }
}
