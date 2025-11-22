import { Project } from 'ts-morph';
import { posix as path } from 'node:path';
import { groupPathsByController } from '../parse.js';
import { SwaggerParser } from '../../core/parser.js';
import { GeneratorConfig } from '../../core/types.js';
import { TypeGenerator } from './type/type.generator.js';
import { ServiceGenerator } from './service/service.generator.js';
import { AdminGenerator } from './admin/admin.generator.js';
import { TokenGenerator } from './utility/token.generator.js';
import { HttpParamsBuilderGenerator } from './utility/http-params-builder.js';
import { FileDownloadGenerator } from './utility/file-download.generator.js';
import { DateTransformerGenerator } from './utility/date-transformer.generator.js';
import { AuthTokensGenerator } from './utility/auth-tokens.generator.js';
import { AuthInterceptorGenerator } from './utility/auth-interceptor.generator.js';
import { OAuthHelperGenerator } from './utility/oauth-helper.generator.js';
import { BaseInterceptorGenerator } from './utility/base-interceptor.generator.js';
import { ProviderGenerator } from './utility/provider.generator.js';
import { MainIndexGenerator, ServiceIndexGenerator } from './utility/index.generator.js';
import { ServiceTestGenerator } from "./test/service-test-generator.js";
import { ServerUrlGenerator } from './utility/server-url.generator.js';
import { XmlBuilderGenerator } from './utility/xml-builder.generator.js';
import { InfoGenerator } from "./utility/info.generator.js";
import { MultipartBuilderGenerator } from "./utility/multipart-builder.generator.js";

export async function emitClientLibrary(outputRoot: string, parser: SwaggerParser, config: GeneratorConfig, project: Project): Promise<void> {
    new TypeGenerator(parser, project, config).generate(outputRoot);
    console.log('✅ Models generated.');

    // Always generate the info file, even if services are disabled, as it's general metadata.
    new InfoGenerator(parser, project).generate(outputRoot);

    if (config.options.generateServices ?? true) {
        const servicesDir = path.join(outputRoot, 'services');
        const controllerGroups = groupPathsByController(parser);

        for (const [controllerName, operations] of Object.entries(controllerGroups)) {
            new ServiceGenerator(parser, project, config).generateServiceFile(controllerName, operations, servicesDir);
        }
        new ServiceIndexGenerator(project).generateIndex(outputRoot);
        console.log('✅ Services generated.');

        // Generate core utilities
        new TokenGenerator(project, config.clientName).generate(outputRoot);
        new HttpParamsBuilderGenerator(project).generate(outputRoot);
        new FileDownloadGenerator(project).generate(outputRoot);
        new ServerUrlGenerator(parser, project).generate(outputRoot);
        new XmlBuilderGenerator(project).generate(outputRoot);
        new MultipartBuilderGenerator(project).generate(outputRoot);

        if (config.options.dateType === 'Date') {
            new DateTransformerGenerator(project).generate(outputRoot);
        }

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
        if (config.options.generateServiceTests ?? true) {
            console.log('📝 Generating tests for services...');
            const testGenerator = new ServiceTestGenerator(parser, project, config);
            const controllerGroupsForTest = groupPathsByController(parser);
            for (const [controllerName, operations] of Object.entries(controllerGroupsForTest)) {
                testGenerator.generateServiceTestFile(controllerName, operations, servicesDir);
            }
            console.log('✅ Service tests generated.');
        }

        if (config.options.admin) {
            await new AdminGenerator(parser, project).generate(outputRoot);
            if (config.options.generateAdminTests ?? true) {
                console.log('📝 Test generation for admin UI is stubbed.');
            }
        }
    }

    new MainIndexGenerator(project, config, parser).generateMainIndex(outputRoot);
    console.log(`🎉 Generation complete! Output written to: ${path.resolve(outputRoot)}`);
}
