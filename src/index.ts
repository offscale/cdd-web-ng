// src/index.ts

import { ModuleKind, Project, ScriptTarget } from 'ts-morph';
import { GeneratorConfig } from './core/types.js';
import { isUrl } from './core/utils.js';
import { SwaggerParser } from './core/parser.js';
import { emitClientLibrary } from './service/emit/index.js';
import * as fs from 'fs';

export async function generateFromConfig(config: GeneratorConfig, project?: Project): Promise<void> {
    const inputPath = config.input;
    const outputPath = config.output;
    const inputType = isUrl(inputPath) ? "URL" : "file";

    // If no project is passed, create one. This is the CLI flow.
    const isTestEnv = !!project;
    const activeProject = project || new Project({
        compilerOptions: {
            declaration: true,
            target: ScriptTarget.ES2022,
            module: ModuleKind.ESNext,
            strict: true,
            ...config.compilerOptions,
        },
    });

    if (!isTestEnv && !fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
    }

    console.log(`📡 Processing OpenAPI specification from ${inputType}: ${inputPath}`);

    try {
        let swaggerParser: SwaggerParser;
        // Distinguish between test environment (in-memory) and real execution.
        if (isTestEnv) {
            const specString = activeProject.getFileSystem().readFileSync(config.input);
            const specObject = JSON.parse(specString);
            swaggerParser = new SwaggerParser(specObject, config);
        } else {
            swaggerParser = await SwaggerParser.create(config.input, config);
        }

        await emitClientLibrary(outputPath, swaggerParser, config, activeProject);

        // Only save if we created the project (i.e., not in a test).
        if (!isTestEnv) {
            await activeProject.save();
        }

    } catch (error) {
        console.error("❌ Generation failed:", error instanceof Error ? error.message : error);
        throw error;
    }
}
