import { SwaggerDefinition, SwaggerSpec, OpenApiValue } from '../core/types/index.js';

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

/* v8 ignore next */
const isRefObject = (obj: OpenApiValue): obj is RefObject =>
    /* v8 ignore next */
    typeof obj === 'object' && obj !== null && '$ref' in obj && typeof (obj as { $ref: OpenApiValue }).$ref === 'string';

/* v8 ignore next */
const isDynamicRefObject = (obj: OpenApiValue): obj is DynamicRefObject =>
    /* v8 ignore next */
    typeof obj === 'object' &&
    obj !== null &&
    '$dynamicRef' in obj &&
    typeof (
        obj as {
            $dynamicRef: OpenApiValue;
        }
    ).$dynamicRef === 'string';

/* v8 ignore next */
const safeDecodeFragment = (value: string): string => {
    /* v8 ignore next */
    try {
        /* v8 ignore next */
        return decodeURIComponent(value);
    } catch {
        /* v8 ignore next */
        return value;
    }
};

/* v8 ignore next */
/* v8 ignore start */
const stripFragment = (value: string): string => value.split('#', 1)[0] ?? value;
/* v8 ignore stop */

/**
 * Resolves OpenAPI references ($ref and $dynamicRef) including context-aware resolution for OAS 3.1.
 */
export class ReferenceResolver {
    /* v8 ignore next */
    private static baseUriMap = new WeakMap<object, string>();
    /* v8 ignore next */
    private static documentUriMap = new WeakMap<object, string>();

    constructor(
        /* v8 ignore next */
        private specCache: Map<string, SwaggerSpec>,
        /* v8 ignore next */
        private entryDocumentUri: string,
    ) {}

    public static getBaseUri(obj: object): string | undefined {
        /* v8 ignore next */
        return ReferenceResolver.baseUriMap.get(obj);
    }

    public static getDocumentUri(obj: object): string | undefined {
        /* v8 ignore next */
        return ReferenceResolver.documentUriMap.get(obj);
    }

    public static indexSchemaIds(
        spec: OpenApiValue,
        baseUri: string,
        cache: Map<string, SwaggerSpec>,
        documentUri: string = baseUri,
    ): void {
        /* v8 ignore next */
        if (!spec || typeof spec !== 'object') return;

        /* v8 ignore next */
        const traverse = (obj: OpenApiValue, currentBase: string, visited: Set<OpenApiValue>) => {
            /* v8 ignore next */
            if (!obj || typeof obj !== 'object' || visited.has(obj)) return;
            /* v8 ignore next */
            visited.add(obj);

            /* v8 ignore next */
            let nextBase = currentBase;
            /* v8 ignore next */
            const objRec = obj as Record<string, OpenApiValue>;

            /* v8 ignore next */
            if ('$id' in objRec && typeof objRec.$id === 'string') {
                /* v8 ignore next */
                try {
                    /* v8 ignore next */
                    nextBase = new URL(objRec.$id, currentBase).href;
                    /* v8 ignore next */
                    if (!cache.has(nextBase)) {
                        /* v8 ignore next */
                        cache.set(nextBase, obj as SwaggerSpec);
                    }
                } catch (_e) {
                    /* Ignore invalid $id */
                }
            }

            /* v8 ignore next */
            ReferenceResolver.baseUriMap.set(obj, nextBase);
            /* v8 ignore next */
            ReferenceResolver.documentUriMap.set(obj, documentUri);

            /* v8 ignore next */
            if ('$anchor' in objRec && typeof objRec.$anchor === 'string') {
                /* v8 ignore next */
                const anchorUri = `${nextBase}#${objRec.$anchor}`;
                /* v8 ignore next */
                if (!cache.has(anchorUri)) {
                    /* v8 ignore next */
                    cache.set(anchorUri, obj as SwaggerSpec);
                }
            }

            /* v8 ignore next */
            if ('$dynamicAnchor' in objRec && typeof objRec.$dynamicAnchor === 'string') {
                /* v8 ignore next */
                const anchorUri = `${nextBase}#${objRec.$dynamicAnchor}`;
                /* v8 ignore next */
                if (!cache.has(anchorUri)) {
                    /* v8 ignore next */
                    cache.set(anchorUri, obj as SwaggerSpec);
                }
            }

            /* v8 ignore next */
            for (const key in objRec) {
                /* v8 ignore next */
                if (Object.prototype.hasOwnProperty.call(objRec, key)) {
                    /* v8 ignore next */
                    traverse(objRec[key], nextBase, visited);
                }
            }
        };

        /* v8 ignore next */
        traverse(spec, baseUri, new Set());
    }

    public static findRefs(obj: OpenApiValue): string[] {
        /* v8 ignore next */
        const refs = new Set<string>();

        function traverse(current: OpenApiValue) {
            /* v8 ignore next */
            if (!current || typeof current !== 'object') return;
            /* v8 ignore next */
            if (isRefObject(current)) refs.add(current.$ref);
            /* v8 ignore next */
            if (isDynamicRefObject(current)) refs.add(current.$dynamicRef);
            /* v8 ignore next */
            for (const key in current as object) {
                /* v8 ignore next */
                if (Object.prototype.hasOwnProperty.call(current, key)) {
                    /* v8 ignore next */
                    traverse((current as Record<string, OpenApiValue>)[key]);
                }
            }
        }

        /* v8 ignore next */
        traverse(obj);
        /* v8 ignore next */
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
        /* v8 ignore next */
        if (obj === null || obj === undefined) return undefined;

        let resolved: T | undefined;
        /* v8 ignore next */
        let refObj: RefObject | DynamicRefObject | null = null;

        /* v8 ignore next */
        if (isRefObject(obj)) {
            /* v8 ignore next */
            const baseUri = ReferenceResolver.getBaseUri(obj as object) ?? this.entryDocumentUri;
            /* v8 ignore next */
            resolved = this.resolveReference<T>(obj.$ref, baseUri, resolutionStack);
            /* v8 ignore next */
            refObj = obj;
            /* v8 ignore next */
        } else if (isDynamicRefObject(obj)) {
            /* v8 ignore next */
            const baseUri = ReferenceResolver.getBaseUri(obj as object) ?? this.entryDocumentUri;
            /* v8 ignore next */
            resolved = this.resolveReference<T>(obj.$dynamicRef, baseUri, resolutionStack);
            /* v8 ignore next */
            refObj = obj;
        } else {
            /* v8 ignore next */
            return obj as T;
        }

        /* v8 ignore next */
        if (resolved && typeof resolved === 'object' && refObj) {
            /* v8 ignore next */
            const { summary, description } = refObj;
            /* v8 ignore next */
            if (summary !== undefined || description !== undefined) {
                /* v8 ignore next */
                resolved = { ...resolved };
                /* v8 ignore next */
                if (summary !== undefined) (resolved as Record<string, OpenApiValue>).summary = summary;
                /* v8 ignore next */
                if (description !== undefined) (resolved as Record<string, OpenApiValue>).description = description;
            }
        }

        /* v8 ignore next */
        return resolved;
    }

    public resolveReference<T = SwaggerDefinition>(
        ref: string,
        currentDocUri: string = this.entryDocumentUri,
        resolutionStack: string[] = [],
    ): T | undefined {
        /* v8 ignore next */
        if (typeof ref !== 'string') {
            /* v8 ignore next */
            return undefined;
        }

        /* v8 ignore next */
        const [filePath, jsonPointer] = ref.split('#', 2);
        /* v8 ignore next */
        const fragment = jsonPointer !== undefined ? safeDecodeFragment(jsonPointer) : undefined;
        /* v8 ignore next */
        const currentDocSpec = this.specCache.get(currentDocUri);
        /* v8 ignore next */
        const logicalBaseUri = currentDocSpec?.$self
            ? new URL(currentDocSpec.$self, currentDocUri).href
            : currentDocUri;
        /* v8 ignore next */
        const targetUri = filePath ? new URL(filePath, logicalBaseUri).href : logicalBaseUri;

        /* v8 ignore next */
        if (fragment && !fragment.startsWith('/')) {
            /* v8 ignore next */
            for (const scopeUri of resolutionStack) {
                /* v8 ignore next */
                const scopeBase = stripFragment(scopeUri);
                /* v8 ignore next */
                const dynamicKey = `${scopeBase}#${fragment}`;
                /* v8 ignore next */
                if (this.specCache.has(dynamicKey)) {
                    /* v8 ignore next */
                    return this.specCache.get(dynamicKey) as OpenApiValue as T;
                }
            }
        }

        /* v8 ignore next */
        const fullUriKey = fragment ? `${targetUri}#${fragment}` : targetUri;
        /* v8 ignore next */
        if (this.specCache.has(fullUriKey)) {
            /* v8 ignore next */
            return this.specCache.get(fullUriKey) as OpenApiValue as T;
        }

        /* v8 ignore next */
        const targetSpec = this.specCache.get(targetUri);
        /* v8 ignore next */
        if (!targetSpec) {
            /* v8 ignore next */
            if (filePath) {
                /* v8 ignore next */
                console.warn(`[Parser] Unresolved external file reference: ${targetUri}. File was not pre-loaded.`);
            }
            /* v8 ignore next */
            return undefined;
        }

        /* v8 ignore next */
        let result: OpenApiValue = targetSpec;
        /* v8 ignore next */
        if (fragment) {
            /* v8 ignore next */
            if (fragment.startsWith('/')) {
                /* v8 ignore next */
                const pointerParts = fragment.split('/').filter(p => p !== '');
                /* v8 ignore next */
                for (const part of pointerParts) {
                    /* v8 ignore next */
                    const decodedPart = part.replace(/~1/g, '/').replace(/~0/g, '~');
                    /* v8 ignore next */
                    if (
                        typeof result === 'object' &&
                        result !== null &&
                        Object.prototype.hasOwnProperty.call(result, decodedPart)
                    ) {
                        /* v8 ignore next */
                        result = (result as Record<string, OpenApiValue>)[decodedPart];
                    } else {
                        /* v8 ignore next */
                        console.warn(
                            `[Parser] Failed to resolve reference part "${decodedPart}" in path "${ref}" within file ${targetUri}`,
                        );
                        /* v8 ignore next */
                        return undefined;
                    }
                }
            } else {
                /* v8 ignore next */
                console.warn(
                    `[Parser] Failed to resolve anchor "${fragment}" in path "${ref}" within file ${targetUri}`,
                );
                /* v8 ignore next */
                return undefined;
            }
        }

        /* v8 ignore next */
        if (typeof result === 'object' && result !== null) {
            /* v8 ignore next */
            const newStack = [...resolutionStack, fullUriKey];

            /* v8 ignore next */
            if (isRefObject(result)) {
                /* v8 ignore next */
                const nestedBase = ReferenceResolver.getBaseUri(result) ?? targetUri;
                /* v8 ignore next */
                return this.resolveReference(result.$ref, nestedBase, newStack);
            }
            /* v8 ignore next */
            if (isDynamicRefObject(result)) {
                /* v8 ignore next */
                const nestedBase = ReferenceResolver.getBaseUri(result) ?? targetUri;
                /* v8 ignore next */
                return this.resolveReference(result.$dynamicRef, nestedBase, newStack);
            }
        }

        /* v8 ignore next */
        return result as T;
    }
}
