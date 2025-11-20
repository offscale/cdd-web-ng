import { IndentationText, ModuleKind, Project, ScriptTarget } from 'ts-morph';
import { generateFromConfig } from '@src/index.js';
import { GeneratorConfig } from '@src/core/types.js';

/**
 * Creates a standard ts-morph project instance for use in tests.
 * This sets up an in-memory file system and a consistent compiler configuration
 * to ensure tests are isolated and reproducible.
 * @returns A pre-configured Project instance with an in-memory file system.
 */
export function createTestProject(): Project {
    return new Project({
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
}

/**
 * A specialized version of `runGenerator` that allows passing a full config object.
 * Useful for E2E tests covering config-dependent features like security and date types.
 * @param spec The OpenAPI specification as a JavaScript object.
 * @param config The full generator config options.
 * @returns A promise that resolves to the `Project` instance containing all generated files.
 */
export async function runGeneratorWithConfig(spec: object, config: Partial<GeneratorConfig['options']>): Promise<Project> {
    const project = createTestProject();

    const fullConfig: GeneratorConfig = {
        input: '/spec.json',
        output: '/generated',
        options: {
            dateType: 'string',
            enumStyle: 'enum',
            generateServices: true,
            generateServiceTests: true,
            admin: false,
            ...config,
        },
    };
    await generateFromConfig(fullConfig, project, { spec });
    return project;
}

/**
 * A centralized helper to run the full generator pipeline for tests.
 * @param spec The OpenAPI specification as a JavaScript object.
 * @param genConfig Optional overrides for the standard generator config.
 * @returns A promise that resolves to the `Project` instance containing all generated files.
 */
export async function runGenerator(spec: object, genConfig?: Partial<GeneratorConfig>): Promise<Project> {
    const project = createTestProject();

    const config: GeneratorConfig = {
        input: '/spec.json',
        output: '/generated',
        options: {
            dateType: 'string',
            enumStyle: 'enum',
            generateServices: true,
            admin: false,
            generateServiceTests: true
        },
        ...genConfig
    };

    await generateFromConfig(config, project, { spec });

    return project;
}
