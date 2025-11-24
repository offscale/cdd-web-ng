// src/service/emit/orchestrator.ts

import { Project } from 'ts-morph';
import { SwaggerParser } from '../../core/parser.js';
import { GeneratorConfig } from '../../core/types.js';
import { AngularClientGenerator } from '../../generators/angular/angular-client.generator.js';

/**
 * @deprecated This function is deprecated. Use `AngularClientGenerator` directly or the factory in `src/index.ts`.
 */
export async function emitClientLibrary(outputRoot: string, parser: SwaggerParser, config: GeneratorConfig, project: Project): Promise<void> {
    const generator = new AngularClientGenerator();
    await generator.generate(project, parser, config, outputRoot);
}
