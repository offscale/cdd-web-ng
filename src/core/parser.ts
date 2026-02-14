/**
 * @fileoverview
 * This file contains the SwaggerParser class, the central component responsible for loading,
 * parsing, and providing a unified interface to OpenAPI (3.x) and Swagger (2.x) specifications.
 */

import {
    GeneratorConfig,
    LinkObject,
    PathInfo,
    PathItem,
    SecurityScheme,
    ServerObject,
    SwaggerDefinition,
    SwaggerSpec,
} from './types/index.js';
import { extractPaths, isUriReference, normalizeSecurityKey, pascalCase } from './utils/index.js';
import { SpecValidationError, validateSpec } from './validator.js';
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

    public readonly schemas: { name: string; definition: SwaggerDefinition | boolean }[];
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
            ReferenceResolver.indexSchemaIds(spec, baseUri, this.specCache, this.documentUri);
        }

        this.resolver = new ReferenceResolver(this.specCache, this.documentUri);

        // Analysis Logic (Extracting simplified views)
        this.schemas = this.collectSchemas();

        // OAS 3.2 Requirement:
        // 1. If the servers field is not provided (or empty), default to a single server with url '/'.
        // 2. Relative URLs MUST be resolved against the document location (or $self).
        this.servers = this.resolveServers(this.spec.servers);

        // We bind resolveRef to this instance so extractPaths can call back into the parser
        const resolveRef = (ref: string) => this.resolveReference(ref);
        const resolveObj = (obj: unknown) => this.resolve(obj as any);

        // Pass components context to extractPaths for strict security matching
        const extractOptions = {
            isOpenApi3: !!this.spec.openapi,
            defaultConsumes: this.spec.swagger ? this.spec.consumes : undefined,
            defaultProduces: this.spec.swagger ? this.spec.produces : undefined,
        };
        const operations = extractPaths(this.spec.paths, resolveRef, this.spec.components, extractOptions, resolveObj);
        const webhooks = extractPaths(this.spec.webhooks, resolveRef, this.spec.components, extractOptions, resolveObj);

        // Resolve operation/path-level server URLs relative to retrieval URI (OAS 3.2).
        const resolveOpServers = (items: PathInfo[]): PathInfo[] =>
            items.map(item => {
                if (item.servers === undefined) return item;
                const normalizedServers = item.servers.length === 0 ? [{ url: '/' }] : item.servers;
                return { ...item, servers: this.resolveServerUrls(normalizedServers, this.documentUri) };
            });

        this.operations = resolveOpServers(operations);
        this.webhooks = resolveOpServers(webhooks);

        this.assertUniqueResolvedOperationIds();

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
        // Swagger 2.0 compatibility: Derive servers from host/basePath/schemes when present.
        if (this.spec.swagger) {
            return this.resolveSwagger2Servers(servers);
        }

        // OAS 3.x Default behavior for missing servers
        if (!servers || servers.length === 0) {
            return [{ url: '/' }];
        }

        return this.resolveServerUrls(servers, this.documentUri);
    }

    /**
     * Resolves relative server URLs against the retrieval URI (documentUri).
     * OAS 3.2: `$self` is ignored for API URLs; the retrieval URI is the base.
     */
    private resolveServerUrls(servers: ServerObject[] | undefined, baseUri: string): ServerObject[] {
        if (!servers || servers.length === 0) return servers ?? [];

        return servers.map(server => {
            if (!server.url) return server;

            const rawUrl = server.url.trim();

            // If the URL starts with a variable {scheme}://... we cannot use the URL constructor
            // as valid schemes are strict. We preserve it as-is.
            if (rawUrl.startsWith('{')) {
                return server;
            }

            try {
                const serverBaseUri = ReferenceResolver.getDocumentUri(server as object) ?? baseUri;
                // new URL() resolves relative paths against baseUri.
                // It also normalizes the path (e.g., 'https://example.com' -> 'https://example.com/')
                const resolvedUrl = new URL(rawUrl, serverBaseUri).href;

                // The URL constructor percent-encodes braces (e.g., {id} -> %7Bid%7D).
                // We must revert this to preserve OAS Server Variables syntax.
                const decodedUrl = resolvedUrl.replace(/%7B/g, '{').replace(/%7D/g, '}');

                return { ...server, url: decodedUrl };
            } catch {
                // If URL parsing fails (e.g., complex variables inside the authority part),
                // fallback to returning the original string.
                return server;
            }
        });
    }

    /**
     * Resolves Swagger 2.0 host/basePath/schemes into OAS-style servers.
     * Falls back to the document URI's host/scheme when available.
     */
    private resolveSwagger2Servers(servers?: ServerObject[]): ServerObject[] {
        // If users supplied servers via extensions, respect them.
        if (servers && servers.length > 0) {
            return servers;
        }

        const swaggerSpec = this.spec as SwaggerSpec;
        const documentUrl = this.getHttpDocumentUrl();

        const host = swaggerSpec.host || documentUrl?.host || undefined;
        const basePathRaw = swaggerSpec.basePath ?? '/';
        const basePath = basePathRaw === '' ? '/' : basePathRaw.startsWith('/') ? basePathRaw : `/${basePathRaw}`;

        const schemes =
            swaggerSpec.schemes && swaggerSpec.schemes.length > 0
                ? swaggerSpec.schemes
                : documentUrl
                  ? [documentUrl.protocol.replace(':', '')]
                  : ['http'];

        if (!host) {
            // Without a host, we cannot build an absolute URL. Preserve relative basePath if meaningful.
            if (basePath && basePath !== '/') {
                return [{ url: basePath }];
            }
            return [];
        }

        const uniqueSchemes = Array.from(new Set(schemes));
        return uniqueSchemes.map(scheme => ({
            url: `${scheme}://${host}${basePath}`,
        }));
    }

    private getHttpDocumentUrl(): URL | undefined {
        try {
            const url = new URL(this.documentUri);
            if (url.protocol === 'http:' || url.protocol === 'https:') {
                return url;
            }
        } catch {
            // Ignore invalid URI
        }
        return undefined;
    }

    public getSpec(): SwaggerSpec {
        return this.spec;
    }

    public getJsonSchemaDialect(): string | undefined {
        if (this.spec.jsonSchemaDialect) {
            return this.spec.jsonSchemaDialect;
        }

        const openapiVersion = this.spec.openapi;
        if (!openapiVersion) return undefined;

        const match = openapiVersion.match(/^3\.(\d+)/);
        if (!match) return undefined;

        const minor = Number(match[1]);
        if (!Number.isNaN(minor) && minor >= 1) {
            return OAS_3_1_DIALECT;
        }

        return undefined;
    }

    public getDefinitions(): Record<string, SwaggerDefinition | boolean> {
        return this.spec.definitions || this.spec.components?.schemas || {};
    }

    public getDefinition(name: string): SwaggerDefinition | boolean | undefined {
        return this.getDefinitions()[name];
    }

    private collectSchemas(): { name: string; definition: SwaggerDefinition | boolean }[] {
        const definitions = new Map<string, SwaggerDefinition | boolean>();
        const definitionValues = new Set<SwaggerDefinition | boolean>();
        const seenDocs = new Set<object>();
        let syntheticCount = 0;

        const addDefinitions = (
            defs: Record<string, SwaggerDefinition | boolean> | undefined,
            origin: string,
        ): void => {
            if (!defs) return;
            Object.entries(defs).forEach(([name, definition]) => {
                const normalizedName = pascalCase(name);
                if (!definitions.has(normalizedName)) {
                    definitions.set(normalizedName, definition);
                    definitionValues.add(definition);
                    return;
                }
                const existing = definitions.get(normalizedName);
                if (existing !== definition) {
                    console.warn(
                        `[Parser] Duplicate schema name "${normalizedName}" encountered in ${origin}. Keeping first occurrence.`,
                    );
                }
            });
        };

        // Always start with the entry document's explicit schemas/definitions.
        addDefinitions(this.getDefinitions(), this.documentUri);

        // Collect schemas from any referenced OpenAPI/Swagger documents and standalone schema documents.
        for (const [uri, doc] of this.specCache.entries()) {
            if (!doc || typeof doc !== 'object') continue;
            if (seenDocs.has(doc)) continue;
            seenDocs.add(doc);

            const asSpec = doc as SwaggerSpec;
            const docDefinitions = asSpec.definitions || asSpec.components?.schemas;
            if (docDefinitions) {
                addDefinitions(docDefinitions, uri);
                continue;
            }

            // Standalone JSON Schema document support (no OpenAPI root, just a Schema Object).
            if (this.isSchemaDocument(doc)) {
                if (definitionValues.has(doc as SwaggerDefinition)) {
                    continue;
                }
                const schemaName = this.deriveSchemaName(uri, doc as SwaggerDefinition, ++syntheticCount);
                if (!definitions.has(schemaName)) {
                    definitions.set(schemaName, doc as SwaggerDefinition);
                    definitionValues.add(doc as SwaggerDefinition);
                } else {
                    const existing = definitions.get(schemaName);
                    if (existing !== doc) {
                        console.warn(
                            `[Parser] Duplicate standalone schema name "${schemaName}" encountered in ${uri}. Keeping first occurrence.`,
                        );
                    }
                }
            }
        }

        return Array.from(definitions.entries()).map(([name, definition]) => ({ name, definition }));
    }

    private isSchemaDocument(candidate: unknown): candidate is SwaggerDefinition {
        if (!candidate || typeof candidate !== 'object') return false;
        const doc = candidate as Record<string, unknown>;

        if ('openapi' in doc || 'swagger' in doc || 'info' in doc || 'paths' in doc) {
            return false;
        }

        const schemaKeys = [
            '$id',
            '$schema',
            'type',
            'properties',
            'items',
            'allOf',
            'anyOf',
            'oneOf',
            'enum',
            'const',
            'additionalProperties',
            'patternProperties',
            'prefixItems',
            'contentMediaType',
            'contentSchema',
        ];

        return schemaKeys.some(key => key in doc);
    }

    private deriveSchemaName(uri: string, schema: SwaggerDefinition, fallbackIndex: number): string {
        const source = typeof schema.$id === 'string' ? schema.$id : uri;
        const withoutFragment = source.split('#')[0].split('?')[0];
        const lastSegment = withoutFragment.split('/').filter(Boolean).pop();
        const base = lastSegment ? lastSegment.replace(/\.[^/.]+$/, '') : `Schema${fallbackIndex}`;
        const name = pascalCase(base);
        return name || `Schema${fallbackIndex}`;
    }

    public getSecuritySchemes(): Record<string, SecurityScheme> {
        const schemes = {
            ...(this.spec.components?.securitySchemes || {}),
            ...(this.spec.securityDefinitions || {}),
        } as Record<string, SecurityScheme>;

        const knownNames = new Set(Object.keys(schemes));

        const addSchemeFromRef = (key: string) => {
            if (!key || knownNames.has(key)) return;

            if (isUriReference(key)) {
                const resolved = this.resolveReference<SecurityScheme>(key);
                if (resolved) {
                    schemes[key] = resolved;
                    knownNames.add(key);
                }
                return;
            }

            const normalized = normalizeSecurityKey(key);
            if (knownNames.has(normalized)) return;
            const resolved = this.resolveReference<SecurityScheme>(key);
            if (resolved) {
                schemes[normalized] = resolved;
                knownNames.add(normalized);
            }
        };

        const scanSecurityRequirements = (security?: Record<string, string[]>[]) => {
            if (!security) return;
            security.forEach(req => {
                if (!req || typeof req !== 'object') return;
                Object.keys(req).forEach(key => {
                    if (!knownNames.has(key)) {
                        addSchemeFromRef(key);
                    }
                });
            });
        };

        const scanPathSecurity = (paths?: Record<string, any>) => {
            if (!paths) return;
            const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace', 'query'];
            Object.values(paths).forEach(pathItem => {
                if (!pathItem || typeof pathItem !== 'object') return;
                methods.forEach(method => {
                    const op = (pathItem as any)[method];
                    if (op?.security) scanSecurityRequirements(op.security);
                });
                if ((pathItem as any).additionalOperations) {
                    Object.values((pathItem as any).additionalOperations as Record<string, any>).forEach(op => {
                        if (op?.security) scanSecurityRequirements(op.security);
                    });
                }
            });
        };

        scanSecurityRequirements(this.spec.security);
        scanPathSecurity(this.spec.paths as Record<string, any>);
        scanPathSecurity(this.spec.webhooks as Record<string, any>);

        return schemes;
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
     * Retrieves the possible options for a polymorphic schema based on `oneOf`/`anyOf` and `discriminator`.
     * Supports strict mapping, explicit enum values, and implicit mapping (OAS 3.2).
     */
    public getPolymorphicSchemaOptions(schema: SwaggerDefinition): PolymorphicOption[] {
        if (!schema.discriminator) {
            return [];
        }
        const dPropName = schema.discriminator.propertyName;

        const variants = schema.oneOf ?? schema.anyOf;
        if (!variants) {
            return [];
        }

        const mapping = schema.discriminator.mapping || {};
        if (Object.keys(mapping).length > 0) {
            return Object.entries(mapping)
                .map(([name, ref]) => {
                    const resolvedSchema = this.resolveReference<SwaggerDefinition>(ref);
                    return resolvedSchema ? { name, schema: resolvedSchema } : null;
                })
                .filter((opt): opt is PolymorphicOption => !!opt);
        }

        return variants
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

    /**
     * Ensures operationId uniqueness across resolved operations and webhooks.
     * This complements input validation by considering $ref-resolved Path Items.
     */
    private assertUniqueResolvedOperationIds(): void {
        const operationIdLocations = new Map<string, string[]>();
        const operationKeys = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace', 'query'];

        const record = (op: PathInfo, prefix: string) => {
            if (!op.operationId) return;
            const location = `${prefix}${op.method.toUpperCase()} ${op.path}`;
            const existing = operationIdLocations.get(op.operationId);
            if (existing) {
                existing.push(location);
            } else {
                operationIdLocations.set(op.operationId, [location]);
            }
        };

        const recordFromPathItem = (pathItem: any, pathKey: string, prefix: string) => {
            if (!pathItem || typeof pathItem !== 'object') return;
            for (const method of operationKeys) {
                const operation = pathItem[method];
                if (operation?.operationId) {
                    const location = `${prefix}${method.toUpperCase()} ${pathKey}`;
                    const existing = operationIdLocations.get(operation.operationId);
                    if (existing) {
                        existing.push(location);
                    } else {
                        operationIdLocations.set(operation.operationId, [location]);
                    }
                }
            }
            if (pathItem.additionalOperations) {
                for (const [method, operation] of Object.entries(pathItem.additionalOperations)) {
                    if ((operation as any)?.operationId) {
                        const location = `${prefix}${method} ${pathKey}`;
                        const existing = operationIdLocations.get((operation as any).operationId);
                        if (existing) {
                            existing.push(location);
                        } else {
                            operationIdLocations.set((operation as any).operationId, [location]);
                        }
                    }
                }
            }
        };

        this.operations.forEach(op => record(op, 'paths: '));
        this.webhooks.forEach(op => record(op, 'webhooks: '));

        const resolvedPaths = new Set(this.operations.map(op => op.path));
        if (this.spec.paths) {
            for (const [pathKey, pathItem] of Object.entries(this.spec.paths)) {
                if (!pathItem || typeof pathItem !== 'object') continue;
                if (!(pathItem as any).$ref) continue;
                if (resolvedPaths.has(pathKey)) continue;
                const resolved = this.resolveReference<PathItem>((pathItem as any).$ref, this.documentUri);
                if (resolved) {
                    recordFromPathItem(resolved, pathKey, 'paths: ');
                }
            }
        }

        if (this.spec.webhooks) {
            const resolvedWebhookPaths = new Set(this.webhooks.map(op => op.path));
            for (const [pathKey, pathItem] of Object.entries(this.spec.webhooks)) {
                if (!pathItem || typeof pathItem !== 'object') continue;
                if (!(pathItem as any).$ref) continue;
                if (resolvedWebhookPaths.has(pathKey)) continue;
                const resolved = this.resolveReference<PathItem>((pathItem as any).$ref, this.documentUri);
                if (resolved) {
                    recordFromPathItem(resolved, pathKey, 'webhooks: ');
                }
            }
        }

        for (const [operationId, locations] of operationIdLocations.entries()) {
            if (locations.length > 1) {
                const message = `Duplicate operationId "${operationId}" found in multiple operations: ${locations.join(
                    ', ',
                )}`;
                let error: Error;
                try {
                    const candidate = new SpecValidationError(message);
                    error =
                        candidate instanceof Error && candidate.message
                            ? candidate
                            : Object.assign(new Error(message), { name: 'SpecValidationError' });
                } catch {
                    error = Object.assign(new Error(message), { name: 'SpecValidationError' });
                }
                throw error;
            }
        }
    }
}
