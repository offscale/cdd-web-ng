import { afterAll, describe, expect, it, vi } from 'vitest';

import { Project } from 'ts-morph';

import fs from 'node:fs';
import path from 'node:path';

import { AngularClientGenerator } from '@src/generators/angular/angular-client.generator.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types/index.js';
import { SwaggerParser } from '@src/core/parser.js';
import { AuthInterceptorGenerator } from '@src/generators/angular/utils/auth-interceptor.generator.js';

// Mock the sub-generators to focus on orchestration wiring
vi.mock('@src/service/emit/type/type.generator.js', () => {
    return {
        TypeGenerator: class {
            constructor(_p: any, _prj: any, _c: any) {}

            generate(_out: string) {
                /* no-op */
            }
        },
    };
});

vi.mock('@src/generators/angular/service/service.generator.js', () => {
    return {
        ServiceGenerator: class {
            constructor(_p: any, _prj: any, _c: any) {}

            // UPDATED MOCK: The contract is now generate(outputDir, group)
            generate(_out: string, _groups: any) {
                // Simulate file creation that usually happens inside generate
                // so that assertions later on filesystem checks pass
                if (!fs.existsSync(path.join(_out, 'services'))) {
                    fs.mkdirSync(path.join(_out, 'services'), { recursive: true });
                }
                fs.writeFileSync(path.join(_out, 'services/user.service.spec.ts'), '// Mock Spec');
            }
        },
    };
});

const fullSpec: SwaggerSpec = {
    openapi: '3.0.0',
    info: { title: 'Orchestrator Spec', version: '1.0' },
    paths: {
        '/users': {
            get: {
                tags: ['User'],
                responses: { '200': { description: 'ok' } },
                callbacks: { onUser: { '{$request.query}': { post: { responses: { '200': {} } } } } },
            },
        },
    },
    tags: [
        { name: 'User', description: 'User management' },
        { name: 'Admin', description: 'Admin access' },
    ],
    components: {
        securitySchemes: {
            ApiKey: { type: 'apiKey', name: 'x-api-key', in: 'header' },
        },
        schemas: {
            User: { type: 'object', properties: { name: { type: 'string' } } },
        },
    },
    servers: [{ url: 'https://api.test.com' }],
    webhooks: {
        userCreated: { post: { responses: { '200': {} } } },
    },
};

describe('Generators: AngularClientGenerator (Orchestrator)', () => {
    const testOutputDir = path.join(process.cwd(), 'temp_gen_out');

    const cleanup = () => {
        if (fs.existsSync(testOutputDir)) {
            fs.rmSync(testOutputDir, { recursive: true, force: true });
        }
    };

    afterAll(() => {
        cleanup();
    });

    it('should orchestrate the generation of all utility files including tags', async () => {
        cleanup();

        const config: GeneratorConfig = {
            input: '',
            output: testOutputDir,
            clientName: 'TestClient',
            options: { dateType: 'string', enumStyle: 'enum', generateServices: true },
        } as any;

        // We must ensure project writes to disk since fs read calls happen later
        const project = new Project();
        const parser = new SwaggerParser(fullSpec, config);
        const generator = new AngularClientGenerator();

        await generator.generate(project, parser, config, testOutputDir);
        await project.save();

        // Shared Utilities
        expect(fs.existsSync(path.join(testOutputDir, 'callbacks.ts'))).toBe(true);
        expect(fs.existsSync(path.join(testOutputDir, 'webhooks.ts'))).toBe(true);
        expect(fs.existsSync(path.join(testOutputDir, 'links.ts'))).toBe(true);
        expect(fs.existsSync(path.join(testOutputDir, 'discriminators.ts'))).toBe(true);
        expect(fs.existsSync(path.join(testOutputDir, 'security.ts'))).toBe(true);
        expect(fs.existsSync(path.join(testOutputDir, 'servers.ts'))).toBe(true);
        expect(fs.existsSync(path.join(testOutputDir, 'tags.ts'))).toBe(true);
        expect(fs.existsSync(path.join(testOutputDir, 'openapi.snapshot.json'))).toBe(true);
        expect(fs.existsSync(path.join(testOutputDir, 'openapi.snapshot.yaml'))).toBe(true);

        // Framework Specifics
        expect(fs.existsSync(path.join(testOutputDir, 'services', 'user.service.spec.ts'))).toBe(true);
        expect(fs.existsSync(path.join(testOutputDir, 'tokens', 'index.ts'))).toBe(true);
    });

    it('should contain expected content in framework agnostic files', async () => {
        const serverFile = fs.readFileSync(path.join(testOutputDir, 'servers.ts'), 'utf-8');
        expect(serverFile).toContain('API_SERVERS');
        expect(serverFile).toContain('https://api.test.com');

        const securityFile = fs.readFileSync(path.join(testOutputDir, 'security.ts'), 'utf-8');
        expect(securityFile).toContain('API_SECURITY_SCHEMES');
        expect(securityFile).toContain('ApiKey');

        const tagsFile = fs.readFileSync(path.join(testOutputDir, 'tags.ts'), 'utf-8');
        expect(tagsFile).toContain('API_TAGS');
        expect(tagsFile).toContain('User management');
    });

    it('should derive controller names from path segments when tags are missing', async () => {
        const outputDir = path.join(process.cwd(), 'temp_gen_out_paths');
        if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });

        const spec: SwaggerSpec = {
            openapi: '3.0.0',
            info: { title: 'Paths Only', version: '1.0' },
            paths: {
                '/': { get: { operationId: 'rootGet', responses: { '200': {} } } },
                '/items': { get: { operationId: 'listItems', responses: { '200': {} } } },
            },
        };

        const config: GeneratorConfig = {
            input: '',
            output: outputDir,
            options: { dateType: 'string', enumStyle: 'enum', generateServices: true, generateServiceTests: true },
        } as any;

        const project = new Project();
        const parser = new SwaggerParser(spec, config);
        const generator = new AngularClientGenerator();

        await generator.generate(project, parser, config, outputDir);
        await project.save();

        expect(fs.existsSync(path.join(outputDir, 'services', 'default.service.spec.ts'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'services', 'items.service.spec.ts'))).toBe(true);
    });

    it('should default token names when auth interceptor returns undefined', async () => {
        const outputDir = path.join(process.cwd(), 'temp_gen_out_tokens');
        if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });

        const specWithSecurity: SwaggerSpec = {
            openapi: '3.0.0',
            info: { title: 'Security', version: '1.0' },
            paths: { '/secure': { get: { responses: { '200': {} } } } },
            components: {
                securitySchemes: {
                    ApiKey: { type: 'apiKey', name: 'x-api-key', in: 'header' },
                },
            },
        };

        const config: GeneratorConfig = {
            input: '',
            output: outputDir,
            options: { dateType: 'string', enumStyle: 'enum', generateServices: true },
        } as any;

        const project = new Project();
        const parser = new SwaggerParser(specWithSecurity, config);
        const generator = new AngularClientGenerator();

        const spy = vi.spyOn(AuthInterceptorGenerator.prototype, 'generate').mockReturnValue(undefined as any);
        await generator.generate(project, parser, config, outputDir);
        await project.save();
        spy.mockRestore();

        expect(fs.existsSync(path.join(outputDir, 'providers.ts'))).toBe(true);
    });
});
