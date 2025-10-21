// src/index.ts

import { ModuleKind, Project, ScriptTarget } from 'ts-morph';
import { GeneratorConfig } from './core/types.js';
import { isUrl } from './core/utils.js';
import { SwaggerParser } from './core/parser.js';
import { emitClientLibrary } from './service/emit.js';
import * as fs from 'fs';

export async function generateFromConfig(config: GeneratorConfig, project?: Project): Promise<void> {
    const inputPath = config.input;
    const outputPath = config.output;
    const inputType = isUrl(inputPath) ? "URL" : "file";

    if (!project && !fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
    }

    const activeProject = project || new Project({
        compilerOptions: {
            declaration: true,
            target: ScriptTarget.ES2022,
            module: ModuleKind.ESNext,
            strict: true,
            ...config.compilerOptions,
        },
    });

    console.log(`📡 Processing OpenAPI specification from ${inputType}: ${inputPath}`);

    try {
        // The parser now correctly handles in-memory files, so no extra logic is needed here.
        let swaggerParser: SwaggerParser;
        if (project && project.useInMemoryFileSystem()) {
            const specString = project.getFileSystem().readFileSync(config.input);
            const specObject = JSON.parse(specString);
            swaggerParser = new SwaggerParser(specObject, config);
        } else {
            swaggerParser = await SwaggerParser.create(config.input, config);
        }

        await emitClientLibrary(outputPath, swaggerParser, config, activeProject);

        if (!project) {
            await activeProject.save();
        }

    } catch (error) {
        console.error("❌ Generation failed:", error instanceof Error ? error.message : error);
        throw error;
    }
}
