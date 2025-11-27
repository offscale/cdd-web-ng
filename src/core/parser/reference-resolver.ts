import { SwaggerDefinition, SwaggerSpec } from '../types/index.js';

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
    typeof obj === 'object' &&
    obj !== null &&
    '$dynamicRef' in obj &&
    typeof (
        obj as {
            $dynamicRef: unknown;
        }
    ).$dynamicRef === 'string';

/**
 * Resolves OpenAPI references ($ref and $dynamicRef) including context-aware resolution for OAS 3.1.
 */
export class ReferenceResolver {
    constructor(
        private specCache: Map<string, SwaggerSpec>,
        private entryDocumentUri: string,
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
                } catch (e) {
                    /* Ignore invalid $id */
                }
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
                // Store mapping for dynamic anchor in the cache map
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

    /**
     * Resolves an object that might be a reference.
     * @param obj The object to resolve (or null).
     * @param resolutionStack The stack of URIs traversed so far (for context-aware $dynamicRef resolution).
     */
    public resolve<T>(
        obj:
            | T
            | { $ref: string }
            | {
                  $dynamicRef: string;
              }
            | null
            | undefined,
        resolutionStack: string[] = [],
    ): T | undefined {
        if (obj === null || obj === undefined) return undefined;

        let resolved: T | undefined;
        let refObj: RefObject | DynamicRefObject | null = null;

        if (isRefObject(obj)) {
            resolved = this.resolveReference<T>(obj.$ref, this.entryDocumentUri, resolutionStack);
            refObj = obj;
        } else if (isDynamicRefObject(obj)) {
            resolved = this.resolveReference<T>(obj.$dynamicRef, this.entryDocumentUri, resolutionStack);
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

    /**
     * Resolves a specific reference string.
     * @param ref The reference string (URI or fragment).
     * @param currentDocUri The URI of the document containing the reference.
     * @param resolutionStack The stack of unique schema URIs encountered during resolution. Used for $dynamicRef lookup.
     */
    public resolveReference<T = SwaggerDefinition>(
        ref: string,
        currentDocUri: string = this.entryDocumentUri,
        resolutionStack: string[] = [],
    ): T | undefined {
        if (typeof ref !== 'string') {
            return undefined;
        }

        const [filePath, jsonPointer] = ref.split('#', 2);
        const currentDocSpec = this.specCache.get(currentDocUri);
        const logicalBaseUri = currentDocSpec?.$self
            ? new URL(currentDocSpec.$self, currentDocUri).href
            : currentDocUri;
        const targetUri = filePath ? new URL(filePath, logicalBaseUri).href : logicalBaseUri;

        // 1. Dynamic Anchor Resolution (OAS 3.1)
        // Dynamic resolution traverses the stack from the outermost (start of resolution)
        // to find the first context that defines this anchor.
        if (jsonPointer && !jsonPointer.includes('/')) {
            for (const scopeUri of resolutionStack) {
                const dynamicKey = `${scopeUri}#${jsonPointer}`;
                if (this.specCache.has(dynamicKey)) {
                    return this.specCache.get(dynamicKey) as unknown as T;
                }
            }
        }

        // 2. Direct Cache Lookup ($id/$anchor - static)
        const fullUriKey = jsonPointer ? `${targetUri}#${jsonPointer}` : targetUri;
        if (this.specCache.has(fullUriKey)) {
            return this.specCache.get(fullUriKey) as unknown as T;
        }

        // 3. Spec File Cache Lookup
        const targetSpec = this.specCache.get(targetUri);
        if (!targetSpec) {
            if (filePath) {
                console.warn(`[Parser] Unresolved external file reference: ${targetUri}. File was not pre-loaded.`);
            }
            return undefined;
        }

        // 4. JSON Pointer Traversal
        let result: any = targetSpec;
        if (jsonPointer) {
            const pointerParts = jsonPointer.split('/').filter(p => p !== '');
            for (const part of pointerParts) {
                const decodedPart = part.replace(/~1/g, '/').replace(/~0/g, '~');
                if (
                    typeof result === 'object' &&
                    result !== null &&
                    Object.prototype.hasOwnProperty.call(result, decodedPart)
                ) {
                    result = result[decodedPart];
                } else {
                    console.warn(
                        `[Parser] Failed to resolve reference part "${decodedPart}" in path "${ref}" within file ${targetUri}`,
                    );
                    return undefined;
                }
            }
        }

        // Handle nested Refs (Recursive resolution)
        if (typeof result === 'object' && result !== null) {
            // Push current scope to stack for dynamic resolution downstream
            const newStack = [...resolutionStack, fullUriKey];

            if (isRefObject(result)) {
                return this.resolveReference(result.$ref, targetUri, newStack);
            }
            if (isDynamicRefObject(result)) {
                return this.resolveReference(result.$dynamicRef, targetUri, newStack);
            }
        }

        return result as T;
    }
}
