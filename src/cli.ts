import { Command, Option } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { generateFromConfig } from './index.js';
import { SwaggerParser } from './openapi/parse.js';
import { generateDocsJson } from './functions/docs_generator.js';
import { GeneratorConfig, GeneratorConfigOptions } from './core/types/index.js';
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
} from './functions/utils.js';
import * as http from 'node:http';

const packageJsonPath = new URL('../package.json', import.meta.url);
// type-coverage:ignore-next-line
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { version: string };

/** Defines the shape of the options object from the 'from_openapi' command. */
interface CliOptions {
    config?: string;
    input?: string;
    inputDir?: string;
    output?: string;
    clientName?: string;
    framework?: 'angular' | 'react' | 'vue';
    implementation?: 'angular' | 'fetch' | 'axios' | 'node';
    dateType?: 'string' | 'Date';
    enumStyle?: 'enum' | 'union';
    admin?: boolean;
    generateServices?: boolean;
    testsForService?: boolean;
    testsForAdmin?: boolean;
    noGithubActions?: boolean;
    noInstallablePackage?: boolean;
}

/** Defines the shape of the options object from the 'to_openapi' command. */
interface ToActionOptions {
    file: string;
    format: 'json' | 'yaml';
    output?: string;
}

async function loadConfigFile(configPath: string): Promise<Partial<GeneratorConfig>> {
    const resolvedPath = path.resolve(process.cwd(), configPath);
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Configuration file not found: ${resolvedPath}`);
    }

    try {
        // type-coverage:ignore-next-line
        const configModule = await import(resolvedPath);
        // type-coverage:ignore-next-line
        const config = configModule.default || configModule.config || configModule;

        const configDir = path.dirname(resolvedPath);
        // type-coverage:ignore-next-line
        if (config.input && !isUrl(config.input) && !path.isAbsolute(config.input)) {
            // type-coverage:ignore-next-line
            config.input = path.resolve(configDir, config.input);
        }
        // type-coverage:ignore-next-line
        if (config.output && !path.isAbsolute(config.output)) {
            // type-coverage:ignore-next-line
            config.output = path.resolve(configDir, config.output);
        }
        return config;
    } catch (error) {
        throw new Error(`Failed to load configuration file: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function runGeneration(options: CliOptions, targetScope?: 'to_sdk' | 'to_sdk_cli' | 'to_server') {
    const startTime = Date.now();
    try {
        let baseConfig: Partial<GeneratorConfig> = {};
        if (options.config) {
            console.log(`📜 Loading configuration from: ${options.config}`);
            baseConfig = await loadConfigFile(options.config);
        }

        const cliOptions: Partial<GeneratorConfigOptions> = {};
        if (options.framework) cliOptions.framework = options.framework;
        if (options.implementation) cliOptions.implementation = options.implementation;
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

        const input = options.input ?? options.inputDir ?? baseConfig.input;
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
            throw new Error('Input path or URL is required. Provide it via --input, --input-dir or a config file.');
        }
        if (!finalConfigInProgress.output) {
            finalConfigInProgress.output = process.cwd();
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

        await generateFromConfig(finalConfigInProgress as GeneratorConfig, undefined, undefined, targetScope);

        // Handling specific scopes
        if (targetScope === 'to_sdk_cli') {
            console.log('Target scope SDK CLI executed.');
        } else if (targetScope === 'to_server') {
            console.log('Target scope Server executed.');
        } else if (targetScope === 'to_sdk') {
            console.log('Target scope SDK executed.');
        }

        if (!options.noInstallablePackage) {
            console.log('Generating package scaffolding...');
            fs.writeFileSync(
                path.join(finalConfigInProgress.output, 'package.json'),
                JSON.stringify({ name: 'generated-client', version: '1.0.0', main: 'index.js' }, null, 2),
            );
            fs.writeFileSync(
                path.join(finalConfigInProgress.output, 'tsconfig.json'),
                JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'CommonJS' } }, null, 2),
            );
        }

        if (!options.noGithubActions) {
            console.log('Generating GitHub actions...');
            const ghDir = path.join(finalConfigInProgress.output, '.github', 'workflows');
            fs.mkdirSync(ghDir, { recursive: true });
            fs.writeFileSync(
                path.join(ghDir, 'ci.yml'),
                'name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v3\n      - run: npm install\n      - run: npm test\n',
            );
        }

        return 'Success';
    } catch (error) {
        throw error;
    } finally {
        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n⏱️  Duration: ${duration.toFixed(2)} seconds`);
    }
}

async function runToOpenApi(options: ToActionOptions, returnObject = false): Promise<void | unknown> {
    // type-coverage:ignore-next-line
    let spec: unknown;
    try {
        // type-coverage:ignore-next-line
        ({ spec } = readOpenApiSnapshot(options.file, fs as unknown as Parameters<typeof readOpenApiSnapshot>[1]));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const shouldFallback =
            message.includes('No OpenAPI snapshot found') || message.includes('Unsupported snapshot file extension');
        if (!shouldFallback) {
            throw error;
        }

        console.warn(`⚠️  ${message}`);
        console.warn('ℹ️  Falling back to parsing generated service files.');

        try {
            const services = parseGeneratedServices(
                options.file,
                fs as unknown as Parameters<typeof parseGeneratedServices>[1],
            );
            let schemas: Record<string, unknown> | undefined;

            try {
                schemas = parseGeneratedModels(
                    options.file,
                    fs as unknown as Parameters<typeof parseGeneratedModels>[1],
                );
            } catch (modelError) {
                const modelMessage = modelError instanceof Error ? modelError.message : String(modelError);
                console.warn(`⚠️  ${modelMessage}`);
                console.warn('ℹ️  Continuing without reconstructed component schemas.');
            }

            // type-coverage:ignore-next-line
            spec = buildOpenApiSpecFromServices(
                services,
                {},
                schemas as unknown as Parameters<typeof buildOpenApiSpecFromServices>[2],
            );

            try {
                const metadata = parseGeneratedMetadata(
                    options.file,
                    fs as unknown as Parameters<typeof parseGeneratedMetadata>[1],
                );
                // type-coverage:ignore-next-line
                spec = applyReverseMetadata(spec as unknown as Parameters<typeof applyReverseMetadata>[0], metadata);
            } catch (metaError) {
                const metaMessage = metaError instanceof Error ? metaError.message : String(metaError);
                console.warn(`⚠️  ${metaMessage}`);
                console.warn('ℹ️  Continuing without reconstructed metadata.');
            }
        } catch (serviceError) {
            const serviceMessage = serviceError instanceof Error ? serviceError.message : String(serviceError);
            console.warn(`⚠️  ${serviceMessage}`);
            console.warn('ℹ️  Falling back to AST-based TypeScript scanning.');
            const scan = scanTypeScriptProject(
                options.file,
                fs as unknown as Parameters<typeof scanTypeScriptProject>[1],
            );
            // type-coverage:ignore-next-line
            spec = buildOpenApiSpecFromScan(scan);
            try {
                const metadata = parseGeneratedMetadata(
                    options.file,
                    fs as unknown as Parameters<typeof parseGeneratedMetadata>[1],
                );
                // type-coverage:ignore-next-line
                spec = applyReverseMetadata(spec as unknown as Parameters<typeof applyReverseMetadata>[0], metadata);
            } catch (metaError) {
                const metaMessage = metaError instanceof Error ? metaError.message : String(metaError);
                console.warn(`⚠️  ${metaMessage}`);
                console.warn('ℹ️  Continuing without reconstructed metadata.');
            }
        }
    }

    if (returnObject) {
        return spec;
    }

    const output =
        // type-coverage:ignore-next-line
        options.format === 'json' ? JSON.stringify(spec, null, 2) : yaml.dump(spec, { noRefs: true });

    if (options.output) {
        fs.writeFileSync(options.output, output.trimEnd() + '\n', 'utf8');
    } else {
        process.stdout.write(output.trimEnd() + '\n');
    }
    return undefined;
}
interface DocsJsonOptions {
    input: string;
    output?: string;
    imports: boolean;
    wrapping: boolean;
}

async function runToDocsJson(options: DocsJsonOptions, returnObject = false): Promise<void | unknown> {
    const config = {
        input: options.input,
        output: './generated',
        options: {
            framework: 'angular',
            dateType: 'Date',
            enumStyle: 'enum',
        },
        compilerOptions: {},
    } as GeneratorConfig;
    const parser = await SwaggerParser.create(options.input, config);
    const docsOptions = {
        imports: options.imports !== false,
        wrapping: options.wrapping !== false,
    };
    const docs = generateDocsJson(parser, config, docsOptions);

    if (returnObject) {
        return docs;
    }

    const outputStr = JSON.stringify(docs, null, 2) + '\n';
    if (options.output) {
        fs.writeFileSync(options.output, outputStr, 'utf8');
    } else {
        process.stdout.write(outputStr);
    }
    return undefined;
}

const program = new Command();
// type-coverage:ignore-next-line
program.name('cdd-ts').description('OpenAPI ↔ Angular').version(packageJson.version);

const fromOpenApi = program.command('from_openapi').description('Generate code from OpenAPI');

const addFromOpenApiOptions = (cmd: Command) => {
    return cmd
        .addOption(new Option('-c, --config <path>', 'Path to a configuration file').env('CDD_CONFIG'))
        .addOption(new Option('-i, --input <path>', 'Path or URL to the OpenAPI spec').env('CDD_INPUT'))
        .addOption(new Option('--input-dir <path>', 'Path to directory of OpenAPI specs').env('CDD_INPUT_DIR'))
        .addOption(new Option('-o, --output <path>', 'Output directory for generated files').env('CDD_OUTPUT'))
        .addOption(new Option('--clientName <name>', 'Name for the generated client').env('CDD_CLIENT_NAME'))
        .addOption(
            new Option('--framework <framework>', 'Target framework')
                .choices(['angular', 'react', 'vue'])
                .default('angular')
                .env('CDD_FRAMEWORK'),
        )
        .addOption(
            new Option('--implementation <implementation>', 'HTTP implementation')
                .choices(['angular', 'fetch', 'axios', 'node'])
                .default('angular')
                .env('CDD_IMPLEMENTATION'),
        )
        .addOption(new Option('--dateType <type>', 'Date type to use').choices(['string', 'Date']).env('CDD_DATE_TYPE'))
        .addOption(
            new Option('--enumStyle <style>', 'Style for enums').choices(['enum', 'union']).env('CDD_ENUM_STYLE'),
        )
        .addOption(new Option('--admin', 'Generate an auto-admin UI').env('CDD_ADMIN'))
        .addOption(
            new Option('--no-generate-services', 'Disable generation of services').env('CDD_NO_GENERATE_SERVICES'),
        )
        .addOption(
            new Option('--no-tests-for-service', 'Disable generation of tests for services').env(
                'CDD_NO_TESTS_FOR_SERVICE',
            ),
        )
        .addOption(
            new Option('--no-tests-for-admin', 'Disable generation of tests for the admin UI').env(
                'CDD_NO_TESTS_FOR_ADMIN',
            ),
        )
        .addOption(
            new Option('--no-github-actions', 'Disable generation of github actions scaffolding').env(
                'CDD_NO_GITHUB_ACTIONS',
            ),
        )
        .addOption(
            new Option('--no-installable-package', 'Disable generation of package scaffolding').env(
                'CDD_NO_INSTALLABLE_PACKAGE',
            ),
        );
};

addFromOpenApiOptions(fromOpenApi.command('to_sdk_cli'))
    .description('Generate Client SDK CLI from an OpenAPI specification')
    .action(async (options: CliOptions) => {
        try {
            await runGeneration(options, 'to_sdk_cli');
        } catch (err) {
            console.error('❌ Generation failed:', err instanceof Error ? err.message : String(err));
            process.exit(1);
        }
    });

addFromOpenApiOptions(fromOpenApi.command('to_sdk'))
    .description('Generate Client SDK from an OpenAPI specification')
    .action(async (options: CliOptions) => {
        try {
            await runGeneration(options, 'to_sdk');
        } catch (err) {
            console.error('❌ Generation failed:', err instanceof Error ? err.message : String(err));
            process.exit(1);
        }
    });

addFromOpenApiOptions(fromOpenApi.command('to_server'))
    .description('Generate Server from an OpenAPI specification')
    .action(async (options: CliOptions) => {
        try {
            await runGeneration(options, 'to_server');
        } catch (err) {
            console.error('❌ Generation failed:', err instanceof Error ? err.message : String(err));
            process.exit(1);
        }
    });

program
    .command('to_openapi')
    .description('Generate an OpenAPI specification from TypeScript code (snapshot-based with AST fallback)')
    .addOption(
        new Option('-f, --file <path>', 'Path to a snapshot file or a generated output directory')
            .env('CDD_FILE')
            .makeOptionMandatory(),
    )
    .addOption(new Option('-o, --output <path>', 'Output file').env('CDD_OUTPUT'))
    .addOption(
        new Option('--format <format>', 'Output format for the OpenAPI spec')
            .choices(['json', 'yaml'])
            .default('yaml')
            .env('CDD_FORMAT'),
    )
    .action(async (options: ToActionOptions) => {
        try {
            await runToOpenApi(options);
        } catch (error) {
            console.error(
                '❌ to_openapi failed:',
                error instanceof Error ? error.message : `Unknown error: ${String(error)}`,
            );
            process.exit(1);
        }
    });

program
    .command('to_docs_json')
    .description('Generate JSON containing how to call operations in the target language')
    .addOption(
        new Option('-i, --input <path>', 'Path or URL to the OpenAPI spec').env('CDD_INPUT').makeOptionMandatory(),
    )
    .addOption(new Option('-o, --output <path>', 'Path to write the JSON to').env('CDD_OUTPUT'))
    .addOption(
        new Option('--no-imports', 'Do not include import statements in the generated code').env('CDD_NO_IMPORTS'),
    )
    .addOption(
        new Option('--no-wrapping', 'Do not wrap the generated code in a function or block').env('CDD_NO_WRAPPING'),
    )
    .action(async (options: DocsJsonOptions) => {
        try {
            await runToDocsJson(options);
        } catch (error) {
            console.error(
                '❌ to_docs_json failed:',
                error instanceof Error ? error.message : `Unknown error: ${String(error)}`,
            );
            process.exit(1);
        }
    });

program
    .command('serve_json_rpc')
    .description('Expose CLI interface as JSON-RPC server')
    .addOption(new Option('--port <port>', 'Port to listen on').default('8080').env('CDD_PORT'))
    .addOption(new Option('--listen <address>', 'Address to listen on').default('127.0.0.1').env('CDD_LISTEN'))
    .action((options: { port: string; listen: string }) => {
        const port = parseInt(options.port, 10);
        const host = options.listen;
        const server = http.createServer(async (req, res) => {
            if (req.method === 'POST') {
                let body = '';
                req.on('data', (chunk: Buffer) => {
                    body += chunk.toString();
                });
                req.on('end', async () => {
                    let parsed: { method?: string; params?: Record<string, unknown>; id?: string | number | null };
                    try {
                        parsed = JSON.parse(body);
                    } catch (err) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(
                            JSON.stringify({
                                jsonrpc: '2.0',
                                error: { code: -32700, message: 'Parse error' },
                                id: null,
                            }),
                        );
                        return;
                    }
                    try {
                        let result: unknown;
                        switch (parsed.method) {
                            case 'from_openapi_to_sdk_cli':
                                result = await runGeneration(parsed.params as unknown as CliOptions, 'to_sdk_cli');
                                break;
                            case 'from_openapi_to_sdk':
                                result = await runGeneration(parsed.params as unknown as CliOptions, 'to_sdk');
                                break;
                            case 'from_openapi_to_server':
                                result = await runGeneration(parsed.params as unknown as CliOptions, 'to_server');
                                break;
                            case 'to_openapi':
                                result = await runToOpenApi(parsed.params as unknown as ToActionOptions, true);
                                break;
                            case 'to_docs_json':
                                result = await runToDocsJson(parsed.params as unknown as DocsJsonOptions, true);
                                break;
                            case 'version':
                                result = packageJson.version;
                                break;
                            default:
                                throw { code: -32601, message: 'Method not found' };
                        }
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ jsonrpc: '2.0', result, id: parsed.id }));
                    } catch (err: unknown) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(
                            JSON.stringify({
                                jsonrpc: '2.0',
                                error: (err as { code?: number }).code
                                    ? err
                                    : { code: -32000, message: (err as { message?: string }).message || String(err) },
                                id: parsed.id,
                            }),
                        );
                    }
                });
            } else {
                res.writeHead(405);
                res.end();
            }
        });
        server.listen(port, host, () => {
            console.log(`JSON-RPC server running at http://${host}:${port}/`);
        });
    });

program.parse(process.argv);
