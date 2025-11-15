import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { AuthTokensGenerator } from '@src/service/emit/utility/auth-tokens.generator.js';

describe('Emitter: AuthTokensGenerator', () => {
    it('should generate a file with API_KEY_TOKEN and BEARER_TOKEN_TOKEN', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        new AuthTokensGenerator(project).generate('/out');
        const fileContent = project.getSourceFileOrThrow('/out/auth/auth.tokens.ts').getText();

        expect(fileContent).toContain('export const API_KEY_TOKEN');
        expect(fileContent).toContain("new InjectionToken<string>('API_KEY')");
        expect(fileContent).toContain('export const BEARER_TOKEN_TOKEN');
        expect(fileContent).toContain("new InjectionToken<string | (() => string)>('BEARER_TOKEN')");
    });
});
