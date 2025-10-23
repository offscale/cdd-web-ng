/**
 * @fileoverview
 * This file contains shared helper functions for the admin UI integration tests.
 */

import { Project, IndentationText, ScriptTarget, ModuleKind } from 'ts-morph';
import { generateFromConfig } from '../../src/index.js';
import { GeneratorConfig } from '../../src/core/types.js';

/**
 * A centralized helper function to run the generator for admin UI tests.
 * It sets up a standard in-memory project, runs the generator with a given spec,
 * and returns the entire `Project` instance for inspection.
 *
 * @param specString The OpenAPI specification as a JSON string.
 * @returns A promise that resolves to the `Project` instance containing all generated files.
 */
export async function generateAdminUI(specString: string): Promise<Project> {
    const project = new Project({
        useInMemoryFileSystem: true,
        manipulationSettings: { indentationText: IndentationText.TwoSpaces },
        compilerOptions: {
            target: ScriptTarget.ESNext,
            module: ModuleKind.ESNext,
            moduleResolution: 99, // NodeNext
            lib: ["ES2022", "DOM"],
            strict: true,
            esModuleInterop: true,
            allowArbitraryExtensions: true,
            resolveJsonModule: true
        }
    });

    const config: GeneratorConfig = {
        input: '/spec.json',
        output: '/generated',
        options: {
            dateType: 'string',
            enumStyle: 'enum',
            generateServices: true,
            admin: true
        }
    };

    const specObject = JSON.parse(specString);

    await generateFromConfig(config, project, { spec: specObject });

    return project;
}
