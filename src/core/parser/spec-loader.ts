import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import yaml from 'js-yaml';

import { SwaggerSpec } from '../types/index.js';
import { isUrl } from '../utils/index.js';
import { validateSpec } from '../validator.js';
import { ReferenceResolver } from './reference-resolver.js';

export class SpecLoader {
    /**
     * Asynchronously loads an OpenAPI specification and all its references.
     * @returns A map cache of all loaded specifications and the entry document URI.
     */
    public static async load(inputPath: string): Promise<{
        entrySpec: SwaggerSpec;
        cache: Map<string, SwaggerSpec>;
        documentUri: string;
    }> {
        const documentUri = isUrl(inputPath) ? inputPath : pathToFileURL(path.resolve(process.cwd(), inputPath)).href;

        const cache = new Map<string, SwaggerSpec>();
        await this.loadAndCacheSpecRecursive(documentUri, cache, new Set<string>());

        const entrySpec = cache.get(documentUri);
        if (!entrySpec) {
            throw new Error(`Failed to load entry spec from ${documentUri}`);
        }

        // Validate every OpenAPI/Swagger document in the cache (skip schema-only documents).
        const validated = new Set<SwaggerSpec>();
        for (const doc of cache.values()) {
            if (!doc || typeof doc !== 'object') continue;
            if (!this.isOpenApiOrSwaggerDoc(doc)) continue;
            if (validated.has(doc)) continue;
            validateSpec(doc);
            validated.add(doc);
        }

        this.validateOperationIdsAcrossDocuments(cache);

        return { entrySpec, cache, documentUri };
    }

    private static async loadAndCacheSpecRecursive(
        uri: string,
        cache: Map<string, SwaggerSpec>,
        visited: Set<string>,
    ): Promise<void> {
        if (visited.has(uri) || cache.has(uri)) return;
        visited.add(uri);

        const content = await this.loadContent(uri);
        const spec = this.parseSpecContent(content, uri);
        cache.set(uri, spec);

        const baseUri = spec.$self ? new URL(spec.$self, uri).href : uri;

        // Aliasing
        if (baseUri !== uri) {
            cache.set(baseUri, spec);
        }

        // Index internal IDs via helper to ensure internal refs can be resolved in the next recursion step
        ReferenceResolver.indexSchemaIds(spec, baseUri, cache, uri);

        // Find external refs to load next (includes $ref/$dynamicRef and Link operationRef targets)
        const refs = ReferenceResolver.findRefs(spec);
        const operationRefs = this.findOperationRefs(spec);
        const fileRefs = new Set<string>();

        refs.forEach(ref => {
            const [filePath] = ref.split('#', 2);
            if (filePath) fileRefs.add(filePath);
        });

        operationRefs.forEach(ref => {
            const [filePath] = ref.split('#', 2);
            if (filePath) fileRefs.add(filePath);
        });

        for (const filePath of fileRefs) {
            try {
                const nextUri = new URL(filePath, baseUri).href;
                await this.loadAndCacheSpecRecursive(nextUri, cache, visited);
            } catch (e) {
                console.warn(`[SpecLoader] Failed to resolve referenced URI: ${filePath}. Skipping.`);
            }
        }
    }

    private static findOperationRefs(spec: unknown): string[] {
        const refs = new Set<string>();

        const traverse = (node: unknown) => {
            if (!node || typeof node !== 'object') return;
            const record = node as Record<string, unknown>;
            if (typeof record.operationRef === 'string') {
                refs.add(record.operationRef);
            }
            Object.values(record).forEach(value => {
                traverse(value);
            });
        };

        traverse(spec);
        return Array.from(refs);
    }

    private static async loadContent(pathOrUrl: string): Promise<string> {
        try {
            if (isUrl(pathOrUrl) && !pathOrUrl.startsWith('file:')) {
                const response = await fetch(pathOrUrl);
                if (!response.ok) throw new Error(`Failed to fetch spec from ${pathOrUrl}: ${response.statusText}`);
                return response.text();
            } else {
                const filePath = pathOrUrl.startsWith('file:') ? new URL(pathOrUrl).pathname : pathOrUrl;
                if (!fs.existsSync(filePath)) throw new Error(`Input file not found at ${filePath}`);
                return fs.readFileSync(filePath, 'utf8');
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            throw new Error(`Failed to read content from "${pathOrUrl}": ${message}`);
        }
    }

    private static parseSpecContent(content: string, pathOrUrl: string): SwaggerSpec {
        try {
            const extension = path.extname(pathOrUrl).toLowerCase();
            const isYamlExt = ['.yaml', '.yml'].includes(extension);
            const isJsonExt = extension === '.json';
            if (isYamlExt || (!extension && content.trim().startsWith('openapi:'))) {
                return yaml.load(content) as SwaggerSpec;
            } else if (isJsonExt) {
                return JSON.parse(content);
            } else {
                try {
                    return JSON.parse(content);
                } catch (jsonError) {
                    return yaml.load(content) as SwaggerSpec;
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to parse content from ${pathOrUrl}. Error: ${message}`);
        }
    }

    private static isOpenApiOrSwaggerDoc(doc: SwaggerSpec): boolean {
        return typeof doc.openapi === 'string' || typeof doc.swagger === 'string';
    }

    private static validateOperationIdsAcrossDocuments(cache: Map<string, SwaggerSpec>): void {
        const operationKeys = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace', 'query'];
        const operationIdLocations = new Map<string, string[]>();
        const seenDocs = new Set<object>();

        const recordOperationId = (operationId: string, location: string) => {
            const existing = operationIdLocations.get(operationId);
            if (existing) {
                existing.push(location);
            } else {
                operationIdLocations.set(operationId, [location]);
            }
        };

        const isRefLike = (value: unknown): boolean =>
            !!value && typeof value === 'object' && ('$ref' in (value as object) || '$dynamicRef' in (value as object));

        const collectFromPathItem = (pathItem: any, pathKey: string, prefix: string) => {
            if (!pathItem || typeof pathItem !== 'object') return;
            if (isRefLike(pathItem)) return;

            for (const method of operationKeys) {
                const operation = (pathItem as any)[method];
                if (operation?.operationId) {
                    recordOperationId(operation.operationId, `${prefix}${method.toUpperCase()} ${pathKey}`);
                }
            }

            if ((pathItem as any).additionalOperations) {
                for (const [method, operation] of Object.entries((pathItem as any).additionalOperations)) {
                    if ((operation as any)?.operationId) {
                        recordOperationId((operation as any).operationId, `${prefix}${method} ${pathKey}`);
                    }
                }
            }
        };

        const collectFromPaths = (paths: Record<string, any> | undefined, prefix: string) => {
            if (!paths) return;
            for (const [pathKey, pathItem] of Object.entries(paths)) {
                collectFromPathItem(pathItem, pathKey, prefix);
            }
        };

        const collectFromCallbacks = (callbacks: Record<string, any> | undefined, prefix: string) => {
            if (!callbacks) return;
            for (const [callbackName, callbackObj] of Object.entries(callbacks)) {
                if (!callbackObj || typeof callbackObj !== 'object') continue;
                if (isRefLike(callbackObj)) continue;
                for (const [expression, callbackPathItem] of Object.entries(callbackObj as Record<string, any>)) {
                    collectFromPathItem(callbackPathItem, expression, `${prefix}${callbackName}.`);
                }
            }
        };

        for (const [uri, doc] of cache.entries()) {
            if (!doc || typeof doc !== 'object') continue;
            if (seenDocs.has(doc)) continue;
            if (!this.isOpenApiOrSwaggerDoc(doc)) continue;
            seenDocs.add(doc);

            const prefix = `${uri}::`;
            const spec = doc as SwaggerSpec;
            collectFromPaths(spec.paths as Record<string, any> | undefined, `${prefix}paths.`);
            collectFromPaths(spec.webhooks as Record<string, any> | undefined, `${prefix}webhooks.`);

            const components = spec.components;
            if (components?.pathItems) {
                collectFromPaths(components.pathItems as Record<string, any>, `${prefix}components.pathItems.`);
            }
            if (components?.webhooks) {
                collectFromPaths(components.webhooks as Record<string, any>, `${prefix}components.webhooks.`);
            }
            if (components?.callbacks) {
                collectFromCallbacks(components.callbacks as Record<string, any>, `${prefix}components.callbacks.`);
            }
        }

        for (const [operationId, locations] of operationIdLocations.entries()) {
            if (locations.length > 1) {
                throw new Error(
                    `Duplicate operationId "${operationId}" found across OpenAPI documents: ${locations.join(', ')}`,
                );
            }
        }
    }
}
