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

const safeDecodeFragment = (value: string): string => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

const stripFragment = (value: string): string => value.split('#', 1)[0] ?? value;

/**
 * Resolves OpenAPI references ($ref and $dynamicRef) including context-aware resolution for OAS 3.1.
 */
export class ReferenceResolver {
    private static baseUriMap = new WeakMap<object, string>();
    private static documentUriMap = new WeakMap<object, string>();

    constructor(
        private specCache: Map<string, SwaggerSpec>,
        private entryDocumentUri: string,
    ) {}

    public static getBaseUri(obj: object): string | undefined {
        return ReferenceResolver.baseUriMap.get(obj);
    }

    public static getDocumentUri(obj: object): string | undefined {
        return ReferenceResolver.documentUriMap.get(obj);
    }

    public static indexSchemaIds(
        spec: unknown,
        baseUri: string,
        cache: Map<string, SwaggerSpec>,
        documentUri: string = baseUri,
    ): void {
        if (!spec || typeof spec !== 'object') return;

        const traverse = (obj: unknown, currentBase: string, visited: Set<unknown>) => {
            if (!obj || typeof obj !== 'object' || visited.has(obj)) return;
            visited.add(obj);

            let nextBase = currentBase;
            const objRec = obj as Record<string, unknown>;

            if ('$id' in objRec && typeof objRec.$id === 'string') {
                try {
                    nextBase = new URL(objRec.$id, currentBase).href;
                    if (!cache.has(nextBase)) {
                        cache.set(nextBase, obj as SwaggerSpec);
                    }
                } catch (_e) {
                    /* Ignore invalid $id */
                }
            }

            ReferenceResolver.baseUriMap.set(obj, nextBase);
            ReferenceResolver.documentUriMap.set(obj, documentUri);

            if ('$anchor' in objRec && typeof objRec.$anchor === 'string') {
                const anchorUri = `${nextBase}#${objRec.$anchor}`;
                if (!cache.has(anchorUri)) {
                    cache.set(anchorUri, obj as SwaggerSpec);
                }
            }

            if ('$dynamicAnchor' in objRec && typeof objRec.$dynamicAnchor === 'string') {
                const anchorUri = `${nextBase}#${objRec.$dynamicAnchor}`;
                if (!cache.has(anchorUri)) {
                    cache.set(anchorUri, obj as SwaggerSpec);
                }
            }

            for (const key in objRec) {
                if (Object.prototype.hasOwnProperty.call(objRec, key)) {
                    traverse(objRec[key], nextBase, visited);
                }
            }
        };

        traverse(spec, baseUri, new Set());
    }

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
            const baseUri = ReferenceResolver.getBaseUri(obj as object) ?? this.entryDocumentUri;
            resolved = this.resolveReference<T>(obj.$ref, baseUri, resolutionStack);
            refObj = obj;
        } else if (isDynamicRefObject(obj)) {
            const baseUri = ReferenceResolver.getBaseUri(obj as object) ?? this.entryDocumentUri;
            resolved = this.resolveReference<T>(obj.$dynamicRef, baseUri, resolutionStack);
            refObj = obj;
        } else {
            return obj as T;
        }

        if (resolved && typeof resolved === 'object' && refObj) {
            const { summary, description } = refObj;
            if (summary !== undefined || description !== undefined) {
                resolved = { ...resolved };
                if (summary !== undefined) (resolved as Record<string, unknown>).summary = summary;
                if (description !== undefined) (resolved as Record<string, unknown>).description = description;
            }
        }

        return resolved;
    }

    public resolveReference<T = SwaggerDefinition>(
        ref: string,
        currentDocUri: string = this.entryDocumentUri,
        resolutionStack: string[] = [],
    ): T | undefined {
        if (typeof ref !== 'string') {
            return undefined;
        }

        const [filePath, jsonPointer] = ref.split('#', 2);
        const fragment = jsonPointer !== undefined ? safeDecodeFragment(jsonPointer) : undefined;
        const currentDocSpec = this.specCache.get(currentDocUri);
        const logicalBaseUri = currentDocSpec?.$self
            ? new URL(currentDocSpec.$self, currentDocUri).href
            : currentDocUri;
        const targetUri = filePath ? new URL(filePath, logicalBaseUri).href : logicalBaseUri;

        if (fragment && !fragment.startsWith('/')) {
            for (const scopeUri of resolutionStack) {
                const scopeBase = stripFragment(scopeUri);
                const dynamicKey = `${scopeBase}#${fragment}`;
                if (this.specCache.has(dynamicKey)) {
                    return this.specCache.get(dynamicKey) as unknown as T;
                }
            }
        }

        const fullUriKey = fragment ? `${targetUri}#${fragment}` : targetUri;
        if (this.specCache.has(fullUriKey)) {
            return this.specCache.get(fullUriKey) as unknown as T;
        }

        const targetSpec = this.specCache.get(targetUri);
        if (!targetSpec) {
            if (filePath) {
                console.warn(`[Parser] Unresolved external file reference: ${targetUri}. File was not pre-loaded.`);
            }
            return undefined;
        }

        let result: unknown = targetSpec;
        if (fragment) {
            if (fragment.startsWith('/')) {
                const pointerParts = fragment.split('/').filter(p => p !== '');
                for (const part of pointerParts) {
                    const decodedPart = part.replace(/~1/g, '/').replace(/~0/g, '~');
                    if (
                        typeof result === 'object' &&
                        result !== null &&
                        Object.prototype.hasOwnProperty.call(result, decodedPart)
                    ) {
                        result = (result as Record<string, unknown>)[decodedPart];
                    } else {
                        console.warn(
                            `[Parser] Failed to resolve reference part "${decodedPart}" in path "${ref}" within file ${targetUri}`,
                        );
                        return undefined;
                    }
                }
            } else {
                console.warn(
                    `[Parser] Failed to resolve anchor "${fragment}" in path "${ref}" within file ${targetUri}`,
                );
                return undefined;
            }
        }

        if (typeof result === 'object' && result !== null) {
            const newStack = [...resolutionStack, fullUriKey];

            if (isRefObject(result)) {
                const nestedBase = ReferenceResolver.getBaseUri(result) ?? targetUri;
                return this.resolveReference(result.$ref, nestedBase, newStack);
            }
            if (isDynamicRefObject(result)) {
                const nestedBase = ReferenceResolver.getBaseUri(result) ?? targetUri;
                return this.resolveReference(result.$dynamicRef, nestedBase, newStack);
            }
        }

        return result as T;
    }
}
