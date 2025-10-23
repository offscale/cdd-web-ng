// src/index.ts

import { ModuleKind, Project, ScriptTarget } from 'ts-morph';
import { GeneratorConfig } from './core/types.js';
import { isUrl } from './core/utils.js';
import { SwaggerParser } from './core/parser.js';
import { emitClientLibrary } from './service/emit/index.js';
import * as fs from 'fs';

// A new type for test environments to pass pre-parsed data
export type TestGeneratorConfig = {
    spec: object;
}

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

    console.log(`📡 Processing OpenAPI specification from ${isUrl(config.input) ? "URL" : "file"}: ${config.input}`);

    try {
        let swaggerParser: SwaggerParser;
        if (isTestEnv) {
            // FIX: Use the pre-parsed spec object directly from the test setup
            // This completely avoids any file system reads here.
            swaggerParser = new SwaggerParser(testConfig.spec as any, config);
        } else {
            swaggerParser = await SwaggerParser.create(config.input, config);
        }

        await emitClientLibrary(config.output, swaggerParser, config, activeProject);

        if (!isTestEnv) {
            await activeProject.save();
        }

    } catch (error) {
        console.error("❌ Generation failed:", error instanceof Error ? error.message : error);
        throw error;
    }
}
