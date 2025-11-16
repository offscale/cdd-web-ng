// src/index.ts

import * as fs from 'node:fs';
import { ModuleKind, Project, ScriptTarget } from 'ts-morph';
import { GeneratorConfig, SwaggerSpec } from './core/types.js';
import { SwaggerParser } from './core/parser.js';
import { emitClientLibrary } from "@src/service/emit/index.js";
import { isUrl } from "@src/core/utils.js";

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
    // MODIFICATION: The save call is now ONLY skipped if testConfig is provided.
    // This allows passing a project for in-memory use while still triggering save().
    const isTestEnv = !!testConfig;

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
            const docUri = 'file://in-memory-spec.json';
            const spec = testConfig.spec as SwaggerSpec;
            const cache = new Map<string, SwaggerSpec>([[docUri, spec]]);
            swaggerParser = new SwaggerParser(spec, config, cache, docUri);
        } else {
            swaggerParser = await SwaggerParser.create(config.input, config);
        }

        await emitClientLibrary(config.output, swaggerParser, config, activeProject);

        // This block is now reachable in our test.
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
