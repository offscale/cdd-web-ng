#!/usr/bin/env node

import { Command, Option } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { generateFromConfig } from './index.js';
import { GeneratorConfig, GeneratorConfigOptions } from '@src/core/types/index.js';
import {
    applyReverseMetadata,
    buildOpenApiSpecFromServices,
    buildOpenApiSpecFromScan,
    isUrl,
    parseGeneratedMetadata,
    parseGeneratedModels,
    parseGeneratedServices,
    readOpenApiSnapshot,
    scanTypeScriptProject,
} from '@src/core/utils/index.js';

const packageJsonPath = new URL('../package.json', import.meta.url);
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

/** Defines the shape of the options object from the 'from_openapi' command. */
interface CliOptions {
    config?: string;
    input?: string;
    output?: string;
    clientName?: string;
    framework?: 'angular' | 'react' | 'vue';
    dateType?: 'string' | 'Date';
    enumStyle?: 'enum' | 'union';
    admin?: boolean;
    generateServices?: boolean;
    testsForService?: boolean;
    testsForAdmin?: boolean;
}

/** Defines the shape of the options object from the 'to_openapi' command. */
interface ToActionOptions {
    file: string;
    format: 'json' | 'yaml';
}

async function loadConfigFile(configPath: string): Promise<Partial<GeneratorConfig>> {
    const resolvedPath = path.resolve(process.cwd(), configPath);
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Configuration file not found: ${resolvedPath}`);
    }

    try {
        const configModule = await import(resolvedPath);
        const config = configModule.default || configModule.config || configModule;

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

async function runGeneration(options: CliOptions) {
    const startTime = Date.now();
    try {
        let baseConfig: Partial<GeneratorConfig> = {};
        if (options.config) {
            console.log(`📜 Loading configuration from: ${options.config}`);
            baseConfig = await loadConfigFile(options.config);
        }

        const cliOptions: Partial<GeneratorConfigOptions> = {};
        if (options.framework) cliOptions.framework = options.framework;
        if (options.dateType) cliOptions.dateType = options.dateType;
        if (options.enumStyle) cliOptions.enumStyle = options.enumStyle;
        if (options.generateServices !== undefined) cliOptions.generateServices = options.generateServices;
        if (options.admin !== undefined) cliOptions.admin = options.admin;
        if (options.testsForService !== undefined) cliOptions.generateServiceTests = options.testsForService;
        if (options.testsForAdmin !== undefined) cliOptions.generateAdminTests = options.testsForAdmin;

        const defaults: GeneratorConfigOptions = {
            framework: 'angular',
            dateType: 'Date',
            enumStyle: 'enum',
            generateServices: true,
            admin: false,
            generateServiceTests: true,
            generateAdminTests: true,
        };

        const finalConfigInProgress: Partial<GeneratorConfig> = {
            options: {
                ...defaults,
                ...baseConfig.options,
                ...cliOptions,
            },
            compilerOptions: {
                ...baseConfig.compilerOptions,
            },
        };

        const input = options.input ?? baseConfig.input;
        if (input) {
            finalConfigInProgress.input = input;
        }

        const output = options.output ?? baseConfig.output;
        if (output) {
            finalConfigInProgress.output = output;
        }

        const clientName = options.clientName ?? baseConfig.clientName;
        if (clientName) {
            finalConfigInProgress.clientName = clientName;
        }

        if (!finalConfigInProgress.input) {
            throw new Error('Input path or URL is required. Provide it via --input or a config file.');
        }
        if (!finalConfigInProgress.output) {
            finalConfigInProgress.output = './generated';
            console.warn(`Output path not specified, defaulting to '${finalConfigInProgress.output}'.`);
        }

        if (!path.isAbsolute(finalConfigInProgress.output)) {
            finalConfigInProgress.output = path.resolve(process.cwd(), finalConfigInProgress.output);
        }

        console.log('🚀 Starting code generation with the following configuration:');
        console.log(
            yaml.dump(
                { ...finalConfigInProgress },
                {
                    indent: 2,
                    skipInvalid: true,
                },
            ),
        );

        await generateFromConfig(finalConfigInProgress as GeneratorConfig);
    } catch (error) {
        console.error('❌ Generation failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    } finally {
        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n⏱️  Duration: ${duration.toFixed(2)} seconds`);
    }
}

const program = new Command();
program.name('cdd_web_ng').description('OpenAPI ↔ Angular').version(packageJson.version);

program
    .command('from_openapi')
    .description('Generate Client SDK services and admin UI from an OpenAPI specification')
    .option('-c, --config <path>', 'Path to a configuration file (e.g., cdd-web-ng.config.js)')
    .option('-i, --input <path>', 'Path or URL to the OpenAPI spec (overrides config)')
    .option('-o, --output <path>', 'Output directory for generated files (overrides config)')
    .option('--clientName <name>', 'Name for the generated client (used for DI tokens)')
    .addOption(
        new Option('--framework <framework>', 'Target framework')
            .choices(['angular', 'react', 'vue'])
            .default('angular'),
    )
    .addOption(new Option('--dateType <type>', 'Date type to use').choices(['string', 'Date']))
    .addOption(new Option('--enumStyle <style>', 'Style for enums').choices(['enum', 'union']))
    .option('--admin', 'Generate an admin UI (Angular only)')
    .addOption(new Option('--no-generate-services', 'Disable generation of services'))
    .option('--no-tests-for-service', 'Disable generation of tests for services')
    .option('--no-tests-for-admin', 'Disable generation of tests for the admin UI')
    .action(runGeneration);

program
    .command('to_openapi')
    .description('Generate an OpenAPI specification from TypeScript code (snapshot-based with AST fallback)')
    .requiredOption(
        '-f, --file <path>',
        'Path to a snapshot file (openapi.snapshot.json|yaml) or a generated output directory containing one',
    )
    .addOption(
        new Option('--format <format>', 'Output format for the OpenAPI spec').choices(['json', 'yaml']).default('yaml'),
    )
    .action((options: ToActionOptions) => {
        try {
            let spec: any;
            try {
                ({ spec } = readOpenApiSnapshot(options.file, fs));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const shouldFallback =
                    message.includes('No OpenAPI snapshot found') ||
                    message.includes('Unsupported snapshot file extension');
                if (!shouldFallback) {
                    throw error;
                }

                console.warn(`⚠️  ${message}`);
                console.warn('ℹ️  Falling back to parsing generated service files.');

                try {
                    const services = parseGeneratedServices(options.file, fs);
                    let schemas: Record<string, any> | undefined;

                    try {
                        schemas = parseGeneratedModels(options.file, fs);
                    } catch (modelError) {
                        const modelMessage = modelError instanceof Error ? modelError.message : String(modelError);
                        console.warn(`⚠️  ${modelMessage}`);
                        console.warn('ℹ️  Continuing without reconstructed component schemas.');
                    }

                    spec = buildOpenApiSpecFromServices(services, {}, schemas);

                    try {
                        const metadata = parseGeneratedMetadata(options.file, fs);
                        spec = applyReverseMetadata(spec, metadata);
                    } catch (metaError) {
                        const metaMessage = metaError instanceof Error ? metaError.message : String(metaError);
                        console.warn(`⚠️  ${metaMessage}`);
                        console.warn('ℹ️  Continuing without reconstructed metadata.');
                    }
                } catch (serviceError) {
                    const serviceMessage = serviceError instanceof Error ? serviceError.message : String(serviceError);
                    console.warn(`⚠️  ${serviceMessage}`);
                    console.warn('ℹ️  Falling back to AST-based TypeScript scanning.');
                    const scan = scanTypeScriptProject(options.file, fs);
                    spec = buildOpenApiSpecFromScan(scan);
                    try {
                        const metadata = parseGeneratedMetadata(options.file, fs);
                        spec = applyReverseMetadata(spec, metadata);
                    } catch (metaError) {
                        const metaMessage = metaError instanceof Error ? metaError.message : String(metaError);
                        console.warn(`⚠️  ${metaMessage}`);
                        console.warn('ℹ️  Continuing without reconstructed metadata.');
                    }
                }
            }

            const output =
                options.format === 'json' ? JSON.stringify(spec, null, 2) : yaml.dump(spec, { noRefs: true });
            process.stdout.write(output.trimEnd() + '\n');
        } catch (error) {
            console.error(
                '❌ to_openapi failed:',
                error instanceof Error ? error.message : `Unknown error: ${String(error)}`,
            );
            process.exit(1);
        }
    });

program.parse(process.argv);
