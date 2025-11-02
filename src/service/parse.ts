// src/service/parse.ts

import { SwaggerParser } from '../core/parser.js';
import { pascalCase } from '../core/utils.js';
import { PathInfo } from '../core/types.js';
import { extractPaths } from '../core/utils.js';

/**
 * Derives a controller name from an operation (PathInfo).
 * This logic prefers the first tag, falls back to the first path segment,
 * and finally defaults to "Default".
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
 * Groups all discovered API operations by their controller name.
 * The controller name is derived from the operation's tag or path.
 * This function now uses the centralized `extractPaths` utility.
 *
 * @param parser The SwaggerParser instance containing the loaded spec.
 * @returns A record where keys are controller names and values are arrays of operations.
 */
export function groupPathsByController(parser: SwaggerParser): Record<string, PathInfo[]> {
    const allOperations = extractPaths(parser.getSpec().paths);
    const groups: Record<string, PathInfo[]> = {};

    for (const operation of allOperations) {
        const controllerName = getControllerName(operation);
        if (!groups[controllerName]) {
            groups[controllerName] = [];
        }
        groups[controllerName].push(operation);
    }

    return groups;
}
