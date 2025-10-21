#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { generateFromConfig } from './index.js';
import { GeneratorConfig } from './core/types.js';
import { isUrl } from './core/utils.js';

// Dynamically import package.json to avoid issues with module resolution
const packageJsonPath = new URL('../package.json', import.meta.url);
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

interface CLIOptions {
    config?: string;
    input?: string;
    output?: string;
    dateType?: 'string' | 'Date';
}

async function loadConfigFile(configPath: string): Promise<GeneratorConfig> {
    const resolvedPath = path.resolve(configPath);
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Configuration file not found: ${resolvedPath}`);
    }

    try {
        const configModule = await import(resolvedPath);
        const config = configModule.default || configModule.config || configModule;

        if (!config.input || !config.output) {
            throw new Error('Configuration must include "input" and "output" properties');
        }

        const configDir = path.dirname(resolvedPath);
        if (!isUrl(config.input) && !path.isAbsolute(config.input)) {
            config.input = path.resolve(configDir, config.input);
        }
        if (!path.isAbsolute(config.output)) {
            config.output = path.resolve(configDir, config.output);
        }
        return config;
    } catch (error) {
        throw new Error(`Failed to load configuration file: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function run(options: CLIOptions): Promise<void> {
    const startTime = Date.now();
    try {
        let config: GeneratorConfig;
        if (options.config) {
            config = await loadConfigFile(options.config);
        } else if (options.input) {
            config = {
                input: options.input,
                output: options.output || './generated',
                options: {
                    dateType: options.dateType || 'Date',
                    enumStyle: 'enum',
                    generateServices: true,
                },
            };
        } else {
            console.error('Error: Either --config or --input option is required.');
            program.help();
            process.exit(1);
        }

        await generateFromConfig(config);

    } catch (error) {
        console.error("❌ Generation failed:", error instanceof Error ? error.message : error);
        process.exit(1);
    } finally {
        const duration = (Date.now() - startTime) / 1000;
        console.log(`⏱️ Duration: ${duration.toFixed(2)} seconds`);
    }
}

const program = new Command();
program
    .name('oag')
    .description('Generate Angular services and types from OpenAPI/Swagger specifications')
    .version(packageJson.version)
    .option('-c, --config <path>', 'Path to a configuration file (e.g., oag.config.js)')
    .option('-i, --input <path>', 'Path or URL to the OpenAPI/Swagger specification')
    .option('-o, --output <path>', 'Output directory for generated files', './generated')
    .option('--date-type <type>', 'Date type to use ("string" or "Date")', 'Date')
    .action(run);

program.parse();
