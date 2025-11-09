// tests/60-e2e/00-orchestrator.spec.ts

import { describe, it, expect, vi, afterEach } from 'vitest';
import { Project } from 'ts-morph';
import { generateFromConfig } from '@src/index.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types.js';
import { coverageSpec, emptySpec } from '../shared/specs.js';
import { createTestProject } from '../shared/helpers.js';

vi.mock('fs', async (importOriginal) => {
    const original = await importOriginal<typeof import('fs')>();
    // This mock is needed because the "real" path of the generator checks for the output dir.
    return { ...original, mkdirSync: vi.fn(), existsSync: vi.fn().mockReturnValue(true) };
});
// ------------------------------------

describe('E2E: Full Generation Orchestrator', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should generate all expected files for a full service-oriented run', async () => {
        const project = createTestProject();
        const config: GeneratorConfig = { input: '', output: '/generated', options: { generateServices: true } as any };
        vi.spyOn(SwaggerParser, 'create').mockResolvedValue(new SwaggerParser(coverageSpec as any, config));
        // Use the test path with pre-parsed spec
        await generateFromConfig(config, project, { spec: coverageSpec });

        const files = project.getSourceFiles().map(f => f.getFilePath());
        expect(files).toContain('/generated/models/index.ts');
        expect(files).toContain('/generated/services/index.ts');
    });

    it('should propagate async errors from the file system save operation', async () => {
        const errorMessage = 'Disk is full';
        // 1. Create a project with an in-memory file system.
        const project = createTestProject();
        // 2. Spy on the `save` method of THIS INSTANCE.
        const saveSpy = vi.spyOn(project, 'save').mockRejectedValue(new Error(errorMessage));

        const config: GeneratorConfig = { input: '', output: '/generated', options: { generateServices: true } as any };
        // 3. Since we are not passing a `testConfig`, the real `SwaggerParser.create` will be called. We must mock it.
        vi.spyOn(SwaggerParser, 'create').mockResolvedValue(new SwaggerParser(emptySpec as any, config));

        // 4. CRITICAL: Pass the in-memory `project`, but DO NOT pass the `testConfig`.
        // This triggers the `!isTestEnv` block in the implementation, ensuring `.save()` is called.
        await expect(generateFromConfig(config, project)).rejects.toThrow(errorMessage);

        // 5. Verify the spy was called.
        expect(saveSpy).toHaveBeenCalled();
        saveSpy.mockRestore();
    });
});
