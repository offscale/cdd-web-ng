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
import { extractPaths,
    isUrl,
    pascalCase
} from './utils.js';

/**
 * A wrapper class for a raw OpenAPI/Swagger specification object.
 * It provides a structured and reliable API to access different parts of the spec,
 * normalizing differences between Swagger 2.0 and OpenAPI 3.x.
 */
export class SwaggerParser {
    public readonly spec: SwaggerSpec;
    public readonly config: GeneratorConfig;
    public readonly schemas: { name: string; definition: SwaggerDefinition; }[];
    public readonly operations: PathInfo[];
    public readonly security: Record<string, SecurityScheme>;

    public constructor(spec: SwaggerSpec, config: GeneratorConfig) {
        this.spec = spec;
        this.config = config;
        this.schemas = Object.entries(this.getDefinitions()).map(([name, definition]) => ({ name: pascalCase(name), definition }));
        this.operations = extractPaths(this.spec.paths);
        this.security = this.getSecuritySchemes();
    }

    static async create(inputPath: string, config: GeneratorConfig): Promise < SwaggerParser > {
        const content = await this.loadContent(inputPath);
        const spec = this.parseSpecContent(content, inputPath);
        return new SwaggerParser(spec, config);
    }

    private static async loadContent(pathOrUrl: string): Promise < string > {
        if (isUrl(pathOrUrl)) {
            const response = await fetch(pathOrUrl);
            if (!response.ok) throw new Error(`Failed to fetch spec from ${pathOrUrl}: ${response.statusText}`);
            return response.text();
        } else {
            if (!fs.existsSync(pathOrUrl)) throw new Error(`Input file not found at ${pathOrUrl}`);
            return fs.readFileSync(pathOrUrl, 'utf8');
        }
    }

    private static parseSpecContent(content: string, pathOrUrl: string): SwaggerSpec {
        const extension = path.extname(pathOrUrl).toLowerCase();
        try {
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

    public getSpec(): SwaggerSpec {
        return this.spec;
    }

    public getDefinitions(): Record < string, SwaggerDefinition > {
        return this.spec.definitions || this.spec.components?.schemas || {};
    }

    public getDefinition(name: string): SwaggerDefinition | undefined {
        return this.getDefinitions()[name];
    }

    public getSecuritySchemes(): Record < string, SecurityScheme > {
        return (this.spec.components?.securitySchemes || this.spec.securityDefinitions || {}) as Record < string, SecurityScheme > ;
    }

    public resolve<T>(obj: T | { $ref: string }): T | undefined {
        if (obj && typeof obj === 'object' && '$ref' in obj && typeof obj.$ref === 'string') {
            const ref = obj.$ref;
            if (!ref.startsWith('#/')) { console.warn(`[Parser] Unsupported external or non-root reference: ${ref}`); return undefined; }
            const parts = ref.substring(2).split('/');
            let current: any = this.spec;
            for (const part of parts) {
                if (typeof current === 'object' && current !== null && Object.prototype.hasOwnProperty.call(current, part)) {
                    current = current[part];
                } else {
                    console.warn(`[Parser] Failed to resolve reference part "${part}" in path "${ref}"`);
                    return undefined;
                }
            }
            return current as T;
        }
        return obj as T;
    }

    public resolveReference(ref: string): SwaggerDefinition | undefined {
        if (typeof ref !== 'string' || !ref.startsWith('#/')) { console.warn(`[Parser] Encountered an unsupported or invalid reference: ${ref}`); return undefined; }
        const parts = ref.split('/');
        const definitionName = parts.pop()!;
        return this.getDefinition(definitionName);
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
