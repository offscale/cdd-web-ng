import { SwaggerParser } from '../../../core/parser.js';
import { FormProperty, PathInfo, Resource, ResourceOperation, SwaggerDefinition, DiscriminatorObject } from '../../../core/types.js';
import { camelCase, extractPaths, pascalCase, singular } from '../../../core/utils.js';

/**
 * Derives a consistent method name for a given API operation.
 * It prefers the `operationId` if available, otherwise it constructs a name
 * from the HTTP method and path segments (e.g., `GET /users/{id}` becomes `getUsersById`).
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
        ? camelCase(op.operationId) // Prefer operationId
        : `${op.method.toLowerCase()}${pathToMethodName(op.path)}`; // Fallback
}

/**
 * Derives a resource name from an operation, preferring the first tag over path segments.
 * This groups operations like `GET /users` and `POST /users` under the "users" resource.
 * @param path The operation's `PathInfo` object.
 * @returns A camelCase string for the resource name.
 */
function getResourceName(path: PathInfo): string {
    const tag = path.tags?.[0];
    if (tag) return camelCase(tag);
    // Fallback: use the first non-parameter part of the path
    const firstSegment = path.path.split('/').filter(p => p && !p.startsWith('{'))[0];
    return camelCase(firstSegment ?? 'default');
}

/**
 * Classifies an API operation into a standard CRUD action (`list`, `create`, `update`, etc.)
 * or a custom action (derived from the `operationId`).
 * Custom `operationId`s are prioritized to correctly identify non-standard actions on standard routes.
 * @param path The operation's `PathInfo` object.
 * @returns A string representing the classified action.
 */
function classifyAction(path: PathInfo): ResourceOperation['action'] {
    const method = path.method.toUpperCase();
    const hasIdSuffix = /\{\w+\}$/.test(path.path);
    const nonParamSegments = path.path.split('/').filter(p => p && !p.startsWith('{'));

    // Prioritize operationId to allow custom actions that overlap with CRUD-like routes.
    // E.g., POST /users with operationId 'searchUsers' should be 'searchUsers', not 'create'.
    if (path.operationId) {
        const opIdLower = path.operationId.toLowerCase();
        const commonCrudPrefixes = ['get', 'list', 'create', 'add', 'post', 'update', 'edit', 'patch', 'put', 'delete', 'remove'];
        // If the operationId doesn't start with a common CRUD verb, treat it as a custom action.
        if (!commonCrudPrefixes.some(prefix => opIdLower.startsWith(prefix))) {
            return camelCase(path.operationId);
        }
    }

    // Standard CRUD heuristics based on method and path structure.
    if (method === 'GET' && !hasIdSuffix) return 'list';
    if (method === 'POST' && !hasIdSuffix) return 'create';
    if (method === 'GET' && hasIdSuffix) return 'getById';
    if ((method === 'PUT' || method === 'PATCH') && hasIdSuffix) return 'update';
    if (method === 'DELETE' && hasIdSuffix) return 'delete';

    // Fallback: if it's not a standard CRUD pattern, use the operationId if it exists.
    if (path.operationId) {
        return camelCase(path.operationId);
    }

    // Final fallback: construct a name from the method and path (e.g., 'postAnalyticsEvents')
    return camelCase(`${method} ${nonParamSegments.join(' ')}${hasIdSuffix ? ' By Id' : ''}`);
}

/**
 * A type-safe helper to resolve a potential `$ref` in a schema to its underlying definition.
 * @param schema The schema object, which might be a direct definition or a `$ref` object.
 * @param parser The `SwaggerParser` instance for resolving references.
 * @returns The resolved `SwaggerDefinition`, or `undefined` if the schema is missing or unresolvable.
 */
function findSchema(schema: SwaggerDefinition | { $ref: string } | undefined, parser: SwaggerParser): SwaggerDefinition | undefined {
    if (!schema) return undefined;
    if ('$ref' in schema && typeof schema.$ref === 'string') return parser.resolveReference(schema.$ref);
    return schema as SwaggerDefinition;
}

/**
 * Aggregates properties from a resource's various operations (create, update, get) to build a
 * unified data model for form generation. It merges properties from request bodies and responses.
 * @param operations All `PathInfo` objects belonging to a single resource.
 * @param parser The `SwaggerParser` instance for resolving references.
 * @returns An array of `FormProperty` objects representing the complete model.
 */
function getFormProperties(operations: PathInfo[], parser: SwaggerParser): FormProperty[] {
    const allSchemas: SwaggerDefinition[] = [];
    operations.forEach(op => {
        // Look in request body
        const reqSchema = findSchema(op.requestBody?.content?.['application/json']?.schema, parser);
        if (reqSchema) allSchemas.push(reqSchema);
        // Look in success responses
        const resSchema = findSchema(op.responses?.['200']?.content?.['application/json']?.schema, parser)
            ?? findSchema(op.responses?.['201']?.content?.['application/json']?.schema, parser);
        if (resSchema) allSchemas.push(resSchema);
    });

    if (allSchemas.length === 0) return [{ name: 'id', schema: { type: 'string' } }];

    const mergedProperties: Record<string, SwaggerDefinition> = {};
    const mergedRequired = new Set<string>();
    let mergedOneOf: SwaggerDefinition[] | undefined, mergedDiscriminator: DiscriminatorObject | undefined;

    allSchemas.forEach(schema => {
        // If the schema is for an array (e.g., in a 'list' response), get the item schema
        let effectiveSchema = findSchema(schema.type === 'array' ? schema.items as SwaggerDefinition : schema, parser) ?? schema;

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
 * Derives a model name for a resource, typically from the schema name used in a POST or GET operation.
 * @param resourceName The name of the resource (e.g., 'users').
 * @param operations The operations associated with the resource.
 * @param parser The `SwaggerParser` instance.
 * @returns The PascalCase model name (e.g., 'User').
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
    // Fallback: singularize the resource name
    return singular(pascalCase(resourceName));
}

/**
 * The main discovery function. It analyzes all paths in an OpenAPI specification,
 * groups them into logical resources (e.g., "Users", "Products"), and extracts
 * structured metadata for each resource needed for Admin UI generation.
 * @param parser The `SwaggerParser` instance containing the loaded specification.
 * @returns An array of `Resource` objects, each detailing a discovered resource.
 */
export function discoverAdminResources(parser: SwaggerParser): Resource[] {
    const allPaths = extractPaths(parser.getSpec().paths);
    const resourceMap = new Map<string, PathInfo[]>();

    // Group all paths by their derived resource name
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
            name,
            modelName,
            isEditable: allOpsForResource.some(op => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(op.method)),
            operations: allOpsForResource.map((op): ResourceOperation => {
                const action = classifyAction(op);
                const standardActions = ['list', 'create', 'getById', 'update', 'delete'];
                const isItemOp = op.path.includes('{');
                return {
                    ...op,
                    action,
                    methodName: getMethodName(op),
                    isCustomItemAction: isItemOp && !standardActions.includes(action),
                    isCustomCollectionAction: !isItemOp && !standardActions.includes(action)
                };
            }),
            formProperties,
            // Select up to 5 simple properties for the list view columns
            listProperties: formProperties.filter(p => !p.schema.writeOnly && p.schema.type !== 'object' && p.schema.type !== 'array').slice(0, 5)
        });
    }
    return resources;
}
