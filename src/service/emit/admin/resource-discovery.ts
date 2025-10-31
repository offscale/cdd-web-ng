// src/service/emit/admin/resource-discovery.ts

import { SwaggerParser } from '../../../core/parser.js';
import { FormProperty, PathInfo, Resource, ResourceOperation, SwaggerDefinition } from '../../../core/types.js';
import { camelCase, extractPaths, pascalCase, singular } from '../../../core/utils.js';

function getResourceName(path: PathInfo): string {
    const tag = path.tags?.[0];
    if (tag) return camelCase(tag);

    const firstSegment = path.path.split('/').filter(p => p && !p.startsWith('{'))[0];
    return camelCase(firstSegment ?? 'default');
}

/**
 * FIX: Replaced with a more robust version that correctly distinguishes standard CRUD
 * from custom collection/item actions based on path structure. This prevents misclassifying
 * actions like 'POST /servers/rebootAll' as 'create'.
 */
function classifyAction(path: PathInfo): ResourceOperation['action'] {
    const method = path.method.toUpperCase();
    const hasIdSuffix = /\{\w+\}$/.test(path.path);
    const nonParamSegments = path.path.split('/').filter(p => p && !p.startsWith('{'));

    // Standard CRUD operations on root collection paths (e.g., /users, /books)
    if (nonParamSegments.length === 1) {
        if (method === 'GET' && !hasIdSuffix) return 'list';
        if (method === 'POST' && !hasIdSuffix) return 'create';
    }

    // Standard CRUD operations on item paths (e.g., /users/{id}, /books/{id})
    if (hasIdSuffix) {
        switch (method) {
            case 'GET':
                return 'getById';
            case 'PUT':
            case 'PATCH':
                return 'update';
            case 'DELETE':
                return 'delete';
        }
    }

    // If none of the standard patterns match, it's a custom action. Use operationId.
    if (path.operationId) return camelCase(path.operationId);

    // Fallback if no operationId is provided
    return camelCase(`${method} ${nonParamSegments.join(' ')}`);
}

function findSchema(schema: SwaggerDefinition | { $ref: string } | undefined, parser: SwaggerParser): SwaggerDefinition | undefined {
    if (!schema) return undefined;
    if ('$ref' in schema) return parser.resolveReference(schema.$ref);
    return schema;
}

function getFormProperties(operations: PathInfo[], parser: SwaggerParser): FormProperty[] {
    const allSchemas: SwaggerDefinition[] = [];

    // Collect schemas from ALL operations to build a complete model
    operations.forEach(op => {
        const reqSchema = findSchema(op?.requestBody?.content?.['application/json']?.schema, parser);
        if (reqSchema) allSchemas.push(reqSchema);

        const resSchema = findSchema(op?.responses?.['200']?.content?.['application/json']?.schema, parser)
            ?? findSchema(op?.responses?.['201']?.content?.['application/json']?.schema, parser);
        if (resSchema) allSchemas.push(resSchema);
    });

    if (allSchemas.length === 0) return [{ name: 'id', schema: { type: 'string' } }];

    // Merge properties from all found schemas
    const mergedProperties: Record<string, SwaggerDefinition> = {};
    const mergedRequired = new Set<string>();
    let mergedOneOf: SwaggerDefinition[] | undefined;
    let mergedDiscriminator: any;

    allSchemas.forEach(schema => {
        let effectiveSchema = schema;
        if (schema.type === 'array' && schema.items) {
            effectiveSchema = findSchema(schema.items as SwaggerDefinition, parser) ?? effectiveSchema;
        }

        Object.assign(mergedProperties, effectiveSchema.properties);
        effectiveSchema.required?.forEach(r => mergedRequired.add(r));
        if (effectiveSchema.oneOf) mergedOneOf = effectiveSchema.oneOf;
        if (effectiveSchema.discriminator) mergedDiscriminator = effectiveSchema.discriminator;
    });

    const finalSchema: SwaggerDefinition = {
        properties: mergedProperties,
        required: Array.from(mergedRequired),
        oneOf: mergedOneOf,
        discriminator: mergedDiscriminator
    };

    // Now continue with the existing logic using the final merged schema
    const properties: FormProperty[] = Object.entries(finalSchema.properties || {}).map(([name, propSchema]) => {
        const resolvedSchema = findSchema(propSchema, parser);
        const finalPropSchema = resolvedSchema ? { ...resolvedSchema, ...propSchema } : propSchema;
        finalPropSchema.required = finalSchema.required?.includes(name);

        if (finalPropSchema.type === 'array' && (finalPropSchema.items as any)?.$ref) {
            const resolvedItems = findSchema(finalPropSchema.items, parser);
            if (resolvedItems) {
                finalPropSchema.items = resolvedItems;
            }
        }

        return { name, schema: finalPropSchema };
    });

    if (finalSchema.oneOf && finalSchema.discriminator) {
        // Resolve the references inside the oneOf array
        const resolvedOneOf = finalSchema.oneOf.map(s => findSchema(s, parser)).filter((s): s is SwaggerDefinition => !!s);
        const dPropName = finalSchema.discriminator.propertyName;

        const existingProp = properties.find(p => p.name === dPropName);
        if (existingProp) {
            existingProp.schema.oneOf = resolvedOneOf;
            existingProp.schema.discriminator = finalSchema.discriminator;
        } else {
            properties.unshift({
                name: dPropName,
                schema: {
                    type: 'string',
                    required: finalSchema.required?.includes(dPropName),
                    oneOf: resolvedOneOf,
                    discriminator: finalSchema.discriminator
                }
            });
        }
    }

    if (properties.length === 0) {
        return [{ name: 'id', schema: { type: 'string' } }];
    }

    return properties;
}

function getModelName(resourceName: string, operations: PathInfo[], parser: SwaggerParser): string {
    const op = operations.find(o => o.method === 'POST') ?? operations.find(o => o.method === 'GET');
    const schema = op?.requestBody?.content?.['application/json']?.schema
        ?? op?.responses?.['200']?.content?.['application/json']?.schema;

    if (schema) {
        const ref = ('$ref' in schema ? schema.$ref : null)
            || ('items' in schema && (schema.items as any)?.$ref ? (schema.items as any).$ref : null);

        if (ref) return pascalCase(ref.split('/').pop()!);
    }

    // Fallback: singularize the resource name. This fixes the 'Publishers' -> 'Publisher' case.
    return singular(pascalCase(resourceName));
}

export function discoverAdminResources(parser: SwaggerParser): Resource[] {
    const allPaths = extractPaths(parser.getSpec().paths);
    const resourceMap = new Map<string, PathInfo[]>();

    // **CRITICAL FIX**: Group all paths by their determined resource name.
    allPaths.forEach(path => {
        const resourceName = getResourceName(path);
        if (!resourceMap.has(resourceName)) {
            resourceMap.set(resourceName, []);
        }
        resourceMap.get(resourceName)!.push(path);
    });

    const resources: Resource[] = [];
    for (const [name, allOpsForResource] of resourceMap.entries()) {
        if (allOpsForResource.length === 0) continue;

        const modelName = getModelName(name, allOpsForResource, parser);

        resources.push({
            name,
            modelName,
            isEditable: allOpsForResource.some(op => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(op.method)),
            operations: allOpsForResource.map(op => ({
                action: classifyAction(op),
                ...op
            })),
            formProperties: getFormProperties(allOpsForResource, parser)
        });
    }

    return resources;
}
