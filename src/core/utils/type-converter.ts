import { GeneratorConfig, RequestBody, SwaggerDefinition, SwaggerResponse } from '../types/index.js';
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

export function getTypeScriptType(
    schema: SwaggerDefinition | boolean | undefined,
    config: GeneratorConfig,
    knownTypes: string[] = [],
): string {
    if (schema === true) return 'any';
    if (schema === false) return 'never';
    if (!schema) return 'any';

    // JSON Schema 2020-12: dependentSchemas support
    if (schema.dependentSchemas) {
        // Generate the base type without the dependentSchemas property to avoid infinite recursion
        const { dependentSchemas, ...restSchema } = schema;
        const baseType = getTypeScriptType(restSchema, config, knownTypes);

        const dependencies = Object.entries(dependentSchemas).map(([propName, titleOrSchema]) => {
            const depSchema = titleOrSchema as SwaggerDefinition | boolean;
            const depType = getTypeScriptType(depSchema, config, knownTypes);
            const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName) ? propName : `'${propName}'`;

            // Schema: If 'propName' key exists in the object, then the object must ALSO satisfy 'depType'.
            // TS Intersection: ( { prop: any } & DepType ) | { prop?: never }
            return `(({ ${safeKey}: any } & ${depType}) | { ${safeKey}?: never })`;
        });

        return `${baseType} & ${dependencies.join(' & ')}`;
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

    if (schema.type === 'string') {
        if (schema.contentMediaType && !schema.contentMediaType.includes('json')) {
            return 'Blob';
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
    if (schema.enum) return schema.enum.join(' | ');
    if (schema.format === 'int64' && config.options.int64Type) return config.options.int64Type;
    return 'number';
}

function getStringType(schema: SwaggerDefinition, config: GeneratorConfig): string {
    if (schema.enum) return schema.enum.map(s => `'${s}'`).join(' | ');
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
        }

        return `[${prefixTypes.join(', ')}${restType}]`;
    }

    if (Array.isArray(schema.items))
        return `[${schema.items.map(s => getTypeScriptType(s, config, knownTypes)).join(', ')}]`;
    const itemsSchema = schema.items ?? {};
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

    const content = requestBody.content;
    const priority = [
        'application/json',
        'application/x-json',
        'multipart/form-data',
        'application/x-www-form-urlencoded',
        'text/plain',
    ];
    for (const key of priority) {
        if (content[key] && content[key].schema !== undefined)
            return getTypeScriptType(content[key].schema!, config, knownTypes);
        if (content[key] && content[key].schema === undefined && content[key].itemSchema !== undefined) {
            const itemType = getTypeScriptType(content[key].itemSchema!, config, knownTypes);
            return `(${itemType})[]`;
        }
    }
    const anyKey = Object.keys(content)[0];
    if (anyKey && content[anyKey].schema !== undefined)
        return getTypeScriptType(content[anyKey].schema!, config, knownTypes);
    if (anyKey && content[anyKey].schema === undefined && content[anyKey].itemSchema !== undefined) {
        const itemType = getTypeScriptType(content[anyKey].itemSchema!, config, knownTypes);
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
    const content = response.content;
    if (content['application/json']?.schema !== undefined)
        return getTypeScriptType(content['application/json'].schema!, config, knownTypes);
    if (content['application/json']?.schema === undefined && content['application/json']?.itemSchema !== undefined) {
        const itemType = getTypeScriptType(content['application/json'].itemSchema!, config, knownTypes);
        return `(${itemType})[]`;
    }
    const keys = Object.keys(content);
    if (keys.length > 0 && content[keys[0]].schema !== undefined)
        return getTypeScriptType(content[keys[0]].schema!, config, knownTypes);
    if (keys.length > 0 && content[keys[0]].schema === undefined && content[keys[0]].itemSchema !== undefined) {
        const itemType = getTypeScriptType(content[keys[0]].itemSchema!, config, knownTypes);
        return `(${itemType})[]`;
    }
    return 'void';
}
