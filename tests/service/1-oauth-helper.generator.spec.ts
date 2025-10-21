/**
 * @fileoverview
 * This test suite validates the `OAuthHelperGenerator`. This generator is only activated when
 * an `oauth2` security scheme is present in the OpenAPI specification. It is responsible for
 * scaffolding a basic `OAuthService` and an `OauthRedirectComponent` to handle the client-side
 * logic of an OAuth2 redirect flow, such as capturing the token from the URL fragment and
 * storing it.
 */

import { describe, it, expect } from 'vitest';
import { Project, IndentationText, ModuleKind, ScriptTarget } from 'ts-morph';
import { SwaggerParser } from '../../src/core/parser.js';
import { GeneratorConfig } from '../../src/core/types.js';
import { OAuthHelperGenerator } from '../../src/service/emit/utility/oauth-helper.generator.js';
import { authSchemesSpec, authSchemesSpecV2 } from '../admin/specs/test.specs.js';

/**
 * A helper function to run the OAuthHelperGenerator and return the entire ts-morph project
 * instance, allowing tests to inspect multiple generated files.
 *
 * @param specString The OpenAPI specification as a JSON string.
 * @returns A promise that resolves to the `Project` instance containing any generated files.
 */
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
        allowArbitraryExtensions: true, // Crucial for `.js` imports in NodeNext
        resolveJsonModule: true
    }
});

    const config: GeneratorConfig = {
        input: 'spec.json',
        output: './generated',
        options: {
            dateType: 'string',
            enumStyle: 'enum',
            generateServices: true,
        }
    };

    const spec = JSON.parse(specString);
    const parser = new SwaggerParser(spec, config);

    const generator = new OAuthHelperGenerator(parser, project);
    generator.generate('./generated');

    return project;
}

/**
 * Main test suite for the OAuthHelperGenerator.
 */
describe('OAuthHelperGenerator', () => {

    /**
     * Verifies that the generator does nothing when the OpenAPI spec does not contain an `oauth2` security scheme.
     */
    it('should not generate files if no oauth2 security scheme is defined', async () => {
        // Using a spec with only an API key
        const project = await generateOAuthHelper(authSchemesSpecV2);
        expect(project.getSourceFile('generated/auth/oauth.service.ts')).toBeUndefined();
        expect(project.getSourceFile('generated/auth/oauth-redirect.component.ts')).toBeUndefined();
    });

    /**
     * Tests that all three required files (`service`, `component.ts`, `component.html`) are created
     * when an `oauth2` scheme is present.
     */
    it('should generate all required files when an oauth2 scheme is present', async () => {
        const project = await generateOAuthHelper(authSchemesSpec);
        expect(project.getSourceFile('generated/auth/oauth.service.ts')).toBeDefined();
        expect(project.getSourceFile('generated/auth/oauth-redirect/oauth-redirect.component.ts')).toBeDefined();
        expect(project.getFileSystem().fileExistsSync('generated/auth/oauth-redirect/oauth-redirect.component.html')).toBe(true);
    });

    /**
     * Verifies the contents of the generated `OAuthService`, ensuring it has logic for storing
     * and retrieving a token, typically using `localStorage`.
     */
    it('should generate a correct OAuthService', async () => {
        const project = await generateOAuthHelper(authSchemesSpec);
        const serviceFile = project.getSourceFile('generated/auth/oauth.service.ts');
        const serviceText = serviceFile!.getFullText();

        expect(serviceText).toContain('@Injectable({ providedIn: \'root\' })');
        expect(serviceText).toContain('export class OAuthService');
        expect(serviceText).toContain(`localStorage.setItem('oauth_token'`);
        expect(serviceText).toContain(`localStorage.getItem('oauth_token'`);
    });

    /**
     * Verifies the contents of the generated `OauthRedirectComponent`, ensuring it correctly
     * injects dependencies and contains the logic to parse the token from the URL fragment.
     */
    it('should generate a correct OauthRedirectComponent', async () => {
        const project = await generateOAuthHelper(authSchemesSpec);
        const componentFile = project.getSourceFile('generated/auth/oauth-redirect/oauth-redirect.component.ts');
        const componentText = componentFile!.getFullText();

        expect(componentText).toContain(`selector: 'app-oauth-redirect'`);
        expect(componentText).toContain(`templateUrl: './oauth-redirect.component.html'`);
        expect(componentText).toContain('export class OauthRedirectComponent implements OnInit');
        expect(componentText).toContain('constructor(private route: ActivatedRoute, private oauthService: OAuthService)');
        expect(componentText).toContain('this.route.fragment.pipe(first())'); // Check for fragment parsing
        expect(componentText).toContain(`params.get('access_token')`);
        expect(componentText).toContain('this.oauthService.setToken(accessToken);');
    });

    /**
     * Verifies that a simple HTML template is generated for the redirect component.
     */
    it('should generate a simple HTML template for the redirect component', async () => {
        const project = await generateOAuthHelper(authSchemesSpec);
        const html = project.getFileSystem().readFileSync('generated/auth/oauth-redirect/oauth-redirect.component.html');
        expect(html).toContain('Redirecting...');
    });
});
