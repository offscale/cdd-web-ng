import { SwaggerParser } from '../../../core/parser.js';
import { FormProperty, PathInfo, Resource, ResourceOperation, SwaggerDefinition } from '../../../core/types.js';
import { camelCase, extractPaths, pascalCase, singular } from '../../../core/utils.js';

function getResourceName(path: PathInfo): string {
    const tag = path.tags?.[0];
    if (tag) return camelCase(tag);

    const firstSegment = path.path.split('/').filter(p => p && !p.startsWith('{'))[0];
    return camelCase(firstSegment ?? 'default');
}

function classifyAction(path: PathInfo): ResourceOperation['action'] {
    const method = path.method.toUpperCase();
    const hasId = /\{\w+\}$/.test(path.path);

    if (method === 'GET' && !hasId) return 'list';
    if (method === 'POST' && !hasId) return 'create';
    if (method === 'GET' && hasId) return 'getById';
    if (method === 'PUT' && hasId) return 'update';
    if (method === 'PATCH' && hasId) return 'update';
    if (method === 'DELETE' && hasId) return 'delete';

    if (path.operationId) return camelCase(path.operationId);

    const segments = path.path.split('/').filter(p => p && !p.startsWith('{'));
    return camelCase(`${method} ${segments.join(' ')}`);
}

function findSchema(schema: SwaggerDefinition | { $ref: string } | undefined, parser: SwaggerParser): SwaggerDefinition | undefined {
    if (!schema) return undefined;
    if ('$ref' in schema) return parser.resolveReference(schema.$ref);
    return schema;
}

function getFormProperties(operations: PathInfo[], parser: SwaggerParser): FormProperty[] {
    const op = operations.find(o => o.method === 'POST') ?? operations.find(o => o.method === 'GET');
    let schema = findSchema(op?.requestBody?.content?.['application/json']?.schema, parser)
        ?? findSchema(op?.responses?.['200']?.content?.['application/json']?.schema, parser);

    if (schema?.type === 'array' && schema.items) {
        schema = findSchema(schema.items as SwaggerDefinition, parser);
    }

    if (!schema) return [{ name: 'id', schema: { type: 'string' } }];

    // Base case: handle schemas with properties
    const properties: FormProperty[] = Object.entries(schema.properties || {}).map(([name, propSchema]) => {
        const resolvedSchema = findSchema(propSchema, parser);
        // Combine properties from the reference point (like readOnly) with the resolved schema
        const finalSchema = resolvedSchema ? { ...propSchema, ...resolvedSchema } : propSchema;
        finalSchema.required = !!schema.required?.includes(name);
        return { name, schema: finalSchema };
    });

    // Special handling for polymorphism
    if (schema.oneOf && schema.discriminator) {
        const dPropName = schema.discriminator.propertyName;
        // Ensure the discriminator property itself is included, and importantly,
        // attach the polymorphic schema information to it for the form generator.
        const existingProp = properties.find(p => p.name === dPropName);
        if (existingProp) {
            existingProp.schema.oneOf = schema.oneOf;
            existingProp.schema.discriminator = schema.discriminator;
        } else {
            properties.unshift({
                name: dPropName,
                schema: {
                    type: 'string', // Discriminator is always a simple type
                    required: schema.required?.includes(dPropName),
                    oneOf: schema.oneOf,
                    discriminator: schema.discriminator
                }
            });
        }
    }

    // Fallback if no properties are found at all
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

    allPaths.forEach(path => {
        const resourceName = getResourceName(path);
        if (!resourceMap.has(resourceName)) resourceMap.set(resourceName, []);
        resourceMap.get(resourceName)!.push(path);
    });

    const resources: Resource[] = [];
    for (const [name, operations] of resourceMap.entries()) {
        const primaryOps = operations.filter(op => op.path.split('/').filter(Boolean).length <= 2);
        if (primaryOps.length === 0) continue;

        const modelName = getModelName(name, primaryOps, parser);

        resources.push({
            name,
            modelName,
            isEditable: primaryOps.some(op => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(op.method)),
            operations: primaryOps.map(op => ({
                action: classifyAction(op),
                ...op
            })),
            formProperties: getFormProperties(primaryOps, parser)
        });
    }

    return resources;
}
