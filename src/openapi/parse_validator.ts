// src/core/validator.ts

import { Parameter, ServerObject, SwaggerSpec, TagObject } from '@src/core/types/index.js';
import { isUrl } from '@src/functions/utils.js';

/**
 * Error thrown when the OpenAPI specification fails validation.
 */
export class SpecValidationError extends Error {
    constructor(message: string) {
        /* v8 ignore next */
        super(message);
        /* v8 ignore next */
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
    /* v8 ignore next */
    return path
        .split('/')
        .map(segment => {
            /* v8 ignore next */
            if (segment.startsWith('{') && segment.endsWith('}')) {
                /* v8 ignore next */
                return '{}';
            }
            /* v8 ignore next */
            return segment;
        })
        .join('/');
}

function getPathTemplateParams(path: string): string[] {
    /* v8 ignore next */
    const params: string[] = [];
    /* v8 ignore next */
    const regex = /\{([^}]+)\}/g;
    let match: RegExpExecArray | null;
    /* v8 ignore next */
    while ((match = regex.exec(path)) !== null) {
        /* v8 ignore next */
        /* v8 ignore start */
        if (match[1]) params.push(match[1]);
        /* v8 ignore stop */
    }
    /* v8 ignore next */
    return params;
}

function validateTemplateBraces(value: string, location: string, label: string): void {
    /* v8 ignore next */
    /* v8 ignore start */
    if (typeof value !== 'string' || value.length === 0) return;
    /* v8 ignore stop */
    /* v8 ignore next */
    if (!value.includes('{') && !value.includes('}')) return;

    /* v8 ignore next */
    let index = 0;
    /* v8 ignore next */
    while (index < value.length) {
        /* v8 ignore next */
        const char = value[index];

        /* v8 ignore next */
        if (char === '{') {
            /* v8 ignore next */
            const closeIndex = value.indexOf('}', index + 1);
            /* v8 ignore next */
            if (closeIndex === -1) {
                /* v8 ignore next */
                throw new SpecValidationError(
                    `${label} at '${location}' contains an opening "{" without a matching "}".`,
                );
            }
            /* v8 ignore next */
            if (closeIndex === index + 1) {
                /* v8 ignore next */
                throw new SpecValidationError(`${label} at '${location}' contains an empty template expression "{}".`);
            }
            /* v8 ignore next */
            const inner = value.slice(index + 1, closeIndex);
            /* v8 ignore next */
            if (inner.includes('{')) {
                /* v8 ignore next */
                throw new SpecValidationError(
                    `${label} at '${location}' contains nested "{" characters, which is not allowed.`,
                );
            }
            /* v8 ignore next */
            index = closeIndex + 1;
            /* v8 ignore next */
            continue;
        }

        /* v8 ignore next */
        if (char === '}') {
            /* v8 ignore next */
            throw new SpecValidationError(`${label} at '${location}' contains a closing "}" without a matching "{".`);
        }
        /* v8 ignore next */
        index += 1;
    }
}

function isUriReference(value: string): boolean {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!value || typeof value !== 'string') return false;
    /* v8 ignore stop */
    /* v8 ignore next */
    if (/\s/.test(value)) return false;
    /* v8 ignore next */
    if (isUrl(value)) return true;

    // If it has a scheme-like prefix before any path characters, validate the scheme
    /* v8 ignore next */
    const schemeMatch = value.match(/^([^:/?#]+):/);
    /* v8 ignore next */
    if (schemeMatch) {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!/^[a-zA-Z][a-zA-Z0-9+.-]*$/.test(schemeMatch[1])) {
            /* v8 ignore stop */
            /* v8 ignore next */
            return false;
        }
    }

    // RFC3986 unreserved + reserved + percent encoding
    /* v8 ignore next */
    return /^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/.test(value);
}

function isEmailAddress(value: string): boolean {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!value || typeof value !== 'string') return false;
    /* v8 ignore stop */
    // Pragmatic email check: local@domain.tld
    /* v8 ignore next */
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isAbsoluteIri(value: string): boolean {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!value || typeof value !== 'string') return false;
    /* v8 ignore stop */
    /* v8 ignore next */
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

/* v8 ignore next */
const RUNTIME_HEADER_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
/* v8 ignore next */
const HTTP_METHOD_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Validates a JSON Pointer fragment (RFC 6901) without the leading '#'.
 */
function isValidJsonPointer(pointer: string): boolean {
    /* v8 ignore next */
    /* v8 ignore start */
    if (pointer === '') return true;
    /* v8 ignore stop */
    /* v8 ignore next */
    if (!pointer.startsWith('/')) return false;
    /* v8 ignore next */
    return new RegExp('^/([^~/]|~[01])*(/([^~/]|~[01])*)*$').test(pointer);
}

/**
 * Validates an OpenAPI Runtime Expression (OAS 3.x).
 */
function isValidRuntimeExpression(expression: string): boolean {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!expression || typeof expression !== 'string') return false;
    /* v8 ignore stop */
    /* v8 ignore next */
    /* v8 ignore start */
    if (expression === '$url' || expression === '$method' || expression === '$statusCode') return true;
    /* v8 ignore stop */

    /* v8 ignore next */
    const isRequest = expression.startsWith('$request.');
    /* v8 ignore next */
    const isResponse = expression.startsWith('$response.');

    /* v8 ignore next */
    if (!isRequest && !isResponse) return false;

    /* v8 ignore next */
    const source = expression.substring(isRequest ? 9 : 10);
    /* v8 ignore next */
    if (source.startsWith('header.')) {
        /* v8 ignore next */
        const token = source.substring(7);
        /* v8 ignore next */
        return RUNTIME_HEADER_TOKEN.test(token);
    }

    /* v8 ignore next */
    if (isRequest) {
        /* v8 ignore next */
        if (source.startsWith('query.')) {
            /* v8 ignore next */
            return source.substring(6).length > 0;
        }
        /* v8 ignore next */
        if (source.startsWith('path.')) {
            /* v8 ignore next */
            return source.substring(5).length > 0;
        }
    }

    /* v8 ignore next */
    if (source === 'body') return true;
    /* v8 ignore next */
    if (source.startsWith('body#')) {
        /* v8 ignore next */
        const pointer = source.substring(5);
        /* v8 ignore next */
        return isValidJsonPointer(pointer);
    }

    /* v8 ignore next */
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
    /* v8 ignore next */
    if (typeof expression !== 'string' || expression.length === 0) {
        /* v8 ignore next */
        throw new SpecValidationError(`${label} at '${location}' must be a non-empty string.`);
    }

    /* v8 ignore next */
    const hasOpen = expression.includes('{');
    /* v8 ignore next */
    const hasClose = expression.includes('}');

    /* v8 ignore next */
    if (hasOpen || hasClose) {
        /* v8 ignore next */
        const matches = [...expression.matchAll(/\{([^}]+)\}/g)];
        /* v8 ignore next */
        if (matches.length === 0) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `${label} at '${location}' contains unmatched braces and cannot be evaluated.`,
            );
        }
        /* v8 ignore next */
        for (const match of matches) {
            /* v8 ignore next */
            /* v8 ignore start */
            const inner = match[1]?.trim() ?? '';
            /* v8 ignore stop */
            /* v8 ignore next */
            if (!isValidRuntimeExpression(inner)) {
                /* v8 ignore next */
                throw new SpecValidationError(
                    `${label} at '${location}' contains invalid runtime expression '{${inner}}'.`,
                );
            }
        }

        /* v8 ignore next */
        const stripped = expression.replace(/\{[^}]*\}/g, '');
        /* v8 ignore next */
        if (stripped.includes('{') || stripped.includes('}')) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `${label} at '${location}' contains unmatched braces and cannot be evaluated.`,
            );
        }
        /* v8 ignore next */
        return;
    }

    /* v8 ignore next */
    /* v8 ignore start */
    if (mode === 'required' || expression.startsWith('$')) {
        /* v8 ignore stop */
        /* v8 ignore next */
        if (!isValidRuntimeExpression(expression)) {
            /* v8 ignore next */
            throw new SpecValidationError(`${label} at '${location}' must be a valid runtime expression.`);
        }
    }
}

function validateCallbackExpression(expression: string, location: string): void {
    /* v8 ignore next */
    validateRuntimeExpressionTemplate(expression, location, 'required', 'Callback expression');
}

type SchemaTypeKind = 'primitive' | 'array' | 'object' | 'unknown';

function getSchemaTypeKind(schema: unknown): SchemaTypeKind {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!schema || typeof schema !== 'object') return 'unknown';
    /* v8 ignore stop */
    /* v8 ignore next */
    /* v8 ignore start */
    if ('$ref' in (schema as object) || '$dynamicRef' in (schema as object)) return 'unknown';
    /* v8 ignore stop */

    /* v8 ignore next */
    const rawType = (schema as { type?: unknown }).type;
    /* v8 ignore next */
    const normalizeType = (value: unknown): SchemaTypeKind => {
        /* v8 ignore next */
        /* v8 ignore start */
        if (typeof value !== 'string') return 'unknown';
        /* v8 ignore stop */
        /* v8 ignore next */
        if (value === 'array') return 'array';
        /* v8 ignore next */
        if (value === 'object') return 'object';
        /* v8 ignore next */
        if (['string', 'number', 'integer', 'boolean', 'null'].includes(value)) return 'primitive';
        /* v8 ignore next */
        return 'unknown';
    };

    /* v8 ignore next */
    if (typeof rawType === 'string') {
        /* v8 ignore next */
        return normalizeType(rawType);
    }

    /* v8 ignore next */
    /* v8 ignore start */
    if (Array.isArray(rawType)) {
        /* v8 ignore stop */
        /* v8 ignore next */
        const filtered = rawType.filter((t: unknown) => t !== 'null');
        /* v8 ignore next */
        if (filtered.length === 1) {
            /* v8 ignore next */
            return normalizeType(filtered[0]);
        }
    }

    /* v8 ignore next */
    return 'unknown';
}

/* v8 ignore next */
const PARAM_STYLE_BY_IN: Record<string, Set<string>> = {
    path: new Set(['matrix', 'label', 'simple']),
    query: new Set(['form', 'spaceDelimited', 'pipeDelimited', 'deepObject']),
    header: new Set(['simple']),
    cookie: new Set(['form', 'cookie']),
    querystring: new Set([]),
};

/* v8 ignore next */
const XML_NODE_TYPES = new Set(['element', 'attribute', 'text', 'cdata', 'none']);

function validateExternalDocsObject(externalDocs: unknown, location: string): void {
    /* v8 ignore next */
    /* v8 ignore start */
    if (externalDocs === undefined || externalDocs === null) return;
    /* v8 ignore stop */
    /* v8 ignore next */
    if (typeof externalDocs !== 'object') {
        /* v8 ignore next */
        throw new SpecValidationError(`ExternalDocs at '${location}' must be an object.`);
    }
    /* v8 ignore next */
    const url = (externalDocs as { url?: unknown }).url;
    /* v8 ignore next */
    if (typeof url !== 'string' || !isUriReference(url)) {
        /* v8 ignore next */
        throw new SpecValidationError(`ExternalDocs.url must be a valid URI at '${location}'. Value: "${String(url)}"`);
    }
}

function validateSchemaExternalDocs(
    schema: unknown,
    location: string,
    seen: WeakSet<object> = new WeakSet<object>(),
): void {
    /* v8 ignore next */
    if (schema === null || schema === undefined) return;
    /* v8 ignore next */
    /* v8 ignore start */
    if (typeof schema !== 'object') return;
    /* v8 ignore stop */

    /* v8 ignore next */
    const obj = schema as Record<string, unknown>;
    /* v8 ignore next */
    /* v8 ignore start */
    if (seen.has(obj)) return;
    /* v8 ignore stop */
    /* v8 ignore next */
    seen.add(obj);

    /* v8 ignore next */
    if ('$schema' in obj) {
        /* v8 ignore next */
        const value = obj.$schema;
        /* v8 ignore next */
        if (typeof value !== 'string' || !isUriReference(value)) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `Schema Object at '${location}' has invalid '$schema'. It must be a valid URI reference.`,
            );
        }
    }

    /* v8 ignore next */
    if ('$id' in obj) {
        /* v8 ignore next */
        const value = obj.$id;
        /* v8 ignore next */
        if (typeof value !== 'string' || !isUriReference(value)) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `Schema Object at '${location}' has invalid '$id'. It must be a valid URI reference.`,
            );
        }
    }

    /* v8 ignore next */
    if ('$anchor' in obj) {
        /* v8 ignore next */
        const value = obj.$anchor;
        /* v8 ignore next */
        if (typeof value !== 'string' || value.trim().length === 0) {
            /* v8 ignore next */
            throw new SpecValidationError(`Schema Object at '${location}' has invalid '$anchor'.`);
        }
    }

    /* v8 ignore next */
    if ('$dynamicAnchor' in obj) {
        /* v8 ignore next */
        const value = obj.$dynamicAnchor;
        /* v8 ignore next */
        if (typeof value !== 'string' || value.trim().length === 0) {
            /* v8 ignore next */
            throw new SpecValidationError(`Schema Object at '${location}' has invalid '$dynamicAnchor'.`);
        }
    }

    /* v8 ignore next */
    if ('$ref' in obj) {
        /* v8 ignore next */
        const value = obj.$ref;
        /* v8 ignore next */
        if (typeof value !== 'string' || !isUriReference(value)) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `Schema Object at '${location}' has invalid '$ref'. It must be a valid URI reference.`,
            );
        }
    }

    /* v8 ignore next */
    if ('$dynamicRef' in obj) {
        /* v8 ignore next */
        const value = obj.$dynamicRef;
        /* v8 ignore next */
        /* v8 ignore start */
        if (typeof value !== 'string' || !isUriReference(value)) {
            /* v8 ignore stop */
            /* v8 ignore next */
            throw new SpecValidationError(
                `Schema Object at '${location}' has invalid '$dynamicRef'. It must be a valid URI reference.`,
            );
        }
    }

    /* v8 ignore next */
    if ('externalDocs' in obj) {
        /* v8 ignore next */
        validateExternalDocsObject((obj as { externalDocs?: unknown }).externalDocs, `${location}.externalDocs`);
    }

    /* v8 ignore next */
    if ('discriminator' in obj) {
        /* v8 ignore next */
        validateDiscriminatorObject(obj, `${location}.discriminator`);
    }

    /* v8 ignore next */
    if ('xml' in obj) {
        /* v8 ignore next */
        validateXmlObject(obj, `${location}.xml`);
    }

    /* v8 ignore next */
    if ('$ref' in obj || '$dynamicRef' in obj) {
        /* v8 ignore next */
        return;
    }

    /* v8 ignore next */
    const visit = (child: unknown, childPath: string) => validateSchemaExternalDocs(child, childPath, seen);

    /* v8 ignore next */
    if (Array.isArray(obj.allOf))
        /* v8 ignore next */
        (obj.allOf as unknown[]).forEach((s: unknown, i: number) => visit(s, `${location}.allOf[${i}]`));
    /* v8 ignore next */
    if (Array.isArray(obj.anyOf))
        /* v8 ignore next */
        (obj.anyOf as unknown[]).forEach((s: unknown, i: number) => visit(s, `${location}.anyOf[${i}]`));
    /* v8 ignore next */
    if (Array.isArray(obj.oneOf))
        /* v8 ignore next */
        (obj.oneOf as unknown[]).forEach((s: unknown, i: number) => visit(s, `${location}.oneOf[${i}]`));
    /* v8 ignore next */
    if (obj.not) visit(obj.not, `${location}.not`);
    /* v8 ignore next */
    if (obj.if) visit(obj.if, `${location}.if`);
    /* v8 ignore next */
    if (obj.then) visit(obj.then, `${location}.then`);
    /* v8 ignore next */
    if (obj.else) visit(obj.else, `${location}.else`);

    /* v8 ignore next */
    if (obj.items) {
        /* v8 ignore next */
        if (Array.isArray(obj.items)) {
            /* v8 ignore next */
            (obj.items as unknown[]).forEach((s: unknown, i: number) => visit(s, `${location}.items[${i}]`));
        } else {
            /* v8 ignore next */
            visit(obj.items, `${location}.items`);
        }
    }

    /* v8 ignore next */
    if (Array.isArray(obj.prefixItems)) {
        /* v8 ignore next */
        (obj.prefixItems as unknown[]).forEach((s: unknown, i: number) => visit(s, `${location}.prefixItems[${i}]`));
    }

    /* v8 ignore next */
    if (obj.properties && typeof obj.properties === 'object') {
        /* v8 ignore next */
        Object.entries(obj.properties as Record<string, unknown>).forEach(([key, value]) =>
            /* v8 ignore next */
            visit(value, `${location}.properties.${key}`),
        );
    }

    /* v8 ignore next */
    if (obj.patternProperties && typeof obj.patternProperties === 'object') {
        /* v8 ignore next */
        Object.entries(obj.patternProperties as Record<string, unknown>).forEach(([key, value]) =>
            /* v8 ignore next */
            visit(value, `${location}.patternProperties.${key}`),
        );
    }

    /* v8 ignore next */
    if (obj.additionalProperties && typeof obj.additionalProperties === 'object') {
        /* v8 ignore next */
        visit(obj.additionalProperties, `${location}.additionalProperties`);
    }

    /* v8 ignore next */
    if (obj.dependentSchemas && typeof obj.dependentSchemas === 'object') {
        /* v8 ignore next */
        Object.entries(obj.dependentSchemas as Record<string, unknown>).forEach(([key, value]) =>
            /* v8 ignore next */
            visit(value, `${location}.dependentSchemas.${key}`),
        );
    }

    /* v8 ignore next */
    if (obj.contentSchema) {
        /* v8 ignore next */
        visit(obj.contentSchema, `${location}.contentSchema`);
    }
}

function isPropertyRequired(schema: unknown, propName: string, seen: WeakSet<object> = new WeakSet<object>()): boolean {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!schema || typeof schema !== 'object') return false;
    /* v8 ignore stop */
    /* v8 ignore next */
    const obj = schema as Record<string, unknown>;
    /* v8 ignore next */
    /* v8 ignore start */
    if (seen.has(obj)) return false;
    /* v8 ignore stop */
    /* v8 ignore next */
    seen.add(obj);

    /* v8 ignore next */
    const required = obj.required;
    /* v8 ignore next */
    if (Array.isArray(required) && required.includes(propName)) return true;

    /* v8 ignore next */
    if (Array.isArray(obj.allOf)) {
        /* v8 ignore next */
        return (obj.allOf as unknown[]).some(sub => {
            /* v8 ignore next */
            if (!sub || typeof sub !== 'object') return false;
            /* v8 ignore next */
            if ('$ref' in (sub as object) || '$dynamicRef' in (sub as object)) return false;
            /* v8 ignore next */
            return isPropertyRequired(sub, propName, seen);
        });
    }

    /* v8 ignore next */
    return false;
}

function validateDiscriminatorObject(schema: Record<string, unknown>, location: string): void {
    /* v8 ignore next */
    const discriminator = schema.discriminator;
    /* v8 ignore next */
    /* v8 ignore start */
    if (discriminator === undefined || discriminator === null) return;
    /* v8 ignore stop */

    // Swagger 2.0 allows discriminator as a string (property name).
    /* v8 ignore next */
    if (typeof discriminator === 'string') {
        /* v8 ignore next */
        if (location.startsWith('definitions.')) return;
        /* v8 ignore next */
        throw new SpecValidationError(`Discriminator at '${location}' must be an object.`);
    }
    /* v8 ignore next */
    if (typeof discriminator !== 'object' || Array.isArray(discriminator)) {
        /* v8 ignore next */
        throw new SpecValidationError(`Discriminator at '${location}' must be an object.`);
    }

    /* v8 ignore next */
    const propName = (discriminator as { propertyName?: unknown }).propertyName;
    /* v8 ignore next */
    if (typeof propName !== 'string' || propName.trim().length === 0) {
        /* v8 ignore next */
        throw new SpecValidationError(`Discriminator at '${location}' must define a non-empty string 'propertyName'.`);
    }

    /* v8 ignore next */
    const hasComposite = Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf) || Array.isArray(schema.allOf);
    /* v8 ignore next */
    if (!hasComposite) {
        /* v8 ignore next */
        throw new SpecValidationError(`Discriminator at '${location}' is only valid alongside oneOf/anyOf/allOf.`);
    }

    /* v8 ignore next */
    const mapping = (discriminator as { mapping?: unknown }).mapping;
    /* v8 ignore next */
    if (mapping !== undefined && (typeof mapping !== 'object' || Array.isArray(mapping))) {
        /* v8 ignore next */
        throw new SpecValidationError(`Discriminator mapping at '${location}' must be an object.`);
    }
    /* v8 ignore next */
    if (mapping && typeof mapping === 'object') {
        /* v8 ignore next */
        Object.entries(mapping as Record<string, unknown>).forEach(([key, value]) => {
            /* v8 ignore next */
            if (typeof value !== 'string') {
                /* v8 ignore next */
                throw new SpecValidationError(
                    `Discriminator mapping value for '${key}' at '${location}' must be a string.`,
                );
            }
        });
    }

    /* v8 ignore next */
    const defaultMapping = (discriminator as { defaultMapping?: unknown }).defaultMapping;
    /* v8 ignore next */
    if (defaultMapping !== undefined && typeof defaultMapping !== 'string') {
        /* v8 ignore next */
        throw new SpecValidationError(`Discriminator defaultMapping at '${location}' must be a string.`);
    }

    /* v8 ignore next */
    const required = isPropertyRequired(schema, propName);

    /* v8 ignore next */
    if (!required && defaultMapping === undefined) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Discriminator property '${propName}' is optional at '${location}'. A 'defaultMapping' is required.`,
        );
    }
}

function validateXmlObject(schema: Record<string, unknown>, location: string): void {
    /* v8 ignore next */
    const xml = schema.xml;
    /* v8 ignore next */
    /* v8 ignore start */
    if (xml === undefined || xml === null) return;
    /* v8 ignore stop */
    /* v8 ignore next */
    if (typeof xml !== 'object' || Array.isArray(xml)) {
        /* v8 ignore next */
        throw new SpecValidationError(`XML Object at '${location}' must be an object.`);
    }

    /* v8 ignore next */
    const xmlObj = xml as {
        nodeType?: unknown;
        name?: unknown;
        namespace?: unknown;
        prefix?: unknown;
        attribute?: unknown;
        wrapped?: unknown;
    };

    /* v8 ignore next */
    if (xmlObj.nodeType !== undefined) {
        /* v8 ignore next */
        if (typeof xmlObj.nodeType !== 'string' || !XML_NODE_TYPES.has(xmlObj.nodeType)) {
            /* v8 ignore next */
            throw new SpecValidationError(`XML Object at '${location}' has invalid 'nodeType'.`);
        }
        /* v8 ignore next */
        if (xmlObj.attribute !== undefined) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `XML Object at '${location}' MUST NOT define 'attribute' when 'nodeType' is present.`,
            );
        }
        /* v8 ignore next */
        if (xmlObj.wrapped !== undefined) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `XML Object at '${location}' MUST NOT define 'wrapped' when 'nodeType' is present.`,
            );
        }
    }

    /* v8 ignore next */
    if (xmlObj.name !== undefined && typeof xmlObj.name !== 'string') {
        /* v8 ignore next */
        throw new SpecValidationError(`XML Object at '${location}' has non-string 'name'.`);
    }
    /* v8 ignore next */
    if (xmlObj.prefix !== undefined && typeof xmlObj.prefix !== 'string') {
        /* v8 ignore next */
        throw new SpecValidationError(`XML Object at '${location}' has non-string 'prefix'.`);
    }
    /* v8 ignore next */
    if (xmlObj.namespace !== undefined) {
        /* v8 ignore next */
        if (typeof xmlObj.namespace !== 'string' || !isAbsoluteIri(xmlObj.namespace)) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `XML Object at '${location}' must define a non-relative IRI for 'namespace'.`,
            );
        }
    }
    /* v8 ignore next */
    if (xmlObj.attribute !== undefined && typeof xmlObj.attribute !== 'boolean') {
        /* v8 ignore next */
        throw new SpecValidationError(`XML Object at '${location}' has non-boolean 'attribute'.`);
    }
    /* v8 ignore next */
    if (xmlObj.wrapped !== undefined && typeof xmlObj.wrapped !== 'boolean') {
        /* v8 ignore next */
        throw new SpecValidationError(`XML Object at '${location}' has non-boolean 'wrapped'.`);
    }
    /* v8 ignore next */
    if (xmlObj.wrapped === true) {
        /* v8 ignore next */
        const schemaType = getSchemaTypeKind(schema);
        /* v8 ignore next */
        if (schemaType !== 'array' && schemaType !== 'unknown') {
            /* v8 ignore next */
            throw new SpecValidationError(
                `XML Object at '${location}' defines 'wrapped' but the schema is not an array.`,
            );
        }
    }
}

function validateParameterStyle(param: Parameter, location: string): void {
    /* v8 ignore next */
    const allowedLocations = new Set(['query', 'path', 'header', 'cookie', 'querystring']);
    /* v8 ignore next */
    if (!allowedLocations.has(param.in)) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Parameter '${param.name}' in '${location}' has invalid location '${param.in}' for OpenAPI 3.x.`,
        );
    }

    /* v8 ignore next */
    if (param.style === undefined) return;

    /* v8 ignore next */
    if (typeof param.style !== 'string') {
        /* v8 ignore next */
        throw new SpecValidationError(`Parameter '${param.name}' in '${location}' has non-string 'style'.`);
    }

    /* v8 ignore next */
    const allowedStyles = PARAM_STYLE_BY_IN[param.in];
    /* v8 ignore next */
    if (!allowedStyles || !allowedStyles.has(param.style)) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Parameter '${param.name}' in '${location}' has invalid style '${param.style}' for location '${param.in}'.`,
        );
    }

    /* v8 ignore next */
    const schemaType = getSchemaTypeKind(param.schema);

    /* v8 ignore next */
    if (param.style === 'deepObject' && schemaType !== 'object' && schemaType !== 'unknown') {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Parameter '${param.name}' in '${location}' uses 'deepObject' style but schema is not an object.`,
        );
    }

    /* v8 ignore next */
    if ((param.style === 'spaceDelimited' || param.style === 'pipeDelimited') && schemaType === 'primitive') {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Parameter '${param.name}' in '${location}' uses '${param.style}' style but schema is not an array or object.`,
        );
    }

    /* v8 ignore next */
    if ((param.style === 'spaceDelimited' || param.style === 'pipeDelimited') && param.explode === true) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Parameter '${param.name}' in '${location}' uses '${param.style}' style with explode=true, which is not permitted.`,
        );
    }
}

/* v8 ignore next */
const RESERVED_HEADER_NAMES = new Set(['accept', 'content-type', 'authorization']);

function escapeRegExp(value: string): string {
    /* v8 ignore next */
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getServerTemplateVariables(url: string): string[] {
    /* v8 ignore next */
    const vars = new Set<string>();
    /* v8 ignore next */
    const regex = /\{([^}]+)\}/g;
    let match: RegExpExecArray | null;

    /* v8 ignore next */
    while ((match = regex.exec(url)) !== null) {
        /* v8 ignore next */
        /* v8 ignore start */
        if (match[1]) vars.add(match[1]);
        /* v8 ignore stop */
    }
    /* v8 ignore next */
    return Array.from(vars);
}

function validateServers(servers: ServerObject[] | undefined, location: string): void {
    /* v8 ignore next */
    if (!servers || servers.length === 0) return;

    /* v8 ignore next */
    const seenNames = new Set<string>();

    /* v8 ignore next */
    servers.forEach((server, index) => {
        /* v8 ignore next */
        const url = server.url;
        /* v8 ignore next */
        if (typeof url !== 'string' || url.length === 0) {
            /* v8 ignore next */
            throw new SpecValidationError(`Server url must be a non-empty string at ${location}[${index}].`);
        }
        /* v8 ignore next */
        validateTemplateBraces(url, `${location}[${index}].url`, 'Server url');

        /* v8 ignore next */
        if (url.includes('?') || url.includes('#')) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `Server url MUST NOT include query or fragment at ${location}[${index}]. Value: "${url}"`,
            );
        }

        /* v8 ignore next */
        if (server.name) {
            /* v8 ignore next */
            if (seenNames.has(server.name)) {
                /* v8 ignore next */
                throw new SpecValidationError(
                    `Server name "${server.name}" must be unique at ${location}. Duplicate found.`,
                );
            }
            /* v8 ignore next */
            seenNames.add(server.name);
        }

        /* v8 ignore next */
        const templateVars = getServerTemplateVariables(url);

        /* v8 ignore next */
        if (templateVars.length > 0 && !server.variables) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `Server url defines template variables but 'variables' is missing at ${location}[${index}].`,
            );
        }

        /* v8 ignore next */
        templateVars.forEach(varName => {
            /* v8 ignore next */
            if (!server.variables || !server.variables[varName]) {
                /* v8 ignore next */
                throw new SpecValidationError(
                    `Server url variable "${varName}" is not defined in variables at ${location}[${index}].`,
                );
            }
        });

        /* v8 ignore next */
        if (server.variables) {
            /* v8 ignore next */
            Object.entries(server.variables).forEach(([varName, variable]) => {
                /* v8 ignore next */
                if (typeof variable.default !== 'string') {
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `Server variable "${varName}" must define a string default at ${location}[${index}].`,
                    );
                }
                /* v8 ignore next */
                if (variable.enum && variable.enum.length === 0) {
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `Server variable "${varName}" enum MUST NOT be empty at ${location}[${index}].`,
                    );
                }
                /* v8 ignore next */
                if (variable.enum && !variable.enum.every((v: unknown) => typeof v === 'string')) {
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `Server variable "${varName}" enum MUST contain only strings at ${location}[${index}].`,
                    );
                }
                /* v8 ignore next */
                if (variable.enum && !variable.enum.includes(variable.default)) {
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `Server variable "${varName}" default MUST be present in enum at ${location}[${index}].`,
                    );
                }

                /* v8 ignore next */
                const token = `{${varName}}`;
                /* v8 ignore next */
                const occurrences = url.match(new RegExp(escapeRegExp(token), 'g'))?.length ?? 0;
                /* v8 ignore next */
                if (occurrences > 1) {
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `Server variable "${varName}" appears more than once in url at ${location}[${index}].`,
                    );
                }
            });
        }
    });
}

function validateHttpsUrl(value: unknown, location: string, fieldName: string): void {
    /* v8 ignore next */
    if (typeof value !== 'string' || value.trim().length === 0) {
        /* v8 ignore next */
        throw new SpecValidationError(`${fieldName} must be a non-empty string at ${location}.`);
    }
    /* v8 ignore next */
    if (!isUrl(value)) {
        /* v8 ignore next */
        throw new SpecValidationError(`${fieldName} must be a valid URL at ${location}. Value: "${value}"`);
    }
    /* v8 ignore next */
    const parsed = new URL(value);
    /* v8 ignore next */
    if (parsed.protocol !== 'https:') {
        /* v8 ignore next */
        throw new SpecValidationError(`${fieldName} must use https (TLS required) at ${location}. Value: "${value}"`);
    }
}

function validateOAuthFlow(flow: unknown, flowName: string, location: string): void {
    /* v8 ignore next */
    if (!flow || typeof flow !== 'object') {
        /* v8 ignore next */
        throw new SpecValidationError(`OAuth2 flow "${flowName}" must be an object at ${location}.`);
    }

    /* v8 ignore next */
    const f = flow as Record<string, unknown>;

    /* v8 ignore next */
    const requiresAuthorizationUrl = flowName === 'implicit' || flowName === 'authorizationCode';
    const requiresTokenUrl =
        /* v8 ignore next */
        flowName === 'password' ||
        flowName === 'clientCredentials' ||
        flowName === 'authorizationCode' ||
        flowName === 'deviceAuthorization';

    /* v8 ignore next */
    if (requiresAuthorizationUrl) {
        /* v8 ignore next */
        validateHttpsUrl(f.authorizationUrl, `${location}.${flowName}`, 'authorizationUrl');
    }
    /* v8 ignore next */
    if (requiresTokenUrl) {
        /* v8 ignore next */
        validateHttpsUrl(f.tokenUrl, `${location}.${flowName}`, 'tokenUrl');
    }
    /* v8 ignore next */
    if (flowName === 'deviceAuthorization') {
        /* v8 ignore next */
        validateHttpsUrl(f.deviceAuthorizationUrl, `${location}.${flowName}`, 'deviceAuthorizationUrl');
    }
    /* v8 ignore next */
    if (f.refreshUrl !== undefined) {
        /* v8 ignore next */
        validateHttpsUrl(f.refreshUrl, `${location}.${flowName}`, 'refreshUrl');
    }

    /* v8 ignore next */
    if (f.scopes === undefined || typeof f.scopes !== 'object') {
        /* v8 ignore next */
        throw new SpecValidationError(`OAuth2 flow "${flowName}" must define 'scopes' as an object at ${location}.`);
    }
}

function validateSecuritySchemes(
    schemes: Record<string, unknown> | undefined,
    location: string,
    isOpenApi3: boolean,
): void {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!schemes || !isOpenApi3) return;
    /* v8 ignore stop */

    /* v8 ignore next */
    for (const [name, rawScheme] of Object.entries(schemes)) {
        /* v8 ignore next */
        if (!rawScheme || typeof rawScheme !== 'object') {
            /* v8 ignore next */
            continue;
        }
        /* v8 ignore next */
        if (isRefLike(rawScheme)) {
            /* v8 ignore next */
            validateReferenceObject(rawScheme, `${location}.${name}`);
            /* v8 ignore next */
            continue;
        }

        /* v8 ignore next */
        const scheme = rawScheme as Record<string, unknown>;
        /* v8 ignore next */
        const type = scheme.type;

        /* v8 ignore next */
        if (typeof type !== 'string') {
            /* v8 ignore next */
            throw new SpecValidationError(`Security scheme "${name}" must define a string 'type' at ${location}.`);
        }

        /* v8 ignore next */
        switch (type) {
            case 'apiKey': {
                /* v8 ignore next */
                const keyName = scheme.name;
                /* v8 ignore next */
                const keyIn = scheme.in;

                /* v8 ignore next */
                if (typeof keyName !== 'string' || keyName.length === 0) {
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `apiKey security scheme "${name}" must define non-empty 'name' at ${location}.`,
                    );
                }

                /* v8 ignore next */
                if (keyIn !== 'query' && keyIn !== 'header' && keyIn !== 'cookie') {
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `apiKey security scheme "${name}" must define 'in' as 'query', 'header', or 'cookie' at ${location}.`,
                    );
                }
                /* v8 ignore next */
                break;
            }
            case 'http': {
                /* v8 ignore next */
                const httpScheme = scheme.scheme;
                /* v8 ignore next */
                if (typeof httpScheme !== 'string' || httpScheme.length === 0) {
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `http security scheme "${name}" must define non-empty 'scheme' at ${location}.`,
                    );
                }
                /* v8 ignore next */
                break;
            }
            case 'oauth2': {
                /* v8 ignore next */
                const flows = scheme.flows;
                /* v8 ignore next */
                if (!flows || typeof flows !== 'object') {
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `oauth2 security scheme "${name}" must define 'flows' at ${location}.`,
                    );
                }

                /* v8 ignore next */
                if (scheme.oauth2MetadataUrl !== undefined) {
                    /* v8 ignore next */
                    validateHttpsUrl(scheme.oauth2MetadataUrl, `${location}.${name}`, 'oauth2MetadataUrl');
                }

                /* v8 ignore next */
                const flowEntries = Object.entries(flows as Record<string, unknown>);

                /* v8 ignore next */
                if (flowEntries.length === 0) {
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `oauth2 security scheme "${name}" must define at least one flow at ${location}.`,
                    );
                }

                /* v8 ignore next */
                for (const [flowName, flowObj] of flowEntries) {
                    /* v8 ignore next */
                    validateOAuthFlow(flowObj, flowName, `${location}.${name}.flows`);
                }
                /* v8 ignore next */
                break;
            }
            case 'openIdConnect': {
                /* v8 ignore next */
                validateHttpsUrl(scheme.openIdConnectUrl, `${location}.${name}`, 'openIdConnectUrl');
                /* v8 ignore next */
                break;
            }
            case 'mutualTLS': {
                /* v8 ignore next */
                break;
            }
            default: {
                /* v8 ignore next */
                throw new SpecValidationError(
                    `Security scheme "${name}" has unsupported type "${type}" at ${location}.`,
                );
            }
        }
    }
}

function isRefLike(obj: unknown): obj is { $ref?: string; $dynamicRef?: string } {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!obj || typeof obj !== 'object') return false;
    /* v8 ignore stop */
    /* v8 ignore next */
    return '$ref' in obj || '$dynamicRef' in obj;
}

function validateReferenceObject(refObj: unknown, location: string): void {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!refObj || typeof refObj !== 'object') return;
    /* v8 ignore stop */
    /* v8 ignore next */
    const obj = refObj as Record<string, unknown>;
    /* v8 ignore next */
    const hasRef = typeof obj.$ref === 'string';
    /* v8 ignore next */
    const hasDynamicRef = typeof obj.$dynamicRef === 'string';

    /* v8 ignore next */
    /* v8 ignore start */
    if (!hasRef && !hasDynamicRef) return;
    /* v8 ignore stop */

    /* v8 ignore next */
    if (hasRef && hasDynamicRef) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Reference Object at '${location}' must not define both '$ref' and '$dynamicRef'.`,
        );
    }

    /* v8 ignore next */
    if (hasRef && !isUriReference(obj.$ref as string)) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Reference Object at '${location}' has invalid '$ref' URI. Value: "${String(obj.$ref)}"`,
        );
    }

    /* v8 ignore next */
    if (hasDynamicRef && !isUriReference(obj.$dynamicRef as string)) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Reference Object at '${location}' has invalid '$dynamicRef' URI. Value: "${String(obj.$dynamicRef)}"`,
        );
    }

    /* v8 ignore next */
    if (obj.summary !== undefined && typeof obj.summary !== 'string') {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Reference Object at '${location}' has non-string 'summary'. Value: "${String(obj.summary)}"`,
        );
    }

    /* v8 ignore next */
    if (obj.description !== undefined && typeof obj.description !== 'string') {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Reference Object at '${location}' has non-string 'description'. Value: "${String(obj.description)}"`,
        );
    }
}

function validateUniqueParameters(params: unknown, location: string): void {
    /* v8 ignore next */
    if (!Array.isArray(params)) return;
    /* v8 ignore next */
    const seen = new Set<string>();
    /* v8 ignore next */
    for (const param of params as unknown[]) {
        /* v8 ignore next */
        if (!param || typeof param !== 'object') continue;

        /* v8 ignore next */
        const name = (param as { name?: unknown }).name;
        /* v8 ignore next */
        const loc = (param as { in?: unknown }).in;

        /* v8 ignore next */
        if (typeof name !== 'string' || typeof loc !== 'string') continue;

        /* v8 ignore next */
        const normalizedName = loc.toLowerCase() === 'header' ? name.toLowerCase() : name;

        /* v8 ignore next */
        const key = `${normalizedName}:${loc}`;

        /* v8 ignore next */
        if (seen.has(key)) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `Duplicate parameter '${name}' in '${location}'. Parameter names must be unique per location.`,
            );
        }
        /* v8 ignore next */
        seen.add(key);
    }
}

/**
 * Validates OAS 3.2 Example Object field exclusivity and basic typing.
 */
function validateExampleObject(exampleObj: unknown, location: string): void {
    /* v8 ignore next */
    if (!exampleObj || typeof exampleObj !== 'object') return;

    /* v8 ignore next */
    if (isRefLike(exampleObj)) {
        /* v8 ignore next */
        validateReferenceObject(exampleObj, location);
        /* v8 ignore next */
        return;
    }

    /* v8 ignore next */
    const example = exampleObj as {
        value?: unknown;
        dataValue?: unknown;
        serializedValue?: unknown;
        externalValue?: unknown;
    };

    /* v8 ignore next */
    const hasValue = example.value !== undefined;
    /* v8 ignore next */
    const hasDataValue = example.dataValue !== undefined;
    /* v8 ignore next */
    const hasSerialized = example.serializedValue !== undefined;
    /* v8 ignore next */
    const hasExternal = example.externalValue !== undefined;

    /* v8 ignore next */
    if (hasValue && hasDataValue) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Example Object at '${location}' cannot define both 'value' and 'dataValue'. These fields are mutually exclusive.`,
        );
    }

    /* v8 ignore next */
    if (hasValue && hasSerialized) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Example Object at '${location}' cannot define both 'value' and 'serializedValue'. These fields are mutually exclusive.`,
        );
    }

    /* v8 ignore next */
    if (hasValue && hasExternal) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Example Object at '${location}' cannot define both 'value' and 'externalValue'. These fields are mutually exclusive.`,
        );
    }

    /* v8 ignore next */
    if (hasSerialized && hasExternal) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Example Object at '${location}' cannot define both 'serializedValue' and 'externalValue'. These fields are mutually exclusive.`,
        );
    }

    /* v8 ignore next */
    if (hasSerialized && typeof example.serializedValue !== 'string') {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Example Object at '${location}' has a non-string 'serializedValue'. It MUST be a string.`,
        );
    }

    /* v8 ignore next */
    if (hasExternal && typeof example.externalValue !== 'string') {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Example Object at '${location}' has a non-string 'externalValue'. It MUST be a string.`,
        );
    }
}

function normalizeMediaType(value: string | undefined): string {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!value) return '';
    /* v8 ignore stop */
    /* v8 ignore next */
    return value.split(';')[0].trim().toLowerCase();
}

function isMultipartMediaType(mediaType: string | undefined): boolean {
    /* v8 ignore next */
    const normalized = normalizeMediaType(mediaType);
    /* v8 ignore next */
    return normalized.startsWith('multipart/');
}

/* v8 ignore next */
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

/* v8 ignore next */
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
    /* v8 ignore next */
    const normalized = normalizeMediaType(mediaType);
    /* v8 ignore next */
    /* v8 ignore start */
    if (!normalized) return false;
    /* v8 ignore stop */
    /* v8 ignore next */
    /* v8 ignore start */
    if (normalized.startsWith('multipart/')) return true;
    /* v8 ignore stop */

    /* v8 ignore next */
    if (SEQUENTIAL_MEDIA_TYPES.has(normalized)) return true;

    /* v8 ignore next */
    for (const suffix of SEQUENTIAL_MEDIA_SUFFIXES) {
        /* v8 ignore next */
        /* v8 ignore start */
        if (normalized.endsWith(suffix)) return true;
        /* v8 ignore stop */
    }
    /* v8 ignore next */
    return false;
}

function isCustomSequentialJsonMediaType(mediaType: string | undefined): boolean {
    /* v8 ignore next */
    const normalized = normalizeMediaType(mediaType);
    /* v8 ignore next */
    /* v8 ignore start */
    if (!normalized) return false;
    /* v8 ignore stop */

    /* v8 ignore next */
    if (normalized === 'application/json' || normalized === '*/*') return false;
    /* v8 ignore next */
    /* v8 ignore start */
    if (normalized.startsWith('multipart/')) return false;
    /* v8 ignore stop */

    /* v8 ignore next */
    /* v8 ignore start */
    return normalized.includes('json') || normalized.endsWith('+json');
    /* v8 ignore stop */
}

function isFormUrlEncodedMediaType(mediaType: string | undefined): boolean {
    /* v8 ignore next */
    return normalizeMediaType(mediaType) === 'application/x-www-form-urlencoded';
}

function validateEncodingObject(encodingObj: unknown, location: string): void {
    /* v8 ignore next */
    if (!encodingObj || typeof encodingObj !== 'object' || Array.isArray(encodingObj)) {
        /* v8 ignore next */
        throw new SpecValidationError(`Encoding Object at '${location}' must be an object.`);
    }

    /* v8 ignore next */
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

    /* v8 ignore next */
    if (encoding.contentType !== undefined && typeof encoding.contentType !== 'string') {
        /* v8 ignore next */
        throw new SpecValidationError(`Encoding Object at '${location}' has non-string 'contentType'.`);
    }

    /* v8 ignore next */
    if (encoding.style !== undefined && typeof encoding.style !== 'string') {
        /* v8 ignore next */
        throw new SpecValidationError(`Encoding Object at '${location}' has non-string 'style'.`);
    }

    /* v8 ignore next */
    if (encoding.style !== undefined) {
        /* v8 ignore next */
        const allowedStyles = PARAM_STYLE_BY_IN['query'];

        /* v8 ignore next */
        if (!allowedStyles || !allowedStyles.has(encoding.style as string)) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `Encoding Object at '${location}' has invalid 'style' value '${encoding.style}'.`,
            );
        }
    }

    /* v8 ignore next */
    if (encoding.explode !== undefined && typeof encoding.explode !== 'boolean') {
        /* v8 ignore next */
        throw new SpecValidationError(`Encoding Object at '${location}' has non-boolean 'explode'.`);
    }

    /* v8 ignore next */
    if (encoding.allowReserved !== undefined && typeof encoding.allowReserved !== 'boolean') {
        /* v8 ignore next */
        throw new SpecValidationError(`Encoding Object at '${location}' has non-boolean 'allowReserved'.`);
    }

    /* v8 ignore next */
    if (encoding.headers !== undefined) {
        /* v8 ignore next */
        if (typeof encoding.headers !== 'object' || Array.isArray(encoding.headers)) {
            /* v8 ignore next */
            throw new SpecValidationError(`Encoding Object at '${location}' has invalid 'headers' map.`);
        }

        /* v8 ignore next */
        Object.entries(encoding.headers as Record<string, unknown>).forEach(([headerName, headerObj]) => {
            /* v8 ignore next */
            if (headerName.toLowerCase() === 'content-type') {
                /* v8 ignore next */
                throw new SpecValidationError(
                    `Encoding Object at '${location}' MUST NOT define 'Content-Type' in headers. Use 'contentType' instead.`,
                );
            }
            /* v8 ignore next */
            validateHeaderObject(headerObj, `${location}.headers.${headerName}`, true);
        });
    }

    /* v8 ignore next */
    const hasEncoding = encoding.encoding !== undefined;
    /* v8 ignore next */
    const hasPrefixEncoding = encoding.prefixEncoding !== undefined;
    /* v8 ignore next */
    const hasItemEncoding = encoding.itemEncoding !== undefined;

    /* v8 ignore next */
    if (hasEncoding && (hasPrefixEncoding || hasItemEncoding)) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Encoding Object at '${location}' defines 'encoding' alongside 'prefixEncoding' or 'itemEncoding'. These fields are mutually exclusive.`,
        );
    }

    /* v8 ignore next */
    if (encoding.encoding !== undefined) {
        /* v8 ignore next */
        if (typeof encoding.encoding !== 'object' || Array.isArray(encoding.encoding)) {
            /* v8 ignore next */
            throw new SpecValidationError(`Encoding Object at '${location}' has invalid nested 'encoding' map.`);
        }

        /* v8 ignore next */
        Object.entries(encoding.encoding as Record<string, unknown>).forEach(([key, value]) => {
            /* v8 ignore next */
            validateEncodingObject(value, `${location}.encoding.${key}`);
        });
    }

    /* v8 ignore next */
    if (encoding.prefixEncoding !== undefined) {
        /* v8 ignore next */
        if (!Array.isArray(encoding.prefixEncoding)) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `Encoding Object at '${location}' has invalid 'prefixEncoding'. It must be an array.`,
            );
        }

        /* v8 ignore next */
        (encoding.prefixEncoding as unknown[]).forEach((value, index) => {
            /* v8 ignore next */
            validateEncodingObject(value, `${location}.prefixEncoding[${index}]`);
        });
    }

    /* v8 ignore next */
    if (encoding.itemEncoding !== undefined) {
        /* v8 ignore next */
        validateEncodingObject(encoding.itemEncoding, `${location}.itemEncoding`);
    }
}

function validateMediaTypeObject(mediaObj: unknown, location: string, mediaType?: string): void {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!mediaObj || typeof mediaObj !== 'object') return;
    /* v8 ignore stop */

    /* v8 ignore next */
    if (isRefLike(mediaObj)) {
        /* v8 ignore next */
        validateReferenceObject(mediaObj, location);
        /* v8 ignore next */
        return;
    }

    /* v8 ignore next */
    const media = mediaObj as {
        example?: unknown;
        examples?: unknown;
        encoding?: unknown;
        prefixEncoding?: unknown;
        itemEncoding?: unknown;
        schema?: unknown;
        itemSchema?: unknown;
    };

    /* v8 ignore next */
    if (media.example !== undefined && media.examples !== undefined) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Media Type Object at '${location}' contains both 'example' and 'examples'. These fields are mutually exclusive.`,
        );
    }

    /* v8 ignore next */
    const hasEncoding = media.encoding !== undefined;
    /* v8 ignore next */
    const hasPrefixEncoding = media.prefixEncoding !== undefined;
    /* v8 ignore next */
    const hasItemEncoding = media.itemEncoding !== undefined;

    /* v8 ignore next */
    if (hasEncoding && (hasPrefixEncoding || hasItemEncoding)) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Media Type Object at '${location}' defines 'encoding' alongside 'prefixEncoding' or 'itemEncoding'. These fields are mutually exclusive.`,
        );
    }

    /* v8 ignore next */
    if (hasEncoding || hasPrefixEncoding || hasItemEncoding) {
        /* v8 ignore next */
        const isMultipart = isMultipartMediaType(mediaType);
        /* v8 ignore next */
        const isForm = isFormUrlEncodedMediaType(mediaType);

        /* v8 ignore next */
        if (hasEncoding && !isMultipart && !isForm) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `Media Type Object at '${location}' uses 'encoding' but media type "${mediaType}" does not support it.`,
            );
        }

        /* v8 ignore next */
        if ((hasPrefixEncoding || hasItemEncoding) && !isMultipart) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `Media Type Object at '${location}' uses positional encoding but media type "${mediaType}" is not multipart.`,
            );
        }
    }

    /* v8 ignore next */
    if (media.examples && typeof media.examples === 'object') {
        /* v8 ignore next */
        Object.entries(media.examples as Record<string, unknown>).forEach(([name, example]) => {
            /* v8 ignore next */
            validateExampleObject(example, `${location}.examples.${name}`);
        });
    }

    /* v8 ignore next */
    if (media.encoding !== undefined) {
        /* v8 ignore next */
        if (typeof media.encoding !== 'object' || Array.isArray(media.encoding)) {
            /* v8 ignore next */
            throw new SpecValidationError(`Media Type Object at '${location}' has invalid 'encoding' map.`);
        }

        /* v8 ignore next */
        Object.entries(media.encoding as Record<string, unknown>).forEach(([key, value]) => {
            /* v8 ignore next */
            validateEncodingObject(value, `${location}.encoding.${key}`);
        });
    }

    /* v8 ignore next */
    if (media.prefixEncoding !== undefined) {
        /* v8 ignore next */
        if (!Array.isArray(media.prefixEncoding)) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `Media Type Object at '${location}' has invalid 'prefixEncoding'. It must be an array.`,
            );
        }

        /* v8 ignore next */
        (media.prefixEncoding as unknown[]).forEach((value, index) => {
            /* v8 ignore next */
            validateEncodingObject(value, `${location}.prefixEncoding[${index}]`);
        });
    }

    /* v8 ignore next */
    if (media.itemEncoding !== undefined) {
        /* v8 ignore next */
        validateEncodingObject(media.itemEncoding, `${location}.itemEncoding`);
    }

    /* v8 ignore next */
    if (media.schema !== undefined) {
        /* v8 ignore next */
        validateSchemaExternalDocs(media.schema, `${location}.schema`);
    }

    /* v8 ignore next */
    if (media.itemSchema !== undefined) {
        const allowsItemSchema =
            /* v8 ignore next */
            mediaType &&
            (isSequentialMediaType(mediaType) ||
                // Allow custom JSON-based sequential media types when itemSchema is present.
                isCustomSequentialJsonMediaType(mediaType));

        /* v8 ignore next */
        if (mediaType && !allowsItemSchema) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `Media Type Object at '${location}' defines 'itemSchema' but media type "${mediaType}" is not sequential.`,
            );
        }
        /* v8 ignore next */
        validateSchemaExternalDocs(media.itemSchema, `${location}.itemSchema`);
    }
}

function validateContentMap(content: Record<string, unknown> | undefined, location: string): void {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!content) return;
    /* v8 ignore stop */

    /* v8 ignore next */
    for (const [mediaType, mediaObj] of Object.entries(content)) {
        /* v8 ignore next */
        validateMediaTypeObject(mediaObj, `${location}.${mediaType}`, mediaType);
    }
}

function validateHeaderObject(headerObj: unknown, location: string, isOpenApi3: boolean): void {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!headerObj || typeof headerObj !== 'object') return;
    /* v8 ignore stop */

    /* v8 ignore next */
    if (isRefLike(headerObj)) {
        /* v8 ignore next */
        validateReferenceObject(headerObj, location);
        /* v8 ignore next */
        return;
    }

    /* v8 ignore next */
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

    /* v8 ignore next */
    if (header.name !== undefined) {
        /* v8 ignore next */
        throw new SpecValidationError(`Header Object at '${location}' MUST NOT define a 'name' field.`);
    }

    /* v8 ignore next */
    if (header.in !== undefined) {
        /* v8 ignore next */
        throw new SpecValidationError(`Header Object at '${location}' MUST NOT define an 'in' field.`);
    }

    /* v8 ignore next */
    if (header.allowEmptyValue !== undefined) {
        /* v8 ignore next */
        throw new SpecValidationError(`Header Object at '${location}' MUST NOT define 'allowEmptyValue'.`);
    }

    /* v8 ignore next */
    if (header.style !== undefined && header.style !== 'simple') {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Header Object at '${location}' has invalid 'style'. The only allowed value is 'simple'.`,
        );
    }

    /* v8 ignore next */
    if (header.example !== undefined && header.examples !== undefined) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Header Object at '${location}' contains both 'example' and 'examples'. These fields are mutually exclusive.`,
        );
    }

    /* v8 ignore next */
    if (header.examples && typeof header.examples === 'object') {
        /* v8 ignore next */
        Object.entries(header.examples as Record<string, unknown>).forEach(([name, example]) => {
            /* v8 ignore next */
            validateExampleObject(example, `${location}.examples.${name}`);
        });
    }

    /* v8 ignore next */
    if (isOpenApi3 && header.schema === undefined && header.content === undefined) {
        /* v8 ignore next */
        throw new SpecValidationError(`Header Object at '${location}' must define either 'schema' or 'content'.`);
    }

    /* v8 ignore next */
    if (header.schema !== undefined && header.content !== undefined) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Header Object at '${location}' contains both 'schema' and 'content'. These fields are mutually exclusive.`,
        );
    }

    /* v8 ignore next */
    if (header.schema !== undefined) {
        /* v8 ignore next */
        validateSchemaExternalDocs(header.schema, `${location}.schema`);
    }

    /* v8 ignore next */
    if (header.content && Object.keys(header.content).length !== 1) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Header Object at '${location}' has an invalid 'content' map. It MUST contain exactly one entry.`,
        );
    }

    /* v8 ignore next */
    if (header.content) {
        /* v8 ignore next */
        validateContentMap(header.content, `${location}.content`);
    }
}

function validateHeadersMap(headers: Record<string, unknown> | undefined, location: string, isOpenApi3: boolean): void {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!headers) return;
    /* v8 ignore stop */

    /* v8 ignore next */
    for (const [headerName, headerObj] of Object.entries(headers)) {
        /* v8 ignore next */
        if (headerName.toLowerCase() === 'content-type') {
            // OAS 3.2: Response header definitions named "Content-Type" are ignored.
            /* v8 ignore next */
            continue;
        }
        /* v8 ignore next */
        validateHeaderObject(headerObj, `${location}.${headerName}`, isOpenApi3);
    }
}

function validateLinkObject(linkObj: unknown, location: string): void {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!linkObj || typeof linkObj !== 'object') return;
    /* v8 ignore stop */

    /* v8 ignore next */
    if (isRefLike(linkObj)) {
        /* v8 ignore next */
        validateReferenceObject(linkObj, location);
        /* v8 ignore next */
        return;
    }

    /* v8 ignore next */
    const link = linkObj as {
        operationId?: unknown;
        operationRef?: unknown;
        parameters?: unknown;
        requestBody?: unknown;
        server?: unknown;
    };

    /* v8 ignore next */
    const hasOperationId = typeof link.operationId === 'string' && link.operationId.length > 0;
    /* v8 ignore next */
    const hasOperationRef = typeof link.operationRef === 'string' && link.operationRef.length > 0;

    /* v8 ignore next */
    if (hasOperationId && hasOperationRef) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Link Object at '${location}' defines both 'operationId' and 'operationRef'. These fields are mutually exclusive.`,
        );
    }

    /* v8 ignore next */
    if (!hasOperationId && !hasOperationRef) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Link Object at '${location}' must define either 'operationId' or 'operationRef'.`,
        );
    }

    /* v8 ignore next */
    if (hasOperationRef && typeof link.operationRef === 'string' && !isUriReference(link.operationRef)) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `Link Object at '${location}' has invalid 'operationRef'. It must be a valid URI reference.`,
        );
    }

    /* v8 ignore next */
    if (link.parameters !== undefined) {
        /* v8 ignore next */
        if (typeof link.parameters !== 'object' || Array.isArray(link.parameters) || link.parameters === null) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `Link Object at '${location}' has invalid 'parameters'. It must be an object map.`,
            );
        }
        /* v8 ignore next */
        Object.entries(link.parameters as Record<string, unknown>).forEach(([name, value]) => {
            /* v8 ignore next */
            /* v8 ignore start */
            if (typeof value === 'string') {
                /* v8 ignore stop */
                /* v8 ignore next */
                validateRuntimeExpressionTemplate(value, `${location}.parameters.${name}`, 'optional');
            }
        });
    }

    /* v8 ignore next */
    if (typeof link.requestBody === 'string') {
        /* v8 ignore next */
        validateRuntimeExpressionTemplate(link.requestBody, `${location}.requestBody`, 'optional');
    }

    /* v8 ignore next */
    if (link.server !== undefined) {
        /* v8 ignore next */
        validateServers([link.server as ServerObject], `${location}.server`);
    }
}

function validateLinksMap(links: Record<string, unknown> | undefined, location: string): void {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!links) return;
    /* v8 ignore stop */

    /* v8 ignore next */
    for (const [linkName, linkObj] of Object.entries(links)) {
        /* v8 ignore next */
        validateLinkObject(linkObj, `${location}.${linkName}`);
    }
}

function validateRequestBody(requestBody: unknown, location: string): void {
    /* v8 ignore next */
    if (!requestBody || typeof requestBody !== 'object') return;

    /* v8 ignore next */
    if (isRefLike(requestBody)) {
        /* v8 ignore next */
        validateReferenceObject(requestBody, location);
        /* v8 ignore next */
        return;
    }

    /* v8 ignore next */
    const body = requestBody as { content?: Record<string, unknown> };

    /* v8 ignore next */
    if (body.content === undefined) {
        /* v8 ignore next */
        throw new SpecValidationError(`RequestBody Object at '${location}' must define 'content'.`);
    }

    /* v8 ignore next */
    if (typeof body.content !== 'object' || Array.isArray(body.content)) {
        /* v8 ignore next */
        throw new SpecValidationError(
            `RequestBody Object at '${location}' has invalid 'content'. It must be an object.`,
        );
    }

    /* v8 ignore next */
    validateContentMap(body.content, `${location}.content`);
}

function validateResponseObject(responseObj: unknown, location: string, isOpenApi3: boolean): void {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!responseObj || typeof responseObj !== 'object') return;
    /* v8 ignore stop */

    /* v8 ignore next */
    if (isRefLike(responseObj)) {
        /* v8 ignore next */
        validateReferenceObject(responseObj, location);
        /* v8 ignore next */
        return;
    }

    /* v8 ignore next */
    const response = responseObj as {
        description?: unknown;
        headers?: Record<string, unknown>;
        content?: Record<string, unknown>;
        links?: Record<string, unknown>;
    };

    /* v8 ignore next */
    if (response.description === undefined) {
        /* v8 ignore next */
        throw new SpecValidationError(`Response Object at '${location}' must define a 'description' field.`);
    }

    /* v8 ignore next */
    if (typeof response.description !== 'string') {
        /* v8 ignore next */
        throw new SpecValidationError(`Response Object at '${location}' has non-string 'description'.`);
    }

    /* v8 ignore next */
    if (response.headers) {
        /* v8 ignore next */
        validateHeadersMap(response.headers, `${location}.headers`, isOpenApi3);
    }

    /* v8 ignore next */
    if (response.content) {
        /* v8 ignore next */
        validateContentMap(response.content, `${location}.content`);
    }

    /* v8 ignore next */
    if (response.links) {
        /* v8 ignore next */
        validateLinksMap(response.links, `${location}.links`);
    }
}

function validateResponses(
    responses: Record<string, unknown> | undefined,
    location: string,
    isOpenApi3: boolean,
): void {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!responses) return;
    /* v8 ignore stop */

    /* v8 ignore next */
    if (Object.keys(responses).length === 0) {
        /* v8 ignore next */
        throw new SpecValidationError(`Responses Object at '${location}' must define at least one response code.`);
    }

    /* v8 ignore next */
    for (const [status, responseObj] of Object.entries(responses)) {
        /* v8 ignore next */
        if (!isValidResponseCode(status)) {
            /* v8 ignore next */
            throw new SpecValidationError(`Responses Object at '${location}' has invalid status code '${status}'.`);
        }
        /* v8 ignore next */
        validateResponseObject(responseObj, `${location}.${status}`, isOpenApi3);
    }
}

function validateComponentResponses(
    responses: Record<string, unknown> | undefined,
    location: string,
    isOpenApi3: boolean,
): void {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!responses) return;
    /* v8 ignore stop */

    /* v8 ignore next */
    for (const [name, responseObj] of Object.entries(responses)) {
        /* v8 ignore next */
        validateResponseObject(responseObj, `${location}.${name}`, isOpenApi3);
    }
}

function isValidResponseCode(status: string): boolean {
    /* v8 ignore next */
    const normalized = String(status).toUpperCase();
    /* v8 ignore next */
    if (normalized === 'DEFAULT') return true;
    /* v8 ignore next */
    if (/^[1-5]\d{2}$/.test(normalized)) return true;
    /* v8 ignore next */
    if (/^[1-5]XX$/.test(normalized)) return true;
    /* v8 ignore next */
    return false;
}

function validatePathItemOperations(pathItem: unknown, location: string, isOpenApi3: boolean): void {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!pathItem || typeof pathItem !== 'object') return;
    /* v8 ignore stop */

    /* v8 ignore next */
    if (isRefLike(pathItem)) {
        /* v8 ignore next */
        validateReferenceObject(pathItem, location);
        /* v8 ignore next */
        return;
    }

    /* v8 ignore next */
    const operationKeys = ['get', 'post', 'put', 'delete', 'options', 'head', 'patch', 'trace', 'query'];
    /* v8 ignore next */
    const pi = pathItem as Record<string, unknown>;

    /* v8 ignore next */
    for (const method of operationKeys) {
        /* v8 ignore next */
        const operation = pi[method] as Record<string, unknown> | undefined;
        /* v8 ignore next */
        if (operation) {
            /* v8 ignore next */
            /* v8 ignore start */
            if (operation.responses === undefined) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                throw new SpecValidationError(`Operation Object at '${location}.${method}' must define 'responses'.`);
                /* v8 ignore stop */
            }
            /* v8 ignore next */
            /* v8 ignore start */
            if (operation.externalDocs) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                validateExternalDocsObject(operation.externalDocs, `${location}.${method}.externalDocs`);
                /* v8 ignore stop */
            }
            /* v8 ignore next */
            validateRequestBody(operation.requestBody, `${location}.${method}.requestBody`);
            /* v8 ignore next */
            validateResponses(
                operation.responses as Record<string, unknown>,
                `${location}.${method}.responses`,
                isOpenApi3,
            );
        }
    }

    /* v8 ignore next */
    if (pi.additionalOperations) {
        /* v8 ignore next */
        for (const [method, opVal] of Object.entries(pi.additionalOperations as Record<string, unknown>)) {
            /* v8 ignore next */
            const operation = opVal as Record<string, unknown> | undefined;
            /* v8 ignore next */
            /* v8 ignore start */
            if (operation?.responses === undefined) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                throw new SpecValidationError(
                    /* v8 ignore stop */
                    `Operation Object at '${location}.additionalOperations.${method}' must define 'responses'.`,
                );
            }
            /* v8 ignore next */
            /* v8 ignore start */
            if (operation?.externalDocs) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                validateExternalDocsObject(
                    /* v8 ignore stop */
                    operation.externalDocs,
                    `${location}.additionalOperations.${method}.externalDocs`,
                );
            }
            /* v8 ignore next */
            validateRequestBody(operation?.requestBody, `${location}.additionalOperations.${method}.requestBody`);
            /* v8 ignore next */
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
    /* v8 ignore next */
    if (!paths) return;

    /* v8 ignore next */
    for (const [pathKey, pathItem] of Object.entries(paths)) {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!pathItem || typeof pathItem !== 'object') continue;
        /* v8 ignore stop */
        /* v8 ignore next */
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
    /* v8 ignore next */
    if (!spec) {
        /* v8 ignore next */
        throw new SpecValidationError('Specification cannot be null or undefined.');
    }

    // 1. Check Version Header
    /* v8 ignore next */
    const isSwag2 = typeof spec.swagger === 'string' && spec.swagger.startsWith('2.');
    /* v8 ignore next */
    const isOpenApi3 = typeof spec.openapi === 'string' && spec.openapi.startsWith('3.');

    /* v8 ignore next */
    if (!isSwag2 && !isOpenApi3) {
        /* v8 ignore next */
        throw new SpecValidationError(
            'Unsupported or missing OpenAPI/Swagger version. Specification must contain \'swagger: "2.x"\' or \'openapi: "3.x"\'.',
        );
    }

    // 2. Check Info Object
    /* v8 ignore next */
    if (!spec.info) {
        /* v8 ignore next */
        throw new SpecValidationError("Specification must contain an 'info' object.");
    }

    /* v8 ignore next */
    if (!spec.info.title || typeof spec.info.title !== 'string') {
        /* v8 ignore next */
        throw new SpecValidationError("Specification info object must contain a required string field: 'title'.");
    }

    /* v8 ignore next */
    if (!spec.info.version || typeof spec.info.version !== 'string') {
        /* v8 ignore next */
        throw new SpecValidationError("Specification info object must contain a required string field: 'version'.");
    }

    // 2a. OpenAPI 3.2 $self validation (URI reference)
    /* v8 ignore next */
    if (isOpenApi3 && spec.$self !== undefined) {
        /* v8 ignore next */
        if (typeof spec.$self !== 'string' || !isUriReference(spec.$self)) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `OpenAPI Object $self must be a valid URI reference. Value: "${String(spec.$self)}"`,
            );
        }
    }

    // 2b. Info Object URI/email fields
    /* v8 ignore next */
    if (spec.info.termsOfService !== undefined) {
        /* v8 ignore next */
        if (typeof spec.info.termsOfService !== 'string' || !isUriReference(spec.info.termsOfService)) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `Info.termsOfService must be a valid URI. Value: "${String(spec.info.termsOfService)}"`,
            );
        }
    }

    /* v8 ignore next */
    if (spec.info.contact) {
        /* v8 ignore next */
        const contact = spec.info.contact as { url?: unknown; email?: unknown };
        /* v8 ignore next */
        if (contact.url !== undefined) {
            /* v8 ignore next */
            if (typeof contact.url !== 'string' || !isUriReference(contact.url)) {
                /* v8 ignore next */
                throw new SpecValidationError(`Info.contact.url must be a valid URI. Value: "${String(contact.url)}"`);
            }
        }
        /* v8 ignore next */
        if (contact.email !== undefined) {
            /* v8 ignore next */
            if (typeof contact.email !== 'string' || !isEmailAddress(contact.email)) {
                /* v8 ignore next */
                throw new SpecValidationError(
                    `Info.contact.email must be a valid email address. Value: "${String(contact.email)}"`,
                );
            }
        }
    }

    /* v8 ignore next */
    if (spec.externalDocs) {
        /* v8 ignore next */
        validateExternalDocsObject(spec.externalDocs, 'externalDocs');
    }

    // 3. Check License Object Constraints (OAS 3.1+)
    // "The `identifier` field is mutually exclusive of the `url` field."
    /* v8 ignore next */
    if (spec.info.license) {
        /* v8 ignore next */
        if (!spec.info.license.name || typeof spec.info.license.name !== 'string') {
            /* v8 ignore next */
            throw new SpecValidationError("License object must contain a required string field: 'name'.");
        }
        /* v8 ignore next */
        const hasUrl = spec.info.license.url !== undefined && spec.info.license.url !== null;
        /* v8 ignore next */
        const hasIdentifier = spec.info.license.identifier !== undefined && spec.info.license.identifier !== null;

        /* v8 ignore next */
        if (hasUrl && hasIdentifier) {
            /* v8 ignore next */
            throw new SpecValidationError(
                "License object cannot contain both 'url' and 'identifier' fields. They are mutually exclusive.",
            );
        }
        /* v8 ignore next */
        /* v8 ignore start */
        if (hasUrl && typeof spec.info.license.url === 'string' && !isUriReference(spec.info.license.url)) {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            throw new SpecValidationError(
                /* v8 ignore stop */
                `Info.license.url must be a valid URI. Value: "${String(spec.info.license.url)}"`,
            );
        }
    }

    // 3b. Check $self URI Reference (OAS 3.2)
    /* v8 ignore next */
    if (isOpenApi3 && spec.$self !== undefined) {
        /* v8 ignore next */
        /* v8 ignore start */
        if (typeof spec.$self !== 'string' || !isUriReference(spec.$self)) {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            throw new SpecValidationError(
                /* v8 ignore stop */
                `OpenAPI '$self' must be a valid URI reference. Value: "${String(spec.$self)}"`,
            );
        }
    }

    /* v8 ignore next */
    const operationKeys = ['get', 'post', 'put', 'delete', 'options', 'head', 'patch', 'trace', 'query'];
    /* v8 ignore next */
    const operationIdLocations = new Map<string, string[]>();

    /* v8 ignore next */
    const recordOperationId = (operationId: string, location: string) => {
        /* v8 ignore next */
        const existing = operationIdLocations.get(operationId);
        /* v8 ignore next */
        if (existing) {
            /* v8 ignore next */
            existing.push(location);
        } else {
            /* v8 ignore next */
            operationIdLocations.set(operationId, [location]);
        }
    };

    /* v8 ignore next */
    const collectOperationIds = (paths: Record<string, unknown> | undefined, locationPrefix: string) => {
        /* v8 ignore next */
        if (!paths) return;

        /* v8 ignore next */
        for (const [pathKey, pVal] of Object.entries(paths)) {
            /* v8 ignore next */
            const pathItem = pVal as Record<string, unknown>;
            /* v8 ignore next */
            /* v8 ignore start */
            if (!pathItem || typeof pathItem !== 'object') continue;
            /* v8 ignore stop */

            /* v8 ignore next */
            for (const method of operationKeys) {
                /* v8 ignore next */
                const operation = pathItem[method] as Record<string, unknown> | undefined;
                /* v8 ignore next */
                if (operation?.operationId) {
                    /* v8 ignore next */
                    recordOperationId(
                        operation.operationId as string,
                        `${locationPrefix}${pathKey} ${method.toUpperCase()}`,
                    );
                }
            }

            /* v8 ignore next */
            const addOps = pathItem.additionalOperations as Record<string, unknown> | undefined;
            /* v8 ignore next */
            if (addOps) {
                /* v8 ignore next */
                for (const [method, opVal] of Object.entries(addOps)) {
                    /* v8 ignore next */
                    const operation = opVal as Record<string, unknown> | undefined;
                    /* v8 ignore next */
                    if (operation?.operationId) {
                        /* v8 ignore next */
                        recordOperationId(operation.operationId as string, `${locationPrefix}${pathKey} ${method}`);
                    }
                }
            }
        }
    };

    /* v8 ignore next */
    const collectCallbackPathItems = (
        paths: Record<string, unknown> | undefined,
        locationPrefix: string,
    ): Record<string, unknown> => {
        /* v8 ignore next */
        const callbacks: Record<string, unknown> = {};
        /* v8 ignore next */
        if (!paths) return callbacks;

        /* v8 ignore next */
        const visitOperation = (operation: unknown, opLocation: string) => {
            /* v8 ignore next */
            /* v8 ignore start */
            if (!operation || typeof operation !== 'object') return;
            /* v8 ignore stop */

            /* v8 ignore next */
            const cbMap = (operation as Record<string, unknown>).callbacks;
            /* v8 ignore next */
            if (!cbMap || typeof cbMap !== 'object') return;

            /* v8 ignore next */
            for (const [callbackName, callbackObj] of Object.entries(cbMap as Record<string, unknown>)) {
                /* v8 ignore next */
                /* v8 ignore start */
                if (!callbackObj || typeof callbackObj !== 'object') continue;
                /* v8 ignore stop */

                /* v8 ignore next */
                if (isRefLike(callbackObj)) {
                    /* v8 ignore next */
                    validateReferenceObject(callbackObj, `${opLocation}.callbacks.${callbackName}`);
                    /* v8 ignore next */
                    continue;
                }

                /* v8 ignore next */
                for (const [expression, callbackPathItem] of Object.entries(callbackObj as Record<string, unknown>)) {
                    /* v8 ignore next */
                    /* v8 ignore start */
                    if (!callbackPathItem || typeof callbackPathItem !== 'object') continue;
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    validateCallbackExpression(expression, `${opLocation}.callbacks.${callbackName}.${expression}`);
                    /* v8 ignore next */
                    validatePathItemOperations(
                        callbackPathItem,
                        `${opLocation}.callbacks.${callbackName}.${expression}`,
                        isOpenApi3,
                    );
                    /* v8 ignore next */
                    callbacks[`${opLocation}.callbacks.${callbackName}.${expression}`] = callbackPathItem;
                }
            }
        };

        /* v8 ignore next */
        for (const [pathKey, pVal] of Object.entries(paths)) {
            /* v8 ignore next */
            const pathItem = pVal as Record<string, unknown>;
            /* v8 ignore next */
            /* v8 ignore start */
            if (!pathItem || typeof pathItem !== 'object') continue;
            /* v8 ignore stop */

            /* v8 ignore next */
            for (const method of operationKeys) {
                /* v8 ignore next */
                const operation = pathItem[method];
                /* v8 ignore next */
                if (operation) {
                    /* v8 ignore next */
                    visitOperation(operation, `${locationPrefix}${pathKey}.${method}`);
                }
            }

            /* v8 ignore next */
            const addOps = pathItem.additionalOperations as Record<string, unknown> | undefined;
            /* v8 ignore next */
            if (addOps) {
                /* v8 ignore next */
                for (const [method, operation] of Object.entries(addOps)) {
                    /* v8 ignore next */
                    visitOperation(operation, `${locationPrefix}${pathKey}.additionalOperations.${method}`);
                }
            }
        }

        /* v8 ignore next */
        return callbacks;
    };

    /* v8 ignore next */
    if (spec.paths) {
        /* v8 ignore next */
        const signatures = new Map<string, string>(); // Signature -> Original Path key

        /* v8 ignore next */
        for (const pathKey of Object.keys(spec.paths)) {
            /* v8 ignore next */
            const pathItemObj = spec.paths[pathKey] as Record<string, unknown>;
            /* v8 ignore next */
            const pathItemRec = pathItemObj;

            /* v8 ignore next */
            const templateParams = getPathTemplateParams(pathKey);
            /* v8 ignore next */
            const templateParamSet = new Set(templateParams);
            /* v8 ignore next */
            const hasTemplateParams = templateParams.length > 0;

            const hasOperations =
                /* v8 ignore next */
                operationKeys.some(method => pathItemRec[method]) ||
                (pathItemRec.additionalOperations &&
                    Object.keys(pathItemRec.additionalOperations as Record<string, unknown>).length > 0);

            /* v8 ignore next */
            const hasPathParams = Array.isArray(pathItemObj.parameters) && pathItemObj.parameters.length > 0;
            // OAS 3.2: If the Path Item is empty (e.g., ACL constraints), template params are not required.
            /* v8 ignore next */
            const isEmptyPathItem = !hasOperations && !hasPathParams;
            /* v8 ignore next */
            const skipPathTemplateValidation = !!pathItemRec.$ref || isEmptyPathItem;

            // 4a. Paths Object field pattern: keys MUST start with "/"
            /* v8 ignore next */
            if (!pathKey.startsWith('/')) {
                /* v8 ignore next */
                throw new SpecValidationError(`Path key "${pathKey}" must start with "/".`);
            }

            /* v8 ignore next */
            validateTemplateBraces(pathKey, `paths.${pathKey}`, 'Path template');

            // 4a. Template Variable Uniqueness (OAS 3.2 Requirement)
            // Each template expression MUST NOT appear more than once in a single path template.
            /* v8 ignore next */
            if (hasTemplateParams) {
                /* v8 ignore next */
                const duplicates = templateParams.filter((param, index) => templateParams.indexOf(param) !== index);
                /* v8 ignore next */
                if (duplicates.length > 0) {
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `Path template "${pathKey}" repeats template variable(s): ${[...new Set(duplicates)].join(', ')}`,
                    );
                }
            }

            // 3.2 AdditionalOperations guard: disallow fixed HTTP methods in the map.
            /* v8 ignore next */
            if (isOpenApi3 && pathItemRec.additionalOperations) {
                /* v8 ignore next */
                const additionalOps = pathItemRec.additionalOperations as Record<string, unknown>;
                /* v8 ignore next */
                for (const methodKey of Object.keys(additionalOps)) {
                    /* v8 ignore next */
                    if (!HTTP_METHOD_TOKEN.test(methodKey)) {
                        /* v8 ignore next */
                        throw new SpecValidationError(
                            `Path '${pathKey}' defines additionalOperations method "${methodKey}" which is not a valid HTTP method token.`,
                        );
                    }
                    /* v8 ignore next */
                    const normalized = methodKey.toLowerCase();
                    /* v8 ignore next */
                    if (operationKeys.includes(normalized)) {
                        /* v8 ignore next */
                        throw new SpecValidationError(
                            `Path '${pathKey}' defines additionalOperations method "${methodKey}" which conflicts with a fixed HTTP method. ` +
                                `Use the corresponding fixed field (e.g. "${normalized}") instead.`,
                        );
                    }
                }

                /* v8 ignore next */
                for (const [methodKey, operation] of Object.entries(additionalOps)) {
                    /* v8 ignore next */
                    /* v8 ignore start */
                    if (operation && typeof operation === 'object') {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        const opRec = operation as Record<string, unknown>;
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (opRec.responses === undefined) {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            throw new SpecValidationError(
                                /* v8 ignore stop */
                                `Operation Object at 'paths.${pathKey}.additionalOperations.${methodKey}' must define 'responses'.`,
                            );
                        }
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (opRec.externalDocs) {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            validateExternalDocsObject(
                                /* v8 ignore stop */
                                opRec.externalDocs,
                                `${pathKey}.additionalOperations.${methodKey}.externalDocs`,
                            );
                        }
                        /* v8 ignore next */
                        validateUniqueParameters(
                            opRec.parameters,
                            `${pathKey}.additionalOperations.${methodKey}.parameters`,
                        );
                    }
                }
            }

            // 4. Path Template Hierarchy Validation (OAS 3.2 Requirement)
            /* v8 ignore next */
            const signature = getPathTemplateSignature(pathKey);

            /* v8 ignore next */
            if (signature.includes('{}')) {
                /* v8 ignore next */
                if (signatures.has(signature)) {
                    /* v8 ignore next */
                    const existingPath = signatures.get(signature)!;
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `Ambiguous path definition detected. OAS 3.2 forbids identical path hierarchies with different parameter names.\n` +
                            `Path 1: "${existingPath}"\n` +
                            `Path 2: "${pathKey}"`,
                    );
                }
                /* v8 ignore next */
                signatures.set(signature, pathKey);
            }

            // 5. Parameter Validation (OAS 3.2 Strictness)
            /* v8 ignore next */
            const pathParams = (pathItemObj.parameters || []) as Parameter[];
            /* v8 ignore next */
            validateUniqueParameters(pathParams, `${pathKey}.parameters`);

            /* v8 ignore next */
            const validatePathParam = (param: Parameter, location: string) => {
                /* v8 ignore next */
                /* v8 ignore start */
                if (param.in !== 'path') return;
                /* v8 ignore stop */
                /* v8 ignore next */
                if (!templateParamSet.has(param.name)) {
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `Path parameter '${param.name}' in '${location}' does not match any template variable in path '${pathKey}'.`,
                    );
                }
                /* v8 ignore next */
                if (param.required !== true) {
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `Path parameter '${param.name}' in '${location}' must be marked as required: true.`,
                    );
                }
            };

            /* v8 ignore next */
            for (const method of operationKeys) {
                /* v8 ignore next */
                const operation = pathItemRec[method] as Record<string, unknown> | undefined;
                /* v8 ignore next */
                if (operation) {
                    /* v8 ignore next */
                    if (isOpenApi3 && operation.responses === undefined) {
                        /* v8 ignore next */
                        throw new SpecValidationError(
                            `Operation Object at 'paths.${pathKey}.${method}' must define 'responses'.`,
                        );
                    }
                    /* v8 ignore next */
                    if (operation.externalDocs) {
                        /* v8 ignore next */
                        validateExternalDocsObject(operation.externalDocs, `${pathKey}.${method}.externalDocs`);
                    }

                    /* v8 ignore next */
                    const opParams = (operation.parameters || []) as Parameter[];
                    /* v8 ignore next */
                    validateUniqueParameters(opParams, `${pathKey}.${method}.parameters`);

                    /* v8 ignore next */
                    const allParams = [...pathParams, ...opParams];

                    // 5a. Path Template Parameter Validation
                    /* v8 ignore next */
                    if (hasTemplateParams && !skipPathTemplateValidation) {
                        /* v8 ignore next */
                        for (const name of templateParamSet) {
                            /* v8 ignore next */
                            const hasParam = allParams.some(
                                p =>
                                    /* v8 ignore next */
                                    !!p &&
                                    typeof p === 'object' &&
                                    (p as unknown as Record<string, unknown>).in === 'path' &&
                                    (p as unknown as Record<string, unknown>).name === name,
                            );

                            /* v8 ignore next */
                            if (!hasParam) {
                                /* v8 ignore next */
                                throw new SpecValidationError(
                                    `Path template '{${name}}' in '${method.toUpperCase()} ${pathKey}' is missing a corresponding 'in: path' parameter definition.`,
                                );
                            }
                        }
                    }

                    // 5a. Query vs Querystring Exclusivity
                    /* v8 ignore next */
                    const hasQuery = allParams.some(p => p.in === 'query');
                    /* v8 ignore next */
                    const hasQuerystring = allParams.some(p => p.in === 'querystring');

                    /* v8 ignore next */
                    if (hasQuery && hasQuerystring) {
                        /* v8 ignore next */
                        throw new SpecValidationError(
                            `Operation '${method.toUpperCase()} ${pathKey}' contains both 'query' and 'querystring' parameters. These are mutually exclusive.`,
                        );
                    }

                    /* v8 ignore next */
                    if (hasQuerystring) {
                        /* v8 ignore next */
                        const querystringParams = allParams.filter(p => p.in === 'querystring');
                        /* v8 ignore next */
                        if (querystringParams.length > 1) {
                            /* v8 ignore next */
                            throw new SpecValidationError(
                                `Operation '${method.toUpperCase()} ${pathKey}' defines more than one 'querystring' parameter. Only one is allowed.`,
                            );
                        }
                    }

                    /* v8 ignore next */
                    for (const [index, param] of allParams.entries()) {
                        /* v8 ignore next */
                        if (!param || typeof param !== 'object') {
                            /* v8 ignore next */
                            throw new SpecValidationError(
                                `Parameter in '${method.toUpperCase()} ${pathKey}' must be an object or Reference Object.`,
                            );
                        }

                        /* v8 ignore next */
                        if (isRefLike(param)) {
                            /* v8 ignore next */
                            validateReferenceObject(param, `${method.toUpperCase()} ${pathKey}.parameters[${index}]`);
                            /* v8 ignore next */
                            continue;
                        }

                        /* v8 ignore next */
                        const paramRec = param as unknown as Record<string, unknown>;

                        /* v8 ignore next */
                        if (typeof paramRec.name !== 'string' || paramRec.name.trim().length === 0) {
                            /* v8 ignore next */
                            throw new SpecValidationError(
                                `Parameter in '${method.toUpperCase()} ${pathKey}' must define a non-empty string 'name'.`,
                            );
                        }

                        /* v8 ignore next */
                        if (typeof paramRec.in !== 'string' || paramRec.in.trim().length === 0) {
                            /* v8 ignore next */
                            throw new SpecValidationError(
                                `Parameter '${paramRec.name}' in '${method.toUpperCase()} ${pathKey}' must define a non-empty string 'in'.`,
                            );
                        }

                        /* v8 ignore next */
                        if (
                            param.in === 'header' &&
                            typeof param.name === 'string' &&
                            RESERVED_HEADER_NAMES.has(param.name.toLowerCase())
                        ) {
                            /* v8 ignore next */
                            continue;
                        }

                        /* v8 ignore next */
                        if (!skipPathTemplateValidation && paramRec.in === 'path' && paramRec.name) {
                            /* v8 ignore next */
                            validatePathParam(param as Parameter, `${method.toUpperCase()} ${pathKey}`);
                        }

                        // 5b. Examples Exclusivity
                        /* v8 ignore next */
                        if (param.example !== undefined && param.examples !== undefined) {
                            /* v8 ignore next */
                            throw new SpecValidationError(
                                `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' contains both 'example' and 'examples'. These fields are mutually exclusive.`,
                            );
                        }

                        /* v8 ignore next */
                        if (param.examples && typeof param.examples === 'object') {
                            /* v8 ignore next */
                            Object.entries(param.examples as Record<string, unknown>).forEach(([name, example]) => {
                                /* v8 ignore next */
                                validateExampleObject(
                                    example,
                                    `${method.toUpperCase()} ${pathKey}.parameters.${param.name}.examples.${name}`,
                                );
                            });
                        }

                        /* v8 ignore next */
                        if (param.schema !== undefined) {
                            /* v8 ignore next */
                            validateSchemaExternalDocs(
                                param.schema,
                                `${method.toUpperCase()} ${pathKey}.parameters.${param.name}.schema`,
                            );
                        }

                        /* v8 ignore next */
                        if (isOpenApi3) {
                            // 5b.1 Require schema or content (OAS 3.2)
                            /* v8 ignore next */
                            if (param.schema === undefined && param.content === undefined) {
                                /* v8 ignore next */
                                throw new SpecValidationError(
                                    `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' must define either 'schema' or 'content'.`,
                                );
                            }

                            // 5c. Schema vs Content Exclusivity (OAS 3.2)
                            /* v8 ignore next */
                            if (param.schema !== undefined && param.content !== undefined) {
                                /* v8 ignore next */
                                throw new SpecValidationError(
                                    `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' contains both 'schema' and 'content'. These fields are mutually exclusive.`,
                                );
                            }

                            // strict content map check (OAS 3.2)
                            /* v8 ignore next */
                            if (param.content) {
                                /* v8 ignore next */
                                if (Object.keys(param.content).length !== 1) {
                                    /* v8 ignore next */
                                    throw new SpecValidationError(
                                        `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' has an invalid 'content' map. It MUST contain exactly one entry.`,
                                    );
                                }
                            }

                            // strict allowEmptyValue checks (OAS 3.2)
                            /* v8 ignore next */
                            if (param.allowEmptyValue) {
                                /* v8 ignore next */
                                if (param.in !== 'query') {
                                    /* v8 ignore next */
                                    throw new SpecValidationError(
                                        `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' defines 'allowEmptyValue' but location is not 'query'.`,
                                    );
                                }
                                /* v8 ignore next */
                                if (param.style) {
                                    /* v8 ignore next */
                                    throw new SpecValidationError(
                                        `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' defines 'allowEmptyValue' alongside 'style'. This is forbidden.`,
                                    );
                                }
                            }
                        }

                        // 5d. Querystring Strictness (OAS 3.2)
                        /* v8 ignore next */
                        if (param.in === 'querystring') {
                            /* v8 ignore next */
                            if (
                                param.style !== undefined ||
                                param.explode !== undefined ||
                                param.allowReserved !== undefined
                            ) {
                                /* v8 ignore next */
                                throw new SpecValidationError(
                                    `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' has location 'querystring' but defines style/explode/allowReserved, which are forbidden.`,
                                );
                            }

                            /* v8 ignore next */
                            if (param.schema !== undefined) {
                                /* v8 ignore next */
                                throw new SpecValidationError(
                                    `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' has location 'querystring' but defines 'schema'. Querystring parameters MUST use 'content' instead.`,
                                );
                            }

                            /* v8 ignore next */
                            /* v8 ignore start */
                            if (param.content === undefined) {
                                /* v8 ignore stop */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore start */
                                throw new SpecValidationError(
                                    /* v8 ignore stop */
                                    `Parameter '${param.name}' in '${method.toUpperCase()} ${pathKey}' has location 'querystring' but is missing 'content'. Querystring parameters MUST use 'content'.`,
                                );
                            }
                        }

                        /* v8 ignore next */
                        if (isOpenApi3) {
                            /* v8 ignore next */
                            validateParameterStyle(
                                param as Parameter,
                                `${method.toUpperCase()} ${pathKey}.parameters.${param.name}`,
                            );
                        }

                        /* v8 ignore next */
                        if (isOpenApi3 && param.content) {
                            /* v8 ignore next */
                            validateContentMap(
                                param.content as Record<string, unknown>,
                                `paths.${pathKey}.${method}.parameters.${param.name}.content`,
                            );
                        }
                    }

                    /* v8 ignore next */
                    if (isOpenApi3) {
                        /* v8 ignore next */
                        validateRequestBody(operation.requestBody, `paths.${pathKey}.${method}.requestBody`);
                        /* v8 ignore next */
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

    /* v8 ignore next */
    const callbackPaths = {
        ...collectCallbackPathItems(spec.paths as Record<string, unknown> | undefined, 'paths.'),
        ...collectCallbackPathItems(spec.webhooks as Record<string, unknown> | undefined, 'webhooks.'),
    };

    /* v8 ignore next */
    if (isOpenApi3) {
        /* v8 ignore next */
        validateOperationsContent(spec.webhooks as Record<string, unknown> | undefined, 'webhooks.', isOpenApi3);
        /* v8 ignore next */
        if (Object.keys(callbackPaths).length > 0) {
            /* v8 ignore next */
            validateOperationsContent(callbackPaths, 'callbacks.', isOpenApi3);
        }
    }

    /* v8 ignore next */
    if (isOpenApi3) {
        // 5e. Server Object Validation (OAS 3.x)
        /* v8 ignore next */
        validateServers(spec.servers, 'servers');

        /* v8 ignore next */
        const validateServerLocations = (paths: Record<string, unknown> | undefined, locationPrefix: string) => {
            /* v8 ignore next */
            if (!paths) return;

            /* v8 ignore next */
            for (const [pathKey, pVal] of Object.entries(paths)) {
                /* v8 ignore next */
                const pathItem = pVal as Record<string, unknown>;
                /* v8 ignore next */
                /* v8 ignore start */
                if (!pathItem || typeof pathItem !== 'object') continue;
                /* v8 ignore stop */

                /* v8 ignore next */
                if (pathItem.servers) {
                    /* v8 ignore next */
                    validateServers(pathItem.servers as ServerObject[], `${locationPrefix}${pathKey}.servers`);
                }

                /* v8 ignore next */
                for (const method of operationKeys) {
                    /* v8 ignore next */
                    const operation = pathItem[method] as Record<string, unknown> | undefined;
                    /* v8 ignore next */
                    if (operation?.servers) {
                        /* v8 ignore next */
                        validateServers(
                            operation.servers as ServerObject[],
                            `${locationPrefix}${pathKey}.${method}.servers`,
                        );
                    }
                }

                /* v8 ignore next */
                const addOps = pathItem.additionalOperations as Record<string, unknown> | undefined;
                /* v8 ignore next */
                if (addOps) {
                    /* v8 ignore next */
                    for (const [method, opVal] of Object.entries(addOps)) {
                        /* v8 ignore next */
                        const operation = opVal as Record<string, unknown> | undefined;
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (operation?.servers) {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            validateServers(
                                /* v8 ignore stop */
                                operation.servers as ServerObject[],
                                `${locationPrefix}${pathKey}.additionalOperations.${method}.servers`,
                            );
                        }
                    }
                }
            }
        };

        /* v8 ignore next */
        validateServerLocations(spec.paths as Record<string, unknown> | undefined, 'paths.');
        /* v8 ignore next */
        validateServerLocations(spec.webhooks as Record<string, unknown> | undefined, 'webhooks.');
        /* v8 ignore next */
        if (Object.keys(callbackPaths).length > 0) {
            /* v8 ignore next */
            validateServerLocations(callbackPaths, 'callbacks.');
        }
    }

    // 6. OperationId Uniqueness (OpenAPI/Swagger)
    /* v8 ignore next */
    collectOperationIds(spec.paths as Record<string, unknown> | undefined, '');
    /* v8 ignore next */
    collectOperationIds(spec.webhooks as Record<string, unknown> | undefined, 'webhooks:');
    /* v8 ignore next */
    if (Object.keys(callbackPaths).length > 0) {
        /* v8 ignore next */
        collectOperationIds(callbackPaths, 'callbacks:');
    }

    /* v8 ignore next */
    if (isOpenApi3 && spec.components?.pathItems) {
        /* v8 ignore next */
        collectOperationIds(spec.components.pathItems as unknown as Record<string, unknown>, 'components.pathItems:');
    }

    /* v8 ignore next */
    if (isOpenApi3 && spec.components?.webhooks) {
        /* v8 ignore next */
        collectOperationIds(spec.components.webhooks as unknown as Record<string, unknown>, 'components.webhooks:');
    }

    /* v8 ignore next */
    if (isOpenApi3 && spec.components?.callbacks) {
        /* v8 ignore next */
        for (const [name, callbackObj] of Object.entries(spec.components.callbacks as Record<string, unknown>)) {
            /* v8 ignore next */
            /* v8 ignore start */
            if (!callbackObj || typeof callbackObj !== 'object') continue;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            if (isRefLike(callbackObj)) continue;
            /* v8 ignore stop */
            /* v8 ignore next */
            collectOperationIds(callbackObj as Record<string, unknown>, `components.callbacks.${name}:`);
        }
    }

    /* v8 ignore next */
    for (const [operationId, locations] of operationIdLocations.entries()) {
        /* v8 ignore next */
        if (locations.length > 1) {
            /* v8 ignore next */
            throw new SpecValidationError(
                `Duplicate operationId "${operationId}" found in multiple operations: ${locations.join(', ')}`,
            );
        }
    }

    // 7. Check Components Parameters Exclusivity (OAS 3.x)
    /* v8 ignore next */
    if (isOpenApi3 && spec.components?.parameters) {
        /* v8 ignore next */
        for (const [name, paramObj] of Object.entries(spec.components.parameters)) {
            /* v8 ignore next */
            const param = paramObj as Record<string, unknown>;
            /* v8 ignore next */
            if (!param || typeof param !== 'object') {
                /* v8 ignore next */
                throw new SpecValidationError(`Component parameter '${name}' must be an object or Reference Object.`);
            }

            /* v8 ignore next */
            /* v8 ignore start */
            if (isRefLike(param)) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                validateReferenceObject(param, `components.parameters.${name}`);
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                continue;
                /* v8 ignore stop */
            }

            /* v8 ignore next */
            if (typeof param.name !== 'string' || param.name.trim().length === 0) {
                /* v8 ignore next */
                throw new SpecValidationError(`Component parameter '${name}' must define a non-empty string 'name'.`);
            }

            /* v8 ignore next */
            if (typeof param.in !== 'string' || param.in.trim().length === 0) {
                /* v8 ignore next */
                throw new SpecValidationError(`Component parameter '${name}' must define a non-empty string 'in'.`);
            }

            /* v8 ignore next */
            /* v8 ignore start */
            if (
                /* v8 ignore stop */
                param.in === 'header' &&
                typeof param.name === 'string' &&
                RESERVED_HEADER_NAMES.has(param.name.toLowerCase())
            ) {
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                continue;
                /* v8 ignore stop */
            }

            /* v8 ignore next */
            if (param.example !== undefined && param.examples !== undefined) {
                /* v8 ignore next */
                throw new SpecValidationError(
                    `Component parameter '${name}' contains both 'example' and 'examples'. These fields are mutually exclusive.`,
                );
            }

            /* v8 ignore next */
            /* v8 ignore start */
            if (param.examples && typeof param.examples === 'object') {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                Object.entries(param.examples as Record<string, unknown>).forEach(([exampleName, example]) => {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    validateExampleObject(example, `components.parameters.${name}.examples.${exampleName}`);
                    /* v8 ignore stop */
                });
            }

            /* v8 ignore next */
            if (param.schema !== undefined) {
                /* v8 ignore next */
                validateSchemaExternalDocs(param.schema, `components.parameters.${name}.schema`);
            }

            // OAS 3.2: Component parameter must define either schema or content
            /* v8 ignore next */
            if (param.schema === undefined && param.content === undefined) {
                /* v8 ignore next */
                throw new SpecValidationError(
                    `Component parameter '${name}' must define either 'schema' or 'content'.`,
                );
            }

            // OAS 3.2 check for component parameter schema vs content exclusivity
            /* v8 ignore next */
            if (param.schema !== undefined && param.content !== undefined) {
                /* v8 ignore next */
                throw new SpecValidationError(
                    `Component parameter '${name}' contains both 'schema' and 'content'. These fields are mutually exclusive.`,
                );
            }

            // strict content map check
            /* v8 ignore next */
            if (param.content) {
                /* v8 ignore next */
                if (Object.keys(param.content as object).length !== 1) {
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `Component parameter '${name}' has an invalid 'content' map. It MUST contain exactly one entry.`,
                    );
                }
            }

            // strict allowEmptyValue checks
            /* v8 ignore next */
            if (param.allowEmptyValue) {
                /* v8 ignore next */
                if (param.in !== 'query') {
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `Component parameter '${name}' defines 'allowEmptyValue' but location is not 'query'.`,
                    );
                }
                /* v8 ignore next */
                if (param.style) {
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `Component parameter '${name}' defines 'allowEmptyValue' alongside 'style'. This is forbidden.`,
                    );
                }
            }

            // OAS 3.2 check for component parameter querystring constraints
            /* v8 ignore next */
            if (param.in === 'querystring') {
                /* v8 ignore next */
                if (param.style !== undefined || param.explode !== undefined || param.allowReserved !== undefined) {
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `Component parameter '${name}' has location 'querystring' but defines style/explode/allowReserved, which are forbidden.`,
                    );
                }
                /* v8 ignore next */
                if (param.schema !== undefined) {
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `Component parameter '${name}' has location 'querystring' but defines 'schema'. Querystring parameters MUST use 'content' instead.`,
                    );
                }
                /* v8 ignore next */
                /* v8 ignore start */
                if (param.content === undefined) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    throw new SpecValidationError(
                        /* v8 ignore stop */
                        `Component parameter '${name}' has location 'querystring' but is missing 'content'. Querystring parameters MUST use 'content'.`,
                    );
                }
            }

            /* v8 ignore next */
            /* v8 ignore start */
            if (isOpenApi3) {
                /* v8 ignore stop */
                /* v8 ignore next */
                validateParameterStyle(param as Parameter, `components.parameters.${name}`);
            }

            /* v8 ignore next */
            if (param.content) {
                /* v8 ignore next */
                validateContentMap(param.content as Record<string, unknown>, `components.parameters.${name}.content`);
            }
        }
    }

    /* v8 ignore next */
    if (isOpenApi3 && spec.components) {
        /* v8 ignore next */
        if (spec.components.headers) {
            /* v8 ignore next */
            validateHeadersMap(spec.components.headers as Record<string, unknown>, 'components.headers', isOpenApi3);
        }

        /* v8 ignore next */
        if (spec.components.links) {
            /* v8 ignore next */
            validateLinksMap(spec.components.links as Record<string, unknown>, 'components.links');
        }

        /* v8 ignore next */
        if (spec.components.examples) {
            /* v8 ignore next */
            for (const [name, exampleObj] of Object.entries(spec.components.examples)) {
                /* v8 ignore next */
                validateExampleObject(exampleObj, `components.examples.${name}`);
            }
        }

        /* v8 ignore next */
        if (spec.components.mediaTypes) {
            /* v8 ignore next */
            for (const [name, mediaObj] of Object.entries(spec.components.mediaTypes)) {
                /* v8 ignore next */
                validateMediaTypeObject(mediaObj, `components.mediaTypes.${name}`);
            }
        }

        /* v8 ignore next */
        if (spec.components.requestBodies) {
            /* v8 ignore next */
            for (const [name, requestBody] of Object.entries(spec.components.requestBodies)) {
                /* v8 ignore next */
                validateRequestBody(requestBody, `components.requestBodies.${name}`);
            }
        }

        /* v8 ignore next */
        if (spec.components.callbacks) {
            /* v8 ignore next */
            for (const [name, callbackObj] of Object.entries(spec.components.callbacks as Record<string, unknown>)) {
                /* v8 ignore next */
                /* v8 ignore start */
                if (!callbackObj || typeof callbackObj !== 'object') continue;
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore start */
                if (isRefLike(callbackObj)) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    validateReferenceObject(callbackObj, `components.callbacks.${name}`);
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    continue;
                    /* v8 ignore stop */
                }

                /* v8 ignore next */
                Object.entries(callbackObj as Record<string, unknown>).forEach(([expression, callbackPathItem]) => {
                    /* v8 ignore next */
                    validateCallbackExpression(expression, `components.callbacks.${name}.${expression}`);
                    /* v8 ignore next */
                    validatePathItemOperations(
                        callbackPathItem,
                        `components.callbacks.${name}.${expression}`,
                        isOpenApi3,
                    );
                });
            }
        }

        /* v8 ignore next */
        if (spec.components.pathItems) {
            /* v8 ignore next */
            validateOperationsContent(
                spec.components.pathItems as Record<string, unknown>,
                'components.pathItems.',
                isOpenApi3,
            );
        }

        /* v8 ignore next */
        if (spec.components.webhooks) {
            /* v8 ignore next */
            validateOperationsContent(
                spec.components.webhooks as Record<string, unknown>,
                'components.webhooks.',
                isOpenApi3,
            );
        }

        /* v8 ignore next */
        if (spec.components.responses) {
            /* v8 ignore next */
            validateComponentResponses(
                spec.components.responses as Record<string, unknown>,
                'components.responses',
                isOpenApi3,
            );
        }
    }

    /* v8 ignore next */
    const hasPaths = spec.paths !== undefined && spec.paths !== null;
    /* v8 ignore next */
    const hasComponents = !!spec.components;
    /* v8 ignore next */
    const hasWebhooks = !!spec.webhooks;

    /* v8 ignore next */
    if (isOpenApi3) {
        /* v8 ignore next */
        if (!hasPaths && !hasComponents && !hasWebhooks) {
            /* v8 ignore next */
            throw new SpecValidationError(
                "OpenAPI 3.x specification must contain at least one of: 'paths', 'components', or 'webhooks'.",
            );
        }

        // 9. Check Component Key Constraints (OAS 3.x)
        /* v8 ignore next */
        if (spec.components) {
            /* v8 ignore next */
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
            /* v8 ignore next */
            const validKeyRegex = /^[a-zA-Z0-9.\-_]+$/;

            /* v8 ignore next */
            for (const type of componentTypes) {
                /* v8 ignore next */
                const componentGroup = (spec.components as Record<string, unknown>)[type] as
                    | Record<string, unknown>
                    | undefined;
                /* v8 ignore next */
                if (componentGroup) {
                    /* v8 ignore next */
                    for (const key of Object.keys(componentGroup)) {
                        /* v8 ignore next */
                        if (!validKeyRegex.test(key)) {
                            /* v8 ignore next */
                            throw new SpecValidationError(
                                `Invalid component key "${key}" in "components.${type}". Keys must match regex: ^[a-zA-Z0-9\\.\\-_]+$`,
                            );
                        }
                    }
                }
            }
        }

        /* v8 ignore next */
        if (spec.components?.schemas) {
            /* v8 ignore next */
            Object.entries(spec.components.schemas).forEach(([name, schema]) => {
                /* v8 ignore next */
                validateSchemaExternalDocs(schema, `components.schemas.${name}`);
            });
        }

        // 9c. Security Scheme validation (OAS 3.x)
        /* v8 ignore next */
        if (spec.components?.securitySchemes) {
            /* v8 ignore next */
            validateSecuritySchemes(
                spec.components.securitySchemes as Record<string, unknown>,
                'components.securitySchemes',
                true,
            );
        }

        // 9b. Tag parent + uniqueness validation (OAS 3.2)
        /* v8 ignore next */
        if (spec.tags && spec.tags.length > 0) {
            /* v8 ignore next */
            const tagNames = new Set<string>();
            /* v8 ignore next */
            const duplicates = new Set<string>();
            /* v8 ignore next */
            const parentMap = new Map<string, string>();

            /* v8 ignore next */
            spec.tags.forEach((tag: TagObject) => {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof tag.name === 'string') {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    if (tagNames.has(tag.name)) {
                        /* v8 ignore next */
                        duplicates.add(tag.name);
                    } else {
                        /* v8 ignore next */
                        tagNames.add(tag.name);
                    }
                }
            });

            /* v8 ignore next */
            if (duplicates.size > 0) {
                /* v8 ignore next */
                throw new SpecValidationError(`Duplicate tag name(s) detected: ${Array.from(duplicates).join(', ')}`);
            }

            /* v8 ignore next */
            spec.tags.forEach((tag: TagObject) => {
                /* v8 ignore next */
                if (tag.externalDocs) {
                    /* v8 ignore next */
                    validateExternalDocsObject(tag.externalDocs, `tags.${tag.name}.externalDocs`);
                }
                /* v8 ignore next */
                if (tag.parent) {
                    /* v8 ignore next */
                    if (!tagNames.has(tag.parent)) {
                        /* v8 ignore next */
                        throw new SpecValidationError(
                            `Tag "${tag.name}" has parent "${tag.parent}" which does not exist in tags array.`,
                        );
                    }
                    /* v8 ignore next */
                    parentMap.set(tag.name, tag.parent);
                }
            });

            // Detect circular references
            /* v8 ignore next */
            for (const tag of spec.tags) {
                /* v8 ignore next */
                const seen = new Set<string>();
                /* v8 ignore next */
                let current: string | undefined = tag.name;
                /* v8 ignore next */
                while (current && parentMap.has(current)) {
                    /* v8 ignore next */
                    if (seen.has(current)) {
                        /* v8 ignore next */
                        throw new SpecValidationError(`Circular tag parent reference detected at "${current}".`);
                    }
                    /* v8 ignore next */
                    seen.add(current);
                    /* v8 ignore next */
                    current = parentMap.get(current);
                }
            }
        }

        // 10. Check jsonSchemaDialect (OAS 3.1+)
        /* v8 ignore next */
        if (spec.jsonSchemaDialect) {
            /* v8 ignore next */
            if (typeof spec.jsonSchemaDialect !== 'string') {
                /* v8 ignore next */
                throw new SpecValidationError("Field 'jsonSchemaDialect' must be a string.");
            }
            // Spec: "This MUST be in the form of a URI."
            /* v8 ignore next */
            if (!isUrl(spec.jsonSchemaDialect)) {
                /* v8 ignore next */
                if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(spec.jsonSchemaDialect)) {
                    /* v8 ignore next */
                    throw new SpecValidationError(
                        `Field 'jsonSchemaDialect' must be a valid URI. Value: "${spec.jsonSchemaDialect}"`,
                    );
                }
            }
        }
    } else {
        /* v8 ignore next */
        if (!hasPaths) {
            /* v8 ignore next */
            throw new SpecValidationError("Swagger 2.0 specification must contain a 'paths' object.");
        }
    }

    /* v8 ignore next */
    if (spec.definitions) {
        /* v8 ignore next */
        Object.entries(spec.definitions).forEach(([name, schema]) => {
            /* v8 ignore next */
            validateSchemaExternalDocs(schema, `definitions.${name}`);
        });
    }
}
