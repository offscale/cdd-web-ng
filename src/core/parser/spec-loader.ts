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
        const documentUri = isUrl(inputPath)
            ? inputPath
            : pathToFileURL(path.resolve(process.cwd(), inputPath)).href;

        const cache = new Map<string, SwaggerSpec>();
        await this.loadAndCacheSpecRecursive(documentUri, cache, new Set<string>());

        const entrySpec = cache.get(documentUri);
        if (!entrySpec) {
            throw new Error(`Failed to load entry spec from ${documentUri}`);
        }

        validateSpec(entrySpec);

        return { entrySpec, cache, documentUri };
    }

    private static async loadAndCacheSpecRecursive(uri: string, cache: Map<string, SwaggerSpec>, visited: Set<string>): Promise<void> {
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
        ReferenceResolver.indexSchemaIds(spec, baseUri, cache);

        // Find external refs to load next
        const refs = ReferenceResolver.findRefs(spec);
        for (const ref of refs) {
            const [filePath] = ref.split('#', 2);
            if (filePath) {
                try {
                    const nextUri = new URL(filePath, baseUri).href;
                    await this.loadAndCacheSpecRecursive(nextUri, cache, visited);
                } catch (e) {
                    console.warn(`[SpecLoader] Failed to resolve referenced URI: ${filePath}. Skipping.`);
                }
            }
        }
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
            if (['.yaml', '.yml'].includes(extension) || (!extension && content.trim().startsWith('openapi:'))) {
                return yaml.load(content) as SwaggerSpec;
            } else {
                return JSON.parse(content);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to parse content from ${pathOrUrl}. Error: ${message}`);
        }
    }
}
