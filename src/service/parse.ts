import { pascalCase, PathInfo, extractPaths } from '../core/utils.js';
import { SwaggerParser } from '../core/parser.js';

/**
 * Extracts a controller/group name from a PathInfo object.
 * The logic is:
 * 1. Use the first tag if available.
 * 2. Fall back to the first non-parameter segment of the URL path.
 * 3. Default to "Default" for root paths or paths with no usable segments.
 * @param path The PathInfo object for a single API operation.
 * @returns The determined controller name, in PascalCase.
 */
function getControllerName(path: PathInfo): string {
    if (path.tags && path.tags.length > 0) {
        return pascalCase(path.tags[0]);
    }

    const pathParts = path.path.split('/').filter(p => p && !p.startsWith('{'));
    if (pathParts.length > 0) {
        return pascalCase(pathParts[0]);
    }

    return 'Default';
}

/**
 * Parses the OpenAPI specification and groups API paths by their controller tag or path structure.
 * This refactored version uses a more efficient and readable `reduce` pattern.
 *
 * @param parser An instance of the SwaggerParser containing the loaded spec.
 * @returns A record where keys are controller names (e.g., "Users") and values are arrays
 *          of PathInfo objects belonging to that controller.
 */
export function groupPathsByController(parser: SwaggerParser): Record<string, PathInfo[]> {
    // 1. Use the central extractPaths utility to get a clean, normalized list of all operations.
    const allOperations = extractPaths(parser.getSpec().paths);

    // 2. Use `reduce` to efficiently group the operations into a structured record.
    return allOperations.reduce((groups, operation) => {
        const controllerName = getControllerName(operation);

        // 3. Initialize the group if it doesn't exist, then add the current operation.
        if (!groups[controllerName]) {
            groups[controllerName] = [];
        }
        groups[controllerName].push(operation);

        return groups;
    }, {} as Record<string, PathInfo[]>);
}
