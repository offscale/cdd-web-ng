// src/generators/angular/admin/resource-discovery.ts
import { SwaggerParser } from '@src/openapi/parse.js';
import {
    DiscriminatorObject,
    FormProperty,
    PathInfo,
    Resource,
    ResourceOperation,
    SwaggerDefinition,
} from '@src/core/types/index.js';
import { camelCase, pascalCase, singular } from '@src/functions/utils.js';

function getMethodName(op: PathInfo): string {
    /* v8 ignore next */
    const pathToMethodName = (path: string): string =>
        /* v8 ignore next */
        path
            .split('/')
            .filter(Boolean)
            .map(segment =>
                /* v8 ignore next */
                segment.startsWith('{') && segment.endsWith('}')
                    ? `By${pascalCase(segment.slice(1, -1))}`
                    : pascalCase(segment),
            )
            .join('');

    /* v8 ignore next */
    return op.operationId ? camelCase(op.operationId) : `${op.method.toLowerCase()}${pathToMethodName(op.path)}`;
}

function getResourceName(path: PathInfo): string {
    /* v8 ignore next */
    const tag = path.tags?.[0];
    /* v8 ignore next */
    if (tag) return camelCase(tag);
    /* v8 ignore next */
    const firstSegment = path.path.split('/').filter(p => p && !p.startsWith('{'))[0];
    /* v8 ignore next */
    return camelCase(firstSegment ?? 'default');
}

function classifyAction(path: PathInfo, method: string): ResourceOperation['action'] {
    /* v8 ignore next */
    const hasIdSuffix = path.path.endsWith('}');
    /* v8 ignore next */
    const m = method.toLowerCase();
    /* v8 ignore next */
    const opId = path.operationId || '';
    /* v8 ignore next */
    const opIdLower = opId.toLowerCase();

    /* v8 ignore next */
    if ((m === 'get' || m === 'query') && !hasIdSuffix) return 'list';
    /* v8 ignore next */
    if ((m === 'get' || m === 'query') && hasIdSuffix) return 'getById';

    /* v8 ignore next */
    if (['put', 'patch'].includes(m) && hasIdSuffix) return 'update';
    /* v8 ignore next */
    if (m === 'delete' && hasIdSuffix) return 'delete';

    /* v8 ignore next */
    if (m === 'post' && !hasIdSuffix) {
        /* v8 ignore next */
        const nonParamSegments = path.path.split('/').filter(s => s && !s.startsWith('{')).length;
        /* v8 ignore next */
        const isCustomPath = nonParamSegments > 1;
        /* v8 ignore next */
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
        /* v8 ignore next */
        const hasCustomKeyword = opId && customActionKeywords.some(kw => opIdLower.includes(kw));
        /* v8 ignore next */
        if (isCustomPath || hasCustomKeyword) {
            // custom
        } else {
            /* v8 ignore next */
            return 'create';
        }
    }
    /* v8 ignore next */
    if (opId) {
        /* v8 ignore next */
        return camelCase(opId);
    }
    /* v8 ignore next */
    const nonParamSegments = path.path.split('/').filter(s => s && !s.startsWith('{'));
    /* v8 ignore next */
    const parts = [m, ...nonParamSegments, ...(hasIdSuffix ? ['ById'] : [])];
    /* v8 ignore next */
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
    /* v8 ignore next */
    if (!schema) return undefined;
    /* v8 ignore next */
    /* v8 ignore start */
    if (typeof schema === 'boolean') return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    if ('$ref' in schema && typeof schema.$ref === 'string')
        /* v8 ignore next */
        return parser.resolveReference<SwaggerDefinition>(schema.$ref);
    /* v8 ignore next */
    return schema as SwaggerDefinition;
}

export function getFormProperties(operations: PathInfo[], parser: SwaggerParser): FormProperty[] {
    /* v8 ignore next */
    const allSchemas: SwaggerDefinition[] = [];
    /* v8 ignore next */
    const formDataProperties: Record<string, SwaggerDefinition> = {};

    /* v8 ignore next */
    operations.forEach(op => {
        /* v8 ignore next */
        const reqSchema = findSchema(
            op.requestBody?.content?.['application/json']?.schema as unknown as SwaggerDefinition,
            parser,
        );
        /* v8 ignore next */
        if (reqSchema) allSchemas.push(reqSchema);

        /* v8 ignore next */
        const formSchemas = [
            findSchema(
                op.requestBody?.content?.['multipart/form-data']?.schema as unknown as SwaggerDefinition,
                parser,
            ),
            findSchema(
                op.requestBody?.content?.['application/x-www-form-urlencoded']?.schema as unknown as SwaggerDefinition,
                parser,
            ),
        ].filter(Boolean) as SwaggerDefinition[];

        /* v8 ignore next */
        formSchemas.forEach(formSchema => {
            /* v8 ignore next */
            /* v8 ignore start */
            if (!formSchema || typeof formSchema !== 'object') return;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            if (!formSchema.properties) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            Object.entries(formSchema.properties).forEach(([propName, propSchema]) => {
                /* v8 ignore next */
                /* v8 ignore start */
                if (!propSchema || typeof propSchema !== 'object') return;
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore start */
                if ('$ref' in propSchema) return;
                /* v8 ignore stop */
                /* v8 ignore next */
                const cloned: SwaggerDefinition = { ...(propSchema as SwaggerDefinition) };
                /* v8 ignore next */
                if (Array.isArray((propSchema as SwaggerDefinition).type)) {
                    /* v8 ignore next */
                    delete (cloned as SwaggerDefinition).type;
                }
                /* v8 ignore next */
                formDataProperties[propName] = cloned;
            });
        });

        const resSchema =
            /* v8 ignore next */
            findSchema(
                op.responses?.['200']?.content?.['application/json']?.schema as unknown as SwaggerDefinition,
                parser,
            ) ??
            findSchema(
                op.responses?.['201']?.content?.['application/json']?.schema as unknown as SwaggerDefinition,
                parser,
            );
        /* v8 ignore next */
        if (resSchema) allSchemas.push(resSchema);

        /* v8 ignore next */
        op.parameters?.forEach(param => {
            /* v8 ignore next */
            if (
                param.in === 'formData' &&
                param.schema &&
                typeof param.schema === 'object' &&
                !('$ref' in param.schema) &&
                !('$dynamicRef' in param.schema)
            ) {
                /* v8 ignore next */
                const schemaObj = param.schema as SwaggerDefinition;
                /* v8 ignore next */
                const prop: Partial<SwaggerDefinition> = {};
                /* v8 ignore next */
                /* v8 ignore start */
                if (schemaObj.format) prop.format = schemaObj.format;
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore start */
                if (param.description) prop.description = param.description;
                /* v8 ignore stop */
                /* v8 ignore next */
                const paramType = schemaObj.type;
                /* v8 ignore next */
                /* v8 ignore start */
                if (paramType && !Array.isArray(paramType))
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    prop.type = paramType as Exclude<SwaggerDefinition['type'], undefined>;
                /* v8 ignore next */
                formDataProperties[param.name] = prop as SwaggerDefinition;
            }
        });
    });

    /* v8 ignore next */
    if (allSchemas.length === 0 && Object.keys(formDataProperties).length === 0) {
        /* v8 ignore next */
        return [{ name: 'id', schema: { type: 'string' } }];
    }

    /* v8 ignore next */
    const mergedProperties: Record<string, SwaggerDefinition | boolean> = { ...formDataProperties };
    /* v8 ignore next */
    const mergedRequired = new Set<string>();
    let mergedOneOf: (SwaggerDefinition | boolean)[] | undefined, mergedDiscriminator: DiscriminatorObject | undefined;

    /* v8 ignore next */
    const assignPropertiesRecursive = (schema: SwaggerDefinition) => {
        /* v8 ignore next */
        if (schema.properties) {
            /* v8 ignore next */
            Object.assign(mergedProperties, schema.properties);
        }
        /* v8 ignore next */
        schema.required?.forEach(r => mergedRequired.add(r));
        /* v8 ignore next */
        if (schema.oneOf) mergedOneOf = schema.oneOf;
        /* v8 ignore next */
        if (schema.discriminator) mergedDiscriminator = schema.discriminator;

        /* v8 ignore next */
        if (schema.allOf) {
            /* v8 ignore next */
            schema.allOf.forEach(sub => {
                /* v8 ignore next */
                const resolvedSub = findSchema(sub as unknown as SwaggerDefinition, parser);
                /* v8 ignore next */
                if (resolvedSub) {
                    /* v8 ignore next */
                    assignPropertiesRecursive(resolvedSub);
                }
            });
        }
    };

    /* v8 ignore next */
    allSchemas.forEach(schema => {
        const effectiveSchema =
            /* v8 ignore next */
            findSchema(schema.type === 'array' ? (schema.items as SwaggerDefinition) : schema, parser) ?? schema;
        /* v8 ignore next */
        assignPropertiesRecursive(effectiveSchema);
    });

    /* v8 ignore next */
    const finalSchema: SwaggerDefinition = {
        properties: mergedProperties,
        required: Array.from(mergedRequired),
        ...(mergedOneOf && { oneOf: mergedOneOf }),
        ...(mergedDiscriminator && { discriminator: mergedDiscriminator }),
    };

    /* v8 ignore next */
    const properties: FormProperty[] = Object.entries(finalSchema.properties!).map(([name, propSchema]) => {
        /* v8 ignore next */
        const resolvedSchema = findSchema(propSchema as unknown as SwaggerDefinition, parser);
        const finalPropSchema =
            /* v8 ignore next */
            resolvedSchema && typeof propSchema === 'object'
                ? { ...(propSchema as SwaggerDefinition), ...resolvedSchema }
                : propSchema;
        /* v8 ignore next */
        if (
            typeof finalPropSchema === 'object' &&
            finalSchema.required?.includes(name) &&
            // type-coverage:ignore-next-line
            !(finalPropSchema as unknown as { required?: string[] }).required?.includes(name)
        ) {
            // type-coverage:ignore-next-line
            /* v8 ignore next */
            ((finalPropSchema as unknown as { required?: string[] }).required ||= []).push(name);
        }
        /* v8 ignore next */
        return { name, schema: finalPropSchema };
    });

    /* v8 ignore next */
    if (finalSchema.oneOf && finalSchema.discriminator) {
        /* v8 ignore next */
        const dPropName = finalSchema.discriminator.propertyName;
        /* v8 ignore next */
        const existingProp = properties.find(p => p.name === dPropName);

        /* v8 ignore next */
        if (existingProp && typeof existingProp.schema === 'object') {
            /* v8 ignore next */
            existingProp.schema.oneOf = finalSchema.oneOf;
            /* v8 ignore next */
            existingProp.schema.discriminator = finalSchema.discriminator;
        } else {
            /* v8 ignore next */
            const syntheticProp: FormProperty = {
                name: dPropName,
                schema: {
                    type: 'string',
                    description: `Determines the type of the polymorphic object.`,
                    oneOf: finalSchema.oneOf,
                    discriminator: finalSchema.discriminator,
                },
            };
            /* v8 ignore next */
            properties.push(syntheticProp);
        }
    }

    /* v8 ignore next */
    return properties.length > 0 ? properties : [{ name: 'id', schema: { type: 'string' } }];
}

export function getModelName(resourceName: string, operations: PathInfo[]): string {
    const op =
        /* v8 ignore next */
        operations.find(o => o.method === 'POST') ??
        /* v8 ignore next */
        operations.find(o => o.method === 'GET') ??
        /* v8 ignore next */
        operations.find(o => o.method === 'QUERY');
    // type-coverage:ignore-next-line
    /* v8 ignore next */
    const schema = (op?.requestBody?.content?.['application/json']?.schema ??
        op?.responses?.['200']?.content?.['application/json']?.schema) as Record<string, unknown> | undefined;
    // type-coverage:ignore-next-line
    /* v8 ignore next */
    if (schema && typeof schema === 'object') {
        /* v8 ignore next */
        let ref: string | null | undefined = null;
        // type-coverage:ignore-next-line
        /* v8 ignore next */
        if ('$ref' in schema) {
            // type-coverage:ignore-next-line
            /* v8 ignore next */
            ref = schema.$ref as string | undefined;
            // type-coverage:ignore-next-line
            /* v8 ignore next */
        } else if (
            schema.type === 'array' &&
            schema.items &&
            !Array.isArray(schema.items) &&
            '$ref' in (schema.items as Record<string, unknown>)
        ) {
            // type-coverage:ignore-next-line
            /* v8 ignore next */
            ref = (schema.items as { $ref?: string }).$ref;
        }
        /* v8 ignore next */
        if (ref) return pascalCase(ref.split('/').pop()!);
    }
    /* v8 ignore next */
    return singular(pascalCase(resourceName));
}

export function discoverAdminResources(parser: SwaggerParser): Resource[] {
    /* v8 ignore next */
    const resourceMap = new Map<string, { name: string; operations: PathInfo[] }>();

    /* v8 ignore next */
    for (const op of parser.operations) {
        /* v8 ignore next */
        const resourceName = getResourceName(op);
        /* v8 ignore next */
        if (!resourceMap.has(resourceName)) {
            /* v8 ignore next */
            resourceMap.set(resourceName, { name: resourceName, operations: [] });
        }
        /* v8 ignore next */
        resourceMap.get(resourceName)!.operations.push(op);
    }

    /* v8 ignore next */
    const finalResources: Resource[] = [];
    /* v8 ignore next */
    for (const group of resourceMap.values()) {
        /* v8 ignore next */
        const classifiedOps: ResourceOperation[] = group.operations.map(op => {
            /* v8 ignore next */
            const action = classifyAction(op, op.method);
            /* v8 ignore next */
            const hasPathParams = op.parameters?.some(p => p.in === 'path') ?? false;

            /* v8 ignore next */
            const resourceOperation: ResourceOperation = {
                action,
                path: op.path,
                method: op.method,
            };

            /* v8 ignore next */
            const methodName = getMethodName(op);
            /* v8 ignore next */
            if (methodName) {
                /* v8 ignore next */
                resourceOperation.methodName = methodName;
            }
            /* v8 ignore next */
            if (op.operationId) {
                /* v8 ignore next */
                resourceOperation.operationId = op.operationId;
            }
            /* v8 ignore next */
            if (op.parameters) {
                /* v8 ignore next */
                resourceOperation.methodParameters = op.parameters;
            }

            /* v8 ignore next */
            const isCustom = !['list', 'create', 'getById', 'update', 'delete'].includes(action);
            /* v8 ignore next */
            if (isCustom && hasPathParams) {
                /* v8 ignore next */
                resourceOperation.isCustomItemAction = true;
            }
            /* v8 ignore next */
            if (isCustom && !hasPathParams) {
                /* v8 ignore next */
                resourceOperation.isCustomCollectionAction = true;
            }
            /* v8 ignore next */
            return resourceOperation;
        });

        /* v8 ignore next */
        const formProperties = getFormProperties(group.operations, parser);

        /* v8 ignore next */
        finalResources.push({
            name: group.name,
            modelName: getModelName(group.name, group.operations),
            operations: classifiedOps,
            /* v8 ignore next */
            isEditable: group.operations.some(op => ['POST', 'PUT', 'PATCH'].includes(op.method)),
            formProperties,
            listProperties: formProperties.filter(
                p =>
                    /* v8 ignore next */
                    typeof p.schema === 'object' &&
                    !p.schema.readOnly &&
                    ['string', 'number', 'integer', 'boolean'].includes(p.schema.type as string),
            ),
        });
    }

    /* v8 ignore next */
    return finalResources;
}
