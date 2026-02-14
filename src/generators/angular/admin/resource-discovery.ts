import { SwaggerParser } from '@src/core/parser.js';
import {
    DiscriminatorObject,
    FormProperty,
    PathInfo,
    Resource,
    ResourceOperation,
    SwaggerDefinition,
} from '@src/core/types/index.js';
import { camelCase, pascalCase, singular } from '@src/core/utils/index.js';

function getMethodName(op: PathInfo): string {
    const pathToMethodName = (path: string): string =>
        path
            .split('/')
            .filter(Boolean)
            .map(segment =>
                segment.startsWith('{') && segment.endsWith('}')
                    ? `By${pascalCase(segment.slice(1, -1))}`
                    : pascalCase(segment),
            )
            .join('');

    return op.operationId ? camelCase(op.operationId) : `${op.method.toLowerCase()}${pathToMethodName(op.path)}`;
}

function getResourceName(path: PathInfo): string {
    const tag = path.tags?.[0];
    if (tag) return camelCase(tag);
    const firstSegment = path.path.split('/').filter(p => p && !p.startsWith('{'))[0];
    return camelCase(firstSegment ?? 'default');
}

function classifyAction(path: PathInfo, method: string): ResourceOperation['action'] {
    const hasIdSuffix = path.path.endsWith('}');
    const m = method.toLowerCase();
    const opId = path.operationId || '';
    const opIdLower = opId.toLowerCase();

    // OAS 3.2 QUERY method support: Treat as list if collection, or getById if item
    if ((m === 'get' || m === 'query') && !hasIdSuffix) return 'list';
    if ((m === 'get' || m === 'query') && hasIdSuffix) return 'getById';

    if (['put', 'patch'].includes(m) && hasIdSuffix) return 'update';
    if (m === 'delete' && hasIdSuffix) return 'delete';

    if (m === 'post' && !hasIdSuffix) {
        const nonParamSegments = path.path.split('/').filter(s => s && !s.startsWith('{')).length;
        const isCustomPath = nonParamSegments > 1;
        const customActionKeywords = [
            'search',
            'export',
            'query',
            'login',
            'upload',
            'import',
            'sync',
            'item',
            'reboot',
            'start',
        ];
        const hasCustomKeyword = opId && customActionKeywords.some(kw => opIdLower.includes(kw));
        if (isCustomPath || hasCustomKeyword) {
            // custom
        } else {
            return 'create';
        }
    }
    if (opId) {
        return camelCase(opId);
    }
    const nonParamSegments = path.path.split('/').filter(s => s && !s.startsWith('{'));
    const parts = [m, ...nonParamSegments, ...(hasIdSuffix ? ['ById'] : [])];
    return camelCase(parts.join(' '));
}

function findSchema(
    schema:
        | SwaggerDefinition
        | boolean
        | {
              $ref: string;
          }
        | undefined,
    parser: SwaggerParser,
): SwaggerDefinition | undefined {
    if (!schema) return undefined;
    if (typeof schema === 'boolean') return undefined;
    if ('$ref' in schema && typeof schema.$ref === 'string')
        return parser.resolveReference<SwaggerDefinition>(schema.$ref);
    return schema as SwaggerDefinition;
}

// Exported for testing
export function getFormProperties(operations: PathInfo[], parser: SwaggerParser): FormProperty[] {
    const allSchemas: SwaggerDefinition[] = [];
    const formDataProperties: Record<string, SwaggerDefinition> = {};

    operations.forEach(op => {
        const reqSchema = findSchema(op.requestBody?.content?.['application/json']?.schema, parser);
        if (reqSchema) allSchemas.push(reqSchema);

        const formSchemas = [
            findSchema(op.requestBody?.content?.['multipart/form-data']?.schema, parser),
            findSchema(op.requestBody?.content?.['application/x-www-form-urlencoded']?.schema, parser),
        ].filter(Boolean) as SwaggerDefinition[];

        formSchemas.forEach(formSchema => {
            if (!formSchema || typeof formSchema !== 'object') return;
            if (!formSchema.properties) return;
            Object.entries(formSchema.properties).forEach(([propName, propSchema]) => {
                if (!propSchema || typeof propSchema !== 'object') return;
                if ('$ref' in propSchema) return;
                const cloned: SwaggerDefinition = { ...(propSchema as SwaggerDefinition) };
                if (Array.isArray((propSchema as SwaggerDefinition).type)) {
                    delete (cloned as SwaggerDefinition).type;
                }
                formDataProperties[propName] = cloned;
            });
        });

        const resSchema =
            findSchema(op.responses?.['200']?.content?.['application/json']?.schema, parser) ??
            findSchema(op.responses?.['201']?.content?.['application/json']?.schema, parser);
        if (resSchema) allSchemas.push(resSchema);

        op.parameters?.forEach(param => {
            if (
                param.in === 'formData' &&
                param.schema &&
                typeof param.schema === 'object' &&
                !('$ref' in param.schema)
            ) {
                const prop: Partial<SwaggerDefinition> = {};
                if (param.schema.format) prop.format = param.schema.format;
                if (param.description) prop.description = param.description;
                const paramType = param.schema.type;
                if (paramType && !Array.isArray(paramType)) prop.type = paramType;
                formDataProperties[param.name] = prop as SwaggerDefinition;
            }
        });
    });

    if (allSchemas.length === 0 && Object.keys(formDataProperties).length === 0) {
        return [{ name: 'id', schema: { type: 'string' } }];
    }

    const mergedProperties: Record<string, SwaggerDefinition | boolean> = { ...formDataProperties };
    const mergedRequired = new Set<string>();
    let mergedOneOf: (SwaggerDefinition | boolean)[] | undefined, mergedDiscriminator: DiscriminatorObject | undefined;

    const assignPropertiesRecursive = (schema: SwaggerDefinition) => {
        if (schema.properties) {
            Object.assign(mergedProperties, schema.properties);
        }
        schema.required?.forEach(r => mergedRequired.add(r));
        if (schema.oneOf) mergedOneOf = schema.oneOf;
        if (schema.discriminator) mergedDiscriminator = schema.discriminator;

        // Handle allOf inheritance (recursively)
        if (schema.allOf) {
            schema.allOf.forEach(sub => {
                const resolvedSub = findSchema(sub, parser);
                if (resolvedSub) {
                    assignPropertiesRecursive(resolvedSub);
                }
            });
        }
    };

    allSchemas.forEach(schema => {
        const effectiveSchema =
            findSchema(schema.type === 'array' ? (schema.items as SwaggerDefinition) : schema, parser) ?? schema;
        assignPropertiesRecursive(effectiveSchema);
    });

    const finalSchema: SwaggerDefinition = {
        properties: mergedProperties,
        required: Array.from(mergedRequired),
        ...(mergedOneOf && { oneOf: mergedOneOf }),
        ...(mergedDiscriminator && { discriminator: mergedDiscriminator }),
    };

    const properties: FormProperty[] = Object.entries(finalSchema.properties!).map(([name, propSchema]) => {
        const resolvedSchema = findSchema(propSchema, parser);
        const finalPropSchema =
            resolvedSchema && typeof propSchema === 'object'
                ? { ...(propSchema as SwaggerDefinition), ...resolvedSchema }
                : propSchema;
        if (
            typeof finalPropSchema === 'object' &&
            finalSchema.required?.includes(name) &&
            !finalPropSchema.required?.includes(name)
        ) {
            (finalPropSchema.required ||= []).push(name);
        }
        return { name, schema: finalPropSchema };
    });

    if (finalSchema.oneOf && finalSchema.discriminator) {
        const dPropName = finalSchema.discriminator.propertyName;
        const existingProp = properties.find(p => p.name === dPropName);

        if (existingProp && typeof existingProp.schema === 'object') {
            existingProp.schema.oneOf = finalSchema.oneOf;
            existingProp.schema.discriminator = finalSchema.discriminator;
        } else {
            const syntheticProp: FormProperty = {
                name: dPropName,
                schema: {
                    type: 'string',
                    description: `Determines the type of the polymorphic object.`,
                    oneOf: finalSchema.oneOf,
                    discriminator: finalSchema.discriminator,
                },
            };
            properties.push(syntheticProp);
        }
    }

    return properties.length > 0 ? properties : [{ name: 'id', schema: { type: 'string' } }];
}

// Exported for testing
export function getModelName(resourceName: string, operations: PathInfo[]): string {
    const op =
        operations.find(o => o.method === 'POST') ??
        operations.find(o => o.method === 'GET') ??
        operations.find(o => o.method === 'QUERY');
    const schema =
        op?.requestBody?.content?.['application/json']?.schema ??
        op?.responses?.['200']?.content?.['application/json']?.schema;
    if (schema && typeof schema === 'object') {
        const ref =
            '$ref' in schema
                ? schema.$ref
                : schema.type === 'array' && schema.items && !Array.isArray(schema.items) && '$ref' in schema.items
                  ? schema.items.$ref
                  : null;
        if (ref) return pascalCase(ref.split('/').pop()!);
    }
    return singular(pascalCase(resourceName));
}

export function discoverAdminResources(parser: SwaggerParser): Resource[] {
    const resourceMap = new Map<string, { name: string; operations: PathInfo[] }>();

    for (const op of parser.operations) {
        const resourceName = getResourceName(op);
        if (!resourceMap.has(resourceName)) {
            resourceMap.set(resourceName, { name: resourceName, operations: [] });
        }
        resourceMap.get(resourceName)!.operations.push(op);
    }

    const finalResources: Resource[] = [];
    for (const group of resourceMap.values()) {
        const classifiedOps: ResourceOperation[] = group.operations.map(op => {
            const action = classifyAction(op, op.method);
            const hasPathParams = op.parameters?.some(p => p.in === 'path') ?? false;

            const resourceOperation: ResourceOperation = {
                action,
                path: op.path,
                method: op.method,
            };

            const methodName = getMethodName(op);
            if (methodName) {
                resourceOperation.methodName = methodName;
            }
            if (op.operationId) {
                resourceOperation.operationId = op.operationId;
            }
            if (op.parameters) {
                resourceOperation.methodParameters = op.parameters;
            }

            const isCustom = !['list', 'create', 'getById', 'update', 'delete'].includes(action);
            if (isCustom && hasPathParams) {
                resourceOperation.isCustomItemAction = true;
            }
            if (isCustom && !hasPathParams) {
                resourceOperation.isCustomCollectionAction = true;
            }
            return resourceOperation;
        });

        const formProperties = getFormProperties(group.operations, parser);

        finalResources.push({
            name: group.name,
            modelName: getModelName(group.name, group.operations),
            operations: classifiedOps,
            // Fix: DELETE operations do not imply a form interface, so they don't make a resource 'editable' in the context of form generation.
            // QUERY doesn't either (safe method)
            isEditable: group.operations.some(op => ['POST', 'PUT', 'PATCH'].includes(op.method)),
            formProperties,
            listProperties: formProperties.filter(
                p =>
                    typeof p.schema === 'object' &&
                    !p.schema.readOnly &&
                    ['string', 'number', 'integer', 'boolean'].includes(p.schema.type as string),
            ),
        });
    }

    return finalResources;
}
