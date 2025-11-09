// src/service/parse.ts

import { SwaggerParser } from '../core/parser.js';
import { camelCase, pascalCase } from '../core/utils.js';
import { PathInfo } from '../core/types.js';
import { extractPaths } from '../core/utils.js';

/**
 * Derives a controller name from an operation (PathInfo).
 * This logic prefers the first tag, falls back to the first path segment,
 * and finally defaults to "Default".
 * @param operation The PathInfo object for an API operation.
 * @returns The derived controller name as a PascalCase string.
 */
function getControllerName(operation: PathInfo): string {
    if (Array.isArray(operation.tags) && typeof operation.tags[0] === 'string' && operation.tags[0]) {
        return pascalCase(operation.tags[0]);
    }

    const pathSegment = operation.path.split('/').filter(p => p && !p.startsWith('{'))[0];
    if (pathSegment) {
        return pascalCase(pathSegment);
    }

    return 'Default';
}
/**
 * A helper function to generate a method name from a URL path.
 * @param path The URL path string.
 * @returns A suffix for a method name, e.g., `/users/{id}` becomes `UsersById`.
 * @private
 */
function path_to_method_name_suffix(path: string): string {
    return path.split('/').filter(Boolean).map(segment => {
        if (segment.startsWith('{') && segment.endsWith('}')) {
            return `By${pascalCase(segment.slice(1, -1))}`;
        }
        return pascalCase(segment);
    }).join('');
}

/**
 * Groups all discovered API operations by their controller name and de-duplicates method names.
 * The controller name is derived from the operation's tag or path.
 * This function also ensures that every operation is assigned a unique `methodName` property.
 *
 * @param parser The SwaggerParser instance containing the loaded spec.
 * @returns A record where keys are controller names and values are arrays of operations.
 */
export function groupPathsByController(parser: SwaggerParser): Record<string, PathInfo[]> {
    const usedMethodNames = new Set<string>();
    const allOperations = extractPaths(parser.getSpec().paths);
    const groups: Record<string, PathInfo[]> = {};

    for (const operation of allOperations) {
        // FIX: Re-introduce the customizeMethodName logic here where method names are assigned.
        const customizer = parser.config.options?.customizeMethodName;
        let baseMethodName: string;
        if (customizer && operation.operationId) {
            baseMethodName = customizer(operation.operationId);
        } else {
            baseMethodName = operation.operationId
                ? camelCase(operation.operationId)
                : `${operation.method.toLowerCase()}${path_to_method_name_suffix(operation.path)}`;
        }

        let uniqueMethodName = baseMethodName;
        let counter = 1;
        while (usedMethodNames.has(uniqueMethodName)) {
            uniqueMethodName = `${baseMethodName}${++counter}`;
        }
        usedMethodNames.add(uniqueMethodName);
        operation.methodName = uniqueMethodName;

        const controllerName = getControllerName(operation);
        if (!groups[controllerName]) {
            groups[controllerName] = [];
        }
        groups[controllerName].push(operation);
    }

    return groups;
}
