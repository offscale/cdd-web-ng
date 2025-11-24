import { GeneratorConfig, RequestBody, SwaggerDefinition, SwaggerResponse } from '../types/index.js';
import { pascalCase } from './string.js';

/**
 * Checks if a TypeScript type string represents a named interface (a generated model),
 * as opposed to a primitive, a built-in type, or a structural type.
 */
export function isDataTypeInterface(type: string): boolean {
    const primitiveOrBuiltIn = /^(any|File|Blob|string|number|boolean|object|unknown|null|undefined|Date|void|bigint)$/;
    const isArray = /\[\]$/;
    const isUnion = / \| /;
    return !primitiveOrBuiltIn.test(type) && !isArray.test(type) && !isUnion.test(type) && !type.startsWith('{') && !type.startsWith('Record');
}

/**
 * Recursively resolves an OpenAPI schema object into a TypeScript type string.
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

    if (schema.$dynamicRef) {
        const ref = schema.$dynamicRef;
        const typeName = pascalCase(ref.split('#').pop()?.split('/').pop() || '');
        return typeName && knownTypes.includes(typeName) ? typeName : 'any';
    }

    if (schema.const !== undefined) {
        const val = schema.const;
        if (val === null) return 'null';
        if (typeof val === 'string') return `'${val.replace(/'/g, "\\'")}'`;
        if (typeof val === 'number' || typeof val === 'boolean') return String(val);
        return 'any';
    }

    if (schema.prefixItems && Array.isArray(schema.prefixItems)) {
        const tupleTypes = schema.prefixItems.map(s => getTypeScriptType(s, config, knownTypes));
        if (schema.items && !Array.isArray(schema.items)) {
            const restType = getTypeScriptType(schema.items as SwaggerDefinition, config, knownTypes);
            return `[${tupleTypes.join(', ')}, ...${restType}[]]`;
        }
        return `[${tupleTypes.join(', ')}]`;
    }

    if (schema.if) {
        const thenType = schema.then ? getTypeScriptType(schema.then, config, knownTypes) : 'any';
        const elseType = schema.else ? getTypeScriptType(schema.else, config, knownTypes) : 'any';

        if (schema.properties || schema.allOf) {
            const { if: _, then: __, else: ___, ...baseSchema } = schema;
            const baseType = getTypeScriptType(baseSchema, config, knownTypes);

            if (schema.then && schema.else) {
                return `${baseType} & (${thenType} | ${elseType})`;
            } else if (schema.then) {
                return `${baseType} & (${thenType} | any)`;
            } else if (schema.else) {
                return `${baseType} & (any | ${elseType})`;
            }
        } else {
            if (schema.then && schema.else) {
                return `${thenType} | ${elseType}`;
            }
            return 'any';
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
            const isDate = (schema.format === 'date' || schema.format === 'date-time') && config.options.dateType === 'Date';
            type = isDate ? 'Date' : 'string';

            if (schema.contentMediaType) {
                const isJson = schema.contentMediaType === 'application/json' || schema.contentMediaType.endsWith('+json');

                if (isJson && schema.contentSchema) {
                    // OAS 3.1 / JSON Schema 2019-09 String-Encoded JSON Support
                    const innerType = getTypeScriptType(schema.contentSchema as SwaggerDefinition, config, knownTypes);
                    type = `string /* JSON: ${innerType} */`;
                } else if (!isJson) {
                    type = 'Blob';
                }
            } else if (schema.format === 'binary') {
                type = 'Blob';
            }
            break;
        case 'number':
            type = 'number';
            break;
        case 'integer':
            if (schema.format === 'int64') {
                type = config.options.int64Type ?? 'number';
            } else {
                type = 'number';
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

            let allowIndexSignature = true;

            if (schema.unevaluatedProperties === false) {
                allowIndexSignature = false;
            } else if (typeof schema.unevaluatedProperties === 'object') {
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
                    allowIndexSignature = true;
                }
            }

            if (allowIndexSignature) {
                if (indexValueTypes.length > 0) {
                    const joined = Array.from(new Set(indexValueTypes)).join(' | ');
                    parts.push(`[key: string]: ${joined}`);
                } else if (!schema.properties && !schema.patternProperties && schema.unevaluatedProperties === undefined && schema.additionalProperties === undefined) {
                    parts.push('[key: string]: any');
                }
            }

            if (schema.dependentSchemas) {
                const deps = schema.dependentSchemas;
                Object.entries(deps).forEach(([prop, depSchema]) => {
                    const depType = getTypeScriptType(depSchema as SwaggerDefinition, config, knownTypes);
                    parts.push(`// dependentSchema: ${prop} -> ${depType}`);
                });
            }

            if (parts.length > 0) {
                type = `{ ${parts.join('; ')} }`;
            } else {
                type = allowIndexSignature ? 'Record<string, any>' : '{}';
            }
            break;
        default:
            type = 'any';
    }
    return schema.nullable ? `${type} | null` : type;
}

/**
 * Extracts the TypeScript type for a request body from a PathInfo object.
 */
export function getRequestBodyType(requestBody: RequestBody | undefined, config: GeneratorConfig, knownTypes: string[]): string {
    if (!requestBody?.content) return 'any';
    const schema = requestBody.content[Object.keys(requestBody.content)[0]]?.schema;
    return getTypeScriptType(schema as SwaggerDefinition, config, knownTypes);
}

/**
 * Extracts the TypeScript type for a successful response from a PathInfo object.
 */
export function getResponseType(response: SwaggerResponse | undefined, config: GeneratorConfig, knownTypes: string[]): string {
    const schema = response?.content?.['application/json']?.schema;
    return getTypeScriptType(schema as SwaggerDefinition, config, knownTypes);
}
