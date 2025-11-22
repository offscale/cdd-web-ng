/**
 * @fileoverview
 * This file contains the SwaggerParser class, the central component responsible for loading,
 * parsing, and providing a unified interface to OpenAPI (3.x) and Swagger (2.x) specifications.
 */

import {
    GeneratorConfig,
    LinkObject,
    PathInfo,
    SecurityScheme,
    ServerObject,
    SwaggerDefinition,
    SwaggerSpec
} from './types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';
import { extractPaths, isUrl, pascalCase } from './utils.js';
import { validateSpec } from './validator.js';
import { JSON_SCHEMA_2020_12_DIALECT, OAS_3_1_DIALECT } from './constants.js';

/** Represents a `$ref` object in a JSON Schema with optional sibling overrides. */
interface RefObject {
    $ref: string;
    summary?: string;
    description?: string;
}

/** Represents a `$dynamicRef` object in OAS 3.1 / JSON Schema 2020-12 with optional sibling overrides. */
interface DynamicRefObject {
    $dynamicRef: string;
    summary?: string;
    description?: string;
}

/**
 * A type guard to safely check if an object is a `$ref` object.
 * @param obj The object to check.
 * @returns True if the object is a valid `$ref` object.
 */
const isRefObject = (obj: unknown): obj is RefObject =>
    typeof obj === 'object' && obj !== null && '$ref' in obj && typeof (obj as { $ref: unknown }).$ref === 'string';

/**
 * A type guard to safely check if an object is a `$dynamicRef` object.
 * @param obj The object to check.
 * @returns True if the object is a valid `$dynamicRef` object.
 */
const isDynamicRefObject = (obj: unknown): obj is DynamicRefObject =>
    typeof obj === 'object' && obj !== null && '$dynamicRef' in obj && typeof (obj as { $dynamicRef: unknown }).$dynamicRef === 'string';

/**
 * Represents a resolved option for a polymorphic (`oneOf`) schema,
 * linking a discriminator value to its corresponding schema definition.
 */
export interface PolymorphicOption {
    /** The value of the discriminator property for this specific schema type (e.g., 'cat'). */
    name: string;
    /** The fully resolved SwaggerDefinition for this schema type. */
    schema: SwaggerDefinition;
}

/**
 * A wrapper class for a raw OpenAPI/Swagger specification object.
 * It provides a structured and reliable API to access different parts of the spec,
 * normalizing differences between versions and providing
 * helpful utilities like `$ref` resolution.
 */
export class SwaggerParser {
    /** The raw, parsed OpenAPI/Swagger specification object for the entry document. */
    public readonly spec: SwaggerSpec;
    /** The configuration object for the generator. */
    public readonly config: GeneratorConfig;
    /** The full URI of the entry document. */
    public readonly documentUri: string;

    /** A normalized array of all top-level schemas (definitions) found in the entry specification. */
    public readonly schemas: { name: string; definition: SwaggerDefinition; }[];
    /** A normalized array of all servers defined in the entry specification. */
    public readonly servers: ServerObject[];
    /** A flattened and processed list of all API operations (paths) from the entry specification. */
    public readonly operations: PathInfo[];
    /** A flattened and processed list of all Webhooks defined in the entry specification. */
    public readonly webhooks: PathInfo[];
    /** A normalized record of all security schemes defined in the entry specification. */
    public readonly security: Record<string, SecurityScheme>;
    /** A normalized record of all reusable links defined in the entry specification. */
    public readonly links: Record<string, LinkObject>;

    /** A cache of all loaded specifications, keyed by their absolute URI. */
    private readonly specCache: Map<string, SwaggerSpec>;

    /**
     * Initializes a new instance of the SwaggerParser. It is generally recommended
     * to use the static `create` factory method instead of this constructor directly.
     * @param spec The raw OpenAPI/Swagger specification object for the entry document.
     * @param config The generator configuration.
     * @param specCache A map containing all pre-loaded and parsed specifications, including the entry spec.
     * @param documentUri The absolute URI of the entry document.
     */
    public constructor(
        spec: SwaggerSpec,
        config: GeneratorConfig,
        specCache?: Map<string, SwaggerSpec>,
        documentUri: string = 'file://entry-spec.json'
    ) {
        // 1. Fundamental Structure Validation
        validateSpec(spec);

        // 2. Dialect Validation (OAS 3.1+)
        if (spec.jsonSchemaDialect) {
            const dialect = spec.jsonSchemaDialect;
            // We accept the specific OAS dialect and the generic JSON Schema Draft 2020-12
            if (dialect !== OAS_3_1_DIALECT && dialect !== JSON_SCHEMA_2020_12_DIALECT) {
                console.warn(`⚠️  Warning: The specification defines a custom jsonSchemaDialect: "${dialect}". ` +
                    `This generator is optimized for the default OpenAPI 3.1 dialect (${OAS_3_1_DIALECT}). ` +
                    `Some schema features may not be generated exactly as intended.`);
            }
        }

        // 3. User-Configured Custom Validation
        if (config.validateInput && !config.validateInput(spec)) {
            throw new Error("Custom input validation failed.");
        }

        this.spec = spec;
        this.config = config;
        this.documentUri = documentUri;

        // If a cache isn't provided, create one with just the entry spec.
        this.specCache = specCache || new Map<string, SwaggerSpec>([[this.documentUri, spec]]);

        this.schemas = Object.entries(this.getDefinitions()).map(([name, definition]) => ({
            name: pascalCase(name),
            definition
        }));

        this.servers = this.spec.servers || [];
        this.operations = extractPaths(this.spec.paths);
        this.webhooks = extractPaths(this.spec.webhooks);
        this.security = this.getSecuritySchemes();
        this.links = this.getLinks();
    }

    /**
     * Asynchronously creates a SwaggerParser instance from a file path or URL.
     * This is the recommended factory method. It pre-loads and caches the entry document
     * and any other documents it references.
     * @param inputPath The local file path or remote URL of the entry OpenAPI/Swagger specification.
     * @param config The generator configuration.
     * @returns A promise that resolves to a new, fully initialized SwaggerParser instance.
     */
    static async create(inputPath: string, config: GeneratorConfig): Promise<SwaggerParser> {
        const documentUri = isUrl(inputPath)
            ? inputPath
            : pathToFileURL(path.resolve(process.cwd(), inputPath)).href;

        const cache = new Map<string, SwaggerSpec>();
        await this.loadAndCacheSpecRecursive(documentUri, cache, new Set<string>());

        const entrySpec = cache.get(documentUri)!;
        return new SwaggerParser(entrySpec, config, cache, documentUri);
    }

    /**
     * Recursively traverses a specification, loading and caching all external references.
     * @param uri The absolute URI of the specification to load.
     * @param cache The map where loaded specs are stored.
     * @param visited A set to track already processed URIs to prevent infinite loops.
     * @private
     */
    private static async loadAndCacheSpecRecursive(uri: string, cache: Map<string, SwaggerSpec>, visited: Set<string>): Promise<void> {
        if (visited.has(uri)) return;
        visited.add(uri);

        const content = await this.loadContent(uri);
        const spec = this.parseSpecContent(content, uri);
        cache.set(uri, spec);

        const baseUri = spec.$self ? new URL(spec.$self, uri).href : uri;

        const refs = this.findRefs(spec);
        for (const ref of refs) {
            const [filePath] = ref.split('#', 2);
            if (filePath) { // It's a reference to another document
                const nextUri = new URL(filePath, baseUri).href;
                await this.loadAndCacheSpecRecursive(nextUri, cache, visited);
            }
        }
    }

    /**
     * Recursively finds all unique `$ref` and `$dynamicRef` values within a given object.
     * @param obj The object to search.
     * @returns An array of unique reference strings.
     * @private
     */
    private static findRefs(obj: unknown): string[] {
        const refs = new Set<string>();

        function traverse(current: unknown) {
            if (!current || typeof current !== 'object') {
                return;
            }

            if (isRefObject(current)) {
                refs.add(current.$ref);
            }

            if (isDynamicRefObject(current)) {
                refs.add(current.$dynamicRef);
            }

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
     * Loads the raw content of the specification from a local file or a remote URL.
     * @param pathOrUrl The path or URL to load from.
     * @returns A promise that resolves to the string content.
     * @private
     */
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

    /**
     * Parses the string content of a specification into a JavaScript object,
     * auto-detecting whether it is JSON or YAML.
     * @param content The raw string content of the specification.
     * @param pathOrUrl The original path, used for error messaging and format detection.
     * @returns The parsed SwaggerSpec object.
     * @private
     */
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

    /** Retrieves the entire parsed entry specification object. */
    public getSpec(): SwaggerSpec {
        return this.spec;
    }

    /** Retrieves the global JSON Schema Dialect if defined. */
    public getJsonSchemaDialect(): string | undefined {
        return this.spec.jsonSchemaDialect;
    }

    /** Retrieves all schema definitions from the entry specification, normalizing for OpenAPI 3 and Swagger 2. */
    public getDefinitions(): Record<string, SwaggerDefinition> {
        return this.spec.definitions || this.spec.components?.schemas || {};
    }

    /** Retrieves a single schema definition by its original name from the entry specification. */
    public getDefinition(name: string): SwaggerDefinition | undefined {
        return this.getDefinitions()[name];
    }

    /** Retrieves all security scheme definitions from the entry specification. */
    public getSecuritySchemes(): Record<string, SecurityScheme> {
        return (this.spec.components?.securitySchemes || this.spec.securityDefinitions || {}) as Record<string, SecurityScheme>;
    }

    /** Retrieves all reusable link definitions from the entry specification. */
    public getLinks(): Record<string, LinkObject> {
        if (!this.spec.components?.links) return {};
        const links: Record<string, LinkObject> = {};
        for (const [key, val] of Object.entries(this.spec.components.links)) {
            if ('$ref' in val) {
                const resolved = this.resolveReference<LinkObject>(val.$ref);
                if (resolved) links[key] = resolved;
            } else {
                links[key] = val as LinkObject;
            }
        }
        return links;
    }

    /**
     * Synchronously resolves a JSON reference (`$ref` or `$dynamicRef`) object to its definition.
     * If the provided object is not a reference, it is returned as is.
     * This method assumes all necessary files have been pre-loaded into the cache.
     *
     * It also supports Overrides: If the Reference Object contains sibling properties 'summary' or 'description',
     * these will be merged into the resolved object, overriding the original values (OAS 3.1+).
     *
     * @template T The expected type of the resolved object.
     * @param obj The object to resolve.
     * @returns The resolved definition, the original object if not a ref, or `undefined` if the reference is invalid.
     */
    public resolve<T>(obj: T | { $ref: string } | { $dynamicRef: string } | null | undefined): T | undefined {
        if (obj === null || obj === undefined) return undefined;

        let resolved: T | undefined;
        let refObj: RefObject | DynamicRefObject | null = null;

        if (isRefObject(obj)) {
            resolved = this.resolveReference<T>(obj.$ref);
            refObj = obj;
        } else if (isDynamicRefObject(obj)) {
            // For static code generation purposes, $dynamicRef is treated largely like $ref
            // Real runtime behavior would depend on dynamic scopes, but here we resolve to the target.
            resolved = this.resolveReference<T>(obj.$dynamicRef);
            refObj = obj;
        } else {
            return obj as T;
        }

        // Handle Reference Object Overrides (OAS 3.1 Feature)
        if (resolved && typeof resolved === 'object' && refObj) {
            const { summary, description } = refObj;
            if (summary !== undefined || description !== undefined) {
                // We must shallow copy the resolved object to define the overrides without mutating the shared definition.
                resolved = { ...resolved };
                if (summary !== undefined) {
                    (resolved as any).summary = summary;
                }
                if (description !== undefined) {
                    (resolved as any).description = description;
                }
            }
        }

        return resolved;
    }

    /**
     * Synchronously resolves a JSON reference string (e.g., './schemas.yaml#/User') to its definition.
     * This method reads from the pre-populated cache and can handle nested references.
     * @param ref The JSON reference string.
     * @param currentDocUri The absolute URI of the document containing the reference. Defaults to the entry document's base URI.
     * @returns The resolved definition, or `undefined` if the reference cannot be resolved.
     */
    public resolveReference<T = SwaggerDefinition>(ref: string, currentDocUri: string = this.documentUri): T | undefined {
        if (typeof ref !== 'string') {
            console.warn(`[Parser] Encountered an unsupported or invalid reference: ${ref}`);
            return undefined;
        }

        const [filePath, jsonPointer] = ref.split('#', 2);

        // Get the specification for the current document context to determine its logical base URI.
        const currentDocSpec = this.specCache.get(currentDocUri);

        // This can happen if an invalid URI is somehow passed as the context.
        if (!currentDocSpec) {
            console.warn(`[Parser] Unresolved document URI in cache: ${currentDocUri}. Cannot resolve reference "${ref}".`);
            return undefined;
        }

        // The base for resolving relative file paths is the document's logical URI, derived from its $self,
        // falling back to its physical URI.
        const logicalBaseUri = currentDocSpec.$self ? new URL(currentDocSpec.$self, currentDocUri).href : currentDocUri;

        // The target file's physical URI is resolved using the logical base. If the ref is local, it's just the current doc's physical URI.
        const targetFileUri = filePath ? new URL(filePath, logicalBaseUri).href : currentDocUri;

        const targetSpec = this.specCache.get(targetFileUri);
        if (!targetSpec) {
            console.warn(`[Parser] Unresolved external file reference: ${targetFileUri}. File was not pre-loaded.`);
            return undefined;
        }

        let result: any = targetSpec;
        if (jsonPointer) {
            // Gracefully handle pointers that are just "/" or empty
            const pointerParts = jsonPointer.split('/').filter(p => p !== '');
            for (const part of pointerParts) {
                const decodedPart = part.replace(/~1/g, '/').replace(/~0/g, '~');
                if (typeof result === 'object' && result !== null && Object.prototype.hasOwnProperty.call(result, decodedPart)) {
                    result = result[decodedPart];
                } else {
                    console.warn(`[Parser] Failed to resolve reference part "${decodedPart}" in path "${ref}" within file ${targetFileUri}`);
                    return undefined;
                }
            }
        }

        // Handle nested $refs recursively, passing the physical URI of the new document context.
        if (isRefObject(result)) {
            return this.resolveReference(result.$ref, targetFileUri);
        }

        // Handle nested $dynamicRefs recursively
        if (isDynamicRefObject(result)) {
            return this.resolveReference(result.$dynamicRef, targetFileUri);
        }

        return result as T;
    }

    /**
     * For a polymorphic schema (one with `oneOf` and a `discriminator`), this method
     * resolves all possible sub-types and returns them with their discriminator values.
     * It supports both explicit `mapping` in the discriminator object and implicit resolution
     * by inspecting the `enum` value of the discriminator property in each `oneOf` schema.
     * @param schema The polymorphic schema definition to analyze.
     * @returns An array of `PolymorphicOption` objects, each linking a discriminator value to its resolved schema.
     */
    public getPolymorphicSchemaOptions(schema: SwaggerDefinition): PolymorphicOption[] {
        if (!schema.oneOf || !schema.discriminator) {
            return [];
        }
        const dPropName = schema.discriminator.propertyName;

        // Strategy 1: Use the explicit mapping if it exists.
        const mapping = schema.discriminator.mapping || {};
        if (Object.keys(mapping).length > 0) {
            return Object.entries(mapping).map(([name, ref]) => {
                const resolvedSchema = this.resolveReference(ref);
                return resolvedSchema ? { name, schema: resolvedSchema } : null;
            }).filter((opt): opt is PolymorphicOption => !!opt);
        }

        // Strategy 2: Infer from the `oneOf` array directly by resolving each ref and reading its discriminator property.
        return schema.oneOf.map(refSchema => {
            // Check for $ref, but in OAS 3.1 it could also be $dynamicRef
            let ref: string | undefined;
            if (refSchema.$ref) ref = refSchema.$ref;
            else if (refSchema.$dynamicRef) ref = refSchema.$dynamicRef;

            if (!ref) return null;

            const resolvedSchema = this.resolveReference(ref);
            if (!resolvedSchema || !resolvedSchema.properties || !resolvedSchema.properties[dPropName]?.enum) {
                return null;
            }
            // The actual discriminator value (e.g., 'cat') must be read from the resolved schema's enum.
            const name = resolvedSchema.properties[dPropName].enum![0] as string;
            return { name, schema: resolvedSchema };
        }).filter((opt): opt is PolymorphicOption => !!opt);
    }

    /** Checks if the loaded specification is a valid OpenAPI 3.x or Swagger 2.0 file. */
    public isValidSpec(): boolean {
        return !!((this.spec.swagger && this.spec.swagger.startsWith('2.')) || (this.spec.openapi && this.spec.openapi.startsWith('3.')));
    }

    /** Gets the version of the loaded specification. */
    public getSpecVersion(): { type: 'swagger' | 'openapi'; version: string } | null {
        if (this.spec.swagger) return { type: 'swagger', version: this.spec.swagger };
        if (this.spec.openapi) return { type: 'openapi', version: this.spec.openapi };
        return null;
    }
}
