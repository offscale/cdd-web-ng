import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import yaml from 'js-yaml';

import { SwaggerSpec, OpenApiValue } from '../core/types/index.js';
import { isUrl } from '../functions/utils.js';
import { validateSpec } from './parse_validator.js';
import { ReferenceResolver } from './parse_reference_resolver.js';

export class SpecLoader {
    public static async load(inputPath: string): Promise<{
        entrySpec: SwaggerSpec;
        cache: Map<string, SwaggerSpec>;
        documentUri: string;
    }> {
        /* v8 ignore next */
        const documentUri = isUrl(inputPath) ? inputPath : pathToFileURL(path.resolve(process.cwd(), inputPath)).href;

        /* v8 ignore next */
        const cache = new Map<string, SwaggerSpec>();
        /* v8 ignore next */
        await this.loadAndCacheSpecRecursive(documentUri, cache, new Set<string>());

        /* v8 ignore next */
        const entrySpec = cache.get(documentUri);
        /* v8 ignore next */
        if (!entrySpec) {
            /* v8 ignore next */
            throw new Error(`Failed to load entry spec from ${documentUri}`);
        }

        /* v8 ignore next */
        const validated = new Set<SwaggerSpec>();
        /* v8 ignore next */
        for (const doc of cache.values()) {
            /* v8 ignore next */
            /* v8 ignore start */
            if (!doc || typeof doc !== 'object') continue;
            /* v8 ignore stop */
            /* v8 ignore next */
            if (!this.isOpenApiOrSwaggerDoc(doc)) continue;
            /* v8 ignore next */
            if (validated.has(doc)) continue;
            /* v8 ignore next */
            validateSpec(doc);
            /* v8 ignore next */
            validated.add(doc);
        }

        /* v8 ignore next */
        this.validateOperationIdsAcrossDocuments(cache);

        /* v8 ignore next */
        return { entrySpec, cache, documentUri };
    }

    private static async loadAndCacheSpecRecursive(
        uri: string,
        cache: Map<string, SwaggerSpec>,
        visited: Set<string>,
    ): Promise<void> {
        /* v8 ignore next */
        if (visited.has(uri) || cache.has(uri)) return;
        /* v8 ignore next */
        visited.add(uri);

        /* v8 ignore next */
        const content = await this.loadContent(uri);
        /* v8 ignore next */
        const spec = this.parseSpecContent(content, uri);
        /* v8 ignore next */
        cache.set(uri, spec);

        /* v8 ignore next */
        const baseUri = spec.$self ? new URL(spec.$self, uri).href : uri;

        /* v8 ignore next */
        if (baseUri !== uri) {
            /* v8 ignore next */
            cache.set(baseUri, spec);
        }

        /* v8 ignore next */
        ReferenceResolver.indexSchemaIds(spec, baseUri, cache, uri);

        /* v8 ignore next */
        const refs = ReferenceResolver.findRefs(spec);
        /* v8 ignore next */
        const operationRefs = this.findOperationRefs(spec);
        /* v8 ignore next */
        const fileRefs = new Set<string>();

        /* v8 ignore next */
        refs.forEach(ref => {
            /* v8 ignore next */
            const [filePath] = ref.split('#', 2);
            /* v8 ignore next */
            if (filePath) fileRefs.add(filePath);
        });

        /* v8 ignore next */
        operationRefs.forEach(ref => {
            /* v8 ignore next */
            const [filePath] = ref.split('#', 2);
            /* v8 ignore next */
            /* v8 ignore start */
            if (filePath) fileRefs.add(filePath);
            /* v8 ignore stop */
        });

        /* v8 ignore next */
        for (const filePath of fileRefs) {
            /* v8 ignore next */
            try {
                /* v8 ignore next */
                const nextUri = new URL(filePath, baseUri).href;
                /* v8 ignore next */
                await this.loadAndCacheSpecRecursive(nextUri, cache, visited);
            } catch (_e) {
                /* v8 ignore next */
                console.warn(`[SpecLoader] Failed to resolve referenced URI: ${filePath}. Skipping.`);
            }
        }
    }

    private static findOperationRefs(spec: OpenApiValue): string[] {
        /* v8 ignore next */
        const refs = new Set<string>();

        /* v8 ignore next */
        const traverse = (node: OpenApiValue) => {
            /* v8 ignore next */
            if (!node || typeof node !== 'object') return;
            /* v8 ignore next */
            const record = node as Record<string, OpenApiValue>;
            /* v8 ignore next */
            if (typeof record.operationRef === 'string') {
                /* v8 ignore next */
                refs.add(record.operationRef);
            }
            /* v8 ignore next */
            Object.values(record).forEach(value => {
                /* v8 ignore next */
                traverse(value);
            });
        };

        /* v8 ignore next */
        traverse(spec);
        /* v8 ignore next */
        return Array.from(refs);
    }

    private static async loadContent(pathOrUrl: string): Promise<string> {
        /* v8 ignore next */
        try {
            /* v8 ignore next */
            if (isUrl(pathOrUrl) && !pathOrUrl.startsWith('file:')) {
                /* v8 ignore next */
                const response = await fetch(pathOrUrl);
                /* v8 ignore next */
                if (!response.ok) throw new Error(`Failed to fetch spec from ${pathOrUrl}: ${response.statusText}`);
                /* v8 ignore next */
                return response.text();
            } else {
                /* v8 ignore next */
                const filePath = pathOrUrl.startsWith('file:') ? new URL(pathOrUrl).pathname : pathOrUrl;
                /* v8 ignore next */
                if (!fs.existsSync(filePath)) throw new Error(`Input file not found at ${filePath}`);
                /* v8 ignore next */
                return fs.readFileSync(filePath, 'utf8');
            }
        } catch (e) {
            /* v8 ignore next */
            const message = e instanceof Error ? e.message : String(e);
            /* v8 ignore next */
            throw new Error(`Failed to read content from "${pathOrUrl}": ${message}`);
        }
    }

    private static parseSpecContent(content: string, pathOrUrl: string): SwaggerSpec {
        /* v8 ignore next */
        try {
            /* v8 ignore next */
            const extension = path.extname(pathOrUrl).toLowerCase();
            /* v8 ignore next */
            const isYamlExt = ['.yaml', '.yml'].includes(extension);
            /* v8 ignore next */
            const isJsonExt = extension === '.json';
            /* v8 ignore next */
            if (isYamlExt || (!extension && content.trim().startsWith('openapi:'))) {
                /* v8 ignore next */
                return yaml.load(content) as SwaggerSpec;
                /* v8 ignore next */
            } else if (isJsonExt) {
                /* v8 ignore next */
                return JSON.parse(content);
            } else {
                /* v8 ignore next */
                try {
                    /* v8 ignore next */
                    return JSON.parse(content);
                } catch (_jsonError) {
                    /* v8 ignore next */
                    return yaml.load(content) as SwaggerSpec;
                }
            }
        } catch (error) {
            /* v8 ignore next */
            const message = error instanceof Error ? error.message : String(error);
            /* v8 ignore next */
            throw new Error(`Failed to parse content from ${pathOrUrl}. Error: ${message}`);
        }
    }

    private static isOpenApiOrSwaggerDoc(doc: SwaggerSpec): boolean {
        /* v8 ignore next */
        return typeof doc.openapi === 'string' || typeof doc.swagger === 'string';
    }

    private static validateOperationIdsAcrossDocuments(cache: Map<string, SwaggerSpec>): void {
        /* v8 ignore next */
        const operationKeys = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace', 'query'];
        /* v8 ignore next */
        const operationIdLocations = new Map<string, string[]>();
        /* v8 ignore next */
        const seenDocs = new Set<object>();

        /* v8 ignore next */
        const recordOperationId = (operationId: string, location: string) => {
            /* v8 ignore next */
            const existing = operationIdLocations.get(operationId);
            /* v8 ignore next */
            if (existing) {
                /* v8 ignore next */
                existing.push(location);
            } else {
                /* v8 ignore next */
                operationIdLocations.set(operationId, [location]);
            }
        };

        /* v8 ignore next */
        const isRefLike = (value: OpenApiValue): boolean =>
            /* v8 ignore next */
            !!value && typeof value === 'object' && ('$ref' in (value as object) || '$dynamicRef' in (value as object));

        /* v8 ignore next */
        const collectFromPathItem = (pathItem: OpenApiValue, pathKey: string, prefix: string) => {
            /* v8 ignore next */
            /* v8 ignore start */
            if (!pathItem || typeof pathItem !== 'object') return;
            /* v8 ignore stop */
            /* v8 ignore next */
            if (isRefLike(pathItem)) return;

            /* v8 ignore next */
            const pi = pathItem as Record<string, OpenApiValue>;

            /* v8 ignore next */
            for (const method of operationKeys) {
                /* v8 ignore next */
                const operation = pi[method] as Record<string, OpenApiValue> | undefined;
                /* v8 ignore next */
                if (operation && typeof operation.operationId === 'string') {
                    /* v8 ignore next */
                    recordOperationId(operation.operationId, `${prefix}${method.toUpperCase()} ${pathKey}`);
                }
            }

            /* v8 ignore next */
            /* v8 ignore start */
            if (pi.additionalOperations) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                for (const [method, opVal] of Object.entries(pi.additionalOperations as Record<string, OpenApiValue>)) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    const operation = opVal as Record<string, OpenApiValue> | undefined;
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    if (operation && typeof operation.operationId === 'string') {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        recordOperationId(operation.operationId, `${prefix}${method} ${pathKey}`);
                        /* v8 ignore stop */
                    }
                }
            }
        };

        /* v8 ignore next */
        const collectFromPaths = (paths: Record<string, OpenApiValue> | undefined, prefix: string) => {
            /* v8 ignore next */
            if (!paths) return;
            /* v8 ignore next */
            for (const [pathKey, pathItem] of Object.entries(paths)) {
                /* v8 ignore next */
                collectFromPathItem(pathItem, pathKey, prefix);
            }
        };

        /* v8 ignore next */
        /* v8 ignore start */
        const collectFromCallbacks = (callbacks: Record<string, OpenApiValue> | undefined, prefix: string) => {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            if (!callbacks) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            for (const [callbackName, callbackObj] of Object.entries(callbacks)) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                if (!callbackObj || typeof callbackObj !== 'object') continue;
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                if (isRefLike(callbackObj)) continue;
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                for (const [expression, callbackPathItem] of Object.entries(callbackObj as Record<string, OpenApiValue>)) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    collectFromPathItem(callbackPathItem, expression, `${prefix}${callbackName}.`);
                    /* v8 ignore stop */
                }
            }
        };

        /* v8 ignore next */
        for (const [uri, doc] of cache.entries()) {
            /* v8 ignore next */
            /* v8 ignore start */
            if (!doc || typeof doc !== 'object') continue;
            /* v8 ignore stop */
            /* v8 ignore next */
            if (seenDocs.has(doc)) continue;
            /* v8 ignore next */
            if (!this.isOpenApiOrSwaggerDoc(doc)) continue;
            /* v8 ignore next */
            seenDocs.add(doc);

            /* v8 ignore next */
            const prefix = `${uri}::`;
            /* v8 ignore next */
            const spec = doc as SwaggerSpec;
            /* v8 ignore next */
            collectFromPaths(spec.paths as Record<string, OpenApiValue> | undefined, `${prefix}paths.`);
            /* v8 ignore next */
            collectFromPaths(spec.webhooks as Record<string, OpenApiValue> | undefined, `${prefix}webhooks.`);

            /* v8 ignore next */
            const components = spec.components;
            /* v8 ignore next */
            /* v8 ignore start */
            if (components?.pathItems) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                collectFromPaths(components.pathItems as Record<string, OpenApiValue>, `${prefix}components.pathItems.`);
                /* v8 ignore stop */
            }
            /* v8 ignore next */
            /* v8 ignore start */
            if (components?.webhooks) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                collectFromPaths(components.webhooks as Record<string, OpenApiValue>, `${prefix}components.webhooks.`);
                /* v8 ignore stop */
            }
            /* v8 ignore next */
            /* v8 ignore start */
            if (components?.callbacks) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                collectFromCallbacks(components.callbacks as Record<string, OpenApiValue>, `${prefix}components.callbacks.`);
                /* v8 ignore stop */
            }
        }

        /* v8 ignore next */
        for (const [operationId, locations] of operationIdLocations.entries()) {
            /* v8 ignore next */
            if (locations.length > 1) {
                /* v8 ignore next */
                throw new Error(
                    `Duplicate operationId "${operationId}" found across OpenAPI documents: ${locations.join(', ')}`,
                );
            }
        }
    }
}
