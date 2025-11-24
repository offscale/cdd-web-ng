import { Project } from 'ts-morph';
import { posix as path } from 'node:path';
import { AbstractClientGenerator } from '../../core/generator.js';
import { SwaggerParser } from '../../core/parser.js';
import { GeneratorConfig } from '../../core/types.js';
import { groupPathsByController } from '../../service/parse.js';

// Core Generators
import { TypeGenerator } from '../../service/emit/type/type.generator.js';

// Angular Generators
import { AdminGenerator } from './admin/admin.generator.js';
import { ServiceGenerator } from './service/service.generator.js';
import { ServiceTestGenerator } from "./test/service-test-generator.js";

// Angular Utilities (Corrected Local Imports)
import { TokenGenerator } from './utils/token.generator.js';
import { HttpParamsBuilderGenerator } from './utils/http-params-builder.generator.js';
import { FileDownloadGenerator } from './utils/file-download.generator.js';
import { DateTransformerGenerator } from './utils/date-transformer.generator.js';
import { AuthTokensGenerator } from './utils/auth-tokens.generator.js';
import { AuthInterceptorGenerator } from './utils/auth-interceptor.generator.js';
import { OAuthHelperGenerator } from './utils/oauth-helper.generator.js';
import { BaseInterceptorGenerator } from './utils/base-interceptor.generator.js';
import { ProviderGenerator } from './utils/provider.generator.js';
import { MainIndexGenerator, ServiceIndexGenerator } from './utils/index.generator.js';
import { LinkServiceGenerator } from './utils/link-service.generator.js';
import { ResponseHeaderParserGenerator } from './utils/response-header-parser.generator.js';

// Shared Utilities (Corrected Shared Imports)
import { ServerGenerator } from '../shared/server.generator.js';
import { ServerUrlGenerator } from '../shared/server-url.generator.js';
import { XmlBuilderGenerator } from '../shared/xml-builder.generator.js';
import { InfoGenerator } from '../shared/info.generator.js';
import { MultipartBuilderGenerator } from '../shared/multipart-builder.generator.js';
import { ResponseHeaderRegistryGenerator } from '../shared/response-header-registry.generator.js';
import { CallbackGenerator } from "@src/generators/shared/callback.generator.js";
import { WebhookGenerator } from "@src/generators/shared/webhook.generator.js";
import { LinkGenerator } from "@src/generators/shared/link.generator.js";
import { DiscriminatorGenerator } from "@src/generators/shared/discriminator.generator.js";
import { SecurityGenerator } from "@src/generators/shared/security.generator.js";
import { TagGenerator } from "@src/generators/shared/tag.generator.js";

/**
 * Concrete implementation for generating an Angular client library.
 * Orchestrates the creation of Services, Interceptors, Modules, and Utilities specific to Angular.
 */
export class AngularClientGenerator extends AbstractClientGenerator {

    public async generate(project: Project, parser: SwaggerParser, config: GeneratorConfig, outputRoot: string): Promise<void> {
        // 1. Models (Framework Agnostic)
        new TypeGenerator(parser, project, config).generate(outputRoot);
        console.log('✅ Models generated.');

        // 2. Shared Utilities
        new InfoGenerator(parser, project).generate(outputRoot);
        new ServerGenerator(parser, project).generate(outputRoot);
        new ServerUrlGenerator(parser, project).generate(outputRoot);

        // ADD THE MISSING GENERATOR CALLS HERE
        new CallbackGenerator(parser, project).generate(outputRoot);
        new WebhookGenerator(parser, project).generate(outputRoot);
        new LinkGenerator(parser, project).generate(outputRoot);
        new DiscriminatorGenerator(parser, project).generate(outputRoot);
        new SecurityGenerator(parser, project).generate(outputRoot);
        new TagGenerator(parser, project).generate(outputRoot);

        // 3. Services and Angular Specifics
        if (config.options.generateServices ?? true) {
            const servicesDir = path.join(outputRoot, 'services');
            const controllerGroups = groupPathsByController(parser);

            for (const [controllerName, operations] of Object.entries(controllerGroups)) {
                new ServiceGenerator(parser, project, config).generateServiceFile(controllerName, operations, servicesDir);
            }
            new ServiceIndexGenerator(project).generateIndex(outputRoot);
            console.log('✅ Services generated.');

            // Generate Utilities
            new TokenGenerator(project, config.clientName).generate(outputRoot);
            new HttpParamsBuilderGenerator(project).generate(outputRoot);
            new FileDownloadGenerator(project).generate(outputRoot);
            new XmlBuilderGenerator(project).generate(outputRoot);
            new MultipartBuilderGenerator(project).generate(outputRoot);
            new LinkServiceGenerator(parser, project).generate(outputRoot);
            new ResponseHeaderRegistryGenerator(parser, project).generate(outputRoot);
            new ResponseHeaderParserGenerator(project).generate(outputRoot);

            if (config.options.dateType === 'Date') {
                new DateTransformerGenerator(project).generate(outputRoot);
            }

            // Auth
            const securitySchemes = parser.getSecuritySchemes();
            let tokenNames: string[] = [];
            if (Object.keys(securitySchemes).length > 0) {
                new AuthTokensGenerator(project).generate(outputRoot);

                const interceptorGenerator = new AuthInterceptorGenerator(parser, project);
                const interceptorResult = interceptorGenerator.generate(outputRoot);
                tokenNames = interceptorResult?.tokenNames || [];

                if (Object.values(securitySchemes).some(s => s.type === 'oauth2')) {
                    new OAuthHelperGenerator(parser, project).generate(outputRoot);
                }
            }

            new BaseInterceptorGenerator(project, config.clientName).generate(outputRoot);
            new ProviderGenerator(parser, project, tokenNames).generate(outputRoot);

            console.log('✅ Utilities and providers generated.');

            // Tests
            if (config.options.generateServiceTests ?? true) {
                console.log('📝 Generating tests for services...');
                const testGenerator = new ServiceTestGenerator(parser, project, config);
                const controllerGroupsForTest = groupPathsByController(parser);
                for (const [controllerName, operations] of Object.entries(controllerGroupsForTest)) {
                    testGenerator.generateServiceTestFile(controllerName, operations, servicesDir);
                }
                console.log('✅ Service tests generated.');
            }

            // Admin
            if (config.options.admin) {
                await new AdminGenerator(parser, project).generate(outputRoot);
                if (config.options.generateAdminTests ?? true) {
                    console.log('📝 Test generation for admin UI is stubbed.');
                }
            }
        }

        // 4. Main Entry Point
        new MainIndexGenerator(project, config, parser).generateMainIndex(outputRoot);
        console.log(`🎉 Generation complete! Output written to: ${path.resolve(outputRoot)}`);
    }
}
