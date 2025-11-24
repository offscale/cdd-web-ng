import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateFromConfig } from '@src/index.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from "@src/core/types/index.js";
import { coverageSpec, emptySpec } from '../shared/specs.js';
import { createTestProject, runGeneratorWithConfig } from '../shared/helpers.js';

vi.mock('fs', async importOriginal => {
    const original = await importOriginal<typeof import('fs')>();
    return { ...original, mkdirSync: vi.fn(), existsSync: vi.fn().mockReturnValue(true) };
});

describe('E2E: Core Orchestrator Flow', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should default to Angular framework when option is absent', async () => {
        const project = await runGeneratorWithConfig(coverageSpec, {});
        const filePaths = project.getSourceFiles().map(f => f.getFilePath());

        // Angular specific artifacts check
        expect(filePaths).toContain('/generated/services/users.service.ts');
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

    it('should throw error for unsupported frameworks', async () => {
        const project = createTestProject();
        const config: GeneratorConfig = {
            input: '',
            output: '/generated',
            options: { framework: 'react' as any } // Type cast for testing invalid runtime option
        };

        await expect(generateFromConfig(config, project, { spec: emptySpec })).rejects.toThrow("React generation is not yet implemented.");
    });
});
