/**
 * @fileoverview
 * This file contains the SwaggerParser class, the central component responsible for loading,
 * parsing, and providing a unified interface to OpenAPI (3.x) and Swagger (2.x) specifications.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { GeneratorConfig, PathInfo, SecurityScheme, SwaggerDefinition, SwaggerSpec } from './types.js';
import { extractPaths, isUrl, pascalCase } from './utils.js';

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
 * normalizing differences between Swagger 2.0 and OpenAPI 3.x and providing
 * helpful utilities like `$ref` resolution.
 */
export class SwaggerParser {
    /** The raw, parsed OpenAPI/Swagger specification object. */
    public readonly spec: SwaggerSpec;
    /** The configuration object for the generator. */
    public readonly config: GeneratorConfig;
    /** A normalized array of all top-level schemas (definitions) found in the specification. */
    public readonly schemas: { name: string; definition: SwaggerDefinition; }[];
    /** A flattened and processed list of all API operations (paths). */
    public readonly operations: PathInfo[];
    /** A normalized record of all security schemes defined in the specification. */
    public readonly security: Record<string, SecurityScheme>;

    /**
     * Initializes a new instance of the SwaggerParser. It is generally recommended
     * to use the static `create` factory method instead of this constructor directly.
     * @param spec The raw OpenAPI/Swagger specification object.
     * @param config The generator configuration.
     */
    public constructor(spec: SwaggerSpec, config: GeneratorConfig) {
        this.spec = spec;
        this.config = config;
        this.schemas = Object.entries(this.getDefinitions()).map(([name, definition]) => ({
            name: pascalCase(name),
            definition
        }));
        this.operations = extractPaths(this.spec.paths);
        this.security = this.getSecuritySchemes();
    }

    /**
     * Asynchronously creates a SwaggerParser instance from a file path or URL.
     * This is the recommended factory method for creating a parser instance.
     * @param inputPath The local file path or remote URL of the OpenAPI/Swagger specification.
     * @param config The generator configuration.
     * @returns A promise that resolves to a new SwaggerParser instance.
     */
    static async create(inputPath: string, config: GeneratorConfig): Promise<SwaggerParser> {
        const content = await this.loadContent(inputPath);
        const spec = this.parseSpecContent(content, inputPath);
        return new SwaggerParser(spec, config);
    }

    /**
     * Loads the raw content of the specification from a local file or a remote URL.
     * @param pathOrUrl The path or URL to load from.
     * @returns A promise that resolves to the string content.
     * @private
     */
    private static async loadContent(pathOrUrl: string): Promise<string> {
        try {
            if (isUrl(pathOrUrl)) {
                const response = await fetch(pathOrUrl);
                if (!response.ok) throw new Error(`Failed to fetch spec from ${pathOrUrl}: ${response.statusText}`);
                return response.text();
            } else {
                if (!fs.existsSync(pathOrUrl)) throw new Error(`Input file not found at ${pathOrUrl}`);
                return fs.readFileSync(pathOrUrl, 'utf8');
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

    /** Retrieves the entire parsed specification object. */
    public getSpec(): SwaggerSpec {
        return this.spec;
    }

    /** Retrieves all schema definitions from the specification, normalizing for OpenAPI 3 and Swagger 2. */
    public getDefinitions(): Record<string, SwaggerDefinition> {
        return this.spec.definitions || this.spec.components?.schemas || {};
    }

    /** Retrieves a single schema definition by its original name from the specification. */
    public getDefinition(name: string): SwaggerDefinition | undefined {
        return this.getDefinitions()[name];
    }

    /** Retrieves all security scheme definitions from the specification. */
    public getSecuritySchemes(): Record<string, SecurityScheme> {
        return (this.spec.components?.securitySchemes || this.spec.securityDefinitions || {}) as Record<string, SecurityScheme>;
    }

    /**
     * Resolves a JSON reference (`$ref`) object to its corresponding definition within the specification.
     * If the provided object is not a `$ref`, it is returned as is.
     * @template T The expected type of the resolved object.
     * @param obj The object to resolve.
     * @returns The resolved definition, the original object if not a ref, or `undefined` if the reference is invalid.
     */
    public resolve<T>(obj: T | { $ref: string } | null | undefined): T | undefined {
        if (obj === null) return null as unknown as undefined;
        if (obj === undefined) return undefined;
        if (typeof obj === 'object' && '$ref' in obj && typeof (obj as any).$ref === 'string') {
            return this.resolveReference((obj as any).$ref);
        }
        return obj as T;
    }

    /**
     * Resolves a JSON reference string (e.g., '#/components/schemas/User') directly to its definition.
     * This robust implementation can traverse any valid local path within the specification.
     * It gracefully handles invalid paths and non-local references by returning `undefined`.
     * @param ref The JSON reference string.
     * @returns The resolved definition, or `undefined` if the reference is not found or is invalid.
     */
    public resolveReference<T = SwaggerDefinition>(ref: string): T | undefined {
        if (typeof ref !== 'string') {
            console.warn(`[Parser] Encountered an unsupported or invalid reference: ${ref}`);
            return undefined;
        }
        if (!ref.startsWith('#/')) {
            console.warn(`[Parser] Unsupported external or non-root reference: ${ref}`);
            return undefined;
        }
        const pathParts = ref.substring(2).split('/');
        let current: any = this.spec;
        for (const part of pathParts) {
            if (typeof current === 'object' && current !== null && Object.prototype.hasOwnProperty.call(current, part)) {
                current = current[part];
            } else {
                console.warn(`[Parser] Failed to resolve reference part "${part}" in path "${ref}"`);
                return undefined;
            }
        }
        return current as T;
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
            if (!refSchema.$ref) return null;
            const resolvedSchema = this.resolveReference(refSchema.$ref);
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
