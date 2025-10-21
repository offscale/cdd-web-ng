import { Project } from 'ts-morph';
import * as path from 'path';
import { groupPathsByController } from '../parse.js';
import { SwaggerParser } from '../../core/parser.js';
import { GeneratorConfig } from '../../core/types.js';
import { TypeGenerator } from './type/type.generator.js';
import { ServiceGenerator } from './service/service.generator.js';
import { AdminGenerator } from './admin/admin.generator.js';
import { TokenGenerator } from './utility/token.generator.js';
import { HttpParamsBuilderGenerator } from './utility/http-params-builder.generator.js';
import { FileDownloadGenerator } from './utility/file-download.generator.js';
import { DateTransformerGenerator } from './utility/date-transformer.generator.js';
import { AuthTokensGenerator } from './utility/auth-tokens.generator.js'; // This import was missing
import { AuthInterceptorGenerator } from './utility/auth-interceptor.generator.js';
import { BaseInterceptorGenerator } from './utility/base-interceptor.generator.js';
import { ProviderGenerator } from './utility/provider.generator.js';
import { MainIndexGenerator, ServiceIndexGenerator } from './utility/index.generator.js';

/**
 * Main orchestrator for emitting the entire client library.
 * This function calls all the individual generators in the correct order.
 */
export async function emitClientLibrary(outputRoot: string, parser: SwaggerParser, config: GeneratorConfig, project: Project) {
    // 1. Generate Models (Types)
    new TypeGenerator(parser, project, config).generate(outputRoot);
    console.log('✅ Models generated.');

    // 2. Generate Services and Utilities if enabled
    if (config.options.generateServices ?? true) {
        const servicesDir = path.join(outputRoot, 'services');
        const controllerGroups = groupPathsByController(parser);

        for (const [controllerName, operations] of Object.entries(controllerGroups)) {
            new ServiceGenerator(parser, project, config).generateServiceFile(controllerName, operations, servicesDir);
        }
        new ServiceIndexGenerator(project).generateIndex(outputRoot);
        console.log('✅ Services generated.');

        // Generate all utility files
        new TokenGenerator(project, config.clientName).generate(outputRoot);
        new HttpParamsBuilderGenerator(project).generate(outputRoot);
        new FileDownloadGenerator(project).generate(outputRoot);
        if (config.options.dateType === 'Date') {
            new DateTransformerGenerator(project).generate(outputRoot);
        }

        const securitySchemes = parser.getSecuritySchemes();
        let interceptorResult; // <-- a variable to hold the result
        if (Object.keys(securitySchemes).length > 0) {
            new AuthTokensGenerator(project).generate(outputRoot);

            // --- FIX: Capture the result ---
            const interceptorGenerator = new AuthInterceptorGenerator(parser, project);
            interceptorResult = interceptorGenerator.generate(outputRoot);
            // --- END FIX ---
        }

        new BaseInterceptorGenerator(project, config.clientName).generate(outputRoot);

        if (interceptorResult) {
            new ProviderGenerator(parser, project, interceptorResult.tokenNames).generate(outputRoot);
        }

        console.log('✅ Utilities and providers generated.');

        // Generate Admin UI if enabled
        if (config.options.admin) {
            await new AdminGenerator(parser, project, config).generate(outputRoot);
            console.log('✅ Angular admin components generated.');
        }
    }

    // 4. Generate Main Index File
    new MainIndexGenerator(project, config).generateMainIndex(outputRoot);
    console.log(`🎉 Generation complete! Output written to: ${path.resolve(outputRoot)}`);
}
