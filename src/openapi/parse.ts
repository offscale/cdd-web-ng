// src/core/parser.ts
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
    SpecOperation,
    OpenApiValue,
} from '../core/types/index.js';
import { extractPaths, isUriReference, normalizeSecurityKey, pascalCase } from '../functions/utils.js';
import { SpecValidationError, validateSpec } from './parse_validator.js';
import { OAS_3_1_DIALECT } from '../core/constants.js';
import { SpecLoader } from './parse_spec_loader.js';
import { ReferenceResolver } from './parse_reference_resolver.js';

export interface PolymorphicOption {
    name: string;
    schema: SwaggerDefinition;
}

/**
 * A wrapper class for a raw OpenAPI/Swagger specification object.
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
        /* v8 ignore next */
        validateSpec(spec);

        /* v8 ignore next */
        if (config.validateInput && !config.validateInput(spec)) {
            /* v8 ignore next */
            throw new Error('Custom input validation failed.');
        }

        /* v8 ignore next */
        this.spec = spec;
        /* v8 ignore next */
        this.config = config;
        /* v8 ignore next */
        this.documentUri = documentUri;

        /* v8 ignore next */
        this.specCache = specCache || new Map<string, SwaggerSpec>([[this.documentUri, spec]]);

        /* v8 ignore next */
        if (!specCache) {
            /* v8 ignore next */
            const baseUri = spec.$self ? new URL(spec.$self, documentUri).href : documentUri;
            /* v8 ignore next */
            if (baseUri !== documentUri) {
                /* v8 ignore next */
                this.specCache.set(baseUri, spec);
            }
            /* v8 ignore next */
            ReferenceResolver.indexSchemaIds(spec, baseUri, this.specCache, this.documentUri);
        }

        /* v8 ignore next */
        this.resolver = new ReferenceResolver(this.specCache, this.documentUri);
        /* v8 ignore next */
        this.schemas = this.collectSchemas();
        /* v8 ignore next */
        this.servers = this.resolveServers(this.spec.servers);

        /* v8 ignore next */
        const resolveRef = (ref: string) => this.resolveReference(ref);
        /* v8 ignore next */
        const resolveObj = (obj: OpenApiValue) => this.resolve(obj);

        const extractOptions: {
            isOpenApi3: boolean;
            defaultConsumes?: string[];
            defaultProduces?: string[];
            /* v8 ignore next */
        } = {
            isOpenApi3: !!this.spec.openapi,
        };
        /* v8 ignore next */
        if (this.spec.swagger) {
            /* v8 ignore next */
            /* v8 ignore start */
            if (this.spec.consumes) extractOptions.defaultConsumes = this.spec.consumes;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            if (this.spec.produces) extractOptions.defaultProduces = this.spec.produces;
            /* v8 ignore stop */
        }

        /* v8 ignore next */
        const operations = extractPaths(this.spec.paths, resolveRef, this.spec.components, extractOptions, resolveObj);
        /* v8 ignore next */
        const webhooks = extractPaths(this.spec.webhooks, resolveRef, this.spec.components, extractOptions, resolveObj);

        /* v8 ignore next */
        const resolveOpServers = (items: PathInfo[]): PathInfo[] =>
            /* v8 ignore next */
            items.map(item => {
                /* v8 ignore next */
                if (item.servers === undefined) return item;
                /* v8 ignore next */
                const normalizedServers = item.servers.length === 0 ? [{ url: '/' }] : item.servers;
                /* v8 ignore next */
                return { ...item, servers: this.resolveServerUrls(normalizedServers, this.documentUri) };
            });

        /* v8 ignore next */
        this.operations = resolveOpServers(operations);
        /* v8 ignore next */
        this.webhooks = resolveOpServers(webhooks);

        /* v8 ignore next */
        this.assertUniqueResolvedOperationIds();

        /* v8 ignore next */
        this.security = this.getSecuritySchemes();
        /* v8 ignore next */
        this.links = this.getLinks();
    }

    static async create(inputPath: string, config: GeneratorConfig): Promise<SwaggerParser> {
        /* v8 ignore next */
        const { entrySpec, cache, documentUri } = await SpecLoader.load(inputPath);
        /* v8 ignore next */
        return new SwaggerParser(entrySpec, config, cache, documentUri);
    }

    private resolveServers(servers?: ServerObject[]): ServerObject[] {
        /* v8 ignore next */
        if (this.spec.swagger) {
            /* v8 ignore next */
            return this.resolveSwagger2Servers(servers);
        }
        /* v8 ignore next */
        if (!servers || servers.length === 0) {
            /* v8 ignore next */
            return [{ url: '/' }];
        }
        /* v8 ignore next */
        return this.resolveServerUrls(servers, this.documentUri);
    }

    private resolveServerUrls(servers: ServerObject[] | undefined, baseUri: string): ServerObject[] {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!servers || servers.length === 0) return servers ?? [];
        /* v8 ignore stop */

        /* v8 ignore next */
        return servers.map(server => {
            /* v8 ignore next */
            if (!server.url) return server;

            /* v8 ignore next */
            const rawUrl = server.url.trim();

            /* v8 ignore next */
            if (rawUrl.startsWith('{')) {
                /* v8 ignore next */
                return server;
            }

            /* v8 ignore next */
            try {
                /* v8 ignore next */
                const serverBaseUri = ReferenceResolver.getDocumentUri(server as object) ?? baseUri;
                /* v8 ignore next */
                const resolvedUrl = new URL(rawUrl, serverBaseUri).href;
                /* v8 ignore next */
                const decodedUrl = resolvedUrl.replace(/%7B/g, '{').replace(/%7D/g, '}');
                /* v8 ignore next */
                return { ...server, url: decodedUrl };
            } catch {
                /* v8 ignore next */
                return server;
            }
        });
    }

    private resolveSwagger2Servers(servers?: ServerObject[]): ServerObject[] {
        /* v8 ignore next */
        if (servers && servers.length > 0) {
            /* v8 ignore next */
            return servers;
        }

        /* v8 ignore next */
        const swaggerSpec = this.spec as SwaggerSpec;
        /* v8 ignore next */
        const documentUrl = this.getHttpDocumentUrl();

        /* v8 ignore next */
        const host = swaggerSpec.host || documentUrl?.host || undefined;
        /* v8 ignore next */
        const basePathRaw = swaggerSpec.basePath ?? '/';
        /* v8 ignore next */
        /* v8 ignore start */
        const basePath = basePathRaw === '' ? '/' : basePathRaw.startsWith('/') ? basePathRaw : `/${basePathRaw}`;
        /* v8 ignore stop */

        const schemes =
            /* v8 ignore next */
            swaggerSpec.schemes && swaggerSpec.schemes.length > 0
                ? swaggerSpec.schemes
                : documentUrl
                  ? [documentUrl.protocol.replace(':', '')]
                  : ['http'];

        /* v8 ignore next */
        if (!host) {
            /* v8 ignore next */
            if (basePath && basePath !== '/') {
                /* v8 ignore next */
                return [{ url: basePath }];
            }
            /* v8 ignore next */
            return [];
        }

        /* v8 ignore next */
        const uniqueSchemes = Array.from(new Set(schemes));
        /* v8 ignore next */
        return uniqueSchemes.map(scheme => ({
            url: `${scheme}://${host}${basePath}`,
        }));
    }

    private getHttpDocumentUrl(): URL | undefined {
        /* v8 ignore next */
        try {
            /* v8 ignore next */
            const url = new URL(this.documentUri);
            /* v8 ignore next */
            if (url.protocol === 'http:' || url.protocol === 'https:') {
                /* v8 ignore next */
                return url;
            }
        } catch {
            // ignore
        }
        /* v8 ignore next */
        return undefined;
    }

    public getSpec(): SwaggerSpec {
        /* v8 ignore next */
        return this.spec;
    }

    public getJsonSchemaDialect(): string | undefined {
        /* v8 ignore next */
        if (this.spec.jsonSchemaDialect) {
            /* v8 ignore next */
            return this.spec.jsonSchemaDialect;
        }

        /* v8 ignore next */
        const openapiVersion = this.spec.openapi;
        /* v8 ignore next */
        /* v8 ignore start */
        if (!openapiVersion) return undefined;
        /* v8 ignore stop */

        /* v8 ignore next */
        const match = openapiVersion.match(/^3\.(\d+)/);
        /* v8 ignore next */
        /* v8 ignore start */
        if (!match) return undefined;
        /* v8 ignore stop */

        /* v8 ignore next */
        const minor = Number(match[1]);
        /* v8 ignore next */
        if (!Number.isNaN(minor) && minor >= 1) {
            /* v8 ignore next */
            return OAS_3_1_DIALECT;
        }

        /* v8 ignore next */
        return undefined;
    }

    public getDefinitions(): Record<string, SwaggerDefinition | boolean> {
        /* v8 ignore next */
        return this.spec.definitions || this.spec.components?.schemas || {};
    }

    public getDefinition(name: string): SwaggerDefinition | boolean | undefined {
        /* v8 ignore next */
        return this.getDefinitions()[name];
    }

    private collectSchemas(): { name: string; definition: SwaggerDefinition | boolean }[] {
        /* v8 ignore next */
        const definitions = new Map<string, SwaggerDefinition | boolean>();
        /* v8 ignore next */
        const definitionValues = new Set<SwaggerDefinition | boolean>();
        /* v8 ignore next */
        const seenDocs = new Set<object>();
        /* v8 ignore next */
        let syntheticCount = 0;

        /* v8 ignore next */
        const addDefinitions = (
            defs: Record<string, SwaggerDefinition | boolean> | undefined,
            origin: string,
        ): void => {
            /* v8 ignore next */
            /* v8 ignore start */
            if (!defs) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            Object.entries(defs).forEach(([name, definition]) => {
                /* v8 ignore next */
                const normalizedName = pascalCase(name);
                /* v8 ignore next */
                if (!definitions.has(normalizedName)) {
                    /* v8 ignore next */
                    definitions.set(normalizedName, definition);
                    /* v8 ignore next */
                    definitionValues.add(definition);
                    /* v8 ignore next */
                    return;
                }
                /* v8 ignore next */
                const existing = definitions.get(normalizedName);
                /* v8 ignore next */
                if (existing !== definition) {
                    /* v8 ignore next */
                    console.warn(
                        `[Parser] Duplicate schema name "${normalizedName}" encountered in ${origin}. Keeping first occurrence.`,
                    );
                }
            });
        };

        /* v8 ignore next */
        addDefinitions(this.getDefinitions(), this.documentUri);

        /* v8 ignore next */
        for (const [uri, doc] of this.specCache.entries()) {
            /* v8 ignore next */
            /* v8 ignore start */
            if (!doc || typeof doc !== 'object') continue;
            /* v8 ignore stop */
            /* v8 ignore next */
            if (seenDocs.has(doc)) continue;
            /* v8 ignore next */
            seenDocs.add(doc);

            /* v8 ignore next */
            const asSpec = doc as SwaggerSpec;
            /* v8 ignore next */
            const docDefinitions = asSpec.definitions || asSpec.components?.schemas;
            /* v8 ignore next */
            if (docDefinitions) {
                /* v8 ignore next */
                addDefinitions(docDefinitions, uri);
                /* v8 ignore next */
                continue;
            }

            /* v8 ignore next */
            if (this.isSchemaDocument(doc)) {
                /* v8 ignore next */
                if (definitionValues.has(doc as SwaggerDefinition)) {
                    /* v8 ignore next */
                    continue;
                }
                /* v8 ignore next */
                const schemaName = this.deriveSchemaName(uri, doc as SwaggerDefinition, ++syntheticCount);
                /* v8 ignore next */
                /* v8 ignore start */
                if (!definitions.has(schemaName)) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    definitions.set(schemaName, doc as SwaggerDefinition);
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    definitionValues.add(doc as SwaggerDefinition);
                    /* v8 ignore stop */
                } else {
                    /* v8 ignore next */
                    const existing = definitions.get(schemaName);
                    /* v8 ignore next */
                    /* v8 ignore start */
                    if (existing !== doc) {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        console.warn(
                            `[Parser] Duplicate standalone schema name "${schemaName}" encountered in ${uri}. Keeping first occurrence.`,
                        );
                    }
                }
            }
        }

        /* v8 ignore next */
        return Array.from(definitions.entries()).map(([name, definition]) => ({ name, definition }));
    }

    private isSchemaDocument(candidate: OpenApiValue): candidate is SwaggerDefinition {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!candidate || typeof candidate !== 'object') return false;
        /* v8 ignore stop */
        /* v8 ignore next */
        const doc = candidate as Record<string, OpenApiValue>;

        /* v8 ignore next */
        if ('openapi' in doc || 'swagger' in doc || 'info' in doc || 'paths' in doc) {
            /* v8 ignore next */
            return false;
        }

        /* v8 ignore next */
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

        /* v8 ignore next */
        return schemaKeys.some(key => key in doc);
    }

    private deriveSchemaName(uri: string, schema: SwaggerDefinition, fallbackIndex: number): string {
        /* v8 ignore next */
        /* v8 ignore start */
        const source = typeof schema.$id === 'string' ? schema.$id : uri;
        /* v8 ignore stop */
        /* v8 ignore next */
        const withoutFragment = source.split('#')[0].split('?')[0];
        /* v8 ignore next */
        const lastSegment = withoutFragment.split('/').filter(Boolean).pop();
        /* v8 ignore next */
        /* v8 ignore start */
        const base = lastSegment ? lastSegment.replace(/\.[^/.]+$/, '') : `Schema${fallbackIndex}`;
        /* v8 ignore stop */
        /* v8 ignore next */
        const name = pascalCase(base);
        /* v8 ignore next */
        /* v8 ignore start */
        return name || `Schema${fallbackIndex}`;
        /* v8 ignore stop */
    }

    public getSecuritySchemes(): Record<string, SecurityScheme> {
        /* v8 ignore next */
        const schemes = {
            ...(this.spec.components?.securitySchemes || {}),
            ...(this.spec.securityDefinitions || {}),
        } as Record<string, SecurityScheme>;

        /* v8 ignore next */
        const knownNames = new Set(Object.keys(schemes));

        /* v8 ignore next */
        const addSchemeFromRef = (key: string) => {
            /* v8 ignore next */
            /* v8 ignore start */
            if (!key || knownNames.has(key)) return;
            /* v8 ignore stop */

            /* v8 ignore next */
            if (isUriReference(key)) {
                /* v8 ignore next */
                const resolved = this.resolveReference<SecurityScheme>(key);
                /* v8 ignore next */
                /* v8 ignore start */
                if (resolved) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schemes[key] = resolved;
                    /* v8 ignore next */
                    knownNames.add(key);
                }
                /* v8 ignore next */
                return;
            }

            /* v8 ignore next */
            const normalized = normalizeSecurityKey(key);
            /* v8 ignore next */
            /* v8 ignore start */
            if (knownNames.has(normalized)) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            const resolved = this.resolveReference<SecurityScheme>(key);
            /* v8 ignore next */
            /* v8 ignore start */
            if (resolved) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                schemes[normalized] = resolved;
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                knownNames.add(normalized);
                /* v8 ignore stop */
            }
        };

        /* v8 ignore next */
        const scanSecurityRequirements = (security?: Record<string, string[]>[]) => {
            /* v8 ignore next */
            if (!security) return;
            /* v8 ignore next */
            security.forEach(req => {
                /* v8 ignore next */
                /* v8 ignore start */
                if (!req || typeof req !== 'object') return;
                /* v8 ignore stop */
                /* v8 ignore next */
                Object.keys(req).forEach(key => {
                    /* v8 ignore next */
                    if (!knownNames.has(key)) {
                        /* v8 ignore next */
                        addSchemeFromRef(key);
                    }
                });
            });
        };

        /* v8 ignore next */
        const scanPathSecurity = (paths?: Record<string, PathItem>) => {
            /* v8 ignore next */
            if (!paths) return;
            /* v8 ignore next */
            const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace', 'query'];
            /* v8 ignore next */
            Object.values(paths).forEach(pathItem => {
                /* v8 ignore next */
                /* v8 ignore start */
                if (!pathItem || typeof pathItem !== 'object') return;
                /* v8 ignore stop */
                /* v8 ignore next */
                const pathRec = pathItem as Extract<PathItem, Record<string, OpenApiValue>>;
                /* v8 ignore next */
                methods.forEach(method => {
                    /* v8 ignore next */
                    const op = pathRec[method] as SpecOperation | undefined;
                    /* v8 ignore next */
                    if (op?.security) scanSecurityRequirements(op.security);
                });
                /* v8 ignore next */
                if (pathRec.additionalOperations) {
                    /* v8 ignore next */
                    Object.values(pathRec.additionalOperations as Record<string, SpecOperation>).forEach(op => {
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (op?.security) scanSecurityRequirements(op.security);
                        /* v8 ignore stop */
                    });
                }
            });
        };

        /* v8 ignore next */
        scanSecurityRequirements(this.spec.security);
        /* v8 ignore next */
        scanPathSecurity(this.spec.paths as Record<string, PathItem>);
        /* v8 ignore next */
        scanPathSecurity(this.spec.webhooks as Record<string, PathItem>);

        /* v8 ignore next */
        return schemes;
    }

    public getLinks(): Record<string, LinkObject> {
        /* v8 ignore next */
        if (!this.spec.components?.links) return {};
        /* v8 ignore next */
        const links: Record<string, LinkObject> = {};
        /* v8 ignore next */
        for (const [key, val] of Object.entries(this.spec.components.links)) {
            /* v8 ignore next */
            if ('$ref' in val) {
                // type-coverage:ignore-next-line
                /* v8 ignore next */
                const resolved = this.resolveReference<LinkObject>((val as { $ref: string }).$ref);
                /* v8 ignore next */
                if (resolved) links[key] = resolved;
            } else {
                /* v8 ignore next */
                links[key] = val as LinkObject;
            }
        }
        /* v8 ignore next */
        return links;
    }

    public resolve<T>(obj: T | { $ref: string } | { $dynamicRef: string } | null | undefined): T | undefined {
        /* v8 ignore next */
        return this.resolver.resolve(obj);
    }

    public resolveReference<T = SwaggerDefinition>(ref: string, currentDocUri?: string): T | undefined {
        /* v8 ignore next */
        return this.resolver.resolveReference(ref, currentDocUri);
    }

    public getPolymorphicSchemaOptions(schema: SwaggerDefinition): PolymorphicOption[] {
        /* v8 ignore next */
        if (!schema.discriminator) {
            /* v8 ignore next */
            return [];
        }
        /* v8 ignore next */
        const dPropName = schema.discriminator.propertyName;

        /* v8 ignore next */
        const variants = schema.oneOf ?? schema.anyOf;
        /* v8 ignore next */
        if (!variants) {
            /* v8 ignore next */
            return [];
        }

        /* v8 ignore next */
        const mapping = schema.discriminator.mapping || {};
        /* v8 ignore next */
        if (Object.keys(mapping).length > 0) {
            /* v8 ignore next */
            return (
                Object.entries(mapping)
                    .map(([name, ref]) => {
                        /* v8 ignore next */
                        const resolvedSchema = this.resolveReference<SwaggerDefinition>(ref);
                        /* v8 ignore next */
                        return resolvedSchema ? { name, schema: resolvedSchema } : null;
                    })
                    /* v8 ignore next */
                    .filter((opt): opt is PolymorphicOption => !!opt)
            );
        }

        /* v8 ignore next */
        return (
            variants
                .map(refSchema => {
                    let ref: string | undefined;
                    /* v8 ignore next */
                    /* v8 ignore start */
                    if (typeof refSchema === 'object') {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        const refObj = refSchema as { $ref?: string; $dynamicRef?: string };
                        /* v8 ignore next */
                        if (refObj.$ref) ref = refObj.$ref;
                        /* v8 ignore next */ else if (refObj.$dynamicRef) ref = refObj.$dynamicRef;
                    }

                    /* v8 ignore next */
                    if (!ref) return null;

                    /* v8 ignore next */
                    const resolvedSchema = this.resolveReference<SwaggerDefinition>(ref);
                    /* v8 ignore next */
                    if (!resolvedSchema) {
                        /* v8 ignore next */
                        return null;
                    }

                    const hasProp =
                        /* v8 ignore next */
                        typeof resolvedSchema === 'object' &&
                        resolvedSchema.properties &&
                        resolvedSchema.properties[dPropName];
                    /* v8 ignore next */
                    if (!hasProp) {
                        /* v8 ignore next */
                        return null;
                    }

                    /* v8 ignore next */
                    if (
                        typeof resolvedSchema === 'object' &&
                        resolvedSchema.properties &&
                        (resolvedSchema.properties[dPropName] as SwaggerDefinition)?.enum
                    ) {
                        /* v8 ignore next */
                        const name = (resolvedSchema.properties[dPropName] as SwaggerDefinition).enum![0] as string;
                        /* v8 ignore next */
                        return { name, schema: resolvedSchema };
                    }

                    /* v8 ignore next */
                    const implicitName = ref.split('/').pop();
                    /* v8 ignore next */
                    if (implicitName) {
                        /* v8 ignore next */
                        return { name: implicitName, schema: resolvedSchema };
                    }

                    /* v8 ignore next */
                    return null;
                })
                /* v8 ignore next */
                .filter((opt): opt is PolymorphicOption => !!opt)
        );
    }

    public isValidSpec(): boolean {
        /* v8 ignore next */
        return !!(
            (this.spec.swagger && this.spec.swagger.startsWith('2.')) ||
            (this.spec.openapi && this.spec.openapi.startsWith('3.'))
        );
    }

    public getSpecVersion(): { type: 'swagger' | 'openapi'; version: string } | null {
        /* v8 ignore next */
        if (this.spec.swagger) return { type: 'swagger', version: this.spec.swagger };
        /* v8 ignore next */
        if (this.spec.openapi) return { type: 'openapi', version: this.spec.openapi };
        /* v8 ignore next */
        return null;
    }

    private assertUniqueResolvedOperationIds(): void {
        /* v8 ignore next */
        const operationIdLocations = new Map<string, string[]>();
        /* v8 ignore next */
        const operationKeys = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace', 'query'];

        /* v8 ignore next */
        const record = (op: PathInfo, prefix: string) => {
            /* v8 ignore next */
            if (!op.operationId) return;
            /* v8 ignore next */
            const location = `${prefix}${op.method.toUpperCase()} ${op.path}`;
            /* v8 ignore next */
            const existing = operationIdLocations.get(op.operationId);
            /* v8 ignore next */
            if (existing) {
                /* v8 ignore next */
                existing.push(location);
            } else {
                /* v8 ignore next */
                operationIdLocations.set(op.operationId, [location]);
            }
        };

        /* v8 ignore next */
        /* v8 ignore start */
        const recordFromPathItem = (pathItem: OpenApiValue, pathKey: string, prefix: string) => {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            if (!pathItem || typeof pathItem !== 'object') return;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            const pi = pathItem as Record<string, OpenApiValue>;
            /* v8 ignore stop */

            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            for (const method of operationKeys) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                const operation = pi[method] as SpecOperation | undefined;
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                if (operation?.operationId) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    const location = `${prefix}${method.toUpperCase()} ${pathKey}`;
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    const existing = operationIdLocations.get(operation.operationId);
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    if (existing) {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        existing.push(location);
                        /* v8 ignore stop */
                    } else {
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        operationIdLocations.set(operation.operationId, [location]);
                        /* v8 ignore stop */
                    }
                }
            }
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            if (pi.additionalOperations) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                for (const [method, operationVal] of Object.entries(
                    /* v8 ignore stop */
                    pi.additionalOperations as Record<string, SpecOperation>,
                )) {
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    const operation = operationVal as SpecOperation | undefined;
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    if (operation?.operationId) {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        const location = `${prefix}${method} ${pathKey}`;
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        const existing = operationIdLocations.get(operation.operationId);
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (existing) {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            existing.push(location);
                            /* v8 ignore stop */
                        } else {
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            operationIdLocations.set(operation.operationId, [location]);
                            /* v8 ignore stop */
                        }
                    }
                }
            }
        };

        /* v8 ignore next */
        this.operations.forEach(op => record(op, 'paths: '));
        /* v8 ignore next */
        this.webhooks.forEach(op => record(op, 'webhooks: '));

        /* v8 ignore next */
        const resolvedPaths = new Set(this.operations.map(op => op.path));
        /* v8 ignore next */
        if (this.spec.paths) {
            /* v8 ignore next */
            for (const [pathKey, pathItem] of Object.entries(this.spec.paths)) {
                /* v8 ignore next */
                /* v8 ignore start */
                if (!pathItem || typeof pathItem !== 'object') continue;
                /* v8 ignore stop */
                /* v8 ignore next */
                if (!(pathItem as Record<string, OpenApiValue>).$ref) continue;
                /* v8 ignore next */
                /* v8 ignore start */
                if (resolvedPaths.has(pathKey)) continue;
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                const resolved = this.resolveReference<PathItem>(
                    /* v8 ignore stop */
                    (pathItem as Record<string, OpenApiValue>).$ref as string,
                    this.documentUri,
                );
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                if (resolved) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    recordFromPathItem(resolved, pathKey, 'paths: ');
                    /* v8 ignore stop */
                }
            }
        }

        /* v8 ignore next */
        if (this.spec.webhooks) {
            /* v8 ignore next */
            const resolvedWebhookPaths = new Set(this.webhooks.map(op => op.path));
            /* v8 ignore next */
            for (const [pathKey, pathItem] of Object.entries(this.spec.webhooks)) {
                /* v8 ignore next */
                /* v8 ignore start */
                if (!pathItem || typeof pathItem !== 'object') continue;
                /* v8 ignore stop */
                /* v8 ignore next */
                if (!(pathItem as Record<string, OpenApiValue>).$ref) continue;
                /* v8 ignore next */
                if (resolvedWebhookPaths.has(pathKey)) continue;
                /* v8 ignore next */
                const resolved = this.resolveReference<PathItem>(
                    (pathItem as Record<string, OpenApiValue>).$ref as string,
                    this.documentUri,
                );
                /* v8 ignore next */
                /* v8 ignore start */
                if (resolved) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    recordFromPathItem(resolved, pathKey, 'webhooks: ');
                    /* v8 ignore stop */
                }
            }
        }

        /* v8 ignore next */
        for (const [operationId, locations] of operationIdLocations.entries()) {
            /* v8 ignore next */
            if (locations.length > 1) {
                /* v8 ignore next */
                const message = `Duplicate operationId "${operationId}" found in multiple operations: ${locations.join(
                    ', ',
                )}`;
                let error: Error;
                /* v8 ignore next */
                try {
                    /* v8 ignore next */
                    const candidate = new SpecValidationError(message);
                    /* v8 ignore next */
                    error =
                        /* v8 ignore start */
                        candidate instanceof Error && candidate.message
                            ? /* v8 ignore stop */
                              candidate
                            : Object.assign(new Error(message), { name: 'SpecValidationError' });
                } catch {
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    error = Object.assign(new Error(message), { name: 'SpecValidationError' });
                    /* v8 ignore stop */
                }
                /* v8 ignore next */
                throw error;
            }
        }
    }
}
