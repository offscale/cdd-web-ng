import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateFromConfig } from '@src/index.js';
import { coverageSpec, securitySpec } from '../shared/specs.js';
import { createTestProject, runGeneratorWithConfig } from '../shared/helpers.js';
import { GeneratorConfig } from "@src/core/types/index.js";

vi.mock('fs', async importOriginal => {
    const original = await importOriginal<typeof import('fs')>();
    return { ...original, mkdirSync: vi.fn(), existsSync: vi.fn().mockReturnValue(true) };
});

describe('E2E: Angular Generator Output', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should generate all expected files for a full service-oriented run', async () => {
        const project = createTestProject();
        // Explicitly requesting Angular framework
        const config: GeneratorConfig = {
            input: '', output: '/generated',
            options: { framework: 'angular', generateServices: true } as any
        };
        await generateFromConfig(config, project, { spec: coverageSpec });

        const filePaths = project.getSourceFiles().map(f => f.getFilePath());
        expect(filePaths).toContain('/generated/models/index.ts');
        expect(filePaths).toContain('/generated/services/index.ts');
        expect(filePaths).toContain('/generated/tokens/index.ts');
    });

    it('should generate date transformer when dateType is Date', async () => {
        const project = await runGeneratorWithConfig(coverageSpec, { framework: 'angular', dateType: 'Date' });
        const filePaths = project.getSourceFiles().map(f => f.getFilePath());
        expect(filePaths).toContain('/generated/utils/date-transformer.ts');
    });

    it('should generate auth-related files when security spec is provided', async () => {
        const project = createTestProject();
        const config: GeneratorConfig = { input: '', output: '/generated', options: { framework: 'angular', generateServices: true } as any };
        await generateFromConfig(config, project, { spec: securitySpec });

        const filePaths = project.getSourceFiles().map(f => f.getFilePath());
        expect(filePaths).toContain('/generated/auth/auth.interceptor.ts');
        expect(filePaths).toContain('/generated/auth/auth.tokens.ts');
        expect(filePaths).toContain('/generated/auth/oauth.service.ts');
    });

    it('should handle specs with only unsupported security schemes (cookie)', async () => {
        const project = createTestProject();
        const config: GeneratorConfig = { input: '', output: '/generated', options: { framework: 'angular', generateServices: true } as any };
        const unsupportedSecuritySpec = {
            openapi: '3.0.0', info: { title: 'Test API', version: '1.0.0' }, paths: {},
            components: {
                securitySchemes: {
                    CookieAuth: { type: 'apiKey', in: 'cookie', name: 'session_id' },
                },
            },
        };

        await generateFromConfig(config, project, { spec: unsupportedSecuritySpec });

        const filePaths = project.getSourceFiles().map(f => f.getFilePath());
        // The tokens file is always generated if any security schemes exist.
        expect(filePaths).toContain('/generated/auth/auth.tokens.ts');
        // The interceptor is NOT generated because 'cookie' is unsupported in Angular impl.
        expect(filePaths).not.toContain('/generated/auth/auth.interceptor.ts');
        expect(filePaths).not.toContain('/generated/auth/oauth.service.ts');

        expect(filePaths).toContain('/generated/providers.ts');
        const providerContent = project.getSourceFileOrThrow('/generated/providers.ts').getText();
        expect(providerContent).not.toContain('apiKey');
        expect(providerContent).not.toContain('bearerToken');
    });

    it('should default to generating admin tests when admin option is present but test option is absent', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

        await runGeneratorWithConfig(coverageSpec, { framework: 'angular', admin: true });

        const logCalls = consoleSpy.mock.calls.flat();
        expect(logCalls).toEqual(expect.arrayContaining([expect.stringContaining('Test generation for admin UI is stubbed.')]));

        consoleSpy.mockRestore();
    });

    it('should skip service generation when config is false', async () => {
        const project = await runGeneratorWithConfig(coverageSpec, { framework: 'angular', generateServices: false });
        const filePaths = project.getSourceFiles().map(f => f.getFilePath());
        expect(filePaths).toContain('/generated/models/index.ts'); // Models are shared/core
        expect(filePaths).not.toContain('/generated/services/index.ts');
        expect(filePaths).not.toContain('/generated/providers.ts');
    });

    it('should skip service test generation when config is false', async () => {
        const project = await runGeneratorWithConfig(coverageSpec, {
            framework: 'angular',
            generateServices: true,
            generateServiceTests: false,
        });
        const filePaths = project.getSourceFiles().map(f => f.getFilePath());
        expect(filePaths).toContain('/generated/services/users.service.ts');
        expect(filePaths).not.toContain('/generated/services/users.service.spec.ts');
    });

    it('should skip admin test generation when config is false', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        await runGeneratorWithConfig(coverageSpec, { framework: 'angular', admin: true, generateAdminTests: false });
        const logCalls = consoleSpy.mock.calls.flat();

        const hasAdminTestLog = logCalls.some(log => log.includes('Test generation for admin UI is stubbed.'));
        expect(hasAdminTestLog).toBe(false);

        consoleSpy.mockRestore();
    });
});
