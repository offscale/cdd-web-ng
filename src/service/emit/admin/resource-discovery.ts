// src/service/emit/admin/resource-discovery.ts

import { SwaggerParser } from '../../../core/parser.js';
import { FormProperty, PathInfo, Resource, ResourceOperation, SwaggerDefinition, DiscriminatorObject } from '../../../core/types.js';
import { camelCase, extractPaths, pascalCase, singular } from '../../../core/utils.js';

/**
 * Derives a consistent method name for a given API operation.
 * It prefers the `operationId`, otherwise it constructs a name from the HTTP method and path.
 */
function getMethodName(op: PathInfo): string {
    const pathToMethodName = (path: string): string =>
        path.split('/').filter(Boolean).map(segment =>
            segment.startsWith('{') && segment.endsWith('}')
                ? `By${pascalCase(segment.slice(1, -1))}`
                : pascalCase(segment)
        ).join('');

    return op.operationId
        ? camelCase(op.operationId)
        : `${op.method.toLowerCase()}${pathToMethodName(op.path)}`;
}

/**
 * Derives a resource name from an operation, preferring tags over path segments.
 */
function getResourceName(path: PathInfo): string {
    const tag = path.tags?.[0];
    if (tag) return camelCase(tag);
    const firstSegment = path.path.split('/').filter(p => p && !p.startsWith('{'))[0];
    return camelCase(firstSegment ?? 'default');
}

/**
 * Classifies an API operation into a standard CRUD action or a custom action.
 * **This function contains the fix.**
 */
function classifyAction(path: PathInfo): ResourceOperation['action'] {
    const method = path.method.toUpperCase();
    const hasIdSuffix = /\{\w+\}$/.test(path.path);
    const nonParamSegments = path.path.split('/').filter(p => p && !p.startsWith('{'));

    // **FIX**: Prioritize operationId to allow custom actions that overlap with CRUD routes.
    // If an operationId is provided and it doesn't look like a standard CRUD verb, treat it as a custom action.
    if (path.operationId) {
        const opIdLower = path.operationId.toLowerCase();

        if (method === 'POST' && !hasIdSuffix && nonParamSegments.length === 1) {
            if (!opIdLower.startsWith('create') && !opIdLower.startsWith('add') && !opIdLower.startsWith('post')) {
                return camelCase(path.operationId);
            }
        }
        if ((method === 'PUT' || method === 'PATCH') && hasIdSuffix) {
            if (!opIdLower.startsWith('update') && !opIdLower.startsWith('edit') && !opIdLower.startsWith('patch') && !opIdLower.startsWith('put')) {
                return camelCase(path.operationId);
            }
        }
        if (method === 'DELETE' && hasIdSuffix) {
            // Only 'delete...' is standard. 'removeItem' or 'archiveItem' will become custom.
            if (!opIdLower.startsWith('delete')) {
                return camelCase(path.operationId);
            }
        }
    }

    // If we're here, it means the operationId looked standard, or didn't exist. Apply standard heuristics.
    if (!hasIdSuffix && nonParamSegments.length === 1) {
        if (method === 'GET') return 'list';
        if (method === 'POST') return 'create';
    }

    if (hasIdSuffix) {
        switch (method) {
            case 'GET': return 'getById';
            case 'PUT': case 'PATCH': return 'update';
            case 'DELETE': return 'delete';
        }
    }

    // Final fallback for all other non-standard paths (e.g. /items/search)
    if (path.operationId) {
        return camelCase(path.operationId);
    }

    return camelCase(`${method} ${nonParamSegments.join(' ')}`);
}

/**
 * A type-safe helper to resolve a potential `$ref` in a schema.
 */
function findSchema(schema: SwaggerDefinition | { $ref: string } | undefined, parser: SwaggerParser): SwaggerDefinition | undefined {
    if (!schema) return undefined;
    if ('$ref' in schema && typeof schema.$ref === 'string') return parser.resolveReference(schema.$ref);
    return schema as SwaggerDefinition;
}

/**
 * Aggregates properties from a resource's operations to build a model for form generation.
 */
function getFormProperties(operations: PathInfo[], parser: SwaggerParser): FormProperty[] {
    const allSchemas: SwaggerDefinition[] = [];
    operations.forEach(op => {
        const reqSchema = findSchema(op.requestBody?.content?.['application/json']?.schema, parser);
        if (reqSchema) allSchemas.push(reqSchema);
        const resSchema = findSchema(op.responses?.['200']?.content?.['application/json']?.schema, parser)
            ?? findSchema(op.responses?.['201']?.content?.['application/json']?.schema, parser);
        if (resSchema) allSchemas.push(resSchema);
    });

    if (allSchemas.length === 0) return [{ name: 'id', schema: { type: 'string' } }];

    const mergedProperties: Record<string, SwaggerDefinition> = {};
    const mergedRequired = new Set<string>();
    let mergedOneOf: SwaggerDefinition[] | undefined, mergedDiscriminator: DiscriminatorObject | undefined;

    allSchemas.forEach(schema => {
        let effectiveSchema = findSchema(schema.type === 'array' ? schema.items as SwaggerDefinition : schema, parser) ?? schema;

        if (effectiveSchema) {
            Object.assign(mergedProperties, effectiveSchema.properties);
            effectiveSchema.required?.forEach(r => mergedRequired.add(r));
            if (effectiveSchema.oneOf) mergedOneOf = effectiveSchema.oneOf;
            if (effectiveSchema.discriminator) mergedDiscriminator = effectiveSchema.discriminator;
        }
    });

    const finalSchema: SwaggerDefinition = { properties: mergedProperties, required: Array.from(mergedRequired), oneOf: mergedOneOf, discriminator: mergedDiscriminator };
    const properties: FormProperty[] = Object.entries(finalSchema.properties || {}).map(([name, propSchema]) => {
        const resolvedSchema = findSchema(propSchema, parser);
        const finalPropSchema: SwaggerDefinition = resolvedSchema ? { ...propSchema, ...resolvedSchema } : propSchema;
        if (finalSchema.required?.includes(name)) (finalPropSchema as any).required = true;
        return { name, schema: finalPropSchema };
    });

    if (finalSchema.oneOf && finalSchema.discriminator) {
        const dPropName = finalSchema.discriminator.propertyName;
        const existingProp = properties.find(p => p.name === dPropName);
        if (existingProp) {
            existingProp.schema.oneOf = finalSchema.oneOf;
            existingProp.schema.discriminator = finalSchema.discriminator;
        }
    }

    return properties.length > 0 ? properties : [{ name: 'id', schema: { type: 'string' } }];
}

/**
 * Derives a model name for a resource.
 */
function getModelName(resourceName: string, operations: PathInfo[], parser: SwaggerParser): string {
    const op = operations.find(o => o.method === 'POST') ?? operations.find(o => o.method === 'GET');
    const schema = op?.requestBody?.content?.['application/json']?.schema ?? op?.responses?.['200']?.content?.['application/json']?.schema;
    if (schema) {
        const ref = '$ref' in schema
            ? schema.$ref
            : schema.type === 'array' && schema.items && !Array.isArray(schema.items) && '$ref' in schema.items
                ? schema.items.$ref
                : null;
        if (ref) return pascalCase(ref.split('/').pop()!);
    }
    return singular(pascalCase(resourceName));
}

/**
 * The main discovery function.
 */
export function discoverAdminResources(parser: SwaggerParser): Resource[] {
    const allPaths = extractPaths(parser.getSpec().paths);
    const resourceMap = new Map<string, PathInfo[]>();
    allPaths.forEach(path => {
        const resourceName = getResourceName(path);
        if (!resourceMap.has(resourceName)) resourceMap.set(resourceName, []);
        resourceMap.get(resourceName)!.push(path);
    });

    const resources: Resource[] = [];
    for (const [name, allOpsForResource] of resourceMap.entries()) {
        if (allOpsForResource.length === 0) continue;
        const modelName = getModelName(name, allOpsForResource, parser);
        const formProperties = getFormProperties(allOpsForResource, parser);
        resources.push({
            name, modelName,
            isEditable: allOpsForResource.some(op => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(op.method)),
            operations: allOpsForResource.map((op): ResourceOperation => {
                const action = classifyAction(op);
                const standardActions = ['list', 'create', 'getById', 'update', 'delete'];
                const isItemOp = op.path.includes('{');
                return { ...op, action, methodName: getMethodName(op), isCustomItemAction: isItemOp && !standardActions.includes(action), isCustomCollectionAction: !isItemOp && !standardActions.includes(action) };
            }),
            formProperties,
            listProperties: formProperties.filter(p => !p.schema.writeOnly && p.schema.type !== 'object' && p.schema.type !== 'array').slice(0, 5)
        });
    }
    return resources;
}
