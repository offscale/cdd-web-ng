import { describe, it, expect, vi, afterEach } from 'vitest';
import { Project } from 'ts-morph';
import { generateFromConfig } from '@src/index.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types.js';
import { coverageSpec, emptySpec, securitySpec } from '../shared/specs.js';
import { createTestProject, runGeneratorWithConfig } from '../shared/helpers.js';

/**
 * @fileoverview
 * This file contains end-to-end tests for the main `generateFromConfig` orchestrator.
 * It ensures that the entire generation pipeline runs correctly under different configurations
 * and that errors are propagated as expected.
 */

// This mock is needed because the "real" generator path checks for the output dir,
// but in our in-memory test environment, it doesn't exist.
vi.mock('fs', async (importOriginal) => {
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
        // Use the testConfig path with a pre-parsed spec to bypass file system access
        await generateFromConfig(config, project, { spec: coverageSpec });

        const filePaths = project.getSourceFiles().map(f => f.getFilePath());
        expect(filePaths).toContain('/generated/models/index.ts');
        expect(filePaths).toContain('/generated/services/index.ts');
        expect(filePaths).toContain('/generated/services/users.service.ts');
        expect(filePaths).toContain('/generated/providers.ts');
        expect(filePaths).toContain('/generated/tokens/index.ts');
        expect(filePaths).toContain('/generated/utils/base-interceptor.ts');
    });

    it('should conditionally generate date transformer files', async () => {
        const project = await runGeneratorWithConfig(emptySpec, { dateType: 'Date', generateServices: true });
        const filePaths = project.getSourceFiles().map(f => f.getFilePath());
        expect(filePaths).toContain('/generated/utils/date-transformer.ts');
    });

    it('should conditionally generate auth and oauth files', async () => {
        const project = await runGeneratorWithConfig(securitySpec, { generateServices: true });
        const filePaths = project.getSourceFiles().map(f => f.getFilePath());
        expect(filePaths).toContain('/generated/auth/auth.interceptor.ts');
        expect(filePaths).toContain('/generated/auth/auth.tokens.ts');
        expect(filePaths).toContain('/generated/auth/oauth.service.ts');
        expect(filePaths).toContain('/generated/auth/oauth-redirect/oauth-redirect.component.ts');
    });

    it('should propagate async errors from the file system save operation', async () => {
        const errorMessage = 'Disk is full';
        const project = createTestProject();
        const saveSpy = vi.spyOn(project, 'save').mockRejectedValue(new Error(errorMessage));

        const config: GeneratorConfig = { input: '', output: '/generated', options: { generateServices: true } as any };
        // Since we are not passing a `testConfig`, the real `SwaggerParser.create` will be called. We must mock it.
        vi.spyOn(SwaggerParser, 'create').mockResolvedValue(new SwaggerParser(emptySpec as any, config));

        // Call generateFromConfig WITHOUT the third testConfig argument.
        // This triggers the `!isTestEnv` block in the implementation, ensuring `.save()` is called.
        await expect(generateFromConfig(config, project)).rejects.toThrow(errorMessage);

        expect(saveSpy).toHaveBeenCalled();
        saveSpy.mockRestore();
    });
});
