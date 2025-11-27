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
    SwaggerSpec,
} from './types/index.js';
import { extractPaths, pascalCase } from './utils/index.js';
import { validateSpec } from './validator.js';
import { OAS_3_1_DIALECT } from './constants.js';
import { SpecLoader } from './parser/spec-loader.js';
import { ReferenceResolver } from './parser/reference-resolver.js';

export interface PolymorphicOption {
    name: string;
    schema: SwaggerDefinition;
}

/**
 * A wrapper class for a raw OpenAPI/Swagger specification object.
 * It provides a structured and reliable API to access different parts of the spec.
 */
export class SwaggerParser {
    public readonly spec: SwaggerSpec;
    public readonly config: GeneratorConfig;
    public readonly documentUri: string;

    public readonly schemas: { name: string; definition: SwaggerDefinition }[];
    public readonly servers: ServerObject[];
    public readonly operations: PathInfo[];
    public readonly webhooks: PathInfo[];
    public readonly security: Record<string, SecurityScheme>;
    public readonly links: Record<string, LinkObject>;

    private readonly specCache: Map<string, SwaggerSpec>;
    private readonly resolver: ReferenceResolver;

    public constructor(
        spec: SwaggerSpec,
        config: GeneratorConfig,
        specCache?: Map<string, SwaggerSpec>,
        documentUri: string = 'file://entry-spec.json',
    ) {
        validateSpec(spec);

        // OAS 3.2 Update: Allow any jsonSchemaDialect pass-through without warning.
        // The default is implicit (OAS_3_1_DIALECT) if not provided, but explicit custom dialects
        // are now valid without restriction.

        if (config.validateInput && !config.validateInput(spec)) {
            throw new Error('Custom input validation failed.');
        }

        this.spec = spec;
        this.config = config;
        this.documentUri = documentUri;

        this.specCache = specCache || new Map<string, SwaggerSpec>([[this.documentUri, spec]]);

        // Initialize the resolver logic
        // If cache wasn't provided, we must self-index local IDs
        if (!specCache) {
            const baseUri = spec.$self ? new URL(spec.$self, documentUri).href : documentUri;
            if (baseUri !== documentUri) {
                this.specCache.set(baseUri, spec);
            }
            ReferenceResolver.indexSchemaIds(spec, baseUri, this.specCache);
        }

        this.resolver = new ReferenceResolver(this.specCache, this.documentUri);

        // Analysis Logic (Extracting simplified views)
        this.schemas = Object.entries(this.getDefinitions()).map(([name, definition]) => ({
            name: pascalCase(name),
            definition,
        }));

        // OAS 3.2 Requirement:
        // 1. If the servers field is not provided (or empty), default to a single server with url '/'.
        // 2. Relative URLs MUST be resolved against the document location (or $self).
        this.servers = this.resolveServers(this.spec.servers);

        // We bind resolveRef to this instance so extractPaths can call back into the parser
        const resolveRef = (ref: string) => this.resolveReference(ref);

        // Pass components context to extractPaths for strict security matching
        this.operations = extractPaths(this.spec.paths, resolveRef, this.spec.components);
        this.webhooks = extractPaths(this.spec.webhooks, resolveRef, this.spec.components);

        this.security = this.getSecuritySchemes();
        this.links = this.getLinks();
    }

    static async create(inputPath: string, config: GeneratorConfig): Promise<SwaggerParser> {
        const { entrySpec, cache, documentUri } = await SpecLoader.load(inputPath);
        return new SwaggerParser(entrySpec, config, cache, documentUri);
    }

    /**
     * Resolves server URLs relative to the document URI using the URL API.
     * Handles OAS 3.x defaults and Swagger 2.0 exclusions.
     */
    private resolveServers(servers?: ServerObject[]): ServerObject[] {
        // Swagger 2.0 compatibility: Do not apply OAS 3 defaults.
        if (this.spec.swagger) {
            return servers || [];
        }

        // OAS 3.x Default behavior for missing servers
        if (!servers || servers.length === 0) {
            return [{ url: '/' }];
        }

        // Determine the Base URI for resolution
        // Priority: $self property > documentUri (retrieval location)
        let baseUri = this.documentUri;
        if (this.spec.$self) {
            try {
                // $self can be relative to documentUri
                baseUri = new URL(this.spec.$self, this.documentUri).href;
            } catch (e) {
                // Fallback to documentUri if $self is malformed
                // (ReferenceResolver usually handles this, but we do it defensively here)
            }
        }

        return servers.map(server => {
            if (!server.url) return server;

            const rawUrl = server.url.trim();

            // If the URL starts with a variable {scheme}://... we cannot use the URL constructor
            // as valid schemes are strict. We preserve it as-is.
            if (rawUrl.startsWith('{')) {
                return server;
            }

            try {
                // new URL() resolves relative paths against baseUri.
                // It also normalizes the path (e.g., 'https://example.com' -> 'https://example.com/')
                const resolvedUrl = new URL(rawUrl, baseUri).href;

                // The URL constructor percent-encodes braces (e.g., {id} -> %7Bid%7D).
                // We must revert this to preserve OAS Server Variables syntax.
                const decodedUrl = resolvedUrl.replace(/%7B/g, '{').replace(/%7D/g, '}');

                return { ...server, url: decodedUrl };
            } catch (e) {
                // If URL parsing fails (e.g., complex variables inside the authority part),
                // fallback to returning the original string.
                return server;
            }
        });
    }

    public getSpec(): SwaggerSpec {
        return this.spec;
    }

    public getJsonSchemaDialect(): string | undefined {
        return this.spec.jsonSchemaDialect || (this.spec.openapi?.startsWith('3.1') ? OAS_3_1_DIALECT : undefined);
    }

    public getDefinitions(): Record<string, SwaggerDefinition> {
        return this.spec.definitions || this.spec.components?.schemas || {};
    }

    public getDefinition(name: string): SwaggerDefinition | undefined {
        return this.getDefinitions()[name];
    }

    public getSecuritySchemes(): Record<string, SecurityScheme> {
        return (this.spec.components?.securitySchemes || this.spec.securityDefinitions || {}) as Record<
            string,
            SecurityScheme
        >;
    }

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

    public resolve<T>(obj: T | { $ref: string } | { $dynamicRef: string } | null | undefined): T | undefined {
        return this.resolver.resolve(obj);
    }

    public resolveReference<T = SwaggerDefinition>(ref: string, currentDocUri?: string): T | undefined {
        return this.resolver.resolveReference(ref, currentDocUri);
    }

    /**
     * Retrieves the possible options for a polymorphic schema based on `oneOf` and `discriminator`.
     * Supports strict mapping, explicit enum values, and implicit mapping (OAS 3.2).
     */
    public getPolymorphicSchemaOptions(schema: SwaggerDefinition): PolymorphicOption[] {
        if (!schema.oneOf || !schema.discriminator) {
            return [];
        }
        const dPropName = schema.discriminator.propertyName;

        const mapping = schema.discriminator.mapping || {};
        if (Object.keys(mapping).length > 0) {
            return Object.entries(mapping)
                .map(([name, ref]) => {
                    const resolvedSchema = this.resolveReference<SwaggerDefinition>(ref);
                    return resolvedSchema ? { name, schema: resolvedSchema } : null;
                })
                .filter((opt): opt is PolymorphicOption => !!opt);
        }

        return schema.oneOf
            .map(refSchema => {
                let ref: string | undefined;
                if (refSchema.$ref) ref = refSchema.$ref;
                else if (refSchema.$dynamicRef) ref = refSchema.$dynamicRef;

                if (!ref) return null;

                const resolvedSchema = this.resolveReference<SwaggerDefinition>(ref);
                if (!resolvedSchema) {
                    return null;
                }

                // Ensure the resolved schema actually has the discriminator property
                // This prevents implicit mapping from picking up incompatible schemas (Fixes regression tests)
                // Note: Ideally we should check allOf merges, but for this basic utility check, properties is the primary target
                const hasProp = resolvedSchema.properties && resolvedSchema.properties[dPropName];
                if (!hasProp) {
                    return null;
                }

                // Strategy A: Explicit Enum in Schema
                if (resolvedSchema.properties![dPropName]?.enum) {
                    const name = resolvedSchema.properties![dPropName].enum![0] as string;
                    return { name, schema: resolvedSchema };
                }

                // Strategy B: Implicit Mapping (Component Name derived from Ref) - OAS 3.2 Support
                // e.g. "#/components/schemas/Cat" -> "Cat"
                const implicitName = ref.split('/').pop();
                if (implicitName) {
                    return { name: implicitName, schema: resolvedSchema };
                }

                return null;
            })
            .filter((opt): opt is PolymorphicOption => !!opt);
    }

    public isValidSpec(): boolean {
        return !!(
            (this.spec.swagger && this.spec.swagger.startsWith('2.')) ||
            (this.spec.openapi && this.spec.openapi.startsWith('3.'))
        );
    }

    public getSpecVersion(): { type: 'swagger' | 'openapi'; version: string } | null {
        if (this.spec.swagger) return { type: 'swagger', version: this.spec.swagger };
        if (this.spec.openapi) return { type: 'openapi', version: this.spec.openapi };
        return null;
    }
}
