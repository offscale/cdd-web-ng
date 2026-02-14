import { GeneratorConfig, MediaTypeObject, RequestBody, SwaggerDefinition, SwaggerResponse } from '../types/index.js';
import { pascalCase } from './string.js';

export function isDataTypeInterface(type: string): boolean {
    if (!type) return false;
    // Eliminate array brackets and generic wrappers for the base check
    const baseType = type.replace(/\[]/g, '').replace(/<.*>/g, '').trim();

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

    if (primitives.includes(baseType)) return false;

    // Check for inline values or signatures which are not named interfaces
    if (baseType.includes("'") || baseType.includes('"')) return false; // 'active' | 'inactive'
    if (baseType.includes('|') || baseType.includes('&')) return false; // Unions/Intersections
    if (baseType.includes('/*')) return false; // Comments
    if (baseType.includes('{')) return false; // Inline Object Definitions: { id: string }

    return true;
}

/**
 * Helpers for formatting literal values into TypeScript types.
 */
function formatLiteralValue(val: unknown): string {
    if (val === null) return 'null';
    if (typeof val === 'string') return `'${val.replace(/'/g, "\\'")}'`;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    return 'any';
}

function normalizeMediaType(value: string | undefined): string | undefined {
    if (!value || typeof value !== 'string') return undefined;
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
    const [type, subtype] = normalized.split('/');
    if (!type || !subtype) return 0;
    if (type.includes('*') || subtype.includes('*')) return 1;
    return 2;
}

function matchesMediaType(range: string, candidate: string): boolean {
    const [rangeType, rangeSubtype] = range.split('/');
    const [candType, candSubtype] = candidate.split('/');
    if (!rangeType || !rangeSubtype || !candType || !candSubtype) return false;
    if (rangeType !== '*' && rangeType !== candType) return false;

    if (rangeSubtype === '*') return true;
    if (!rangeSubtype.includes('*')) return rangeSubtype === candSubtype;

    const escaped = rangeSubtype.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`);
    return regex.test(candSubtype);
}

function filterMediaTypeEntries(entries: MediaTypeEntry[]): MediaTypeEntry[] {
    return entries.filter(candidate => {
        if (candidate.specificity === 2) return true;
        return !entries.some(
            other =>
                other !== candidate &&
                other.specificity > candidate.specificity &&
                matchesMediaType(candidate.normalized, other.normalized),
        );
    });
}

function getMediaTypePriority(normalized: string): number {
    if (normalized === 'application/json') return 0;
    if (normalized === 'application/x-json') return 1;
    if (normalized.includes('/json') || normalized.endsWith('+json')) return 2;
    if (normalized === 'multipart/form-data') return 3;
    if (normalized === 'application/x-www-form-urlencoded') return 4;
    if (normalized.startsWith('text/')) return 5;
    return 6;
}

function pickPreferredMediaType(content: Record<string, MediaTypeObject | undefined>): MediaTypeObject | undefined {
    const entries: MediaTypeEntry[] = [];

    Object.entries(content).forEach(([raw, media], index) => {
        if (!media) return;
        const normalized = normalizeMediaType(raw);
        if (!normalized) return;
        entries.push({
            raw,
            normalized,
            specificity: mediaTypeSpecificity(normalized),
            index,
            media,
        });
    });

    if (entries.length === 0) return undefined;

    const filtered = filterMediaTypeEntries(entries);
    if (filtered.length === 0) return undefined;

    const sorted = [...filtered].sort((a, b) => {
        const priorityDiff = getMediaTypePriority(a.normalized) - getMediaTypePriority(b.normalized);
        if (priorityDiff !== 0) return priorityDiff;
        const specificityDiff = b.specificity - a.specificity;
        if (specificityDiff !== 0) return specificityDiff;
        return a.index - b.index;
    });

    return sorted[0]?.media;
}

function isTextualMediaType(mediaType: string | undefined): boolean {
    if (!mediaType) return false;
    if (mediaType.startsWith('text/')) return true;
    if (mediaType === 'application/x-www-form-urlencoded') return true;
    if (mediaType === 'application/json' || mediaType.endsWith('+json') || mediaType.includes('json')) return true;
    if (mediaType === 'application/xml' || mediaType.endsWith('+xml') || mediaType.includes('xml')) return true;
    return false;
}

function isBinaryMediaType(mediaType: string | undefined): boolean {
    if (!mediaType) return false;
    if (mediaType.startsWith('image/') || mediaType.startsWith('audio/') || mediaType.startsWith('video/')) return true;
    if (mediaType === 'application/octet-stream') return true;
    return false;
}

export function getTypeScriptType(
    schema: SwaggerDefinition | boolean | undefined,
    config: GeneratorConfig,
    knownTypes: string[] = [],
): string {
    if (schema === true) return 'any';
    if (schema === false) return 'never';
    if (!schema) return 'any';

    // OAS 3.0 nullable support: add a null union when explicitly requested.
    if (schema.nullable) {
        const { nullable: _ignored, ...rest } = schema;
        const baseType = getTypeScriptType(rest as SwaggerDefinition, config, knownTypes);
        if (baseType === 'any' || /\bnull\b/.test(baseType)) {
            return baseType;
        }
        return `${baseType} | null`;
    }

    const hasDependentSchemas = !!schema.dependentSchemas;
    const hasDependentRequired = !!schema.dependentRequired;
    if (hasDependentSchemas || hasDependentRequired) {
        const { dependentSchemas, dependentRequired, ...restSchema } = schema;
        const baseType = getTypeScriptType(restSchema, config, knownTypes);
        const dependencies: string[] = [];

        if (dependentSchemas) {
            Object.entries(dependentSchemas).forEach(([propName, titleOrSchema]) => {
                const depSchema = titleOrSchema as SwaggerDefinition | boolean;
                const depType = getTypeScriptType(depSchema, config, knownTypes);
                const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName) ? propName : `'${propName}'`;

                // Schema: If 'propName' key exists in the object, then the object must ALSO satisfy 'depType'.
                // TS Intersection: ( { prop: any } & DepType ) | { prop?: never }
                dependencies.push(`(({ ${safeKey}: any } & ${depType}) | { ${safeKey}?: never })`);
            });
        }

        if (dependentRequired) {
            Object.entries(dependentRequired).forEach(([propName, requiredList]) => {
                if (!Array.isArray(requiredList) || requiredList.length === 0) return;
                const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName) ? propName : `'${propName}'`;
                const requiredFields = requiredList
                    .filter((req): req is string => typeof req === 'string')
                    .map(req => (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(req) ? req : `'${req}'`))
                    .map(req => `${req}: unknown`)
                    .join('; ');
                if (!requiredFields) return;
                dependencies.push(`(({ ${safeKey}: unknown } & { ${requiredFields} }) | { ${safeKey}?: never })`);
            });
        }

        if (dependencies.length > 0) {
            return `${baseType} & ${dependencies.join(' & ')}`;
        }
    }

    if (schema.$ref) {
        const typeName = pascalCase(schema.$ref.split('/').pop() || '');
        return knownTypes.includes(typeName) ? typeName : 'any';
    }
    if (schema.$dynamicRef) {
        const typeName = pascalCase(schema.$dynamicRef.split('/').pop() || '');
        return knownTypes.includes(typeName) ? typeName : 'any';
    }

    // OAS 3.1 / JSON Schema 2020-12: const support
    if (schema.const !== undefined) {
        return formatLiteralValue(schema.const);
    }

    if (Array.isArray(schema.type)) {
        const types = schema.type.map(t => {
            if (t === 'null') return 'null';
            return getTypeScriptType({ ...schema, type: t }, config, knownTypes);
        });
        return [...new Set(types)].join(' | ');
    }

    if (schema.oneOf) return schema.oneOf.map(s => getTypeScriptType(s, config, knownTypes)).join(' | ');
    if (schema.anyOf) return schema.anyOf.map(s => getTypeScriptType(s, config, knownTypes)).join(' | ');
    if (schema.allOf) return schema.allOf.map(s => getTypeScriptType(s, config, knownTypes)).join(' & ');

    if (schema.enum) {
        if (schema.title && knownTypes.includes(pascalCase(schema.title))) return pascalCase(schema.title);
        if (config.options.enumStyle === 'union' || !schema.title) {
            return schema.enum.map(val => formatLiteralValue(val)).join(' | ');
        }
    }

    // OAS 3.1 Auto-decoding support: contentSchema
    // If a schema has contentSchema, it means the value (string) contains structure defined by contentSchema.
    // We return the type of that inner schema instead of 'string'.
    if (schema.contentSchema) {
        return getTypeScriptType(schema.contentSchema, config, knownTypes);
    }

    const normalizedMediaType = normalizeMediaType(schema.contentMediaType);
    const hasContentEncoding = typeof schema.contentEncoding === 'string' && schema.contentEncoding.length > 0;
    const isStringLike =
        schema.type === 'string' ||
        (schema.type === undefined &&
            !schema.properties &&
            !schema.additionalProperties &&
            !schema.unevaluatedProperties);

    if (hasContentEncoding && isStringLike) {
        return 'string';
    }

    if (normalizedMediaType && isStringLike) {
        if (isBinaryMediaType(normalizedMediaType)) {
            return 'Blob';
        }
        if (isTextualMediaType(normalizedMediaType)) {
            return 'string';
        }
    }

    // OAS 3.1: Infer array type if prefixItems is present
    if (schema.prefixItems && !schema.type) {
        return getArrayType(schema, config, knownTypes);
    }

    switch (schema.type) {
        case 'integer':
        case 'number':
            return getNumberType(schema, config);
        case 'string':
            return getStringType(schema, config);
        case 'boolean':
            return 'boolean';
        case 'file':
            return 'File';
        case 'null':
            return 'null';
        case 'array':
            return getArrayType(schema, config, knownTypes);
        case 'object':
            return getObjectType(schema, config, knownTypes);
        case undefined:
            if (schema.properties || schema.additionalProperties || schema.unevaluatedProperties)
                return getObjectType(schema, config, knownTypes);
            return 'any';
        default:
            return 'any';
    }
}

function getNumberType(schema: SwaggerDefinition, config: GeneratorConfig): string {
    if (schema.enum) return schema.enum.map(val => formatLiteralValue(val)).join(' | ');
    if (schema.format === 'int64' && config.options.int64Type) return config.options.int64Type;
    return 'number';
}

function getStringType(schema: SwaggerDefinition, config: GeneratorConfig): string {
    if (schema.enum) return schema.enum.map(val => formatLiteralValue(val)).join(' | ');
    if (schema.format === 'date' || schema.format === 'date-time')
        return config.options.dateType === 'Date' ? 'Date' : 'string';
    if (schema.format === 'binary') return 'Blob';
    return 'string';
}

function getArrayType(schema: SwaggerDefinition, config: GeneratorConfig, knownTypes: string[]): string {
    // OAS 3.1 Tuple support using prefixItems
    if (schema.prefixItems && Array.isArray(schema.prefixItems)) {
        const prefixTypes = schema.prefixItems.map(s => getTypeScriptType(s, config, knownTypes));
        let restType = '';

        // In OAS 3.1, 'items' describes the elements AFTER the prefix items (rest elements)
        if (schema.items && !Array.isArray(schema.items)) {
            const itemsSchema = schema.items as SwaggerDefinition;
            const innerType = getTypeScriptType(itemsSchema, config, knownTypes);
            const safeInnerType = innerType.includes('|') || innerType.includes('&') ? `(${innerType})` : innerType;
            restType = `, ...${safeInnerType}[]`;
        } else if (schema.unevaluatedItems !== undefined) {
            // JSON Schema 2020-12: unevaluatedItems applies to remaining tuple items
            const unevaluated = schema.unevaluatedItems;
            if (unevaluated === true) {
                restType = `, ...any[]`;
            } else if (unevaluated === false) {
                restType = '';
            } else {
                const innerType = getTypeScriptType(unevaluated as SwaggerDefinition, config, knownTypes);
                const safeInnerType = innerType.includes('|') || innerType.includes('&') ? `(${innerType})` : innerType;
                restType = `, ...${safeInnerType}[]`;
            }
        }

        return `[${prefixTypes.join(', ')}${restType}]`;
    }

    if (Array.isArray(schema.items))
        return `[${schema.items.map(s => getTypeScriptType(s, config, knownTypes)).join(', ')}]`;
    const itemsSchema = schema.items ?? schema.unevaluatedItems ?? {};
    const itemsType = getTypeScriptType(itemsSchema as SwaggerDefinition | boolean, config, knownTypes);
    return itemsType.includes('|') || itemsType.includes('&') ? `(${itemsType})[]` : `${itemsType}[]`;
}

function getObjectType(schema: SwaggerDefinition, config: GeneratorConfig, knownTypes: string[]): string {
    let indexSignatureTypes: string[] = [];

    // 1. additionalProperties
    if (schema.additionalProperties) {
        const valueType =
            schema.additionalProperties === true
                ? 'any'
                : getTypeScriptType(schema.additionalProperties as SwaggerDefinition, config, knownTypes);
        indexSignatureTypes.push(valueType);
    }

    // 1b. patternProperties (JSON Schema 2020-12)
    if (schema.patternProperties && typeof schema.patternProperties === 'object') {
        const patternTypes = Object.values(schema.patternProperties)
            .map(patternSchema => getTypeScriptType(patternSchema as SwaggerDefinition | boolean, config, knownTypes))
            .filter(Boolean);
        if (patternTypes.length > 0) {
            indexSignatureTypes.push(...patternTypes);
        }
    }

    // 2. unevaluatedProperties (OAS 3.1)
    if (schema.unevaluatedProperties) {
        const valueType =
            schema.unevaluatedProperties === true
                ? 'any'
                : getTypeScriptType(schema.unevaluatedProperties as SwaggerDefinition, config, knownTypes);
        indexSignatureTypes.push(valueType);
    }

    // Resolve combined index signature type
    let indexSignatureType = '';
    if (indexSignatureTypes.length > 0) {
        if (indexSignatureTypes.includes('any')) {
            indexSignatureType = 'any';
        } else {
            indexSignatureType = [...new Set(indexSignatureTypes)].join(' | ');
        }
    }

    // Logic to determine if object is explicitly closed (no index signature allowed)
    // If both are explicitly false, closed.
    // If one is false and other missing, it depends on interpretation, but generally safe to close if all known dynamic props are forbidden.
    // However, standard JSON schema implies if additionalProperties is explicitly false, no extra props.
    const explicitlyClosed =
        schema.additionalProperties === false &&
        (schema.unevaluatedProperties === false || schema.unevaluatedProperties === undefined);

    if (schema.properties) {
        if (Object.keys(schema.properties).length === 0) {
            if (explicitlyClosed) return '{}';
            return indexSignatureType ? `{ [key: string]: ${indexSignatureType} }` : '{ [key: string]: any }';
        }

        const props = Object.entries(schema.properties).map(([key, propSchema]) => {
            const isRequired = schema.required?.includes(key);
            const pType = getTypeScriptType(propSchema, config, knownTypes);
            const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
            return `${safeKey}${isRequired ? '' : '?'}: ${pType}`;
        });

        if (indexSignatureType) {
            return `{ ${props.join('; ')}; [key: string]: ${indexSignatureType} | any }`;
        }

        // Note: We rely on this exact formatting without trailing semicolon for unit tests assertions
        return `{ ${props.join('; ')} }`;
    }

    if (explicitlyClosed) return '{}';
    return indexSignatureType ? `{ [key: string]: ${indexSignatureType} }` : '{ [key: string]: any }';
}

export function getRequestBodyType(
    requestBody: RequestBody | undefined,
    config: GeneratorConfig,
    knownTypes: string[],
): string {
    if (!requestBody || !requestBody.content) return 'any';

    const content = requestBody.content as Record<string, MediaTypeObject>;
    const preferred = pickPreferredMediaType(content);
    if (preferred?.schema !== undefined) {
        return getTypeScriptType(preferred.schema, config, knownTypes);
    }
    if (preferred?.itemSchema !== undefined) {
        const itemType = getTypeScriptType(preferred.itemSchema, config, knownTypes);
        return `(${itemType})[]`;
    }

    return 'any';
}

export function getResponseType(
    response: SwaggerResponse | undefined,
    config: GeneratorConfig,
    knownTypes: string[],
): string {
    if (!response || !response.content) return 'void';
    const content = response.content as Record<string, MediaTypeObject>;
    const preferred = pickPreferredMediaType(content);
    if (preferred?.schema !== undefined) {
        return getTypeScriptType(preferred.schema, config, knownTypes);
    }
    if (preferred?.itemSchema !== undefined) {
        const itemType = getTypeScriptType(preferred.itemSchema, config, knownTypes);
        return `(${itemType})[]`;
    }
    return 'void';
}
