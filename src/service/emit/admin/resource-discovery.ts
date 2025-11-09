// src/service/emit/admin/resource-discovery.ts

/**
 * @fileoverview
 * This module is the core of the Admin UI generation logic. It analyzes all paths
 * in a parsed OpenAPI specification, groups them into logical "resources" (e.g.,
 * "Users", "Products"), and extracts structured metadata for each one. This metadata
 * is then consumed by downstream generators to create list components, forms, and routing.
 */

import { SwaggerParser } from '../../../core/parser.js';
import {
    FormProperty,
    PathInfo,
    Resource,
    ResourceOperation,
    SwaggerDefinition,
    DiscriminatorObject
} from '../../../core/types.js';
import { camelCase, pascalCase, singular } from '../../../core/utils.js';

/**
 * Derives a consistent, camelCased method name for a given API operation,
 * suitable for use in an Angular service.
 *
 * The method name is determined using the following priority:
 * 1. The operation's `operationId`, if present.
 * 2. A generated name from the HTTP method and path segments (e.g., `GET /users/{id}` becomes `getUsersById`).
 *
 * @param op The operation's `PathInfo` object.
 * @returns A camelCase string representing the method name.
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
 * Derives a resource name from an operation, which is used to group related
 * endpoints together (e.g., `GET /users`, `POST /users`, and `GET /users/{id}`
 * all belong to the "users" resource).
 *
 * The resource name is determined using the following priority:
 * 1. The first tag associated with the operation.
 * 2. The first non-parameter segment of the URL path.
 * 3. A fallback of "default" if no other name can be determined.
 *
 * @param path The operation's `PathInfo` object.
 * @returns A camelCase string for the resource name.
 */
function getResourceName(path: PathInfo): string {
    const tag = path.tags?.[0];
    if (tag) return camelCase(tag);
    const firstSegment = path.path.split('/').filter(p => p && !p.startsWith('{'))[0];
    return camelCase(firstSegment ?? 'default');
}

/**
 * Classifies an API operation into a standard UI action (e.g., 'list', 'create')
 * or a custom action name derived from its `operationId`. This is crucial for
 * determining which UI components (list, form) to generate.
 *
 * The classification follows a multi-step heuristic:
 * 1.  It first checks for standard CRUD patterns based on the HTTP method and path structure.
 * 2.  The `POST /collection` pattern is only considered a 'create' action if its `operationId`
 *     does not suggest a different custom action (e.g., 'search', 'export').
 * 3.  If no standard pattern matches, it is considered a custom action, and the `operationId` is used.
 * 4.  If there is no `operationId`, a fallback name is generated from the method and path.
 *
 * @param path The operation's `PathInfo` object.
 * @param method The HTTP verb (e.g., 'GET', 'POST').
 * @returns A string representing the classified action.
 */
function classifyAction(path: PathInfo, method: string): ResourceOperation['action'] {
    if (typeof method !== 'string') { return 'unknown'; }

    const nonParamSegments = path.path.split('/').filter(s => s && !s.startsWith('{'));
    const hasIdSuffix = path.path.endsWith('}');
    const m = method.toLowerCase();
    const opId = path.operationId || '';

    // --- RULE 1: Standard CRUD Heuristics ---
    if (m === 'get' && !hasIdSuffix) return 'list';
    // A POST on a collection is only 'create' if the operationId implies it.
    if (m === 'post' && !hasIdSuffix) {
        const opIdLower = opId.toLowerCase();
        // The check for 'add' was removed as it was too greedy and incorrectly
        // classified custom actions like 'addItem' as a standard 'create' action.
        if (!opId || opIdLower.includes('create') || opIdLower.includes('new') || opIdLower.startsWith('post')) {
            return 'create';
        }
    }
    if (m === 'get' && hasIdSuffix) return 'getById';
    if (['put', 'patch'].includes(m) && hasIdSuffix) return 'update';
    if (m === 'delete' && hasIdSuffix) return 'delete';

    // --- RULE 2: If we're here, it must be a custom action, so use the operationId. ---
    if (opId) { return camelCase(opId); }

    // --- FINAL FALLBACK: Construct a name from path segments if no operationId. ---
    const parts = [ m, ...nonParamSegments, ...(hasIdSuffix ? ['ById'] : []) ];
    return camelCase(parts.join(' '));
}

/**
 * A type-safe helper to resolve a potential `$ref` in a schema to its underlying definition.
 *
 * @param schema The schema object, which might be a direct definition or a `$ref` object.
 * @param parser The `SwaggerParser` instance for resolving references.
 * @returns The resolved `SwaggerDefinition`, or `undefined` if the schema is missing or unresolvable.
 */
function findSchema(schema: SwaggerDefinition | { $ref: string } | undefined, parser: SwaggerParser): SwaggerDefinition | undefined {
    if (!schema) return undefined;
    if ('$ref' in schema && typeof schema.$ref === 'string') return parser.resolveReference<SwaggerDefinition>(schema.$ref);
    return schema as SwaggerDefinition;
}

/**
 * Aggregates properties from a resource's various operations (create, update, get) to build a
 * unified data model for form generation. It merges properties from request bodies, success responses,
 * and Swagger 2.0 `formData` parameters into a single, comprehensive list. It also handles
 * polymorphic schemas by attaching `oneOf` and `discriminator` information to the relevant property.
 *
 * @param operations All `PathInfo` objects belonging to a single resource.
 * @param parser The `SwaggerParser` instance for resolving references.
 * @returns An array of `FormProperty` objects representing the complete model.
 */
function getFormProperties(operations: PathInfo[], parser: SwaggerParser): FormProperty[] {
    const allSchemas: SwaggerDefinition[] = [];
    const formDataProperties: Record<string, SwaggerDefinition> = {};

    operations.forEach(op => {
        // Look in request body's JSON schema
        const reqSchema = findSchema(op.requestBody?.content?.['application/json']?.schema, parser);
        if (reqSchema) allSchemas.push(reqSchema);

        // Look in success responses' JSON schemas
        const resSchema = findSchema(op.responses?.['200']?.content?.['application/json']?.schema, parser)
            ?? findSchema(op.responses?.['201']?.content?.['application/json']?.schema, parser);
        if (resSchema) allSchemas.push(resSchema);

        // Look for Swagger 2.0 `formData` parameters
        op.parameters?.forEach(param => {
            if ((param as any).in === 'formData') {
                formDataProperties[param.name] = {
                    type: (param as any).type,
                    format: (param as any).format,
                    description: param.description,
                };
            }
        });
    });

    if (allSchemas.length === 0 && Object.keys(formDataProperties).length === 0) {
        // Fallback for resources with no defined schemas (e.g., a simple DELETE endpoint)
        return [{ name: 'id', schema: { type: 'string' } }];
    }

    const mergedProperties: Record<string, SwaggerDefinition> = { ...formDataProperties };
    const mergedRequired = new Set<string>();
    let mergedOneOf: SwaggerDefinition[] | undefined, mergedDiscriminator: DiscriminatorObject | undefined;

    allSchemas.forEach(schema => {
        // If the schema is for an array (e.g., in a 'list' response), get the item schema
        const effectiveSchema = findSchema(schema.type === 'array' ? schema.items as SwaggerDefinition : schema, parser) ?? schema;

        if (effectiveSchema) {
            Object.assign(mergedProperties, effectiveSchema.properties);
            effectiveSchema.required?.forEach(r => mergedRequired.add(r));
            // Capture polymorphism details
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

    // Special handling for polymorphism: attach oneOf/discriminator info to the discriminator property itself.
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
 * Derives a human-readable, PascalCase model name for a resource (e.g., 'User').
 * It inspects the schema `$ref` used in a POST or GET operation. If no `$ref` can be
 * found, it falls back to singularizing the machine-friendly resource name.
 *
 * @param resourceName The machine-friendly name of the resource (e.g., 'users').
 * @param operations The operations associated with the resource.
 * @param parser The `SwaggerParser` instance for resolving references.
 * @returns The PascalCase model name string.
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
    // Fallback if no schema reference is found.
    return singular(pascalCase(resourceName));
}

/**
 * The main discovery function. It analyzes all paths in an OpenAPI specification,
 * groups them into logical resources, and extracts structured metadata for each
 * resource needed for Admin UI generation.
 *
 * It uses a two-pass algorithm:
 * 1.  **Pass 1:** Groups all operations by resource name, derived from tags or path segments.
 * 2.  **Pass 2:** Processes each group to classify operations, determine if the resource is
 *     editable, aggregate a unified data model, and identify listable properties.
 *
 * @param parser The `SwaggerParser` instance containing the loaded specification.
 * @returns An array of `Resource` objects, each detailing a discovered resource.
 */
export function discoverAdminResources(parser: SwaggerParser): Resource[] {
    const resourceMap = new Map<string, { name: string; operations: PathInfo[] }>();

    // PASS 1: Group operations by resource.
    for (const op of parser.operations) {
        const resourceName = getResourceName(op);
        if (!resourceMap.has(resourceName)) {
            resourceMap.set(resourceName, { name: resourceName, operations: [] });
        }
        resourceMap.get(resourceName)!.operations.push(op);
    }

    const finalResources: Resource[] = [];

    // PASS 2: Process each complete resource group.
    for (const group of resourceMap.values()) {
        const classifiedOps: ResourceOperation[] = group.operations.map(op => {
            const action = classifyAction(op, op.method);
            const hasPathParams = op.parameters?.some(p => p.in === 'path') ?? false;
            return {
                ...op,
                action,
                methodName: getMethodName(op),
                isCustomItemAction: !['list', 'create', 'getById', 'update', 'delete'].includes(action) && hasPathParams,
                isCustomCollectionAction: !['list', 'create', 'getById', 'update', 'delete'].includes(action) && !hasPathParams,
            };
        });

        const formProperties = getFormProperties(group.operations, parser);

        finalResources.push({
            name: group.name,
            modelName: getModelName(group.name, group.operations, parser),
            operations: classifiedOps,
            // A resource is editable if it has any data-modifying HTTP methods.
            isEditable: group.operations.some(op => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(op.method)),
            formProperties,
            listProperties: formProperties.filter(p => !p.schema.readOnly && ['string', 'number', 'integer', 'boolean'].includes(p.schema.type as string)),
        });
    }

    return finalResources;
}
