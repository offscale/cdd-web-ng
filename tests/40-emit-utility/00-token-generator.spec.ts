import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { TokenGenerator } from '@src/service/emit/utility/token.generator.js';

describe('Emitter: TokenGenerator', () => {
    it('should generate uniquely named tokens for a given clientName', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        new TokenGenerator(project, 'MyTestClient').generate('/out');
        const fileContent = project.getSourceFileOrThrow('/out/tokens/index.ts').getText();

        expect(fileContent).toContain('export const BASE_PATH_MYTESTCLIENT');
        expect(fileContent).toContain('export const HTTP_INTERCEPTORS_MYTESTCLIENT');
        expect(fileContent).toContain('export const CLIENT_CONTEXT_TOKEN_MYTESTCLIENT');
    });

    it('should generate default token names when clientName is not provided', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        new TokenGenerator(project).generate('/out');
        const fileContent = project.getSourceFileOrThrow('/out/tokens/index.ts').getText();

        expect(fileContent).toContain('export const BASE_PATH_DEFAULT');
        expect(fileContent).toContain('export const HTTP_INTERCEPTORS_DEFAULT');
        expect(fileContent).toContain('export const CLIENT_CONTEXT_TOKEN_DEFAULT');
    });
});
