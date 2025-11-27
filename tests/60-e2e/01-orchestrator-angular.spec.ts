import { Project } from 'ts-morph';

import * as path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runGeneratorWithConfig } from '../shared/helpers.js';
import { coverageSpec } from '../fixtures/coverage.fixture.js';

describe('E2E: Angular Generator Output', () => {
    beforeAll(async () => {});
    afterAll(async () => {});

    /**
     * Returns true if any generated file's name ends with one of the given names, regardless of slashes.
     */
    function hasFile(project: Project, name: string): boolean {
        // This works with both forward and backward slashes
        const fileNameNormalized = name.replace(/[\\/]/g, path.sep);
        return project
            .getSourceFiles()
            .some(
                f =>
                    f.getBaseName() === name ||
                    f.getFilePath().endsWith(name) ||
                    f.getFilePath().endsWith(path.sep + name) ||
                    f.getFilePath().endsWith(fileNameNormalized),
            );
    }

    it('should generate an admin module when requested', async () => {
        const project = await runGeneratorWithConfig(coverageSpec, {
            framework: 'angular',
            admin: true,
        });

        // Accept any path ending in the file—across slashes intentionally
        expect(hasFile(project, 'admin.routes.ts')).toBe(true);
        expect(hasFile(project, 'users-list.component.ts')).toBe(true);
        expect(hasFile(project, 'users-form.component.ts')).toBe(true);
    });

    it('should run without auth generation for a spec with no security', async () => {
        const noSecuritySpec = {
            openapi: '3.0.0',
            info: { title: 'No Security Spec', version: '1.0' },
            paths: {
                '/test': {
                    get: {
                        operationId: 'getTest',
                        responses: { '200': { description: 'OK' } },
                    },
                },
            },
        };

        const project = await runGeneratorWithConfig(noSecuritySpec, {
            framework: 'angular',
        });

        expect(hasFile(project, 'auth.interceptor.ts')).toBe(false);
        expect(hasFile(project, 'auth.tokens.ts')).toBe(false);
    });
});
