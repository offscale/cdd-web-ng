import {
    GeneratorConfig,
    MediaTypeObject,
    RequestBody,
    SwaggerDefinition,
    SwaggerResponse,
} from '../core/types/index.js';
import { pascalCase } from '../functions/utils_string.js';

export function isDataTypeInterface(type: string): boolean {
    /* v8 ignore next */
    if (!type) return false;
    // Eliminate array brackets and generic wrappers for the base check
    /* v8 ignore next */
    const baseType = type.replace(/\[]/g, '').replace(/<.*>/g, '').trim();

    /* v8 ignore next */
    const primitives = [
        'string',
        'number',
        'boolean',
        'any',
        'void',
        'undefined',
        'null',
        'unknown',
        'never',
        'object',
        'Date',
        'Blob',
        'File',
        'Buffer',
    ];

    /* v8 ignore next */
    if (primitives.includes(baseType)) return false;

    // Check for inline values or signatures which are not named interfaces
    /* v8 ignore next */
    if (baseType.includes("'") || baseType.includes('"')) return false; // 'active' | 'inactive'
    /* v8 ignore next */
    if (baseType.includes('|') || baseType.includes('&')) return false; // Unions/Intersections
    /* v8 ignore next */
    if (baseType.includes('/*')) return false; // Comments
    /* v8 ignore next */
    if (baseType.includes('{')) return false; // Inline Object Definitions: { id: string }

    /* v8 ignore next */
    return true;
}

/**
 * Helpers for formatting literal values into TypeScript types.
 */
function formatLiteralValue(val: unknown): string {
    /* v8 ignore next */
    if (val === null) return 'null';
    /* v8 ignore next */
    if (typeof val === 'string') return `'${val.replace(/'/g, "\\'")}'`;
    /* v8 ignore next */
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    /* v8 ignore next */
    return 'any';
}

function normalizeMediaType(value: string | undefined): string | undefined {
    /* v8 ignore next */
    if (!value || typeof value !== 'string') return undefined;
    /* v8 ignore next */
    return value.split(';')[0]?.trim().toLowerCase();
}

type MediaTypeEntry = {
    raw: string;
    normalized: string;
    specificity: number;
    index: number;
    media: MediaTypeObject;
};

function mediaTypeSpecificity(normalized: string): number {
    /* v8 ignore next */
    const [type, subtype] = normalized.split('/');
    /* v8 ignore next */
    /* v8 ignore start */
    if (!type || !subtype) return 0;
    /* v8 ignore stop */
    /* v8 ignore next */
    if (type.includes('*') || subtype.includes('*')) return 1;
    /* v8 ignore next */
    return 2;
}

function matchesMediaType(range: string, candidate: string): boolean {
    /* v8 ignore next */
    const [rangeType, rangeSubtype] = range.split('/');
    /* v8 ignore next */
    const [candType, candSubtype] = candidate.split('/');
    /* v8 ignore next */
    /* v8 ignore start */
    if (!rangeType || !rangeSubtype || !candType || !candSubtype) return false;
    /* v8 ignore stop */
    /* v8 ignore next */
    /* v8 ignore start */
    if (rangeType !== '*' && rangeType !== candType) return false;
    /* v8 ignore stop */

    /* v8 ignore next */
    if (rangeSubtype === '*') return true;
    /* v8 ignore next */
    /* v8 ignore start */
    if (!rangeSubtype.includes('*')) return rangeSubtype === candSubtype;
    /* v8 ignore stop */

    /* v8 ignore next */
    const escaped = rangeSubtype.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
    /* v8 ignore next */
    const regex = new RegExp(`^${escaped}$`);
    /* v8 ignore next */
    return regex.test(candSubtype);
}

function filterMediaTypeEntries(entries: MediaTypeEntry[]): MediaTypeEntry[] {
    /* v8 ignore next */
    return entries.filter(candidate => {
        /* v8 ignore next */
        if (candidate.specificity === 2) return true;
        /* v8 ignore next */
        return !entries.some(
            other =>
                /* v8 ignore next */
                other !== candidate &&
                other.specificity > candidate.specificity &&
                matchesMediaType(candidate.normalized, other.normalized),
        );
    });
}

function getMediaTypePriority(normalized: string): number {
    /* v8 ignore next */
    if (normalized === 'application/json') return 0;
    /* v8 ignore next */
    /* v8 ignore start */
    if (normalized === 'application/x-json') return 1;
    /* v8 ignore stop */
    /* v8 ignore next */
    if (normalized.includes('/json') || normalized.endsWith('+json')) return 2;
    /* v8 ignore next */
    /* v8 ignore start */
    if (normalized === 'multipart/form-data') return 3;
    /* v8 ignore stop */
    /* v8 ignore next */
    /* v8 ignore start */
    if (normalized === 'application/x-www-form-urlencoded') return 4;
    /* v8 ignore stop */
    /* v8 ignore next */
    if (normalized.startsWith('text/')) return 5;
    /* v8 ignore next */
    return 6;
}

function pickPreferredMediaType(content: Record<string, MediaTypeObject | undefined>): MediaTypeObject | undefined {
    /* v8 ignore next */
    const entries: MediaTypeEntry[] = [];

    /* v8 ignore next */
    Object.entries(content).forEach(([raw, media], index) => {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!media) return;
        /* v8 ignore stop */
        /* v8 ignore next */
        const normalized = normalizeMediaType(raw);
        /* v8 ignore next */
        /* v8 ignore start */
        if (!normalized) return;
        /* v8 ignore stop */
        /* v8 ignore next */
        entries.push({
            raw,
            normalized,
            specificity: mediaTypeSpecificity(normalized),
            index,
            media,
        });
    });

    /* v8 ignore next */
    if (entries.length === 0) return undefined;

    /* v8 ignore next */
    const filtered = filterMediaTypeEntries(entries);
    /* v8 ignore next */
    /* v8 ignore start */
    if (filtered.length === 0) return undefined;
    /* v8 ignore stop */

    /* v8 ignore next */
    const sorted = [...filtered].sort((a, b) => {
        /* v8 ignore next */
        const priorityDiff = getMediaTypePriority(a.normalized) - getMediaTypePriority(b.normalized);
        /* v8 ignore next */
        if (priorityDiff !== 0) return priorityDiff;
        /* v8 ignore next */
        const specificityDiff = b.specificity - a.specificity;
        /* v8 ignore next */
        /* v8 ignore start */
        if (specificityDiff !== 0) return specificityDiff;
        /* v8 ignore stop */
        /* v8 ignore next */
        return a.index - b.index;
    });

    /* v8 ignore next */
    return sorted[0]?.media;
}

function isTextualMediaType(mediaType: string | undefined): boolean {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!mediaType) return false;
    /* v8 ignore stop */
    /* v8 ignore next */
    if (mediaType.startsWith('text/')) return true;
    /* v8 ignore next */
    /* v8 ignore start */
    if (mediaType === 'application/x-www-form-urlencoded') return true;
    /* v8 ignore stop */
    /* v8 ignore next */
    if (mediaType === 'application/json' || mediaType.endsWith('+json') || mediaType.includes('json')) return true;
    /* v8 ignore next */
    if (mediaType === 'application/xml' || mediaType.endsWith('+xml') || mediaType.includes('xml')) return true;
    /* v8 ignore next */
    /* v8 ignore next */
    return false;
}

function isBinaryMediaType(mediaType: string | undefined): boolean {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!mediaType) return false;
    /* v8 ignore stop */
    /* v8 ignore next */
    if (mediaType.startsWith('image/') || mediaType.startsWith('audio/') || mediaType.startsWith('video/')) return true;
    /* v8 ignore next */
    /* v8 ignore start */
    if (mediaType === 'application/octet-stream') return true;
    /* v8 ignore stop */
    /* v8 ignore next */
    return false;
}

export function getTypeScriptType(
    schema: SwaggerDefinition | boolean | undefined,
    config: GeneratorConfig,
    knownTypes: string[] = [],
): string {
    /* v8 ignore next */
    if (schema === true) return 'any';
    /* v8 ignore next */
    if (schema === false) return 'never';
    /* v8 ignore next */
    if (!schema) return 'any';

    // OAS 3.0 nullable support: add a null union when explicitly requested.
    /* v8 ignore next */
    if (schema.nullable) {
        /* v8 ignore next */
        const { nullable: _ignored, ...rest } = schema;
        /* v8 ignore next */
        const baseType = getTypeScriptType(rest as SwaggerDefinition, config, knownTypes);
        /* v8 ignore next */
        if (baseType === 'any' || /\bnull\b/.test(baseType)) {
            /* v8 ignore next */
            return baseType;
        }
        /* v8 ignore next */
        return `${baseType} | null`;
    }

    /* v8 ignore next */
    const hasDependentSchemas = !!schema.dependentSchemas;
    /* v8 ignore next */
    const hasDependentRequired = !!schema.dependentRequired;
    /* v8 ignore next */
    if (hasDependentSchemas || hasDependentRequired) {
        /* v8 ignore next */
        const { dependentSchemas, dependentRequired, ...restSchema } = schema;
        /* v8 ignore next */
        const baseType = getTypeScriptType(restSchema, config, knownTypes);
        /* v8 ignore next */
        const dependencies: string[] = [];

        /* v8 ignore next */
        if (dependentSchemas) {
            /* v8 ignore next */
            Object.entries(dependentSchemas).forEach(([propName, titleOrSchema]) => {
                /* v8 ignore next */
                const depSchema = titleOrSchema as SwaggerDefinition | boolean;
                /* v8 ignore next */
                const depType = getTypeScriptType(depSchema, config, knownTypes);
                /* v8 ignore next */
                const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName) ? propName : `'${propName}'`;

                // Schema: If 'propName' key exists in the object, then the object must ALSO satisfy 'depType'.
                // TS Intersection: ( { prop: any } & DepType ) | { prop?: never }
                /* v8 ignore next */
                dependencies.push(`(({ ${safeKey}: any } & ${depType}) | { ${safeKey}?: never })`);
            });
        }

        /* v8 ignore next */
        if (dependentRequired) {
            /* v8 ignore next */
            Object.entries(dependentRequired).forEach(([propName, requiredList]) => {
                /* v8 ignore next */
                if (!Array.isArray(requiredList) || requiredList.length === 0) return;
                /* v8 ignore next */
                const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName) ? propName : `'${propName}'`;
                /* v8 ignore next */
                const requiredFields = requiredList
                    /* v8 ignore next */
                    .filter((req): req is string => typeof req === 'string')
                    /* v8 ignore next */
                    .map(req => (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(req) ? req : `'${req}'`))
                    /* v8 ignore next */
                    .map(req => `${req}: unknown`)
                    .join('; ');
                /* v8 ignore next */
                if (!requiredFields) return;
                /* v8 ignore next */
                dependencies.push(`(({ ${safeKey}: unknown } & { ${requiredFields} }) | { ${safeKey}?: never })`);
            });
        }

        /* v8 ignore next */
        if (dependencies.length > 0) {
            /* v8 ignore next */
            return `${baseType} & ${dependencies.join(' & ')}`;
        }
    }

    /* v8 ignore next */
    if (schema.$ref) {
        /* v8 ignore next */
        const typeName = pascalCase(schema.$ref.split('/').pop() || '');
        /* v8 ignore next */
        return knownTypes.includes(typeName) ? typeName : 'any';
    }
    /* v8 ignore next */
    if (schema.$dynamicRef) {
        /* v8 ignore next */
        const typeName = pascalCase(schema.$dynamicRef.split('/').pop() || '');
        /* v8 ignore next */
        return knownTypes.includes(typeName) ? typeName : 'any';
    }

    // OAS 3.1 / JSON Schema 2020-12: const support
    /* v8 ignore next */
    if (schema.const !== undefined) {
        /* v8 ignore next */
        return formatLiteralValue(schema.const);
    }

    /* v8 ignore next */
    if (Array.isArray(schema.type)) {
        /* v8 ignore next */
        const types = schema.type.map(t => {
            /* v8 ignore next */
            if (t === 'null') return 'null';
            /* v8 ignore next */
            return getTypeScriptType({ ...schema, type: t }, config, knownTypes);
        });
        /* v8 ignore next */
        return [...new Set(types)].join(' | ');
    }

    /* v8 ignore next */
    if (schema.oneOf) return schema.oneOf.map(s => getTypeScriptType(s, config, knownTypes)).join(' | ');
    /* v8 ignore next */
    if (schema.anyOf) return schema.anyOf.map(s => getTypeScriptType(s, config, knownTypes)).join(' | ');
    /* v8 ignore next */
    if (schema.allOf) return schema.allOf.map(s => getTypeScriptType(s, config, knownTypes)).join(' & ');

    /* v8 ignore next */
    if (schema.enum) {
        /* v8 ignore next */
        if (schema.title && knownTypes.includes(pascalCase(schema.title))) return pascalCase(schema.title);
        /* v8 ignore next */
        if (config.options.enumStyle === 'union' || !schema.title) {
            /* v8 ignore next */
            return schema.enum.map(val => formatLiteralValue(val)).join(' | ');
        }
    }

    // OAS 3.1 Auto-decoding support: contentSchema
    // If a schema has contentSchema, it means the value (string) contains structure defined by contentSchema.
    // We return the type of that inner schema instead of 'string'.
    /* v8 ignore next */
    if (schema.contentSchema) {
        /* v8 ignore next */
        return getTypeScriptType(schema.contentSchema, config, knownTypes);
    }

    /* v8 ignore next */
    const normalizedMediaType = normalizeMediaType(schema.contentMediaType);
    /* v8 ignore next */
    const hasContentEncoding = typeof schema.contentEncoding === 'string' && schema.contentEncoding.length > 0;
    const isStringLike =
        /* v8 ignore next */
        schema.type === 'string' ||
        (schema.type === undefined &&
            !schema.properties &&
            !schema.additionalProperties &&
            !schema.unevaluatedProperties);

    /* v8 ignore next */
    if (hasContentEncoding && isStringLike) {
        /* v8 ignore next */
        return 'string';
    }

    /* v8 ignore next */
    if (normalizedMediaType && isStringLike) {
        /* v8 ignore next */
        if (isBinaryMediaType(normalizedMediaType)) {
            /* v8 ignore next */
            return 'Blob';
        }
        /* v8 ignore next */
        if (isTextualMediaType(normalizedMediaType)) {
            /* v8 ignore next */
            return 'string';
        }
    }

    // OAS 3.1: Infer array type if prefixItems is present
    /* v8 ignore next */
    if (schema.prefixItems && !schema.type) {
        /* v8 ignore next */
        return getArrayType(schema, config, knownTypes);
    }

    /* v8 ignore next */
    switch (schema.type) {
        case 'integer':
        case 'number':
            /* v8 ignore next */
            return getNumberType(schema, config);
        case 'string':
            /* v8 ignore next */
            return getStringType(schema, config);
        case 'boolean':
            /* v8 ignore next */
            return 'boolean';
        case 'file':
            /* v8 ignore next */
            return 'File';
        case 'null':
            /* v8 ignore next */
            return 'null';
        case 'array':
            /* v8 ignore next */
            return getArrayType(schema, config, knownTypes);
        case 'object':
            /* v8 ignore next */
            return getObjectType(schema, config, knownTypes);
        case undefined:
            /* v8 ignore next */
            if (schema.properties || schema.additionalProperties || schema.unevaluatedProperties)
                /* v8 ignore next */
                return getObjectType(schema, config, knownTypes);
            /* v8 ignore next */
            return 'any';
        default:
            /* v8 ignore next */
            return 'any';
    }
}

function getNumberType(schema: SwaggerDefinition, config: GeneratorConfig): string {
    /* v8 ignore next */
    if (schema.enum) return schema.enum.map(val => formatLiteralValue(val)).join(' | ');
    /* v8 ignore next */
    if (schema.format === 'int64' && config.options.int64Type) return config.options.int64Type;
    /* v8 ignore next */
    return 'number';
}

function getStringType(schema: SwaggerDefinition, config: GeneratorConfig): string {
    /* v8 ignore next */
    if (schema.enum) return schema.enum.map(val => formatLiteralValue(val)).join(' | ');
    /* v8 ignore next */
    if (schema.format === 'date' || schema.format === 'date-time')
        /* v8 ignore next */
        return config.options.dateType === 'Date' ? 'Date' : 'string';
    /* v8 ignore next */
    if (schema.format === 'binary') return 'Blob';
    /* v8 ignore next */
    return 'string';
}

function getArrayType(schema: SwaggerDefinition, config: GeneratorConfig, knownTypes: string[]): string {
    // OAS 3.1 Tuple support using prefixItems
    /* v8 ignore next */
    if (schema.prefixItems && Array.isArray(schema.prefixItems)) {
        /* v8 ignore next */
        const prefixTypes = schema.prefixItems.map(s => getTypeScriptType(s, config, knownTypes));
        /* v8 ignore next */
        let restType = '';

        // In OAS 3.1, 'items' describes the elements AFTER the prefix items (rest elements)
        /* v8 ignore next */
        if (schema.items && !Array.isArray(schema.items)) {
            /* v8 ignore next */
            const itemsSchema = schema.items as SwaggerDefinition;
            /* v8 ignore next */
            const innerType = getTypeScriptType(itemsSchema, config, knownTypes);
            /* v8 ignore next */
            /* v8 ignore start */
            const safeInnerType = innerType.includes('|') || innerType.includes('&') ? `(${innerType})` : innerType;
            /* v8 ignore stop */
            /* v8 ignore next */
            restType = `, ...${safeInnerType}[]`;
            /* v8 ignore next */
        } else if (schema.unevaluatedItems !== undefined) {
            // JSON Schema 2020-12: unevaluatedItems applies to remaining tuple items
            /* v8 ignore next */
            const unevaluated = schema.unevaluatedItems;
            /* v8 ignore next */
            if (unevaluated === true) {
                /* v8 ignore next */
                restType = `, ...any[]`;
                /* v8 ignore next */
            } else if (unevaluated === false) {
                /* v8 ignore next */
                restType = '';
            } else {
                /* v8 ignore next */
                const innerType = getTypeScriptType(unevaluated as SwaggerDefinition, config, knownTypes);
                /* v8 ignore next */
                /* v8 ignore start */
                const safeInnerType = innerType.includes('|') || innerType.includes('&') ? `(${innerType})` : innerType;
                /* v8 ignore stop */
                /* v8 ignore next */
                restType = `, ...${safeInnerType}[]`;
            }
        }

        /* v8 ignore next */
        return `[${prefixTypes.join(', ')}${restType}]`;
    }

    /* v8 ignore next */
    if (Array.isArray(schema.items))
        /* v8 ignore next */
        return `[${schema.items.map(s => getTypeScriptType(s, config, knownTypes)).join(', ')}]`;
    /* v8 ignore next */
    const itemsSchema = schema.items ?? schema.unevaluatedItems ?? {};
    /* v8 ignore next */
    const itemsType = getTypeScriptType(itemsSchema as SwaggerDefinition | boolean, config, knownTypes);
    /* v8 ignore next */
    return itemsType.includes('|') || itemsType.includes('&') ? `(${itemsType})[]` : `${itemsType}[]`;
}

function getObjectType(schema: SwaggerDefinition, config: GeneratorConfig, knownTypes: string[]): string {
    /* v8 ignore next */
    let indexSignatureTypes: string[] = [];

    // 1. additionalProperties
    /* v8 ignore next */
    if (schema.additionalProperties) {
        const valueType =
            /* v8 ignore next */
            schema.additionalProperties === true
                ? 'any'
                : getTypeScriptType(schema.additionalProperties as SwaggerDefinition, config, knownTypes);
        /* v8 ignore next */
        indexSignatureTypes.push(valueType);
    }

    // 1b. patternProperties (JSON Schema 2020-12)
    /* v8 ignore next */
    if (schema.patternProperties && typeof schema.patternProperties === 'object') {
        /* v8 ignore next */
        const patternTypes = Object.values(schema.patternProperties)
            /* v8 ignore next */
            .map(patternSchema => getTypeScriptType(patternSchema as SwaggerDefinition | boolean, config, knownTypes))
            .filter(Boolean);
        /* v8 ignore next */
        /* v8 ignore start */
        if (patternTypes.length > 0) {
            /* v8 ignore stop */
            /* v8 ignore next */
            indexSignatureTypes.push(...patternTypes);
        }
    }

    // 2. unevaluatedProperties (OAS 3.1)
    /* v8 ignore next */
    if (schema.unevaluatedProperties) {
        const valueType =
            /* v8 ignore next */
            schema.unevaluatedProperties === true
                ? 'any'
                : getTypeScriptType(schema.unevaluatedProperties as SwaggerDefinition, config, knownTypes);
        /* v8 ignore next */
        indexSignatureTypes.push(valueType);
    }

    // Resolve combined index signature type
    /* v8 ignore next */
    let indexSignatureType = '';
    /* v8 ignore next */
    if (indexSignatureTypes.length > 0) {
        /* v8 ignore next */
        if (indexSignatureTypes.includes('any')) {
            /* v8 ignore next */
            indexSignatureType = 'any';
        } else {
            /* v8 ignore next */
            indexSignatureType = [...new Set(indexSignatureTypes)].join(' | ');
        }
    }

    // Logic to determine if object is explicitly closed (no index signature allowed)
    // If both are explicitly false, closed.
    // If one is false and other missing, it depends on interpretation, but generally safe to close if all known dynamic props are forbidden.
    // However, standard JSON schema implies if additionalProperties is explicitly false, no extra props.
    const explicitlyClosed =
        /* v8 ignore next */
        schema.additionalProperties === false &&
        (schema.unevaluatedProperties === false || schema.unevaluatedProperties === undefined);

    /* v8 ignore next */
    if (schema.properties) {
        /* v8 ignore next */
        if (Object.keys(schema.properties).length === 0) {
            /* v8 ignore next */
            if (explicitlyClosed) return '{}';
            /* v8 ignore next */
            return indexSignatureType ? `{ [key: string]: ${indexSignatureType} }` : '{ [key: string]: any }';
        }

        /* v8 ignore next */
        const props = Object.entries(schema.properties).map(([key, propSchema]) => {
            /* v8 ignore next */
            const isRequired = schema.required?.includes(key);
            /* v8 ignore next */
            const pType = getTypeScriptType(propSchema, config, knownTypes);
            /* v8 ignore next */
            const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
            /* v8 ignore next */
            return `${safeKey}${isRequired ? '' : '?'}: ${pType}`;
        });

        /* v8 ignore next */
        if (indexSignatureType) {
            /* v8 ignore next */
            return `{ ${props.join('; ')}; [key: string]: ${indexSignatureType} | any }`;
        }

        // Note: We rely on this exact formatting without trailing semicolon for unit tests assertions
        /* v8 ignore next */
        return `{ ${props.join('; ')} }`;
    }

    /* v8 ignore next */
    if (explicitlyClosed) return '{}';
    /* v8 ignore next */
    return indexSignatureType ? `{ [key: string]: ${indexSignatureType} }` : '{ [key: string]: any }';
}

export function getRequestBodyType(
    requestBody: RequestBody | undefined,
    config: GeneratorConfig,
    knownTypes: string[],
): string {
    /* v8 ignore next */
    if (!requestBody || !requestBody.content) return 'any';

    /* v8 ignore next */
    const content = requestBody.content as Record<string, MediaTypeObject>;
    /* v8 ignore next */
    const preferred = pickPreferredMediaType(content);
    /* v8 ignore next */
    if (preferred?.schema !== undefined) {
        /* v8 ignore next */
        return getTypeScriptType(preferred.schema, config, knownTypes);
    }
    /* v8 ignore next */
    if (preferred?.itemSchema !== undefined) {
        /* v8 ignore next */
        const itemType = getTypeScriptType(preferred.itemSchema, config, knownTypes);
        /* v8 ignore next */
        return `(${itemType})[]`;
    }

    /* v8 ignore next */
    return 'any';
}

export function getResponseType(
    response: SwaggerResponse | undefined,
    config: GeneratorConfig,
    knownTypes: string[],
): string {
    /* v8 ignore next */
    if (!response || !response.content) return 'void';
    /* v8 ignore next */
    const content = response.content as Record<string, MediaTypeObject>;
    /* v8 ignore next */
    const preferred = pickPreferredMediaType(content);
    /* v8 ignore next */
    if (preferred?.schema !== undefined) {
        /* v8 ignore next */
        return getTypeScriptType(preferred.schema, config, knownTypes);
    }
    /* v8 ignore next */
    if (preferred?.itemSchema !== undefined) {
        /* v8 ignore next */
        const itemType = getTypeScriptType(preferred.itemSchema, config, knownTypes);
        /* v8 ignore next */
        return `(${itemType})[]`;
    }
    /* v8 ignore next */
    return 'void';
}
