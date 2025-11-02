import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { generateFromConfig } from '../../src/index.js';
import { GeneratorConfig } from '../../src/core/types.js';
import { coverageSpec, securitySpec } from '../shared/specs.js';
import { createTestProject } from '../shared/helpers.js';

describe('E2E: Full Generation Orchestrator', () => {

    // FIX: Correctly await the generation and return the mutated project
    const run = async (spec: object, configOverrides: Partial<GeneratorConfig> = {}): Promise<Project> => {
        const project = createTestProject();
        const config: GeneratorConfig = {
            input: '', output: '/generated', clientName: 'TestClient',
            options: { generateServices: true, dateType: 'string', enumStyle: 'enum' },
            ...configOverrides
        };
        await generateFromConfig(config, project, { spec });
        return project;
    };

    it('should generate all expected files for a full service-oriented run', async () => {
        const project = await run(coverageSpec);

        expect(project.getDirectory('/generated/models')).toBeDefined();
        expect(project.getSourceFile('/generated/services/index.ts')).toBeDefined();
        expect(project.getSourceFile('/generated/providers.ts')).toBeDefined();
        expect(project.getSourceFile('/generated/index.ts')).toBeDefined();
        expect(project.getSourceFile('/generated/services/users.service.ts')).toBeDefined();
    });

    it('should generate auth and oauth files when security schemes are present', async () => {
        const project = await run(securitySpec);

        expect(project.getDirectory('/generated/auth')).toBeDefined();
        expect(project.getSourceFile('/generated/auth/auth.interceptor.ts')).toBeDefined();
        expect(project.getSourceFile('/generated/auth/oauth.service.ts')).toBeDefined();
    });

    it('should generate the date transformer when dateType is "Date"', async () => {
        const project = await run(coverageSpec, { options: { dateType: 'Date', enumStyle: 'enum', generateServices: true }});
        expect(project.getSourceFile('/generated/utils/date-transformer.ts')).toBeDefined();
    });

    it('should run without generating services or admin if options are false', async () => {
        const project = await run(coverageSpec, { options: { admin: false, generateServices: false, dateType: 'string', enumStyle: 'enum' }});

        expect(project.getSourceFile('/generated/models/index.ts')).toBeDefined();
        expect(project.getDirectory('/generated/services')).toBeUndefined();
        expect(project.getDirectory('/generated/admin')).toBeUndefined();
    });

    it('should re-throw errors from the generation process', async () => {
        const invalidSpec = { openapi: '3.0.0', paths: { '/test': { get: { operationId: 123 }}}} as any;
        await expect(run(invalidSpec)).rejects.toThrow();
    });
});
