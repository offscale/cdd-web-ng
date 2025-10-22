import { SwaggerParser } from '../../../core/parser.js';
import { PathInfo, Resource, ResourceOperation, SwaggerDefinition } from '../../../core/types.js';
import { camelCase, extractPaths, pascalCase } from '../../../core/utils.js';

/**
 * Heuristically determines the name of a resource from a PathInfo object.
 * It prefers the first tag, falling back to the first non-parameter segment of the URL path.
 */
function getResourceName(path: PathInfo): string {
    let name: string;
    if (path.tags && path.tags.length > 0) {
        name = path.tags[0];
    } else {
        const pathParts = path.path.split('/').filter(p => p && !p.startsWith('{'));
        name = pathParts.length > 0 ? pathParts[0] : 'default';
    }
    return camelCase(name);
}

/**
 * Classifies a PathInfo object into a standard CRUD action or a custom action based on its method and path structure.
 */
function classifyAction(path: PathInfo): ResourceOperation['action'] {
    const method = path.method.toUpperCase();
    const hasId = /\{\w+\}$/.test(path.path); // Path ends with a parameter like /{id}  
    const segments = path.path.split('/').filter(p => p && !p.startsWith('{'));

    if (method === 'GET' && !hasId) return 'list';
    if (method === 'POST' && !hasId) return 'create';
    if (method === 'GET' && hasId) return 'getById';
    if (method === 'PUT' && hasId) return 'update';
    if (method === 'PATCH' && hasId) return 'update';
    if (method === 'DELETE' && hasId) return 'delete';

    // For custom actions like /users/deactivateAll or /users/{id}/resetPassword  
    if (path.operationId) {
        return camelCase(path.operationId);
    }

    // Fallback for non-standard paths without an operationId  
    return camelCase(`${method} ${segments.join(' ')}`);
}

/**
 * Attempts to find the primary model name (e.g., 'User') associated with a resource's operations.
 * It prioritizes response schemas of GET operations and falls back to request body schemas of POST/PUT.
 */
function getModelName(operations: PathInfo[], resourceName: string): string {
    let ref: string | undefined;

    const findRef = (schema: SwaggerDefinition | undefined): string | undefined => {
        if (!schema) return undefined;
        if (schema.$ref) return schema.$ref;
        if (schema.type === 'array' && schema.items) {
            const itemSchema = schema.items as SwaggerDefinition;
            if (itemSchema.$ref) return itemSchema.$ref;
        }
        // Handle nested allOf/oneOf if necessary  
        const composite = schema.allOf || schema.oneOf || schema.anyOf;
        if (composite) {
            for (const subSchema of composite) {
                const foundRef = findRef(subSchema);
                if (foundRef) return foundRef;
            }
        }
        return undefined;
    };

    // Prefer the 'getById' or 'list' operation for model name discovery  
    const getOp = operations.find(op => op.method === 'GET');
    if (getOp) {
        const successResponse = getOp.responses?.['200'] || getOp.responses?.['201'];
        ref = findRef(successResponse?.content?.['application/json']?.schema);
    }

    // Fallback to create/update operations  
    if (!ref) {
        const postOp = operations.find(op => op.method === 'POST' || op.method === 'PUT');
        if (postOp) {
            ref = findRef(postOp.requestBody?.content?.['application/json']?.schema);
        }
    }

    return ref ? pascalCase(ref.split('/').pop()!) : pascalCase(resourceName);
}

/**
 * Parses an OpenAPI specification to discover logical RESTful resources and their associated operations.
 * This is the foundational step for generating the admin UI.
 */
export function discoverAdminResources(parser: SwaggerParser): Resource[] {
    const allPaths = extractPaths(parser.getSpec().paths);
    const resourceMap = new Map<string, PathInfo[]>();

    // Group all paths by their inferred resource name  
    for (const path of allPaths) {
        const resourceName = getResourceName(path);
        if (!resourceMap.has(resourceName)) {
            resourceMap.set(resourceName, []);
        }
        resourceMap.get(resourceName)!.push(path);
    }

    const resources: Resource[] = [];
    for (const [name, operations] of resourceMap.entries()) {
        const isEditable = operations.some(op => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(op.method.toUpperCase()));
        const modelName = getModelName(operations, name);

        // Filter out paths that are too deeply nested to be considered part of the primary resource interface  
        // e.g., /users/{id}/permissions/{permId} shouldn't be a primary CRUD op for 'users'  
        const primaryOps = operations.filter(op => {
            const segments = op.path.split('/').filter(Boolean);
            return segments.length <= 2;
        });

        const resourceOps: ResourceOperation[] = primaryOps.map(op => ({
            path: op.path,
            method: op.method,
            operationId: op.operationId,
            action: classifyAction(op),
        }));

        resources.push({
            name,
            modelName,
            isEditable,
            operations: resourceOps,
            formProperties: [] // This will be populated later by the form generator  
        });
    }

    return resources;
}
