import { describe, expect, it, vi, afterAll } from 'vitest';
import { OpenApiGenerator } from '@src/service/open-api.generator.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types.js';
import fs from 'node:fs';
import path from 'node:path';

// Mock the Core Generators to focus tests on the orchestration logic and Utility wiring
vi.mock('@src/service/emit/models.js', () => {
    return {
        ModelGenerator: class {
            constructor(_p: any, _prj: any) {}
            generate(_out: string) { /* no-op */ }
        }
    };
});

vi.mock('@src/service/emit/angular-service.js', () => {
    return {
        ServiceGenerator: class {
            constructor(_p: any, _prj: any) {}
            generate(_out: string) { /* no-op */ }
        }
    };
});

const fullSpec: SwaggerSpec = {
    openapi: '3.0.0',
    info: { title: 'Orchestrator Spec', version: '1.0' },
    paths: {
        '/users': {
            get: {
                tags: ['User'], // References a tag
                responses: { '200': { description: 'ok' } },
                callbacks: { 'onUser': { '{$request.query}': { post: { responses: {'200':{}} } } } }
            }
        }
    },
    tags: [
        { name: 'User', description: 'User management' },
        { name: 'Admin', description: 'Admin access' }
    ],
    components: {
        securitySchemes: {
            'ApiKey': { type: 'apiKey', name: 'x-api-key', in: 'header' }
        },
        schemas: {
            'User': { type: 'object', properties: { name: { type: 'string' } } }
        }
    },
    servers: [
        { url: 'https://api.test.com' }
    ],
    webhooks: {
        'userCreated': { post: { responses: {'200':{}} } }
    }
};

describe('Service: OpenApiGenerator (Orchestrator)', () => {
    const testOutputDir = path.join(process.cwd(), 'temp_gen_out');

    // Cleanup helper
    const cleanup = () => {
        if (fs.existsSync(testOutputDir)) {
            fs.rmSync(testOutputDir, { recursive: true, force: true });
        }
    };

    afterAll(() => {
        cleanup();
    });

    it('should orchestrate the generation of all utility files including tags', async () => {
        cleanup(); // Ensure clean start

        const config: GeneratorConfig = {
            output: testOutputDir,
            options: { dateType: 'string', enumStyle: 'enum' }
        } as any;

        const generator = new OpenApiGenerator(fullSpec, config);
        await generator.generate();

        // Verify Files Exist on Disk (Integration Check)

        // Utilities
        expect(fs.existsSync(path.join(testOutputDir, 'callbacks.ts'))).toBe(true);
        expect(fs.existsSync(path.join(testOutputDir, 'webhooks.ts'))).toBe(true);
        expect(fs.existsSync(path.join(testOutputDir, 'links.ts'))).toBe(true);
        expect(fs.existsSync(path.join(testOutputDir, 'discriminators.ts'))).toBe(true);
        expect(fs.existsSync(path.join(testOutputDir, 'security.ts'))).toBe(true);
        expect(fs.existsSync(path.join(testOutputDir, 'servers.ts'))).toBe(true);

        // Verify Tags file specifically
        expect(fs.existsSync(path.join(testOutputDir, 'tags.ts'))).toBe(true);
    });

    it('should contain expected content in generated files', async () => {
        // Check Servers
        const serverFile = fs.readFileSync(path.join(testOutputDir, 'servers.ts'), 'utf-8');
        expect(serverFile).toContain('API_SERVERS');
        expect(serverFile).toContain('https://api.test.com');

        // Check Security
        const securityFile = fs.readFileSync(path.join(testOutputDir, 'security.ts'), 'utf-8');
        expect(securityFile).toContain('API_SECURITY_SCHEMES');
        expect(securityFile).toContain('ApiKey');

        // Check Tags
        const tagsFile = fs.readFileSync(path.join(testOutputDir, 'tags.ts'), 'utf-8');
        expect(tagsFile).toContain('API_TAGS');
        expect(tagsFile).toContain('API_TAGS_MAP');
        expect(tagsFile).toContain('User management');
    });
});
