import { GeneratorConfig, RequestBody, SwaggerDefinition, SwaggerResponse } from "../types/index.js";
import { pascalCase } from "./string.js";

export function isDataTypeInterface(type: string): boolean {
    if (!type) return false;
    // Eliminate array brackets and generic wrappers for the base check
    const baseType = type.replace(/\[\]/g, '').replace(/<.*>/g, '').trim();

    const primitives = [
        'string', 'number', 'boolean', 'any', 'void', 'undefined', 'null', 'unknown',
        'never', 'object', 'Date', 'Blob', 'File', 'Buffer'
    ];

    if (primitives.includes(baseType)) return false;

    // Check for inline values or signatures which are not named interfaces
    if (baseType.includes("'") || baseType.includes('"')) return false; // 'active' | 'inactive'
    if (baseType.includes('|') || baseType.includes('&')) return false; // Unions/Intersections
    if (baseType.includes('/*')) return false; // Comments
    if (baseType.includes('{')) return false; // Inline Object Definitions: { id: string }

    return true;
}

export function getTypeScriptType(schema: SwaggerDefinition | undefined, config: GeneratorConfig, knownTypes: string[] = []): string {
    if (!schema) return 'any';

    if (schema.$ref) {
        const typeName = pascalCase(schema.$ref.split('/').pop() || '');
        return knownTypes.includes(typeName) ? typeName : 'any';
    }
    if (schema.$dynamicRef) {
        const typeName = pascalCase(schema.$dynamicRef.split('/').pop() || '');
        return knownTypes.includes(typeName) ? typeName : 'any';
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
            return schema.enum.map(val => {
                if (val === null) return 'null';
                if (typeof val === 'string') return `'${val.replace(/'/g, "\\'")}'`;
                return val;
            }).join(' | ');
        }
    }

    if (schema.type === 'string') {
        if (schema.contentMediaType && !schema.contentMediaType.includes('json')) {
            return 'Blob';
        }
        if (schema.contentSchema) {
            const innerType = getTypeScriptType(schema.contentSchema, config, knownTypes);
            return `string /* JSON: ${innerType} */`;
        }
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
            if (schema.properties || schema.additionalProperties) return getObjectType(schema, config, knownTypes);
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
    if (schema.format === 'date' || schema.format === 'date-time') return config.options.dateType === 'Date' ? 'Date' : 'string';
    if (schema.format === 'binary') return 'Blob';
    return 'string';
}

function getArrayType(schema: SwaggerDefinition, config: GeneratorConfig, knownTypes: string[]): string {
    if (Array.isArray(schema.items)) return `[${schema.items.map(s => getTypeScriptType(s, config, knownTypes)).join(', ')}]`;
    const itemsSchema = (schema.items as SwaggerDefinition) || {};
    const itemsType = getTypeScriptType(itemsSchema, config, knownTypes);
    return (itemsType.includes('|') || itemsType.includes('&')) ? `(${itemsType})[]` : `${itemsType}[]`;
}

function getObjectType(schema: SwaggerDefinition, config: GeneratorConfig, knownTypes: string[]): string {
    if (schema.additionalProperties) {
        const valueType = schema.additionalProperties === true
            ? 'any'
            : getTypeScriptType(schema.additionalProperties as SwaggerDefinition, config, knownTypes);
        return `{ [key: string]: ${valueType} }`;
    }

    if (schema.properties) {
        if (Object.keys(schema.properties).length === 0) return '{ [key: string]: any }';

        const props = Object.entries(schema.properties).map(([key, propSchema]) => {
            const isRequired = schema.required?.includes(key);
            const pType = getTypeScriptType(propSchema, config, knownTypes);
            const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
            return `${safeKey}${isRequired ? '' : '?'}: ${pType}`;
        });
        return `{ ${props.join('; ')} }`;
    }

    return '{ [key: string]: any }';
}

export function getRequestBodyType(requestBody: RequestBody | undefined, config: GeneratorConfig, knownTypes: string[]): string {
    if (!requestBody || !requestBody.content) return 'any';

    const content = requestBody.content;
    const priority = ['application/json', 'application/x-json', 'multipart/form-data', 'application/x-www-form-urlencoded', 'text/plain'];
    for (const key of priority) {
        if (content[key] && content[key].schema) return getTypeScriptType(content[key].schema!, config, knownTypes);
    }
    const anyKey = Object.keys(content)[0];
    if (anyKey && content[anyKey].schema) return getTypeScriptType(content[anyKey].schema!, config, knownTypes);

    return 'any';
}

export function getResponseType(response: SwaggerResponse | undefined, config: GeneratorConfig, knownTypes: string[]): string {
    if (!response || !response.content) return 'void';
    const content = response.content;
    if (content['application/json']?.schema) return getTypeScriptType(content['application/json'].schema!, config, knownTypes);
    const keys = Object.keys(content);
    if (keys.length > 0 && content[keys[0]].schema) return getTypeScriptType(content[keys[0]].schema!, config, knownTypes);
    return 'void';
}
