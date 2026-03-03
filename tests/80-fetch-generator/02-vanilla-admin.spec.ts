import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { runGenerator } from '../shared/helpers.js';
import { coverageSpec } from '../shared/specs.js';

describe('Vanilla Admin UI Generation (Fetch)', () => {
    it('should generate vanilla web components for admin UI', async () => {
        const project = await runGenerator(coverageSpec, {
            options: {
                implementation: 'fetch',
                admin: true,
                generateServices: true,
            } as any,
        });

        const files = project.getSourceFiles().map(f => f.getFilePath());

        expect(files.some(f => f.includes('admin/app-shell.ts'))).toBe(true);
        expect(files.some(f => f.includes('admin/users/users-list/users-list.component.ts'))).toBe(true);
        expect(files.some(f => f.includes('admin/users/users-form/users-form.component.ts'))).toBe(true);

        const appShell = project.getSourceFileOrThrow('/generated/admin/app-shell.ts');
        expect(appShell.getText()).toContain('import "./users/users-list/users-list.component.js"');
        expect(appShell.getText()).toContain('import "./users/users-form/users-form.component.js"');
    });
});
