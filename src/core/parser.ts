/**
 * @fileoverview
 * This file contains the SwaggerParser class, the central component responsible for loading,
 * parsing, and providing a unified interface to OpenAPI (3.x) and Swagger (2.x) specifications.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {
    GeneratorConfig,
    SwaggerDefinition,
    SwaggerSpec,
    SecurityScheme,
    PathInfo
} from './types.js';
import {
    extractPaths,
    isUrl,
    pascalCase
} from './utils.js';

/**
 * A wrapper class for a raw OpenAPI/Swagger specification object.
 * It provides a structured and reliable API to access different parts of the spec,
 * normalizing differences between Swagger 2.0 and OpenAPI 3.x.
 */
export class SwaggerParser {
    /** The raw, parsed OpenAPI/Swagger specification object. */
    public readonly spec: SwaggerSpec;
    /** The configuration object for the generator. */
    public readonly config: GeneratorConfig;
    /** A normalized array of all schemas (definitions) found in the specification. */
    public readonly schemas: { name: string; definition: SwaggerDefinition; }[];
    /** A flattened and processed list of all API operations (paths). */
    public readonly operations: PathInfo[];
    /** A normalized record of all security schemes defined in the specification. */
    public readonly security: Record<string, SecurityScheme>;

    /**
     * Initializes a new instance of the SwaggerParser.
     * @param spec The raw OpenAPI/Swagger specification object.
     * @param config The generator configuration.
     */
    public constructor(spec: SwaggerSpec, config: GeneratorConfig) {
        this.spec = spec;
        this.config = config;
        this.schemas = Object.entries(this.getDefinitions()).map(([name, definition]) => ({ name: pascalCase(name), definition }));
        this.operations = extractPaths(this.spec.paths);
        this.security = this.getSecuritySchemes();
    }

    /**
     * Asynchronously creates a SwaggerParser instance from a file path or URL.
     * This is the recommended factory method for creating a parser instance.
     *
     * @param inputPath The local path or remote URL of the OpenAPI/Swagger specification.
     * @param config The generator configuration.
     * @returns A promise that resolves to a new SwaggerParser instance.
     */
    static async create(inputPath: string, config: GeneratorConfig): Promise<SwaggerParser> {
        const content = await this.loadContent(inputPath);
        const spec = this.parseSpecContent(content, inputPath);
        return new SwaggerParser(spec, config);
    }

    /**
     * Loads the raw content of the specification from a file or URL.
     * @param pathOrUrl The path or URL to load from.
     * @returns A promise that resolves to the string content.
     * @private
     */
    private static async loadContent(pathOrUrl: string): Promise<string> {
        if (isUrl(pathOrUrl)) {
            const response = await fetch(pathOrUrl);
            if (!response.ok) throw new Error(`Failed to fetch spec from ${pathOrUrl}: ${response.statusText}`);
            return response.text();
        } else {
            if (!fs.existsSync(pathOrUrl)) throw new Error(`Input file not found at ${pathOrUrl}`);
            return fs.readFileSync(pathOrUrl, 'utf8');
        }
    }

    /**
     * Parses the string content of a specification into a JavaScript object.
     * It automatically detects whether the content is JSON or YAML based on file extension or content sniffing.
     *
     * @param content The raw string content.
     * @param pathOrUrl The original path, used for error messaging and format detection.
     * @returns The parsed SwaggerSpec object.
     * @private
     */
    private static parseSpecContent(content: string, pathOrUrl: string): SwaggerSpec {
        const extension = path.extname(pathOrUrl).toLowerCase();
        try {
            // Prefer YAML parsing for .yaml/.yml or if it looks like YAML
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

    /**
     * Retrieves the entire parsed specification object.
     * @returns The SwaggerSpec object.
     */
    public getSpec(): SwaggerSpec {
        return this.spec;
    }

    /**
     * Retrieves all schema definitions from the specification, normalizing for
     * both OpenAPI 3.x (`components/schemas`) and Swagger 2.0 (`definitions`).
     *
     * @returns A record mapping schema names to their definitions.
     */
    public getDefinitions(): Record<string, SwaggerDefinition> {
        return this.spec.definitions || this.spec.components?.schemas || {};
    }

    /**
     * Retrieves a single schema definition by its name.
     * @param name The name of the schema to retrieve.
     * @returns The SwaggerDefinition, or `undefined` if not found.
     */
    public getDefinition(name: string): SwaggerDefinition | undefined {
        return this.getDefinitions()[name];
    }

    /**
     * Retrieves all security scheme definitions from the specification, normalizing
     * for OpenAPI 3.x (`components/securitySchemes`) and Swagger 2.0 (`securityDefinitions`).
     *
     * @returns A record mapping security scheme names to their definitions.
     */
    public getSecuritySchemes(): Record<string, SecurityScheme> {
        return (this.spec.components?.securitySchemes || this.spec.securityDefinitions || {}) as Record<string, SecurityScheme>;
    }

    /**
     * Resolves a JSON reference (`$ref`) object to its corresponding definition within the specification.
     * This method only supports local references (e.g., '#/components/schemas/User').
     *
     * @param obj The object to resolve. If it's not a `$ref` object, it's returned as is.
     * @returns The resolved definition, or the original object if not a `$ref`. Returns `undefined` if the reference cannot be resolved.
     */
    public resolve<T>(obj: T | { $ref: string }): T | undefined {
        if (obj && typeof obj === 'object' && '$ref' in obj && typeof obj.$ref === 'string') {
            const ref = obj.$ref;
            if (!ref.startsWith('#/')) {
                console.warn(`[Parser] Unsupported external or non-root reference: ${ref}`);
                return undefined;
            }
            const parts = ref.substring(2).split('/');
            let current: unknown = this.spec;
            for (const part of parts) {
                if (typeof current === 'object' && current !== null && Object.prototype.hasOwnProperty.call(current, part)) {
                    current = (current as Record<string, unknown>)[part];
                } else {
                    console.warn(`[Parser] Failed to resolve reference part "${part}" in path "${ref}"`);
                    return undefined;
                }
            }
            return current as T;
        }
        return obj as T;
    }

    /**
     * A specialized version of `resolve` for resolving a string reference directly.
     * This is a simplified lookup assuming the reference points to a top-level schema definition.
     *
     * @param ref The JSON reference string (e.g., '#/components/schemas/User').
     * @returns The resolved SwaggerDefinition, or undefined if not found or the reference is invalid.
     */
    public resolveReference(ref: string): SwaggerDefinition | undefined {
        if (typeof ref !== 'string' || !ref.startsWith('#/')) {
            console.warn(`[Parser] Encountered an unsupported or invalid reference: ${ref}`);
            return undefined;
        }
        const parts = ref.split('/');
        const definitionName = parts.pop()!;
        // This is a simplified lookup assuming refs point to top-level schemas or definitions.
        return this.getDefinition(definitionName);
    }

    /**
     * Checks if the loaded specification is a valid OpenAPI 3.x or Swagger 2.0 file
     * by inspecting the `openapi` or `swagger` version fields.
     * This method is lenient and only checks for the presence of a version string starting with '2.' or '3.'.
     * @returns `true` if the spec version is recognized, `false` otherwise.
     */
    public isValidSpec(): boolean {
        return !!((this.spec.swagger && this.spec.swagger.startsWith('2.')) || (this.spec.openapi && this.spec.openapi.startsWith('3.')));
    }

    /**
     * Gets the version of the loaded specification.
     * @returns An object containing the type ('swagger' or 'openapi') and version string, or `null` if unrecognized.
     */
    public getSpecVersion(): { type: 'swagger' | 'openapi'; version: string } | null {
        if (this.spec.swagger) return { type: 'swagger', version: this.spec.swagger };
        if (this.spec.openapi) return { type: 'openapi', version: this.spec.openapi };
        return null;
    }
}
