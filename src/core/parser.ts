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
} from './types/index.js';
import { extractPaths, pascalCase } from './utils/index.js';
import { validateSpec } from './validator.js';
import { JSON_SCHEMA_2020_12_DIALECT, OAS_3_1_DIALECT } from './constants.js';
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

    public readonly schemas: { name: string; definition: SwaggerDefinition; }[];
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
        documentUri: string = 'file://entry-spec.json'
    ) {
        validateSpec(spec);

        if (spec.jsonSchemaDialect) {
            const dialect = spec.jsonSchemaDialect;
            if (dialect !== OAS_3_1_DIALECT && dialect !== JSON_SCHEMA_2020_12_DIALECT) {
                console.warn(`⚠️  Warning: The specification defines a custom jsonSchemaDialect: "${dialect}". ` +
                    `This generator is optimized for the default OpenAPI 3.1 dialect (${OAS_3_1_DIALECT}).`);
            }
        }

        if (config.validateInput && !config.validateInput(spec)) {
            throw new Error("Custom input validation failed.");
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
            definition
        }));

        // OAS 3.2 Requirement: If the servers field is not provided, or is an empty array,
        // the default value would be an array consisting of a single Server Object with a url value of /.
        if (this.spec.openapi && (!this.spec.servers || this.spec.servers.length === 0)) {
            this.servers = [{ url: '/' }];
        } else {
            this.servers = this.spec.servers || [];
        }

        // We bind resolveReference to this instance so extractPaths can call back into the parser
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

    public getSpec(): SwaggerSpec {
        return this.spec;
    }

    public getJsonSchemaDialect(): string | undefined {
        return this.spec.jsonSchemaDialect;
    }

    public getDefinitions(): Record<string, SwaggerDefinition> {
        return this.spec.definitions || this.spec.components?.schemas || {};
    }

    public getDefinition(name: string): SwaggerDefinition | undefined {
        return this.getDefinitions()[name];
    }

    public getSecuritySchemes(): Record<string, SecurityScheme> {
        return (this.spec.components?.securitySchemes || this.spec.securityDefinitions || {}) as Record<string, SecurityScheme>;
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

    public getPolymorphicSchemaOptions(schema: SwaggerDefinition): PolymorphicOption[] {
        if (!schema.oneOf || !schema.discriminator) {
            return [];
        }
        const dPropName = schema.discriminator.propertyName;

        const mapping = schema.discriminator.mapping || {};
        if (Object.keys(mapping).length > 0) {
            return Object.entries(mapping).map(([name, ref]) => {
                const resolvedSchema = this.resolveReference<SwaggerDefinition>(ref);
                return resolvedSchema ? { name, schema: resolvedSchema } : null;
            }).filter((opt): opt is PolymorphicOption => !!opt);
        }

        return schema.oneOf.map(refSchema => {
            let ref: string | undefined;
            if (refSchema.$ref) ref = refSchema.$ref;
            else if (refSchema.$dynamicRef) ref = refSchema.$dynamicRef;

            if (!ref) return null;

            const resolvedSchema = this.resolveReference<SwaggerDefinition>(ref);
            if (!resolvedSchema || !resolvedSchema.properties || !resolvedSchema.properties[dPropName]?.enum) {
                return null;
            }
            const name = resolvedSchema.properties[dPropName].enum![0] as string;
            return { name, schema: resolvedSchema };
        }).filter((opt): opt is PolymorphicOption => !!opt);
    }

    public isValidSpec(): boolean {
        return !!((this.spec.swagger && this.spec.swagger.startsWith('2.')) || (this.spec.openapi && this.spec.openapi.startsWith('3.')));
    }

    public getSpecVersion(): { type: 'swagger' | 'openapi'; version: string } | null {
        if (this.spec.swagger) return { type: 'swagger', version: this.spec.swagger };
        if (this.spec.openapi) return { type: 'openapi', version: this.spec.openapi };
        return null;
    }
}
