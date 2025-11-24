import { SwaggerDefinition, SwaggerSpec } from "../types/index.js";

interface RefObject {
    $ref: string;
    summary?: string;
    description?: string;
}

interface DynamicRefObject {
    $dynamicRef: string;
    summary?: string;
    description?: string;
}

const isRefObject = (obj: unknown): obj is RefObject =>
    typeof obj === 'object' && obj !== null && '$ref' in obj && typeof (obj as { $ref: unknown }).$ref === 'string';

const isDynamicRefObject = (obj: unknown): obj is DynamicRefObject =>
    typeof obj === 'object' && obj !== null && '$dynamicRef' in obj && typeof (obj as { $dynamicRef: unknown }).$dynamicRef === 'string';

export class ReferenceResolver {
    constructor(
        private specCache: Map<string, SwaggerSpec>,
        private entryDocumentUri: string
    ) {}

    /**
     * Indexes any `$id`, `$anchor`, and `$dynamicAnchor` properties within a spec object
     * and adds them to the cache for direct lookup.
     */
    public static indexSchemaIds(spec: any, baseUri: string, cache: Map<string, SwaggerSpec>): void {
        if (!spec || typeof spec !== 'object') return;

        const traverse = (obj: any, currentBase: string, visited: Set<any>) => {
            if (!obj || typeof obj !== 'object' || visited.has(obj)) return;
            visited.add(obj);

            let nextBase = currentBase;

            // $id
            if ('$id' in obj && typeof obj.$id === 'string') {
                try {
                    nextBase = new URL(obj.$id, currentBase).href;
                    if (!cache.has(nextBase)) {
                        cache.set(nextBase, obj as SwaggerSpec);
                    }
                } catch (e) { /* Ignore invalid $id */ }
            }

            // $anchor
            if ('$anchor' in obj && typeof obj.$anchor === 'string') {
                const anchorUri = `${nextBase}#${obj.$anchor}`;
                if (!cache.has(anchorUri)) {
                    cache.set(anchorUri, obj as SwaggerSpec);
                }
            }

            // $dynamicAnchor
            if ('$dynamicAnchor' in obj && typeof obj.$dynamicAnchor === 'string') {
                const anchorUri = `${nextBase}#${obj.$dynamicAnchor}`;
                if (!cache.has(anchorUri)) {
                    cache.set(anchorUri, obj as SwaggerSpec);
                }
            }

            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    traverse(obj[key], nextBase, visited);
                }
            }
        };

        traverse(spec, baseUri, new Set());
    }

    /**
     * Recursively finds all unique $ref and $dynamicRef string values.
     */
    public static findRefs(obj: unknown): string[] {
        const refs = new Set<string>();
        function traverse(current: unknown) {
            if (!current || typeof current !== 'object') return;
            if (isRefObject(current)) refs.add(current.$ref);
            if (isDynamicRefObject(current)) refs.add(current.$dynamicRef);
            for (const key in current as object) {
                if (Object.prototype.hasOwnProperty.call(current, key)) {
                    traverse((current as any)[key]);
                }
            }
        }
        traverse(obj);
        return Array.from(refs);
    }

    public resolve<T>(obj: T | { $ref: string } | { $dynamicRef: string } | null | undefined): T | undefined {
        if (obj === null || obj === undefined) return undefined;

        let resolved: T | undefined;
        let refObj: RefObject | DynamicRefObject | null = null;

        if (isRefObject(obj)) {
            resolved = this.resolveReference<T>(obj.$ref);
            refObj = obj;
        } else if (isDynamicRefObject(obj)) {
            resolved = this.resolveReference<T>(obj.$dynamicRef);
            refObj = obj;
        } else {
            return obj as T;
        }

        // Handle Overrides (OAS 3.1)
        if (resolved && typeof resolved === 'object' && refObj) {
            const { summary, description } = refObj;
            if (summary !== undefined || description !== undefined) {
                resolved = { ...resolved };
                if (summary !== undefined) (resolved as any).summary = summary;
                if (description !== undefined) (resolved as any).description = description;
            }
        }

        return resolved;
    }

    public resolveReference<T = SwaggerDefinition>(ref: string, currentDocUri: string = this.entryDocumentUri): T | undefined {
        if (typeof ref !== 'string') {
            console.warn(`[Parser] Encountered an unsupported or invalid reference: ${ref}`);
            return undefined;
        }

        const [filePath, jsonPointer] = ref.split('#', 2);
        const currentDocSpec = this.specCache.get(currentDocUri);
        const logicalBaseUri = currentDocSpec?.$self ? new URL(currentDocSpec.$self, currentDocUri).href : currentDocUri;
        const targetUri = filePath ? new URL(filePath, logicalBaseUri).href : logicalBaseUri;

        // 1. Direct Cache Lookup ($id/$anchor)
        const fullUriKey = jsonPointer ? `${targetUri}#${jsonPointer}` : targetUri;
        if (this.specCache.has(fullUriKey)) {
            return this.specCache.get(fullUriKey) as unknown as T;
        }

        // 2. Spec File Cache Lookup
        const targetSpec = this.specCache.get(targetUri);
        if (!targetSpec) {
            console.warn(`[Parser] Unresolved external file reference: ${targetUri}. File was not pre-loaded.`);
            return undefined;
        }

        // 3. JSON Pointer Traversal
        let result: any = targetSpec;
        if (jsonPointer) {
            const pointerParts = jsonPointer.split('/').filter(p => p !== '');
            for (const part of pointerParts) {
                const decodedPart = part.replace(/~1/g, '/').replace(/~0/g, '~');
                if (typeof result === 'object' && result !== null && Object.prototype.hasOwnProperty.call(result, decodedPart)) {
                    result = result[decodedPart];
                } else {
                    console.warn(`[Parser] Failed to resolve reference part "${decodedPart}" in path "${ref}" within file ${targetUri}`);
                    return undefined;
                }
            }
        }

        // Handle nested Refs (Recursive resolution)
        if (isRefObject(result)) {
            return this.resolveReference(result.$ref, targetUri);
        }
        if (isDynamicRefObject(result)) {
            return this.resolveReference(result.$dynamicRef, targetUri);
        }

        return result as T;
    }
}
