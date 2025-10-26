import { Command, Option } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import { generateFromConfig } from './index.js';
import { GeneratorConfig, GeneratorConfigOptions } from './core/types.js';
import { isUrl } from './core/utils.js';

// Dynamically import package.json to read the version number
const packageJsonPath = new URL('../package.json', import.meta.url);
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

/**
 * Loads and parses a JavaScript or JSON configuration file.
 * @param configPath - The path to the configuration file.
 * @returns A promise that resolves to the parsed configuration object.
 */
async function loadConfigFile(configPath: string): Promise<Partial<GeneratorConfig>> {
    const resolvedPath = path.resolve(process.cwd(), configPath);
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Configuration file not found: ${resolvedPath}`);
    }

    try {
        const configModule = await import(resolvedPath);
        const config = configModule.default || configModule.config || configModule;

        // Resolve input/output paths relative to the config file's directory
        const configDir = path.dirname(resolvedPath);
        if (config.input && !isUrl(config.input) && !path.isAbsolute(config.input)) {
            config.input = path.resolve(configDir, config.input);
        }
        if (config.output && !path.isAbsolute(config.output)) {
            config.output = path.resolve(configDir, config.output);
        }
        return config;
    } catch (error) {
        throw new Error(`Failed to load configuration file: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * The action handler for the `from_openapi` command. It constructs the final
 * configuration and triggers the code generation process.
 * @param options - The options object provided by Commander.js.
 */
async function runGeneration(options: any) {
    const startTime = Date.now();
    try {
        let baseConfig: Partial<GeneratorConfig> = {};
        if (options.config) {
            console.log(`📜 Loading configuration from: ${options.config}`);
            baseConfig = await loadConfigFile(options.config);
        }

        // CLI options override config file options.
        // We build a separate 'options' object to merge cleanly.
        const cliOptions: Partial<GeneratorConfigOptions> = {
            dateType: options.dateType,
            enumStyle: options.enumStyle,
            generateServices: options.generateServices,
            admin: options.admin,
        };

        // Remove undefined values so they don't incorrectly override defaults.
        Object.keys(cliOptions).forEach(key => (cliOptions as any)[key] === undefined && delete (cliOptions as any)[key]);

        const finalConfig: GeneratorConfig = {
            input: options.input ?? baseConfig.input,
            output: options.output ?? baseConfig.output,
            clientName: options.clientName ?? baseConfig.clientName,
            // Deep merge the options, with CLI arguments having the highest priority.
            options: {
                dateType: 'Date', // Default value
                enumStyle: 'enum', // Default value
                generateServices: true, // Default value
                admin: false, // Default value
                ...baseConfig.options,
                ...cliOptions,
            },
            ...baseConfig.compilerOptions,
        };

        if (!finalConfig.input) {
            throw new Error('Input path or URL is required. Provide it via --input or a config file.');
        }
        if (!finalConfig.output) {
            finalConfig.output = './generated';
            console.warn(`Output path not specified, defaulting to '${finalConfig.output}'.`);
        }

        // Resolve output path relative to current working directory if not absolute
        if (!path.isAbsolute(finalConfig.output)) {
            finalConfig.output = path.resolve(process.cwd(), finalConfig.output);
        }

        console.log('🚀 Starting code generation with the following configuration:');
        console.log(yaml.dump({ ...finalConfig, options: { ...finalConfig.options } }, { indent: 2, skipInvalid: true }));

        await generateFromConfig(finalConfig);

    } catch (error) {
        console.error("❌ Generation failed:", error instanceof Error ? error.message : String(error));
        process.exit(1);
    } finally {
        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n⏱️  Duration: ${duration.toFixed(2)} seconds`);
    }
}

const program = new Command();
program
    .name('cdd_web_ng')
    .description('OpenAPI ↔ Angular (TypeScript, HTML) code generator')
    .version(packageJson.version);

// --- from_openapi command ---
program
    .command('from_openapi')
    .description('Generate Angular services and admin UI from an OpenAPI specification')
    .option('-c, --config <path>', 'Path to a configuration file (e.g., cdd-web-ng.config.js)')
    .option('-i, --input <path>', 'Path or URL to the OpenAPI spec (overrides config)')
    .option('-o, --output <path>', 'Output directory for generated files (overrides config)')
    .option('--clientName <name>', 'Name for the generated client (used for DI tokens)')
    .addOption(new Option('--dateType <type>', 'Date type to use').choices(['string', 'Date']))
    .addOption(new Option('--enumStyle <style>', 'Style for enums').choices(['enum', 'union']))
    .option('--admin', 'Generate an Angular Material admin UI')
    .addOption(new Option('--generate-services', 'Generate Angular services').default(true))
    .action(runGeneration);

// --- to_openapi command (stub) ---
program
    .command('to_openapi')
    .description('Generate an OpenAPI specification from TypeScript code (Not yet implemented)')
    .requiredOption('-f, --file <path>', 'Path to the input TypeScript source file or directory')
    .addOption(new Option('--format <format>', 'Output format for the OpenAPI spec')
        .choices(['json', 'yaml'])
        .default('yaml'))
    .action((options) => {
        console.log('\n`to_openapi` command is a stub and is not yet implemented.');
        console.log('Provided Options:');
        console.log(`  - Input file: ${options.file}`);
        console.log(`  - Output format: ${options.format}`);
    });

program.parse(process.argv);
