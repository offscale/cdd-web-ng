import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateFromConfig } from '@src/index.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types.js';
import { coverageSpec, emptySpec, securitySpec } from '../shared/specs.js';
import { createTestProject, runGeneratorWithConfig } from '../shared/helpers.js';

vi.mock('fs', async importOriginal => {
    const original = await importOriginal<typeof import('fs')>();
    return { ...original, mkdirSync: vi.fn(), existsSync: vi.fn().mockReturnValue(true) };
});

describe('E2E: Full Generation Orchestrator', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should generate all expected files for a full service-oriented run', async () => {
        const project = createTestProject();
        const config: GeneratorConfig = { input: '', output: '/generated', options: { generateServices: true } as any };
        await generateFromConfig(config, project, { spec: coverageSpec });

        const filePaths = project.getSourceFiles().map(f => f.getFilePath());
        expect(filePaths).toContain('/generated/models/index.ts');
        expect(filePaths).toContain('/generated/services/index.ts');
    });

    it('should generate auth-related files when security spec is provided', async () => {
        const project = createTestProject();
        const config: GeneratorConfig = { input: '', output: '/generated', options: { generateServices: true } as any };
        // Use the spec with security schemes
        await generateFromConfig(config, project, { spec: securitySpec });

        const filePaths = project.getSourceFiles().map(f => f.getFilePath());

        // This covers the entire `if (Object.keys(securitySchemes).length > 0)` block in orchestrator.ts
        expect(filePaths).toContain('/generated/auth/auth.interceptor.ts');
        expect(filePaths).toContain('/generated/auth/auth.tokens.ts');
        expect(filePaths).toContain('/generated/auth/oauth.service.ts'); // because oauth2 is in securitySpec
    });

    it('should skip service generation when config is false', async () => {
        const project = await runGeneratorWithConfig(coverageSpec, { generateServices: false });
        const filePaths = project.getSourceFiles().map(f => f.getFilePath());
        expect(filePaths).toContain('/generated/models/index.ts');
        expect(filePaths).not.toContain('/generated/services/index.ts');
        expect(filePaths).not.toContain('/generated/providers.ts');
    });

    it('should skip service test generation when config is false', async () => {
        const project = await runGeneratorWithConfig(coverageSpec, {
            generateServices: true,
            generateServiceTests: false,
        });
        const filePaths = project.getSourceFiles().map(f => f.getFilePath());
        expect(filePaths).toContain('/generated/services/users.service.ts');
        expect(filePaths).not.toContain('/generated/services/users.service.spec.ts');
    });

    it('should skip admin test generation when config is false', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        await runGeneratorWithConfig(coverageSpec, { admin: true, generateAdminTests: false });
        const logCalls = consoleSpy.mock.calls.flat();
        expect(logCalls).not.toContain(expect.stringContaining('Test generation for admin UI is stubbed.'));
        consoleSpy.mockRestore();
    });

    it('should propagate async errors from the file system save operation', async () => {
        const errorMessage = 'Disk is full';
        const project = createTestProject();
        const saveSpy = vi.spyOn(project, 'save').mockRejectedValue(new Error(errorMessage));
        const config: GeneratorConfig = { input: '', output: '/generated', options: { generateServices: true } as any };
        vi.spyOn(SwaggerParser, 'create').mockResolvedValue(new SwaggerParser(emptySpec as any, config));
        await expect(generateFromConfig(config, project)).rejects.toThrow(errorMessage);
        expect(saveSpy).toHaveBeenCalled();
    });
});
