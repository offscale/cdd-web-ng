// src/index.ts

import { ModuleKind, Project, ScriptTarget } from 'ts-morph';
import { GeneratorConfig } from './core/types.js';
import { isUrl } from './core/utils.js';
import { SwaggerParser } from './core/parser.js';
import { emitClientLibrary } from './service/emit/index.js';
import * as fs from 'fs';

/**
 * For test environments, allows passing a pre-parsed OpenAPI specification object.
 */
export type TestGeneratorConfig = {
    /** The pre-parsed OpenAPI specification object. */
    spec: object;
}

/**
 * Orchestrates the entire code generation process based on a configuration object.
 * @param config The generator configuration object.
 * @param project Optional ts-morph Project to use. If not provided, a new one is created. Useful for testing.
 * @param testConfig Optional configuration for test environments to inject a pre-parsed spec.
 * @returns A promise that resolves when generation is complete.
 */
export async function generateFromConfig(
    config: GeneratorConfig,
    project?: Project,
    testConfig?: TestGeneratorConfig
): Promise<void> {
    const isTestEnv = !!project && !!testConfig;

    const activeProject = project || new Project({
        compilerOptions: {
            declaration: true,
            target: ScriptTarget.ES2022,
            module: ModuleKind.ESNext,
            strict: true,
            ...config.compilerOptions,
        },
    });

    if (!isTestEnv && !fs.existsSync(config.output)) {
        fs.mkdirSync(config.output, { recursive: true });
    }

    if (!isTestEnv) {
        console.log(`📡 Processing OpenAPI specification from ${isUrl(config.input) ? "URL" : "file"}: ${config.input}`);
    }

    try {
        let swaggerParser: SwaggerParser;
        if (isTestEnv) {
            swaggerParser = new SwaggerParser(testConfig.spec as any, config);
        } else {
            swaggerParser = await SwaggerParser.create(config.input, config);
        }

        await emitClientLibrary(config.output, swaggerParser, config, activeProject);

        if (!isTestEnv) {
            await activeProject.save();
        }

    } catch (error) {
        if (!isTestEnv) {
            console.error("❌ Generation failed:", error instanceof Error ? error.message : error);
        }
        throw error;
    }
}
