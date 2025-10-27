import { pascalCase, PathInfo } from '../core/utils.js';
import { SwaggerParser } from '../core/parser.js';

/**
 * Parses the OpenAPI specification and groups API paths by their controller tag.
 * @param parser An instance of the SwaggerParser containing the loaded spec.
 * @returns A record where keys are controller names and values are arrays of paths for that controller.
 */
export function groupPathsByController(parser: SwaggerParser): Record<string, PathInfo[]> {
    const paths = parser.getSpec().paths;
    const allPaths = Object.entries(paths).flatMap(([path, pathItem]) => {
        return Object.entries(pathItem).map(([method, operation]) => ({
            path,
            method,
            ...(operation as object),
        })) as PathInfo[];
    });

    const groups: Record<string, PathInfo[]> = {};
    allPaths.forEach((path) => {
        let controllerName = "Default";
        if (path.tags && path.tags.length > 0) {
            controllerName = path.tags[0];
        } else {
            const pathParts = path.path.split('/').filter((p: string): boolean => p && !p.startsWith('{'));
            if (pathParts.length > 0) {
                controllerName = pathParts[0];
            }
        }
        controllerName = pascalCase(controllerName);
        if (!groups[controllerName]) {
            groups[controllerName] = [];
        }
        groups[controllerName].push(path);
    });

    return groups;
}
