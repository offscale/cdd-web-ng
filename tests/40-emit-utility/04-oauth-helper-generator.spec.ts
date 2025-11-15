import { describe, it, expect } from 'vitest';
import { SwaggerParser } from '@src/core/parser.js';
import { OAuthHelperGenerator } from '@src/service/emit/utility/oauth-helper.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { securitySpec } from '../shared/specs.js';

describe('Emitter: OAuthHelperGenerator', () => {
    const runGenerator = (spec: object) => {
        const project = createTestProject();
        const parser = new SwaggerParser(spec as any, { output: '/out' } as any);
        new OAuthHelperGenerator(parser, project).generate('/out');
        return project;
    };

    it('should not generate files if no oauth2 scheme is present', () => {
        const project = runGenerator({ ...securitySpec, components: { securitySchemes: { ApiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-KEY' } } }});
        expect(project.getSourceFile('/out/auth/oauth.service.ts')).toBeUndefined();
    });

    it('should generate service and component if oauth2 scheme is present', () => {
        const project = runGenerator(securitySpec);
        expect(project.getSourceFile('/out/auth/oauth.service.ts')).toBeDefined();
        expect(project.getSourceFile('/out/auth/oauth-redirect/oauth-redirect.component.ts')).toBeDefined();
        expect(project.getFileSystem().readFileSync('/out/auth/oauth-redirect/oauth-redirect.component.html')).toBe('<p>Redirecting...</p>');
    });
});
