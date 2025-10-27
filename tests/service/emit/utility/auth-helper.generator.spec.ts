import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { AuthHelperGenerator } from '../../../../src/service/emit/utility/auth-helper.generator.js';

describe('Unit: AuthHelperGenerator', () => {
    it('should generate an auth-helper service file', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const generator = new AuthHelperGenerator(project);

        generator.generate('/generated');

        const sourceFile = project.getSourceFile('/generated/auth/auth-helper.service.ts');
        expect(sourceFile).toBeDefined();
        const fileText = sourceFile!.getFullText();

        expect(fileText).toContain('export class AuthHelperService');
        expect(fileText).toContain('private readonly oAuthService = inject(OAuthService);');
    });
});
