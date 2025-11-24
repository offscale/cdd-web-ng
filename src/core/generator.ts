import { Project } from 'ts-morph';

import { GeneratorConfig } from './types/config.js';
import { SwaggerParser } from './parser.js';

/**
 * Abstract contracts for framework-specific generators.
 */
export interface IClientGenerator {
    /**
     * Execute the generation process.
     * @param project The active ts-morph project.
     * @param parser The parsed OpenAPI specification.
     * @param config The generation configuration.
     * @param outputDir The root directory for the output.
     */
    generate(project: Project, parser: SwaggerParser, config: GeneratorConfig, outputDir: string): Promise<void>;
}

/**
 * Base class for Client Generators.
 * Can be extended to share common logic (e.g. Model generation) across frameworks in the future.
 */
export abstract class AbstractClientGenerator implements IClientGenerator {
    abstract generate(project: Project, parser: SwaggerParser, config: GeneratorConfig, outputDir: string): Promise<void>;
}
