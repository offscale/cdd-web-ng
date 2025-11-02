import { Project, IndentationText, ScriptTarget, ModuleKind } from 'ts-morph';
import { generateFromConfig } from '../../src/index.js';
import { GeneratorConfig } from '../../src/core/types.js';

/**
 * Creates a standard ts-morph project instance for use in tests.
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
            admin: false
        },
        ...genConfig
    };

    await generateFromConfig(config, project, { spec });

    return project;
}
