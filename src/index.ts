// src/index.ts

import * as fs from 'node:fs';
import { ModuleKind, Project, ScriptTarget } from 'ts-morph';

import { GeneratorConfig, SwaggerSpec } from '@src/core/types/index.js';
import { isUrl } from '@src/functions/utils.js';

import { SwaggerParser } from './openapi/parse.js';
import { AngularClientGenerator } from './vendors/angular/angular-client.generator.js';
import { FetchClientGenerator } from './vendors/fetch/fetch-client.generator.js';
import { AxiosClientGenerator } from './vendors/axios/axios-client.generator.js';
import { NodeClientGenerator } from './vendors/node/node-client.generator.js';
import { IClientGenerator } from './core/generator.js';

/**
 * For test environments, allows passing a pre-parsed OpenAPI specification object.
 */
export type TestGeneratorConfig = {
    /** The pre-parsed OpenAPI specification object. */
    spec: object;
};

function getGeneratorFactory(framework: string, implementation?: string): IClientGenerator {
    if (implementation === 'fetch') {
        return new FetchClientGenerator();
    }
    if (implementation === 'axios') {
        return new AxiosClientGenerator();
    }
    if (implementation === 'node') {
        return new NodeClientGenerator();
    }
    switch (framework) {
        case 'angular':
            return new AngularClientGenerator();
        case 'react':
            throw new Error('React generation is not yet implemented.');
        case 'vue':
            throw new Error('Vue generation is not yet implemented.');
        default:
            // Default to Angular for backward compatibility if undefined, though config defaults handle this
            return new AngularClientGenerator();
    }
}

/**
 * Orchestrates the entire code generation process based on a configuration object.
 * @param config The generator configuration object.
 * @param project Optional ts-morph Project to use. If not provided, a new one is created. Useful for testing.
 * @param testConfig Optional configuration for test environments to inject a pre-parsed spec.
 * @returns A promise that resolves when generation is complete.
 */
export async function generateFromConfig(
    config: GeneratorConfig,
    project?: Project,
    testConfig?: TestGeneratorConfig,
): Promise<void> {
    const isTestEnv = !!testConfig;

    const activeProject =
        project ||
        new Project({
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

    if (!isTestEnv) {
        console.log(
            `📡 Processing OpenAPI specification from ${isUrl(config.input) ? 'URL' : 'file'}: ${config.input}`,
        );
    }

    try {
        const framework = config.options.framework || 'angular';
        const implementation = config.options.implementation;

        if (
            config.options.admin &&
            (implementation === 'fetch' || implementation === 'axios' || implementation === 'node')
        ) {
            throw new Error(
                `Not implemented: Admin UI is not supported when the implementation/transport is ${implementation}.`,
            );
        }

        let swaggerParser: SwaggerParser;
        if (isTestEnv) {
            const docUri = 'file://in-memory-spec.json';
            const spec = testConfig.spec as SwaggerSpec;
            const cache = new Map<string, SwaggerSpec>([[docUri, spec]]);
            swaggerParser = new SwaggerParser(spec, config, cache, docUri);
        } else {
            swaggerParser = await SwaggerParser.create(config.input, config);
        }

        const generator = getGeneratorFactory(framework, implementation);

        await generator.generate(activeProject, swaggerParser, config, config.output);

        // This block is now reachable in our test.
        if (!isTestEnv) {
            await activeProject.save();
        }
    } catch (error) {
        if (!isTestEnv) {
            console.error('❌ Generation failed:', error instanceof Error ? error.message : error);
        }
        throw error;
    }
}

/**
 * AST scanner utilities for reverse-generating OpenAPI specs from TypeScript.
 */
export {
    buildOpenApiSpecFromScan,
    scanTypeScriptProject,
    scanTypeScriptSource,
    type CodeScanFileSystem,
    type CodeScanIr,
    type CodeScanOperation,
    type CodeScanOptions,
    type CodeScanParam,
    type CodeScanParamLocation,
    type CodeScanRequestBody,
    type CodeScanResponse,
} from './functions/parse.js';
