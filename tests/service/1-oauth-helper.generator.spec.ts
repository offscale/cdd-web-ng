// ./tests/service/1-oauth-helper.generator.spec.ts

import { describe, it, expect } from 'vitest';
import { Project, IndentationText, ModuleKind, ScriptTarget } from 'ts-morph';
import { SwaggerParser } from '../../src/core/parser.js';
import { GeneratorConfig } from '../../src/core/types.js';
import { OAuthHelperGenerator } from '../../src/service/emit/utility/oauth-helper.generator.js';
import { authSchemesSpec, authSchemesSpecV2 } from '../admin/specs/test.specs.js';

async function generateOAuthHelper(specString: string): Promise<Project> {
    const project = new Project({
        useInMemoryFileSystem: true,
        manipulationSettings: { indentationText: IndentationText.TwoSpaces },
        compilerOptions: {
            target: ScriptTarget.ESNext,
            module: ModuleKind.ESNext,
            moduleResolution: 99, // NodeNext
            lib: ["ES2022", "DOM"],
            strict: true,
            esModuleInterop: true,
            allowArbitraryExtensions: true,
            resolveJsonModule: true
        }
    });

    const config: GeneratorConfig = {
        input: '/spec.json',
        output: '/generated',
        options: {
            dateType: 'string',
            enumStyle: 'enum',
            generateServices: true,
        }
    };
    project.createSourceFile(config.input, specString);

    const spec = JSON.parse(specString);
    const parser = new SwaggerParser(spec, config);

    const generator = new OAuthHelperGenerator(parser, project);
    generator.generate(config.output);

    return project;
}

describe('OAuthHelperGenerator', () => {
    it('should not generate files if no oauth2 security scheme is defined', async () => {
        const project = await generateOAuthHelper(authSchemesSpecV2);
        expect(project.getSourceFile('/generated/auth/oauth.service.ts')).toBeUndefined();
        expect(project.getSourceFile('/generated/auth/oauth-redirect/oauth-redirect.component.ts')).toBeUndefined();
    });

    it('should generate all required files when an oauth2 scheme is present', async () => {
        const project = await generateOAuthHelper(authSchemesSpec);
        expect(project.getSourceFile('/generated/auth/oauth.service.ts')).toBeDefined();
        expect(project.getSourceFile('/generated/auth/oauth-redirect/oauth-redirect.component.ts')).toBeDefined();
        expect(project.getFileSystem().fileExistsSync('/generated/auth/oauth-redirect/oauth-redirect.component.html')).toBe(true);
    });

    it('should generate a correct OAuthService', async () => {
        const project = await generateOAuthHelper(authSchemesSpec);
        const serviceFile = project.getSourceFile('/generated/auth/oauth.service.ts');
        const serviceText = serviceFile!.getFullText();

        expect(serviceText).toContain('@Injectable({ providedIn: \'root\' })');
        expect(serviceText).toContain('export class OAuthService');
        expect(serviceText).toContain(`localStorage.setItem(this.TOKEN_KEY, token)`);
        expect(serviceText).toContain(`localStorage.getItem(this.TOKEN_KEY)`);
    });

    it('should generate a correct OauthRedirectComponent', async () => {
        const project = await generateOAuthHelper(authSchemesSpec);
        const componentFile = project.getSourceFile('/generated/auth/oauth-redirect/oauth-redirect.component.ts');
        const componentText = componentFile!.getFullText();

        expect(componentText).toContain(`selector: 'app-oauth-redirect'`);
        expect(componentText).toContain(`templateUrl: './oauth-redirect.component.html'`);
        expect(componentText).toContain('export class OauthRedirectComponent implements OnInit');
        // FIX: Use a more robust regex that is less sensitive to formatting
        expect(componentText).toMatch(/constructor\s*\([^)]*private\s+route:\s*ActivatedRoute/);
        expect(componentText).toContain('this.route.fragment.pipe(first())');
        expect(componentText).toContain(`params.get('access_token')`);
        expect(componentText).toContain('this.oauthService.setToken(accessToken)');
    });

    it('should generate a simple HTML template for the redirect component', async () => {
        const project = await generateOAuthHelper(authSchemesSpec);
        const html = project.getFileSystem().readFileSync('/generated/auth/oauth-redirect/oauth-redirect.component.html');
        expect(html).toContain('Redirecting...');
    });
});
