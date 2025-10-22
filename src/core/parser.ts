/**
 * @fileoverview
 * This file contains the SwaggerParser class, the central component responsible for loading,
 * parsing, and providing a unified interface to OpenAPI (3.x) and Swagger (2.x) specifications.
 * It handles fetching specs from URLs, reading from the local file system (both real and in-memory for testing),
 * and parsing both JSON and YAML formats. The class abstracts away version differences,
 * allowing the rest of the generator to work with a consistent data structure.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Project } from 'ts-morph';
import { GeneratorConfig, SwaggerDefinition, SwaggerSpec, SecurityScheme } from './types.js';
import { isUrl } from './utils.js';

/**
 * A wrapper class for a raw OpenAPI/Swagger specification object.
 * It provides a structured and reliable API to access different parts of the spec,
 * normalizing differences between Swagger 2.0 and OpenAPI 3.x.
 */
export class SwaggerParser {
    public readonly spec: SwaggerSpec;
    public readonly config: GeneratorConfig;

    public constructor(spec: SwaggerSpec, config: GeneratorConfig) {
        this.spec = spec;
        this.config = config;
    }

    static async create(inputPath: string, config: GeneratorConfig): Promise<SwaggerParser> {
        const content = await this.loadContent(inputPath);
        const spec = this.parseSpecContent(content, inputPath);
        return new SwaggerParser(spec, config);
    }

    // This function is now only used by create(), which is only used by the CLI.
    private static async loadContent(pathOrUrl: string): Promise<string> {
        if (isUrl(pathOrUrl)) {
            const response = await fetch(pathOrUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch spec from ${pathOrUrl}: ${response.statusText}`);
            }
            return response.text();
        } else {
            if (!fs.existsSync(pathOrUrl)) {
                throw new Error(`Input file not found at ${pathOrUrl}`);
            }
            return fs.readFileSync(pathOrUrl, 'utf8');
        }
    }

    /**
     * Parses the raw string content into a JavaScript object.
     * It automatically detects whether the content is JSON or YAML.
     * @param content The raw string content of the specification.
     * @param pathOrUrl The original path or URL, used for error messaging and format sniffing.
     * @returns A JavaScript object representing the Swagger specification.
     * @throws If parsing fails.
     * @private
     */
    private static parseSpecContent(content: string, pathOrUrl: string): SwaggerSpec {
        const extension = path.extname(pathOrUrl).toLowerCase();
        try {
            // Heuristic for YAML: check for extension or common YAML keys if no extension is present.
            if (extension === '.yaml' || extension === '.yml' || (!extension && content.trim().startsWith('openapi:'))) {
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
     * Gets the entire raw specification object.
     * @returns The parsed `SwaggerSpec` object.
     */
    getSpec(): SwaggerSpec {
        return this.spec;
    }

    /**
     * Gets all model definitions/schemas from the specification, abstracting over version differences.
     * It checks for `definitions` (Swagger 2.0) and `components.schemas` (OpenAPI 3.x).
     * @returns A record of all available SwaggerDefinitions.
     */
    getDefinitions(): Record<string, SwaggerDefinition> {
        return this.spec.definitions || this.spec.components?.schemas || {};
    }

    /**
     * Retrieves a single definition/schema by its name.
     * @param name The name of the definition to retrieve.
     * @returns The corresponding SwaggerDefinition, or `undefined` if not found.
     */
    getDefinition(name: string): SwaggerDefinition | undefined {
        return this.getDefinitions()[name];
    }

    /**
     * Gets all security schemes from the specification, abstracting over version differences.
     * It checks for `securityDefinitions` (Swagger 2.0) and `components.securitySchemes` (OpenAPI 3.x).
     * @returns A record of all available security schemes.
     */
    getSecuritySchemes(): Record<string, SecurityScheme> {
        return (this.spec.components?.securitySchemes || this.spec.securityDefinitions || {}) as Record<string, SecurityScheme>;
    }

    /**
     * Resolves a `$ref` string (e.g., '#/components/schemas/User') to its corresponding definition object.
     * @param ref The reference string.
     * @returns The resolved SwaggerDefinition, or `undefined` if parsing the ref fails.
     */
    resolveReference(ref: string): SwaggerDefinition | undefined {
        if (typeof ref !== 'string' || !ref.startsWith('#/')) {
            console.warn(`[Parser] Encountered an unsupported or invalid reference: ${ref}`);
            return undefined;
        }

        const parts = ref.split('/');
        // e.g., #/components/schemas/User -> ['#', 'components', 'schemas', 'User']
        const definitionName = parts.pop()!;
        return this.getDefinition(definitionName);
    }

    /**
     * Performs a basic check to confirm that the specification is a supported version (Swagger 2.x or OpenAPI 3.x).
     * @returns `true` if the spec version is supported, `false` otherwise.
     */
    isValidSpec(): boolean {
        return !!((this.spec.swagger && this.spec.swagger.startsWith('2.')) || (this.spec.openapi && this.spec.openapi.startsWith('3.')));
    }

    /**
     * Identifies the type and version of the loaded specification.
     * @returns An object containing the `type` ('swagger' or 'openapi') and `version`, or `null` if it cannot be determined.
     */
    getSpecVersion(): { type: 'swagger' | 'openapi'; version: string } | null {
        if (this.spec.swagger) return { type: 'swagger', version: this.spec.swagger };
        else if (this.spec.openapi) return { type: 'openapi', version: this.spec.openapi };
        else return null;
    }
}
