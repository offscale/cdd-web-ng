// src/service/emit/orchestrator.ts (Corrected)

import { Project } from 'ts-morph';
import { posix as path } from 'path';
import { groupPathsByController } from '../parse.js';
import { SwaggerParser } from '../../core/parser.js';
import { GeneratorConfig } from '../../core/types.js';
import { TypeGenerator } from './type/type.generator.js';
import { ServiceGenerator } from './service/service.generator.js';
import { AdminGenerator } from './admin/admin.generator.js';
import { TokenGenerator } from './utility/token.generator.js';
// FIX: Correct the import to match the renamed file.
import { HttpParamsBuilderGenerator } from './utility/http-params-builder.js';
import { FileDownloadGenerator } from './utility/file-download.generator.js';
import { DateTransformerGenerator } from './utility/date-transformer.generator.js';
import { AuthTokensGenerator } from './utility/auth-tokens.generator.js';
import { AuthInterceptorGenerator } from './utility/auth-interceptor.generator.js';
import { OAuthHelperGenerator } from './utility/oauth-helper.generator.js';
import { BaseInterceptorGenerator } from './utility/base-interceptor.generator.js';
import { ProviderGenerator } from './utility/provider.generator.js';
import { MainIndexGenerator, ServiceIndexGenerator } from './utility/index.generator.js';

// ... rest of the file is unchanged ...
export async function emitClientLibrary(outputRoot: string, parser: SwaggerParser, config: GeneratorConfig, project: Project) {
    new TypeGenerator(parser, project, config).generate(outputRoot);
    console.log('✅ Models generated.');

    if (config.options.generateServices ?? true) {
        const servicesDir = path.join(outputRoot, 'services');
        const controllerGroups = groupPathsByController(parser);

        for (const [controllerName, operations] of Object.entries(controllerGroups)) {
            new ServiceGenerator(parser, project, config).generateServiceFile(controllerName, operations, servicesDir);
        }
        new ServiceIndexGenerator(project).generateIndex(outputRoot);
        console.log('✅ Services generated.');

        new TokenGenerator(project, config.clientName).generate(outputRoot);
        new HttpParamsBuilderGenerator(project).generate(outputRoot);
        new FileDownloadGenerator(project).generate(outputRoot);
        if (config.options.dateType === 'Date') {
            new DateTransformerGenerator(project).generate(outputRoot);
        }

        const securitySchemes = parser.getSecuritySchemes();
        let tokenNames: string[] = [];
        if (Object.keys(securitySchemes).length > 0) {
            new AuthTokensGenerator(project).generate(outputRoot);

            const interceptorGenerator = new AuthInterceptorGenerator(parser, project);
            const interceptorResult = interceptorGenerator.generate(outputRoot);
            if (interceptorResult) {
                tokenNames = interceptorResult.tokenNames;
            }

            if (Object.values(securitySchemes).some(s => s.type === 'oauth2')) {
                new OAuthHelperGenerator(parser, project).generate(outputRoot);
            }
        }

        new BaseInterceptorGenerator(project, config.clientName).generate(outputRoot);
        new ProviderGenerator(parser, project, tokenNames).generate(outputRoot);

        console.log('✅ Utilities and providers generated.');

        if (config.options.admin) {
            await new AdminGenerator(parser, project, config).generate(outputRoot);
            console.log('✅ Angular admin components generated.');
        }
    }

    new MainIndexGenerator(project, config, parser).generateMainIndex(outputRoot);
    console.log(`🎉 Generation complete! Output written to: ${path.resolve(outputRoot)}`);
}
