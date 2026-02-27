// src/core/validator.ts

import { Parameter, ServerObject, SwaggerSpec, TagObject } from '@src/core/types/index.js';
import { isUrl } from '@src/functions/utils.js';

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

function validateTemplateBraces(value: string, location: string, label: string): void {
    if (typeof value !== 'string' || value.length === 0) return;
    if (!value.includes('{') && !value.includes('}')) return;

    let index = 0;
    while (index < value.length) {
        const char = value[index];

        if (char === '{') {
            const closeIndex = value.indexOf('}', index + 1);
            if (closeIndex === -1) {
                throw new SpecValidationError(
                    `${label} at '${location}' contains an opening "{" without a matching "}".`,
                );
            }
            if (closeIndex === index + 1) {
                throw new SpecValidationError(`${label} at '${location}' contains an empty template expression "{}".`);
            }
            const inner = value.slice(index + 1, closeIndex);
            if (inner.includes('{')) {
                throw new SpecValidationError(
                    `${label} at '${location}' contains nested "{" characters, which is not allowed.`,
                );
            }
            index = closeIndex + 1;
            continue;
        }

        if (char === '}') {
            throw new SpecValidationError(`${label} at '${location}' contains a closing "}" without a matching "{".`);
        }
        index += 1;
    }
}

function isUriReference(value: string): boolean {
    if (!value || typeof value !== 'string') return false;
    if (/\s/.test(value)) return false;
    if (isUrl(value)) return true;

    // If it has a scheme-like prefix before any path characters, validate the scheme
    const schemeMatch = value.match(/^([^:/?#]+):/);
    if (schemeMatch) {
        if (!/^[a-zA-Z][a-zA-Z0-9+.-]*$/.test(schemeMatch[1])) {
            return false;
        }
    }

    // RFC3986 unreserved + reserved + percent encoding
    return /^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/.test(value);
}

function isEmailAddress(value: string): boolean {
    if (!value || typeof value !== 'string') return false;
    // Pragmatic email check: local@domain.tld
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isAbsoluteIri(value: string): boolean {
    if (!value || typeof value !== 'string') return false;
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

const RUNTIME_HEADER_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const HTTP_METHOD_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Validates a JSON Pointer fragment (RFC 6901) without the leading '#'.
 */
function isValidJsonPointer(pointer: string): boolean {
    if (pointer === '') return true;
    if (!pointer.startsWith('/')) return false;
    return new RegExp('^/([^~/]|~[01])*(/([^~/]|~[01])*)*$').test(pointer);
}

/**
 * Validates an OpenAPI Runtime Expression (OAS 3.x).
 */
function isValidRuntimeExpression(expression: string): boolean {
    if (!expression || typeof expression !== 'string') return false;
    if (expression === '$url' || expression === '$method' || expression === '$statusCode') return true;

    const isRequest = expression.startsWith('$request.');
    const isResponse = expression.startsWith('$response.');

    if (!isRequest && !isResponse) return false;

    const source = expression.substring(isRequest ? 9 : 10);
    if (source.startsWith('header.')) {
        const token = source.substring(7);
        return RUNTIME_HEADER_TOKEN.test(token);
    }

    if (isRequest) {
        if (source.startsWith('query.')) {
            return source.substring(6).length > 0;
        }
        if (source.startsWith('path.')) {
            return source.substring(5).length > 0;
        }
    }

    if (source === 'body') return true;
    if (source.startsWith('body#')) {
        const pointer = source.substring(5);
        return isValidJsonPointer(pointer);
    }

    return false;
}

/**
 * Validates Callback Object expression keys (runtime expressions or templates).
 */
type RuntimeExpressionMode = 'required' | 'optional';

function validateRuntimeExpressionTemplate(
    expression: string,
    location: string,
    mode: RuntimeExpressionMode,
    label = 'Runtime expression',
): void {
    if (typeof expression !== 'string' || expression.length === 0) {
        throw new SpecValidationError(`${label} at '${location}' must be a non-empty string.`);
    }

    const hasOpen = expression.includes('{');
    const hasClose = expression.includes('}');

    if (hasOpen || hasClose) {
        const matches = [...expression.matchAll(/\{([^}]+)\}/g)];
        if (matches.length === 0) {
            throw new SpecValidationError(
                `${label} at '${location}' contains unmatched braces and cannot be evaluated.`,
            );
        }
        for (const match of matches) {
            const inner = match[1]?.trim() ?? '';
            if (!isValidRuntimeExpression(inner)) {
                throw new SpecValidationError(
                    `${label} at '${location}' contains invalid runtime expression '{${inner}}'.`,
                );
            }
        }

        const stripped = expression.replace(/\{[^}]*\}/g, '');
        if (stripped.includes('{') || stripped.includes('}')) {
            throw new SpecValidationError(
                `${label} at '${location}' contains unmatched braces and cannot be evaluated.`,
            );
        }
        return;
    }

    if (mode === 'required' || expression.startsWith('$')) {
        if (!isValidRuntimeExpression(expression)) {
            throw new SpecValidationError(`${label} at '${location}' must be a valid runtime expression.`);
        }
    }
}

function validateCallbackExpression(expression: string, location: string): void {
    validateRuntimeExpressionTemplate(expression, location, 'required', 'Callback expression');
}

type SchemaTypeKind = 'primitive' | 'array' | 'object' | 'unknown';

function getSchemaTypeKind(schema: unknown): SchemaTypeKind {
    if (!schema || typeof schema !== 'object') return 'unknown';
    if ('$ref' in (schema as object) || '$dynamicRef' in (schema as object)) return 'unknown';

    const rawType = (schema as { type?: unknown }).type;
    const normalizeType = (value: unknown): SchemaTypeKind => {
        if (typeof value !== 'string') return 'unknown';
        if (value === 'array') return 'array';
        if (value === 'object') return 'object';
        if (['string', 'number', 'integer', 'boolean', 'null'].includes(value)) return 'primitive';
        return 'unknown';
    };

    if (typeof rawType === 'string') {
        return normalizeType(rawType);
    }

    if (Array.isArray(rawType)) {
        const filtered = rawType.filter((t: unknown) => t !== 'null');
        if (filtered.length === 1) {
            return normalizeType(filtered[0]);
        }
    }

    return 'unknown';
}

const PARAM_STYLE_BY_IN: Record<string, Set<string>> = {
    path: new Set(['matrix', 'label', 'simple']),
    query: new Set(['form', 'spaceDelimited', 'pipeDelimited', 'deepObject']),
    header: new Set(['simple']),
    cookie: new Set(['form', 'cookie']),
    querystring: new Set([]),
};

const XML_NODE_TYPES = new Set(['element', 'attribute', 'text', 'cdata', 'none']);

function validateExternalDocsObject(externalDocs: unknown, location: string): void {
    if (externalDocs === undefined || externalDocs === null) return;
    if (typeof externalDocs !== 'object') {
        throw new SpecValidationError(`ExternalDocs at '${location}' must be an object.`);
    }
    const url = (externalDocs as { url?: unknown }).url;
    if (typeof url !== 'string' || !isUriReference(url)) {
        throw new SpecValidationError(`ExternalDocs.url must be a valid URI at '${location}'. Value: "${String(url)}"`);
    }
}

function validateSchemaExternalDocs(
    schema: unknown,
    location: string,
    seen: WeakSet<object> = new WeakSet<object>(),
): void {
    if (schema === null || schema === undefined) return;
    if (typeof schema !== 'object') return;

    const obj = schema as Record<string, unknown>;
    if (seen.has(obj)) return;
    seen.add(obj);

    if ('$schema' in obj) {
        const value = obj.$schema;
        if (typeof value !== 'string' || !isUriReference(value)) {
            throw new SpecValidationError(
                `Schema Object at '${location}' has invalid '$schema'. It must be a valid URI reference.`,
            );
        }
    }

    if ('$id' in obj) {
        const value = obj.$id;
        if (typeof value !== 'string' || !isUriReference(value)) {
            throw new SpecValidationError(
                `Schema Object at '${location}' has invalid '$id'. It must be a valid URI reference.`,
            );
        }
    }

    if ('$anchor' in obj) {
        const value = obj.$anchor;
        if (typeof value !== 'string' || value.trim().length === 0) {
            throw new SpecValidationError(`Schema Object at '${location}' has invalid '$anchor'.`);
        }
    }

    if ('$dynamicAnchor' in obj) {
        const value = obj.$dynamicAnchor;
        if (typeof value !== 'string' || value.trim().length === 0) {
            throw new SpecValidationError(`Schema Object at '${location}' has invalid '$dynamicAnchor'.`);
        }
    }

    if ('$ref' in obj) {
        const value = obj.$ref;
        if (typeof value !== 'string' || !isUriReference(value)) {
            throw new SpecValidationError(
                `Schema Object at '${location}' has invalid '$ref'. It must be a valid URI reference.`,
            );
        }
    }

    if ('$dynamicRef' in obj) {
        const value = obj.$dynamicRef;
        if (typeof value !== 'string' || !isUriReference(value)) {
            throw new SpecValidationError(
                `Schema Object at '${location}' has invalid '$dynamicRef'. It must be a valid URI reference.`,
            );
        }
    }

    if ('externalDocs' in obj) {
        validateExternalDocsObject((obj as { externalDocs?: unknown }).externalDocs, `${location}.externalDocs`);
    }

    if ('discriminator' in obj) {
        validateDiscriminatorObject(obj, `${location}.discriminator`);
    }

    if ('xml' in obj) {
        validateXmlObject(obj, `${location}.xml`);
    }

    if ('$ref' in obj || '$dynamicRef' in obj) {
        return;
    }

    const visit = (child: unknown, childPath: string) => validateSchemaExternalDocs(child, childPath, seen);

    if (Array.isArray(obj.allOf))
        (obj.allOf as unknown[]).forEach((s: unknown, i: number) => visit(s, `${location}.allOf[${i}]`));
    if (Array.isArray(obj.anyOf))
        (obj.anyOf as unknown[]).forEach((s: unknown, i: number) => visit(s, `${location}.anyOf[${i}]`));
    if (Array.isArray(obj.oneOf))
        (obj.oneOf as unknown[]).forEach((s: unknown, i: number) => visit(s, `${location}.oneOf[${i}]`));
    if (obj.not) visit(obj.not, `${location}.not`);
    if (obj.if) visit(obj.if, `${location}.if`);
    if (obj.then) visit(obj.then, `${location}.then`);
    if (obj.else) visit(obj.else, `${location}.else`);

    if (obj.items) {
        if (Array.isArray(obj.items)) {
            (obj.items as unknown[]).forEach((s: unknown, i: number) => visit(s, `${location}.items[${i}]`));
        } else {
            visit(obj.items, `${location}.items`);
        }
    }

    if (Array.isArray(obj.prefixItems)) {
        (obj.prefixItems as unknown[]).forEach((s: unknown, i: number) => visit(s, `${location}.prefixItems[${i}]`));
    }

    if (obj.properties && typeof obj.properties === 'object') {
        Object.entries(obj.properties as Record<string, unknown>).forEach(([key, value]) =>
            visit(value, `${location}.properties.${key}`),
        );
    }

    if (obj.patternProperties && typeof obj.patternProperties === 'object') {
        Object.entries(obj.patternProperties as Record<string, unknown>).forEach(([key, value]) =>
            visit(value, `${location}.patternProperties.${key}`),
        );
    }

    if (obj.additionalProperties && typeof obj.additionalProperties === 'object') {
        visit(obj.additionalProperties, `${location}.additionalProperties`);
    }

    if (obj.dependentSchemas && typeof obj.dependentSchemas === 'object') {
        Object.entries(obj.dependentSchemas as Record<string, unknown>).forEach(([key, value]) =>
            visit(value, `${location}.dependentSchemas.${key}`),
        );
    }

    if (obj.contentSchema) {
        visit(obj.contentSchema, `${location}.contentSchema`);
    }
}

function isPropertyRequired(schema: unknown, propName: string, seen: WeakSet<object> = new WeakSet<object>()): boolean {
    if (!schema || typeof schema !== 'object') return false;
    const obj = schema as Record<string, unknown>;
    if (seen.has(obj)) return false;
    seen.add(obj);

    const required = obj.required;
    if (Array.isArray(required) && required.includes(propName)) return true;

    if (Array.isArray(obj.allOf)) {
        return (obj.allOf as unknown[]).some(sub => {
            if (!sub || typeof sub !== 'object') return false;
            if ('$ref' in (sub as object) || '$dynamicRef' in (sub as object)) return false;
            return isPropertyRequired(sub, propName, seen);
        });
    }

    return false;
}

function validateDiscriminatorObject(schema: Record<string, unknown>, location: string): void {
    const discriminator = schema.discriminator;
    if (discriminator === undefined || discriminator === null) return;

    // Swagger 2.0 allows discriminator as a string (property name).
    if (typeof discriminator === 'string') {
        if (location.startsWith('definitions.')) return;
        throw new SpecValidationError(`Discriminator at '${location}' must be an object.`);
    }
    if (typeof discriminator !== 'object' || Array.isArray(discriminator)) {
        throw new SpecValidationError(`Discriminator at '${location}' must be an object.`);
    }

    const propName = (discriminator as { propertyName?: unknown }).propertyName;
    if (typeof propName !== 'string' || propName.trim().length === 0) {
        throw new SpecValidationError(`Discriminator at '${location}' must define a non-empty string 'propertyName'.`);
    }

    const hasComposite = Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf) || Array.isArray(schema.allOf);
    if (!hasComposite) {
        throw new SpecValidationError(`Discriminator at '${location}' is only valid alongside oneOf/anyOf/allOf.`);
    }

    const mapping = (discriminator as { mapping?: unknown }).mapping;
    if (mapping !== undefined && (typeof mapping !== 'object' || Array.isArray(mapping))) {
        throw new SpecValidationError(`Discriminator mapping at '${location}' must be an object.`);
    }
    if (mapping && typeof mapping === 'object') {
        Object.entries(mapping as Record<string, unknown>).forEach(([key, value]) => {
            if (typeof value !== 'string') {
                throw new SpecValidationError(
                    `Discriminator mapping value for '${key}' at '${location}' must be a string.`,
                );
            }
        });
    }

    const defaultMapping = (discriminator as { defaultMapping?: unknown }).defaultMapping;
    if (defaultMapping !== undefined && typeof defaultMapping !== 'string') {
        throw new SpecValidationError(`Discriminator defaultMapping at '${location}' must be a string.`);
    }

    const required = isPropertyRequired(schema, propName);

    if (!required && defaultMapping === undefined) {
        throw new SpecValidationError(
            `Discriminator property '${propName}' is optional at '${location}'. A 'defaultMapping' is required.`,
        );
    }
}

function validateXmlObject(schema: Record<string, unknown>, location: string): void {
    const xml = schema.xml;
    if (xml === undefined || xml === null) return;
    if (typeof xml !== 'object' || Array.isArray(xml)) {
        throw new SpecValidationError(`XML Object at '${location}' must be an object.`);
    }

    const xmlObj = xml as {
        nodeType?: unknown;
        name?: unknown;
        namespace?: unknown;
        prefix?: unknown;
        attribute?: unknown;
        wrapped?: unknown;
    };

    if (xmlObj.nodeType !== undefined) {
        if (typeof xmlObj.nodeType !== 'string' || !XML_NODE_TYPES.has(xmlObj.nodeType)) {
            throw new SpecValidationError(`XML Object at '${location}' has invalid 'nodeType'.`);
        }
        if (xmlObj.attribute !== undefined) {
            throw new SpecValidationError(
                `XML Object at '${location}' MUST NOT define 'attribute' when 'nodeType' is present.`,
            );
        }
        if (xmlObj.wrapped !== undefined) {
            throw new SpecValidationError(
                `XML Object at '${location}' MUST NOT define 'wrapped' when 'nodeType' is present.`,
            );
        }
    }

    if (xmlObj.name !== undefined && typeof xmlObj.name !== 'string') {
        throw new SpecValidationError(`XML Object at '${location}' has non-string 'name'.`);
    }
    if (xmlObj.prefix !== undefined && typeof xmlObj.prefix !== 'string') {
        throw new SpecValidationError(`XML Object at '${location}' has non-string 'prefix'.`);
    }
    if (xmlObj.namespace !== undefined) {
        if (typeof xmlObj.namespace !== 'string' || !isAbsoluteIri(xmlObj.namespace)) {
            throw new SpecValidationError(
                `XML Object at '${location}' must define a non-relative IRI for 'namespace'.`,
            );
        }
    }
    if (xmlObj.attribute !== undefined && typeof xmlObj.attribute !== 'boolean') {
        throw new SpecValidationError(`XML Object at '${location}' has non-boolean 'attribute'.`);
    }
    if (xmlObj.wrapped !== undefined && typeof xmlObj.wrapped !== 'boolean') {
        throw new SpecValidationError(`XML Object at '${location}' has non-boolean 'wrapped'.`);
    }
    if (xmlObj.wrapped === true) {
        const schemaType = getSchemaTypeKind(schema);
        if (schemaType !== 'array' && schemaType !== 'unknown') {
            throw new SpecValidationError(
                `XML Object at '${location}' defines 'wrapped' but the schema is not an array.`,
            );
        }
    }
}

function validateParameterStyle(param: Parameter, location: string): void {
    const allowedLocations = new Set(['query', 'path', 'header', 'cookie', 'querystring']);
    if (!allowedLocations.has(param.in)) {
        throw new SpecValidationError(
            `Parameter '${param.name}' in '${location}' has invalid location '${param.in}' for OpenAPI 3.x.`,
        );
    }

    if (param.style === undefined) return;

    if (typeof param.style !== 'string') {
        throw new SpecValidationError(`Parameter '${param.name}' in '${location}' has non-string 'style'.`);
    }

    const allowedStyles = PARAM_STYLE_BY_IN[param.in];
    if (!allowedStyles || !allowedStyles.has(param.style)) {
        throw new SpecValidationError(
            `Parameter '${param.name}' in '${location}' has invalid style '${param.style}' for location '${param.in}'.`,
        );
    }

    const schemaType = getSchemaTypeKind(param.schema);

    if (param.style === 'deepObject' && schemaType !== 'object' && schemaType !== 'unknown') {
        throw new SpecValidationError(
            `Parameter '${param.name}' in '${location}' uses 'deepObject' style but schema is not an object.`,
        );
    }

    if ((param.style === 'spaceDelimited' || param.style === 'pipeDelimited') && schemaType === 'primitive') {
        throw new SpecValidationError(
            `Parameter '${param.name}' in '${location}' uses '${param.style}' style but schema is not an array or object.`,
        );
    }

    if ((param.style === 'spaceDelimited' || param.style === 'pipeDelimited') && param.explode === true) {
        throw new SpecValidationError(
            `Parameter '${param.name}' in '${location}' uses '${param.style}' style with explode=true, which is not permitted.`,
        );
    }
}

const RESERVED_HEADER_NAMES = new Set(['accept', 'content-type', 'authorization']);

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
        validateTemplateBraces(url, `${location}[${index}].url`, 'Server url');

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
                if (typeof variable.default !== 'string') {
                    throw new SpecValidationError(
                        `Server variable "${varName}" must define a string default at ${location}[${index}].`,
                    );
                }
                if (variable.enum && variable.enum.length === 0) {
                    throw new SpecValidationError(
                        `Server variable "${varName}" enum MUST NOT be empty at ${location}[${index}].`,
                    );
                }
                if (variable.enum && !variable.enum.every((v: unknown) => typeof v === 'string')) {
                    throw new SpecValidationError(
                        `Server variable "${varName}" enum MUST contain only strings at ${location}[${index}].`,
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

function validateHttpsUrl(value: unknown, location: string, fieldName: string): void {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new SpecValidationError(`${fieldName} must be a non-empty string at ${location}.`);
    }
    if (!isUrl(value)) {
        throw new SpecValidationError(`${fieldName} must be a valid URL at ${location}. Value: "${value}"`);
    }
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') {
        throw new SpecValidationError(`${fieldName} must use https (TLS required) at ${location}. Value: "${value}"`);
    }
}

function validateOAuthFlow(flow: unknown, flowName: string, location: string): void {
    if (!flow || typeof flow !== 'object') {
        throw new SpecValidationError(`OAuth2 flow "${flowName}" must be an object at ${location}.`);
    }

    const f = flow as Record<string, unknown>;

    const requiresAuthorizationUrl = flowName === 'implicit' || flowName === 'authorizationCode';
    const requiresTokenUrl =
        flowName === 'password' ||
        flowName === 'clientCredentials' ||
        flowName === 'authorizationCode' ||
        flowName === 'deviceAuthorization';

    if (requiresAuthorizationUrl) {
        validateHttpsUrl(f.authorizationUrl, `${location}.${flowName}`, 'authorizationUrl');
    }
    if (requiresTokenUrl) {
        validateHttpsUrl(f.tokenUrl, `${location}.${flowName}`, 'tokenUrl');
    }
    if (flowName === 'deviceAuthorization') {
        validateHttpsUrl(f.deviceAuthorizationUrl, `${location}.${flowName}`, 'deviceAuthorizationUrl');
    }
    if (f.refreshUrl !== undefined) {
        validateHttpsUrl(f.refreshUrl, `${location}.${flowName}`, 'refreshUrl');
    }

    if (f.scopes === undefined || typeof f.scopes !== 'object') {
        throw new SpecValidationError(`OAuth2 flow "${flowName}" must define 'scopes' as an object at ${location}.`);
    }
}

function validateSecuritySchemes(
    schemes: Record<string, unknown> | undefined,
    location: string,
    isOpenApi3: boolean,
): void {
    if (!schemes || !isOpenApi3) return;

    for (const [name, rawScheme] of Object.entries(schemes)) {
        if (!rawScheme || typeof rawScheme !== 'object') {
            continue;
        }
        if (isRefLike(rawScheme)) {
            validateReferenceObject(rawScheme, `${location}.${name}`);
            continue;
        }

        const scheme = rawScheme as Record<string, unknown>;
        const type = scheme.type;

        if (typeof type !== 'string') {
            throw new SpecValidationError(`Security scheme "${name}" must define a string 'type' at ${location}.`);
        }

        switch (type) {
            case 'apiKey': {
                const keyName = scheme.name;
                const keyIn = scheme.in;

                if (typeof keyName !== 'string' || keyName.length === 0) {
                    throw new SpecValidationError(
                        `apiKey security scheme "${name}" must define non-empty 'name' at ${location}.`,
                    );
                }

                if (keyIn !== 'query' && keyIn !== 'header' && keyIn !== 'cookie') {
                    throw new SpecValidationError(
                        `apiKey security scheme "${name}" must define 'in' as 'query', 'header', or 'cookie' at ${location}.`,
                    );
                }
                break;
            }
            case 'http': {
                const httpScheme = scheme.scheme;
                if (typeof httpScheme !== 'string' || httpScheme.length === 0) {
                    throw new SpecValidationError(
                        `http security scheme "${name}" must define non-empty 'scheme' at ${location}.`,
                    );
                }
                break;
            }
            case 'oauth2': {
                const flows = scheme.flows;
                if (!flows || typeof flows !== 'object') {
                    throw new SpecValidationError(
                        `oauth2 security scheme "${name}" must define 'flows' at ${location}.`,
                    );
                }

                if (scheme.oauth2MetadataUrl !== undefined) {
                    validateHttpsUrl(scheme.oauth2MetadataUrl, `${location}.${name}`, 'oauth2MetadataUrl');
                }

                const flowEntries = Object.entries(flows as Record<string, unknown>);

                if (flowEntries.length === 0) {
                    throw new SpecValidationError(
                        `oauth2 security scheme "${name}" must define at least one flow at ${location}.`,
                    );
                }

                for (const [flowName, flowObj] of flowEntries) {
                    validateOAuthFlow(flowObj, flowName, `${location}.${name}.flows`);
                }
                break;
            }
            case 'openIdConnect': {
                validateHttpsUrl(scheme.openIdConnectUrl, `${location}.${name}`, 'openIdConnectUrl');
                break;
            }
            case 'mutualTLS': {
                break;
            }
            default: {
                throw new SpecValidationError(
                    `Security scheme "${name}" has unsupported type "${type}" at ${location}.`,
                );
            }
        }
    }
}

function isRefLike(obj: unknown): obj is { $ref?: string; $dynamicRef?: string } {
    if (!obj || typeof obj !== 'object') return false;
    return '$ref' in obj || '$dynamicRef' in obj;
}

function validateReferenceObject(refObj: unknown, location: string): void {
    if (!refObj || typeof refObj !== 'object') return;
    const obj = refObj as Record<string, unknown>;
    const hasRef = typeof obj.$ref === 'string';
    const hasDynamicRef = typeof obj.$dynamicRef === 'string';

    if (!hasRef && !hasDynamicRef) return;

    if (hasRef && hasDynamicRef) {
        throw new SpecValidationError(
            `Reference Object at '${location}' must not define both '$ref' and '$dynamicRef'.`,
        );
    }

    if (hasRef && !isUriReference(obj.$ref as string)) {
        throw new SpecValidationError(
            `Reference Object at '${location}' has invalid '$ref' URI. Value: "${String(obj.$ref)}"`,
        );
    }

    if (hasDynamicRef && !isUriReference(obj.$dynamicRef as string)) {
        throw new SpecValidationError(
            `Reference Object at '${location}' has invalid '$dynamicRef' URI. Value: "${String(obj.$dynamicRef)}"`,
        );
    }

    if (obj.summary !== undefined && typeof obj.summary !== 'string') {
        throw new SpecValidationError(
            `Reference Object at '${location}' has non-string 'summary'. Value: "${String(obj.summary)}"`,
        );
    }

    if (obj.description !== undefined && typeof obj.description !== 'string') {
        throw new SpecValidationError(
            `Reference Object at '${location}' has non-string 'description'. Value: "${String(obj.description)}"`,
        );
    }
}

function validateUniqueParameters(params: unknown, location: string): void {
    if (!Array.isArray(params)) return;
    const seen = new Set<string>();
    for (const param of params as unknown[]) {
        if (!param || typeof param !== 'object') continue;

        const name = (param as { name?: unknown }).name;
        const loc = (param as { in?: unknown }).in;

        if (typeof name !== 'string' || typeof loc !== 'string') continue;

        const normalizedName = loc.toLowerCase() === 'header' ? name.toLowerCase() : name;

        const key = `${normalizedName}:${loc}`;

        if (seen.has(key)) {
            throw new SpecValidationError(
                `Duplicate parameter '${name}' in '${location}'. Parameter names must be unique per location.`,
            );
        }
        seen.add(key);
    }
}

/**
 * Validates OAS 3.2 Example Object field exclusivity and basic typing.
 */
function validateExampleObject(exampleObj: unknown, location: string): void {
    if (!exampleObj || typeof exampleObj !== 'object') return;

    if (isRefLike(exampleObj)) {
        validateReferenceObject(exampleObj, location);
        return;
    }

    const example = exampleObj as {
        value?: unknown;
        dataValue?: unknown;
        serializedValue?: unknown;
        externalValue?: unknown;
    };

    const hasValue = example.value !== undefined;
    const hasDataValue = example.dataValue !== undefined;
    const hasSerialized = example.serializedValue !== undefined;
    const hasExternal = example.externalValue !== undefined;

    if (hasValue && hasDataValue) {
        throw new SpecValidationError(
            `Example Object at '${location}' cannot define both 'value' and 'dataValue'. These fields are mutually exclusive.`,
        );
    }

    if (hasValue && hasSerialized) {
        throw new SpecValidationError(
            `Example Object at '${location}' cannot define both 'value' and 'serializedValue'. These fields are mutually exclusive.`,
        );
    }

    if (hasValue && hasExternal) {
        throw new SpecValidationError(
            `Example Object at '${location}' cannot define both 'value' and 'externalValue'. These fields are mutually exclusive.`,
        );
    }

    if (hasSerialized && hasExternal) {
        throw new SpecValidationError(
            `Example Object at '${location}' cannot define both 'serializedValue' and 'externalValue'. These fields are mutually exclusive.`,
        );
    }

    if (hasSerialized && typeof example.serializedValue !== 'string') {
        throw new SpecValidationError(
            `Example Object at '${location}' has a non-string 'serializedValue'. It MUST be a string.`,
        );
    }

    if (hasExternal && typeof example.externalValue !== 'string') {
        throw new SpecValidationError(
            `Example Object at '${location}' has a non-string 'externalValue'. It MUST be a string.`,
        );
    }
}

function normalizeMediaType(value: string | undefined): string {
    if (!value) return '';
    return value.split(';')[0].trim().toLowerCase();
}

function isMultipartMediaType(mediaType: string | undefined): boolean {
    const normalized = normalizeMediaType(mediaType);
    return normalized.startsWith('multipart/');
}

const SEQUENTIAL_MEDIA_TYPES = new Set([
    'application/json-seq',
    'application/geo+json-seq',
    'application/jsonl',
    'application/jsonlines',
    'application/x-ndjson',
    'application/ndjson',
    'application/x-jsonlines',
    'text/event-stream',
    'multipart/mixed',
]);

const SEQUENTIAL_MEDIA_SUFFIXES = new Set([
    '+json-seq',
    '+jsonl',
    '+ndjson',
    '/json-seq',
    '/jsonl',
    '/ndjson',
    '/x-ndjson',
]);

function isSequentialMediaType(mediaType: string | undefined): boolean {
    const normalized = normalizeMediaType(mediaType);
    if (!normalized) return false;
    if (normalized.startsWith('multipart/')) return true;

    if (SEQUENTIAL_MEDIA_TYPES.has(normalized)) return true;

    for (const suffix of SEQUENTIAL_MEDIA_SUFFIXES) {
        if (normalized.endsWith(suffix)) return true;
    }
    return false;
}

function isCustomSequentialJsonMediaType(mediaType: string | undefined): boolean {
    const normalized = normalizeMediaType(mediaType);
    if (!normalized) return false;

    if (normalized === 'application/json' || normalized === '*/*') return false;
    if (normalized.startsWith('multipart/')) return false;

    return normalized.includes('json') || normalized.endsWith('+json');
}

function isFormUrlEncodedMediaType(mediaType: string | undefined): boolean {
    return normalizeMediaType(mediaType) === 'application/x-www-form-urlencoded';
}

function validateEncodingObject(encodingObj: unknown, location: string): void {
    if (!encodingObj || typeof encodingObj !== 'object' || Array.isArray(encodingObj)) {
        throw new SpecValidationError(`Encoding Object at '${location}' must be an object.`);
    }

    const encoding = encodingObj as {
        contentType?: unknown;
        headers?: Record<string, unknown>;
        style?: unknown;
        explode?: unknown;
        allowReserved?: unknown;
        encoding?: Record<string, unknown>;
        prefixEncoding?: unknown;
        itemEncoding?: unknown;
    };

    if (encoding.contentType !== undefined && typeof encoding.contentType !== 'string') {
        throw new SpecValidationError(`Encoding Object at '${location}' has non-string 'contentType'.`);
    }

    if (encoding.style !== undefined && typeof encoding.style !== 'string') {
        throw new SpecValidationError(`Encoding Object at '${location}' has non-string 'style'.`);
    }

    if (encoding.style !== undefined) {
        const allowedStyles = PARAM_STYLE_BY_IN['query'];

        if (!allowedStyles || !allowedStyles.has(encoding.style as string)) {
            throw new SpecValidationError(
                `Encoding Object at '${location}' has invalid 'style' value '${encoding.style}'.`,
            );
        }
    }

    if (encoding.explode !== undefined && typeof encoding.explode !== 'boolean') {
        throw new SpecValidationError(`Encoding Object at '${location}' has non-boolean 'explode'.`);
    }

    if (encoding.allowReserved !== undefined && typeof encoding.allowReserved !== 'boolean') {
        throw new SpecValidationError(`Encoding Object at '${location}' has non-boolean 'allowReserved'.`);
    }

    if (encoding.headers !== undefined) {
        if (typeof encoding.headers !== 'object' || Array.isArray(encoding.headers)) {
            throw new SpecValidationError(`Encoding Object at '${location}' has invalid 'headers' map.`);
        }

        Object.entries(encoding.headers as Record<string, unknown>).forEach(([headerName, headerObj]) => {
            if (headerName.toLowerCase() === 'content-type') {
                throw new SpecValidationError(
                    `Encoding Object at '${location}' MUST NOT define 'Content-Type' in headers. Use 'contentType' instead.`,
                );
            }
            validateHeaderObject(headerObj, `${location}.headers.${headerName}`, true);
        });
    }

    const hasEncoding = encoding.encoding !== undefined;
    const hasPrefixEncoding = encoding.prefixEncoding !== undefined;
    const hasItemEncoding = encoding.itemEncoding !== undefined;

    if (hasEncoding && (hasPrefixEncoding || hasItemEncoding)) {
        throw new SpecValidationError(
            `Encoding Object at '${location}' defines 'encoding' alongside 'prefixEncoding' or 'itemEncoding'. These fields are mutually exclusive.`,
        );
    }

    if (encoding.encoding !== undefined) {
        if (typeof encoding.encoding !== 'object' || Array.isArray(encoding.encoding)) {
            throw new SpecValidationError(`Encoding Object at '${location}' has invalid nested 'encoding' map.`);
        }

        Object.entries(encoding.encoding as Record<string, unknown>).forEach(([key, value]) => {
            validateEncodingObject(value, `${location}.encoding.${key}`);
        });
    }

    if (encoding.prefixEncoding !== undefined) {
        if (!Array.isArray(encoding.prefixEncoding)) {
            throw new SpecValidationError(
                `Encoding Object at '${location}' has invalid 'prefixEncoding'. It must be an array.`,
            );
        }

        (encoding.prefixEncoding as unknown[]).forEach((value, index) => {
            validateEncodingObject(value, `${location}.prefixEncoding[${index}]`);
        });
    }

    if (encoding.itemEncoding !== undefined) {
        validateEncodingObject(encoding.itemEncoding, `${location}.itemEncoding`);
    }
}

function validateMediaTypeObject(mediaObj: unknown, location: string, mediaType?: string): void {
    if (!mediaObj || typeof mediaObj !== 'object') return;

    if (isRefLike(mediaObj)) {
        validateReferenceObject(mediaObj, location);
        return;
    }

    const media = mediaObj as {
        example?: unknown;
        examples?: unknown;
        encoding?: unknown;
        prefixEncoding?: unknown;
        itemEncoding?: unknown;
        schema?: unknown;
        itemSchema?: unknown;
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

    if (hasEncoding || hasPrefixEncoding || hasItemEncoding) {
        const isMultipart = isMultipartMediaType(mediaType);
        const isForm = isFormUrlEncodedMediaType(mediaType);

        if (hasEncoding && !isMultipart && !isForm) {
            throw new SpecValidationError(
                `Media Type Object at '${location}' uses 'encoding' but media type "${mediaType}" does not support it.`,
            );
        }

        if ((hasPrefixEncoding || hasItemEncoding) && !isMultipart) {
            throw new SpecValidationError(
                `Media Type Object at '${location}' uses positional encoding but media type "${mediaType}" is not multipart.`,
            );
        }
    }

    if (media.examples && typeof media.examples === 'object') {
        Object.entries(media.examples as Record<string, unknown>).forEach(([name, example]) => {
            validateExampleObject(example, `${location}.examples.${name}`);
        });
    }

    if (media.encoding !== undefined) {
        if (typeof media.encoding !== 'object' || Array.isArray(media.encoding)) {
            throw new SpecValidationError(`Media Type Object at '${location}' has invalid 'encoding' map.`);
        }

        Object.entries(media.encoding as Record<string, unknown>).forEach(([key, value]) => {
            validateEncodingObject(value, `${location}.encoding.${key}`);
        });
    }

    if (media.prefixEncoding !== undefined) {
        if (!Array.isArray(media.prefixEncoding)) {
            throw new SpecValidationError(
                `Media Type Object at '${location}' has invalid 'prefixEncoding'. It must be an array.`,
            );
        }

        (media.prefixEncoding as unknown[]).forEach((value, index) => {
            validateEncodingObject(value, `${location}.prefixEncoding[${index}]`);
        });
    }

    if (media.itemEncoding !== undefined) {
        validateEncodingObject(media.itemEncoding, `${location}.itemEncoding`);
    }

    if (media.schema !== undefined) {
        validateSchemaExternalDocs(media.schema, `${location}.schema`);
    }

    if (media.itemSchema !== undefined) {
        const allowsItemSchema =
            mediaType &&
            (isSequentialMediaType(mediaType) ||
                // Allow custom JSON-based sequential media types when itemSchema is present.
                isCustomSequentialJsonMediaType(mediaType));

        if (mediaType && !allowsItemSchema) {
            throw new SpecValidationError(
                `Media Type Object at '${location}' defines 'itemSchema' but media type "${mediaType}" is not sequential.`,
            );
        }
        validateSchemaExternalDocs(media.itemSchema, `${location}.itemSchema`);
    }
}

function validateContentMap(content: Record<string, unknown> | undefined, location: string): void {
    if (!content) return;

    for (const [mediaType, mediaObj] of Object.entries(content)) {
        validateMediaTypeObject(mediaObj, `${location}.${mediaType}`, mediaType);
    }
}

function validateHeaderObject(headerObj: unknown, location: string, isOpenApi3: boolean): void {
    if (!headerObj || typeof headerObj !== 'object') return;

    if (isRefLike(headerObj)) {
        validateReferenceObject(headerObj, location);
        return;
    }

    const header = headerObj as {
        schema?: unknown;
        content?: Record<string, unknown>;
        name?: unknown;
        in?: unknown;
        style?: unknown;
        allowEmptyValue?: unknown;
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

    if (header.examples && typeof header.examples === 'object') {
        Object.entries(header.examples as Record<string, unknown>).forEach(([name, example]) => {
            validateExampleObject(example, `${location}.examples.${name}`);
        });
    }

    if (isOpenApi3 && header.schema === undefined && header.content === undefined) {
        throw new SpecValidationError(`Header Object at '${location}' must define either 'schema' or 'content'.`);
    }

    if (header.schema !== undefined && header.content !== undefined) {
        throw new SpecValidationError(
            `Header Object at '${location}' contains both 'schema' and 'content'. These fields are mutually exclusive.`,
        );
    }

    if (header.schema !== undefined) {
        validateSchemaExternalDocs(header.schema, `${location}.schema`);
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

function validateHeadersMap(headers: Record<string, unknown> | undefined, location: string, isOpenApi3: boolean): void {
    if (!headers) return;

    for (const [headerName, headerObj] of Object.entries(headers)) {
        if (headerName.toLowerCase() === 'content-type') {
            // OAS 3.2: Response header definitions named "Content-Type" are ignored.
            continue;
        }
        validateHeaderObject(headerObj, `${location}.${headerName}`, isOpenApi3);
    }
}

function validateLinkObject(linkObj: unknown, location: string): void {
    if (!linkObj || typeof linkObj !== 'object') return;

    if (isRefLike(linkObj)) {
        validateReferenceObject(linkObj, location);
        return;
    }

    const link = linkObj as {
        operationId?: unknown;
        operationRef?: unknown;
        parameters?: unknown;
        requestBody?: unknown;
        server?: unknown;
    };

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

    if (hasOperationRef && typeof link.operationRef === 'string' && !isUriReference(link.operationRef)) {
        throw new SpecValidationError(
            `Link Object at '${location}' has invalid 'operationRef'. It must be a valid URI reference.`,
        );
    }

    if (link.parameters !== undefined) {
        if (typeof link.parameters !== 'object' || Array.isArray(link.parameters) || link.parameters === null) {
            throw new SpecValidationError(
                `Link Object at '${location}' has invalid 'parameters'. It must be an object map.`,
            );
        }
        Object.entries(link.parameters as Record<string, unknown>).forEach(([name, value]) => {
            if (typeof value === 'string') {
                validateRuntimeExpressionTemplate(value, `${location}.parameters.${name}`, 'optional');
            }
        });
    }

    if (typeof link.requestBody === 'string') {
        validateRuntimeExpressionTemplate(link.requestBody, `${location}.requestBody`, 'optional');
    }

    if (link.server !== undefined) {
        validateServers([link.server as ServerObject], `${location}.server`);
    }
}

function validateLinksMap(links: Record<string, unknown> | undefined, location: string): void {
    if (!links) return;

    for (const [linkName, linkObj] of Object.entries(links)) {
        validateLinkObject(linkObj, `${location}.${linkName}`);
    }
}

function validateRequestBody(requestBody: unknown, location: string): void {
    if (!requestBody || typeof requestBody !== 'object') return;

    if (isRefLike(requestBody)) {
        validateReferenceObject(requestBody, location);
        return;
    }

    const body = requestBody as { content?: Record<string, unknown> };

    if (body.content === undefined) {
        throw new SpecValidationError(`RequestBody Object at '${location}' must define 'content'.`);
    }

    if (typeof body.content !== 'object' || Array.isArray(body.content)) {
        throw new SpecValidationError(
            `RequestBody Object at '${location}' has invalid 'content'. It must be an object.`,
        );
    }

    validateContentMap(body.content, `${location}.content`);
}

function validateResponseObject(responseObj: unknown, location: string, isOpenApi3: boolean): void {
    if (!responseObj || typeof responseObj !== 'object') return;

    if (isRefLike(responseObj)) {
        validateReferenceObject(responseObj, location);
        return;
    }

    const response = responseObj as {
        description?: unknown;
        headers?: Record<string, unknown>;
        content?: Record<string, unknown>;
        links?: Record<string, unknown>;
    };

    if (response.description === undefined) {
        throw new SpecValidationError(`Response Object at '${location}' must define a 'description' field.`);
    }

    if (typeof response.description !== 'string') {
        throw new SpecValidationError(`Response Object at '${location}' has non-string 'description'.`);
    }

    if (response.headers) {
        validateHeadersMap(response.headers, `${location}.headers`, isOpenApi3);
    }

    if (response.content) {
        validateContentMap(response.content, `${location}.content`);
    }

    if (response.links) {
        validateLinksMap(response.links, `${location}.links`);
    }
}

function validateResponses(
    responses: Record<string, unknown> | undefined,
    location: string,
    isOpenApi3: boolean,
): void {
    if (!responses) return;

    if (Object.keys(responses).length === 0) {
        throw new SpecValidationError(`Responses Object at '${location}' must define at least one response code.`);
    }

    for (const [status, responseObj] of Object.entries(responses)) {
        if (!isValidResponseCode(status)) {
            throw new SpecValidationError(`Responses Object at '${location}' has invalid status code '${status}'.`);
        }
        validateResponseObject(responseObj, `${location}.${status}`, isOpenApi3);
    }
}

function validateComponentResponses(
    responses: Record<string, unknown> | undefined,
    location: string,
    isOpenApi3: boolean,
): void {
    if (!responses) return;

    for (const [name, responseObj] of Object.entries(responses)) {
        validateResponseObject(responseObj, `${location}.${name}`, isOpenApi3);
    }
}

function isValidResponseCode(status: string): boolean {
    const normalized = String(status).toUpperCase();
    if (normalized === 'DEFAULT') return true;
    if (/^[1-5]\d{2}$/.test(normalized)) return true;
    if (/^[1-5]XX$/.test(normalized)) return true;
    return false;
}

function validatePathItemOperations(pathItem: unknown, location: string, isOpenApi3: boolean): void {
    if (!pathItem || typeof pathItem !== 'object') return;

    if (isRefLike(pathItem)) {
        validateReferenceObject(pathItem, location);
        return;
    }

    const operationKeys = ['get', 'post', 'put', 'delete', 'options', 'head', 'patch', 'trace', 'query'];
    const pi = pathItem as Record<string, unknown>;

    for (const method of operationKeys) {
        const operation = pi[method] as Record<string, unknown> | undefined;
        if (operation) {
            if (operation.responses === undefined) {
                throw new SpecValidationError(`Operation Object at '${location}.${method}' must define 'responses'.`);
            }
            if (operation.externalDocs) {
                validateExternalDocsObject(operation.externalDocs, `${location}.${method}.externalDocs`);
            }
            validateRequestBody(operation.requestBody, `${location}.${method}.requestBody`);
            validateResponses(
                operation.responses as Record<string, unknown>,
                `${location}.${method}.responses`,
                isOpenApi3,
            );
        }
    }

    if (pi.additionalOperations) {
        for (const [method, opVal] of Object.entries(pi.additionalOperations as Record<string, unknown>)) {
            const operation = opVal as Record<string, unknown> | undefined;
            if (operation?.responses === undefined) {
                throw new SpecValidationError(
                    `Operation Object at '${location}.additionalOperations.${method}' must define 'responses'.`,
                );
            }
            if (operation?.externalDocs) {
                validateExternalDocsObject(
                    operation.externalDocs,
                    `${location}.additionalOperations.${method}.externalDocs`,
                );
            }
            validateRequestBody(operation?.requestBody, `${location}.additionalOperations.${method}.requestBody`);
            validateResponses(
                operation?.responses as Record<string, unknown>,
                `${location}.additionalOperations.${method}.responses`,
                isOpenApi3,
            );
        }
    }
}

function validateOperationsContent(
    paths: Record<string, unknown> | undefined,
    locationPrefix: string,
    isOpenApi3: boolean,
): void {
    if (!paths) return;

    for (const [pathKey, pathItem] of Object.entries(paths)) {
        if (!pathItem || typeof pathItem !== 'object') continue;
        validatePathItemOperations(pathItem, `${locationPrefix}${pathKey}`, isOpenApi3);
    }
}

/**
 * Validates that a parsed object conforms to the basic structure of a Swagger 2.0 or OpenAPI 3.x specification.
 * Checks for:
 * - Valid version string ('swagger: "2.x"' or 'openapi: "3.x"')
 * - "info" object with "title" and "version"
 * - Info Object field constraints (termsOfService/contact/license URI/email)
 * - At least one functional root property ("paths", "components", or "webhooks")
 * - License Object constraints (mutually exclusive `url` and `identifier`)
 * - Strict regex compliance for component keys (OAS 3.x)
 * - Path Template Hierarchy collisions (OAS 3.2)
 * - Path keys must start with "/" (OAS 3.x)
 * - Parameter exclusivity rules (OAS 3.2):
 *    - `in: "query"` is exclusive with `in: "querystring"` in same operation.
 *    - `example` and `examples` are mutually exclusive on Parameter/Object.
 *    - `content` and `schema` are mutually exclusive on Parameter Objects.
 *    - Parameter Objects MUST include either `schema` or `content`.
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

    // 2a. OpenAPI 3.2 $self validation (URI reference)
    if (isOpenApi3 && spec.$self !== undefined) {
        if (typeof spec.$self !== 'string' || !isUriReference(spec.$self)) {
            throw new SpecValidationError(
                `OpenAPI Object $self must be a valid URI reference. Value: "${String(spec.$self)}"`,
            );
        }
    }

    // 2b. Info Object URI/email fields
    if (spec.info.termsOfService !== undefined) {
        if (typeof spec.info.termsOfService !== 'string' || !isUriReference(spec.info.termsOfService)) {
            throw new SpecValidationError(
                `Info.termsOfService must be a valid URI. Value: "${String(spec.info.termsOfService)}"`,
            );
        }
    }

    if (spec.info.contact) {
        const contact = spec.info.contact as { url?: unknown; email?: unknown };
        if (contact.url !== undefined) {
            if (typeof contact.url !== 'string' || !isUriReference(contact.url)) {
                throw new SpecValidationError(`Info.contact.url must be a valid URI. Value: "${String(contact.url)}"`);
            }
        }
        if (contact.email !== undefined) {
            if (typeof contact.email !== 'string' || !isEmailAddress(contact.email)) {
                throw new SpecValidationError(
                    `Info.contact.email must be a valid email address. Value: "${String(contact.email)}"`,
                );
            }
        }
    }

    if (spec.externalDocs) {
        validateExternalDocsObject(spec.externalDocs, 'externalDocs');
    }

    // 3. Check License Object Constraints (OAS 3.1+)
    // "The `identifier` field is mutually exclusive of the `url` field."
    if (spec.info.license) {
        if (!spec.info.license.name || typeof spec.info.license.name !== 'string') {
            throw new SpecValidationError("License object must contain a required string field: 'name'.");
        }
        const hasUrl = spec.info.license.url !== undefined && spec.info.license.url !== null;
        const hasIdentifier = spec.info.license.identifier !== undefined && spec.info.license.identifier !== null;

        if (hasUrl && hasIdentifier) {
            throw new SpecValidationError(
                "License object cannot contain both 'url' and 'identifier' fields. They are mutually exclusive.",
            );
        }
        if (hasUrl && typeof spec.info.license.url === 'string' && !isUriReference(spec.info.license.url)) {
            throw new SpecValidationError(
                `Info.license.url must be a valid URI. Value: "${String(spec.info.license.url)}"`,
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

    const collectOperationIds = (paths: Record<string, unknown> | undefined, locationPrefix: string) => {
        if (!paths) return;

        for (const [pathKey, pVal] of Object.entries(paths)) {
            const pathItem = pVal as Record<string, unknown>;
            if (!pathItem || typeof pathItem !== 'object') continue;

            for (const method of operationKeys) {
                const operation = pathItem[method] as Record<string, unknown> | undefined;
                if (operation?.operationId) {
                    recordOperationId(
                        operation.operationId as string,
                        `${locationPrefix}${pathKey} ${method.toUpperCase()}`,
                    );
                }
            }

            const addOps = pathItem.additionalOperations as Record<string, unknown> | undefined;
            if (addOps) {
                for (const [method, opVal] of Object.entries(addOps)) {
                    const operation = opVal as Record<string, unknown> | undefined;
                    if (operation?.operationId) {
                        recordOperationId(operation.operationId as string, `${locationPrefix}${pathKey} ${method}`);
                    }
                }
            }
        }
    };

    const collectCallbackPathItems = (
        paths: Record<string, unknown> | undefined,
        locationPrefix: string,
    ): Record<string, unknown> => {
        const callbacks: Record<string, unknown> = {};
        if (!paths) return callbacks;

        const visitOperation = (operation: unknown, opLocation: string) => {
            if (!operation || typeof operation !== 'object') return;

            const cbMap = (operation as Record<string, unknown>).callbacks;
            if (!cbMap || typeof cbMap !== 'object') return;

            for (const [callbackName, callbackObj] of Object.entries(cbMap as Record<string, unknown>)) {
                if (!callbackObj || typeof callbackObj !== 'object') continue;

                if (isRefLike(callbackObj)) {
                    validateReferenceObject(callbackObj, `${opLocation}.callbacks.${callbackName}`);
                    continue;
                }

                for (const [expression, callbackPathItem] of Object.entries(callbackObj as Record<string, unknown>)) {
                    if (!callbackPathItem || typeof callbackPathItem !== 'object') continue;
                    validateCallbackExpression(expression, `${opLocation}.callbacks.${callbackName}.${expression}`);
                    validatePathItemOperations(
                        callbackPathItem,
                        `${opLocation}.callbacks.${callbackName}.${expression}`,
                        isOpenApi3,
                    );
                    callbacks[`${opLocation}.callbacks.${callbackName}.${expression}`] = callbackPathItem;
                }
            }
        };

        for (const [pathKey, pVal] of Object.entries(paths)) {
            const pathItem = pVal as Record<string, unknown>;
            if (!pathItem || typeof pathItem !== 'object') continue;

            for (const method of operationKeys) {
                const operation = pathItem[method];
                if (operation) {
                    visitOperation(operation, `${locationPrefix}${pathKey}.${method}`);
                }
            }

            const addOps = pathItem.additionalOperations as Record<string, unknown> | undefined;
            if (addOps) {
                for (const [method, operation] of Object.entries(addOps)) {
                    visitOperation(operation, `${locationPrefix}${pathKey}.additionalOperations.${method}`);
                }
            }
        }

        return callbacks;
    };

    if (spec.paths) {
        const signatures = new Map<string, string>(); // Signature -> Original Path key

        for (const pathKey of Object.keys(spec.paths)) {
            const pathItemObj = spec.paths[pathKey] as Record<string, unknown>;
            const pathItemRec = pathItemObj;

            const templateParams = getPathTemplateParams(pathKey);
            const templateParamSet = new Set(templateParams);
            const hasTemplateParams = templateParams.length > 0;

            const hasOperations =
                operationKeys.some(method => pathItemRec[method]) ||
                (pathItemRec.additionalOperations &&
                    Object.keys(pathItemRec.additionalOperations as Record<string, unknown>).length > 0);

            const hasPathParams = Array.isArray(pathItemObj.parameters) && pathItemObj.parameters.length > 0;
            // OAS 3.2: If the Path Item is empty (e.g., ACL constraints), template params are not required.
            const isEmptyPathItem = !hasOperations && !hasPathParams;
            const skipPathTemplateValidation = !!pathItemRec.$ref || isEmptyPathItem;

            // 4a. Paths Object field pattern: keys MUST start with "/"
            if (!pathKey.startsWith('/')) {
                throw new SpecValidationError(`Path key "${pathKey}" must start with "/".`);
            }

            validateTemplateBraces(pathKey, `paths.${pathKey}`, 'Path template');

            // 4a. Template Variable Uniqueness (OAS 3.2 Requirement)
            // Each template expression MUST NOT appear more than once in a single path template.
            if (hasTemplateParams) {
                const duplicates = templateParams.filter((param, index) => templateParams.indexOf(param) !== index);
                if (duplicates.length > 0) {
                    throw new SpecValidationError(
                        `Path template "${pathKey}" repeats template variable(s): ${[...new Set(duplicates)].join(', ')}`,
                    );
                }
            }

            // 3.2 AdditionalOperations guard: disallow fixed HTTP methods in the map.
            if (isOpenApi3 && pathItemRec.additionalOperations) {
                const additionalOps = pathItemRec.additionalOperations as Record<string, unknown>;
                for (const methodKey of Object.keys(additionalOps)) {
                    if (!HTTP_METHOD_TOKEN.test(methodKey)) {
                        throw new SpecValidationError(
                            `Path '${pathKey}' defines additionalOperations method "${methodKey}" which is not a valid HTTP method token.`,
                        );
                    }
                    const normalized = methodKey.toLowerCase();
                    if (operationKeys.includes(normalized)) {
                        throw new SpecValidationError(
                            `Path '${pathKey}' defines additionalOperations method "${methodKey}" which conflicts with a fixed HTTP method. ` +
                                `Use the corresponding fixed field (e.g. "${normalized}") instead.`,
                        );
                    }
                }

                for (const [methodKey, operation] of Object.entries(additionalOps)) {
                    if (operation && typeof operation === 'object') {
                        const opRec = operation as Record<string, unknown>;
                        if (opRec.responses === undefined) {
                            throw new SpecValidationError(
                                `Operation Object at 'paths.${pathKey}.additionalOperations.${methodKey}' must define 'responses'.`,
                            );
                        }
                        if (opRec.externalDocs) {
                            validateExternalDocsObject(
                                opRec.externalDocs,
                                `${pathKey}.additionalOperations.${methodKey}.externalDocs`,
                            );
                        }
                        validateUniqueParameters(
                            opRec.parameters,
                            `${pathKey}.additionalOperations.${methodKey}.parameters`,
                        );
                    }
                }
            }

            // 4. Path Template Hierarchy Validation (OAS 3.2 Requirement)
            const signature = getPathTemplateSignature(pathKey);

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
            const pathParams = (pathItemObj.parameters || []) as Parameter[];
            validateUniqueParameters(pathParams, `${pathKey}.parameters`);

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
                const operation = pathItemRec[method] as Record<string, unknown> | undefined;
                if (operation) {
                    if (isOpenApi3 && operation.responses === undefined) {
                        throw new SpecValidationError(
                            `Operation Object at 'paths.${pathKey}.${method}' must define 'responses'.`,
                        );
                    }
                    if (operation.externalDocs) {
                        validateExternalDocsObject(operation.externalDocs, `${pathKey}.${method}.externalDocs`);
                    }

                    const opParams = (operation.parameters || []) as Parameter[];
                    validateUniqueParameters(opParams, `${pathKey}.${method}.parameters`);

                    const allParams = [...pathParams, ...opParams];

                    // 5a. Path Template Parameter Validation
                    if (hasTemplateParams && !skipPathTemplateValidation) {
                        for (const name of templateParamSet) {
                            const hasParam = allParams.some(
                                p =>
                                    !!p &&
                                    typeof p === 'object' &&
                                    (p as unknown as Record<string, unknown>).in === 'path' &&
                                    (p as unknown as Record<string, unknown>).name === name,
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

                    if (hasQuerystring) {
                        const querystringParams = allParams.filter(p => p.in === 'querystring');
                        if (querystringParams.length > 1) {
                            throw new SpecValidationError(
                                `Operation '${method.toUpperCase()} ${pathKey}' defines more than one 'querystring' parameter. Only one is allowed.`,
                            );
                        }
                    }

                    for (const [index, param] of allParams.entries()) {
                        if (!param || typeof param !== 'object') {
                            throw new SpecValidationError(
                                `Parameter in '${method.toUpperCase()} ${pathKey}' must be an object or Reference Object.`,
                            );
                        }

                        if (isRefLike(param)) {
                            validateReferenceObject(param, `${method.toUpperCase()} ${pathKey}.parameters[${index}]`);
                            continue;
                        }

                        const paramRec = param as unknown as Record<string, unknown>;

                        if (typeof paramRec.name !== 'string' || paramRec.name.trim().length === 0) {
                            throw new SpecValidationError(
                                `Parameter in '${method.toUpperCase()} ${pathKey}' must define a non-empty string 'name'.`,
                            );
                        }

                        if (typeof paramRec.in !== 'string' || paramRec.in.trim().length === 0) {
                            throw new SpecValidationError(
                                `Parameter '${paramRec.name}' in '${method.toUpperCase()} ${pathKey}' must define a non-empty string 'in'.`,
                            );
                        }

                        if (
                            param.in === 'header' &&
                            typeof param.name === 'string' &&
                            RESERVED_HEADER_NAMES.has(param.name.toLowerCase())
                        ) {
                            continue;
                        }

                        if (!skipPathTemplateValidation && paramRec.in === 'path' && paramRec.name) {
                            validatePathParam(param as Parameter, `${method.toUpperCase()} ${pathKey}`);
                        }

                        // 5b. Examples Exclusivity
                        if (param.example !== undefined && param.examples !== undefined) {
                            throw new SpecValidationError(
                                `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' contains both 'example' and 'examples'. These fields are mutually exclusive.`,
                            );
                        }

                        if (param.examples && typeof param.examples === 'object') {
                            Object.entries(param.examples as Record<string, unknown>).forEach(([name, example]) => {
                                validateExampleObject(
                                    example,
                                    `${method.toUpperCase()} ${pathKey}.parameters.${param.name}.examples.${name}`,
                                );
                            });
                        }

                        if (param.schema !== undefined) {
                            validateSchemaExternalDocs(
                                param.schema,
                                `${method.toUpperCase()} ${pathKey}.parameters.${param.name}.schema`,
                            );
                        }

                        if (isOpenApi3) {
                            // 5b.1 Require schema or content (OAS 3.2)
                            if (param.schema === undefined && param.content === undefined) {
                                throw new SpecValidationError(
                                    `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' must define either 'schema' or 'content'.`,
                                );
                            }

                            // 5c. Schema vs Content Exclusivity (OAS 3.2)
                            if (param.schema !== undefined && param.content !== undefined) {
                                throw new SpecValidationError(
                                    `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' contains both 'schema' and 'content'. These fields are mutually exclusive.`,
                                );
                            }

                            // strict content map check (OAS 3.2)
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
                                if (param.style) {
                                    throw new SpecValidationError(
                                        `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' defines 'allowEmptyValue' alongside 'style'. This is forbidden.`,
                                    );
                                }
                            }
                        }

                        // 5d. Querystring Strictness (OAS 3.2)
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

                            if (param.schema !== undefined) {
                                throw new SpecValidationError(
                                    `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' has location 'querystring' but defines 'schema'. Querystring parameters MUST use 'content' instead.`,
                                );
                            }

                            if (param.content === undefined) {
                                throw new SpecValidationError(
                                    `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' has location 'querystring' but is missing 'content'. Querystring parameters MUST use 'content'.`,
                                );
                            }
                        }

                        if (isOpenApi3) {
                            validateParameterStyle(
                                param as Parameter,
                                `${method.toUpperCase()} ${pathKey}.parameters.${param.name}`,
                            );
                        }

                        if (isOpenApi3 && param.content) {
                            validateContentMap(
                                param.content as Record<string, unknown>,
                                `paths.${pathKey}.${method}.parameters.${param.name}.content`,
                            );
                        }
                    }

                    if (isOpenApi3) {
                        validateRequestBody(operation.requestBody, `paths.${pathKey}.${method}.requestBody`);
                        validateResponses(
                            operation.responses as Record<string, unknown>,
                            `paths.${pathKey}.${method}.responses`,
                            isOpenApi3,
                        );
                    }
                }
            }
        }
    }

    const callbackPaths = {
        ...collectCallbackPathItems(spec.paths as Record<string, unknown> | undefined, 'paths.'),
        ...collectCallbackPathItems(spec.webhooks as Record<string, unknown> | undefined, 'webhooks.'),
    };

    if (isOpenApi3) {
        validateOperationsContent(spec.webhooks as Record<string, unknown> | undefined, 'webhooks.', isOpenApi3);
        if (Object.keys(callbackPaths).length > 0) {
            validateOperationsContent(callbackPaths, 'callbacks.', isOpenApi3);
        }
    }

    if (isOpenApi3) {
        // 5e. Server Object Validation (OAS 3.x)
        validateServers(spec.servers, 'servers');

        const validateServerLocations = (paths: Record<string, unknown> | undefined, locationPrefix: string) => {
            if (!paths) return;

            for (const [pathKey, pVal] of Object.entries(paths)) {
                const pathItem = pVal as Record<string, unknown>;
                if (!pathItem || typeof pathItem !== 'object') continue;

                if (pathItem.servers) {
                    validateServers(pathItem.servers as ServerObject[], `${locationPrefix}${pathKey}.servers`);
                }

                for (const method of operationKeys) {
                    const operation = pathItem[method] as Record<string, unknown> | undefined;
                    if (operation?.servers) {
                        validateServers(
                            operation.servers as ServerObject[],
                            `${locationPrefix}${pathKey}.${method}.servers`,
                        );
                    }
                }

                const addOps = pathItem.additionalOperations as Record<string, unknown> | undefined;
                if (addOps) {
                    for (const [method, opVal] of Object.entries(addOps)) {
                        const operation = opVal as Record<string, unknown> | undefined;
                        if (operation?.servers) {
                            validateServers(
                                operation.servers as ServerObject[],
                                `${locationPrefix}${pathKey}.additionalOperations.${method}.servers`,
                            );
                        }
                    }
                }
            }
        };

        validateServerLocations(spec.paths as Record<string, unknown> | undefined, 'paths.');
        validateServerLocations(spec.webhooks as Record<string, unknown> | undefined, 'webhooks.');
        if (Object.keys(callbackPaths).length > 0) {
            validateServerLocations(callbackPaths, 'callbacks.');
        }
    }

    // 6. OperationId Uniqueness (OpenAPI/Swagger)
    collectOperationIds(spec.paths as Record<string, unknown> | undefined, '');
    collectOperationIds(spec.webhooks as Record<string, unknown> | undefined, 'webhooks:');
    if (Object.keys(callbackPaths).length > 0) {
        collectOperationIds(callbackPaths, 'callbacks:');
    }

    if (isOpenApi3 && spec.components?.pathItems) {
        collectOperationIds(spec.components.pathItems as unknown as Record<string, unknown>, 'components.pathItems:');
    }

    if (isOpenApi3 && spec.components?.webhooks) {
        collectOperationIds(spec.components.webhooks as unknown as Record<string, unknown>, 'components.webhooks:');
    }

    if (isOpenApi3 && spec.components?.callbacks) {
        for (const [name, callbackObj] of Object.entries(spec.components.callbacks as Record<string, unknown>)) {
            if (!callbackObj || typeof callbackObj !== 'object') continue;
            if (isRefLike(callbackObj)) continue;
            collectOperationIds(callbackObj as Record<string, unknown>, `components.callbacks.${name}:`);
        }
    }

    for (const [operationId, locations] of operationIdLocations.entries()) {
        if (locations.length > 1) {
            throw new SpecValidationError(
                `Duplicate operationId "${operationId}" found in multiple operations: ${locations.join(', ')}`,
            );
        }
    }

    // 7. Check Components Parameters Exclusivity (OAS 3.x)
    if (isOpenApi3 && spec.components?.parameters) {
        for (const [name, paramObj] of Object.entries(spec.components.parameters)) {
            const param = paramObj as Record<string, unknown>;
            if (!param || typeof param !== 'object') {
                throw new SpecValidationError(`Component parameter '${name}' must be an object or Reference Object.`);
            }

            if (isRefLike(param)) {
                validateReferenceObject(param, `components.parameters.${name}`);
                continue;
            }

            if (typeof param.name !== 'string' || param.name.trim().length === 0) {
                throw new SpecValidationError(`Component parameter '${name}' must define a non-empty string 'name'.`);
            }

            if (typeof param.in !== 'string' || param.in.trim().length === 0) {
                throw new SpecValidationError(`Component parameter '${name}' must define a non-empty string 'in'.`);
            }

            if (
                param.in === 'header' &&
                typeof param.name === 'string' &&
                RESERVED_HEADER_NAMES.has(param.name.toLowerCase())
            ) {
                continue;
            }

            if (param.example !== undefined && param.examples !== undefined) {
                throw new SpecValidationError(
                    `Component parameter '${name}' contains both 'example' and 'examples'. These fields are mutually exclusive.`,
                );
            }

            if (param.examples && typeof param.examples === 'object') {
                Object.entries(param.examples as Record<string, unknown>).forEach(([exampleName, example]) => {
                    validateExampleObject(example, `components.parameters.${name}.examples.${exampleName}`);
                });
            }

            if (param.schema !== undefined) {
                validateSchemaExternalDocs(param.schema, `components.parameters.${name}.schema`);
            }

            // OAS 3.2: Component parameter must define either schema or content
            if (param.schema === undefined && param.content === undefined) {
                throw new SpecValidationError(
                    `Component parameter '${name}' must define either 'schema' or 'content'.`,
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
                if (Object.keys(param.content as object).length !== 1) {
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
                if (param.schema !== undefined) {
                    throw new SpecValidationError(
                        `Component parameter '${name}' has location 'querystring' but defines 'schema'. Querystring parameters MUST use 'content' instead.`,
                    );
                }
                if (param.content === undefined) {
                    throw new SpecValidationError(
                        `Component parameter '${name}' has location 'querystring' but is missing 'content'. Querystring parameters MUST use 'content'.`,
                    );
                }
            }

            if (isOpenApi3) {
                validateParameterStyle(param as Parameter, `components.parameters.${name}`);
            }

            if (param.content) {
                validateContentMap(param.content as Record<string, unknown>, `components.parameters.${name}.content`);
            }
        }
    }

    if (isOpenApi3 && spec.components) {
        if (spec.components.headers) {
            validateHeadersMap(spec.components.headers as Record<string, unknown>, 'components.headers', isOpenApi3);
        }

        if (spec.components.links) {
            validateLinksMap(spec.components.links as Record<string, unknown>, 'components.links');
        }

        if (spec.components.examples) {
            for (const [name, exampleObj] of Object.entries(spec.components.examples)) {
                validateExampleObject(exampleObj, `components.examples.${name}`);
            }
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

        if (spec.components.callbacks) {
            for (const [name, callbackObj] of Object.entries(spec.components.callbacks as Record<string, unknown>)) {
                if (!callbackObj || typeof callbackObj !== 'object') continue;
                if (isRefLike(callbackObj)) {
                    validateReferenceObject(callbackObj, `components.callbacks.${name}`);
                    continue;
                }

                Object.entries(callbackObj as Record<string, unknown>).forEach(([expression, callbackPathItem]) => {
                    validateCallbackExpression(expression, `components.callbacks.${name}.${expression}`);
                    validatePathItemOperations(
                        callbackPathItem,
                        `components.callbacks.${name}.${expression}`,
                        isOpenApi3,
                    );
                });
            }
        }

        if (spec.components.pathItems) {
            validateOperationsContent(
                spec.components.pathItems as Record<string, unknown>,
                'components.pathItems.',
                isOpenApi3,
            );
        }

        if (spec.components.webhooks) {
            validateOperationsContent(
                spec.components.webhooks as Record<string, unknown>,
                'components.webhooks.',
                isOpenApi3,
            );
        }

        if (spec.components.responses) {
            validateComponentResponses(
                spec.components.responses as Record<string, unknown>,
                'components.responses',
                isOpenApi3,
            );
        }
    }

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
            const validKeyRegex = /^[a-zA-Z0-9.\-_]+$/;

            for (const type of componentTypes) {
                const componentGroup = (spec.components as any)[type] as Record<string, unknown> | undefined;
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

        if (spec.components?.schemas) {
            Object.entries(spec.components.schemas).forEach(([name, schema]) => {
                validateSchemaExternalDocs(schema, `components.schemas.${name}`);
            });
        }

        // 9c. Security Scheme validation (OAS 3.x)
        if (spec.components?.securitySchemes) {
            validateSecuritySchemes(
                spec.components.securitySchemes as Record<string, unknown>,
                'components.securitySchemes',
                true,
            );
        }

        // 9b. Tag parent + uniqueness validation (OAS 3.2)
        if (spec.tags && spec.tags.length > 0) {
            const tagNames = new Set<string>();
            const duplicates = new Set<string>();
            const parentMap = new Map<string, string>();

            spec.tags.forEach((tag: TagObject) => {
                if (typeof tag.name === 'string') {
                    if (tagNames.has(tag.name)) {
                        duplicates.add(tag.name);
                    } else {
                        tagNames.add(tag.name);
                    }
                }
            });

            if (duplicates.size > 0) {
                throw new SpecValidationError(`Duplicate tag name(s) detected: ${Array.from(duplicates).join(', ')}`);
            }

            spec.tags.forEach((tag: TagObject) => {
                if (tag.externalDocs) {
                    validateExternalDocsObject(tag.externalDocs, `tags.${tag.name}.externalDocs`);
                }
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
                if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(spec.jsonSchemaDialect)) {
                    throw new SpecValidationError(
                        `Field 'jsonSchemaDialect' must be a valid URI. Value: "${spec.jsonSchemaDialect}"`,
                    );
                }
            }
        }
    } else {
        if (!hasPaths) {
            throw new SpecValidationError("Swagger 2.0 specification must contain a 'paths' object.");
        }
    }

    if (spec.definitions) {
        Object.entries(spec.definitions).forEach(([name, schema]) => {
            validateSchemaExternalDocs(schema, `definitions.${name}`);
        });
    }
}
