// ./src/service/emit/orchestrator.ts

import { Project } from 'ts-morph';
import { posix as path } from 'path';
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
import { AuthTokensGenerator } from './utility/auth-tokens.generator.js';
import { AuthInterceptorGenerator } from './utility/auth-interceptor.generator.js';
import { OAuthHelperGenerator } from './utility/oauth-helper.generator.js';
import { BaseInterceptorGenerator } from './utility/base-interceptor.generator.js';
import { ProviderGenerator } from './utility/provider.generator.js';
import { MainIndexGenerator, ServiceIndexGenerator } from './utility/index.generator.js';
// *** FIX: Import the generators that will be injected ***
import { FormComponentGenerator } from './admin/form-component.generator.js';
import { ListComponentGenerator } from './admin/list-component.generator.js';

export async function emitClientLibrary(outputRoot: string, parser: SwaggerParser, config: GeneratorConfig, project: Project) {
    // 1. Generate Models (Types)
    new TypeGenerator(parser, project, config).generate(outputRoot);
    console.log('✅ Models generated.');

    if (config.options.generateServices ?? true) {
        // ... service and utility generation as before ...
        const servicesDir = path.join(outputRoot, 'services');
        const controllerGroups = groupPathsByController(parser);
        new ServiceGenerator(parser, project, config).generate(servicesDir, controllerGroups);
        new ServiceIndexGenerator(project).generateIndex(outputRoot);
        console.log('✅ Services generated.');

        // ... all other utility generators are instantiated here ...
        new TokenGenerator(project, config.clientName).generate(outputRoot);
        // ... (etc.)

        console.log('✅ Utilities and providers generated.');

        // Generate Admin UI if enabled
        if (config.options.admin) {
            // *** FIX: Instantiate all admin-related generators here ***
            const formComponentGenerator = new FormComponentGenerator(project);
            const listComponentGenerator = new ListComponentGenerator(project);

            // *** FIX: Inject the instances into the AdminGenerator ***
            const adminGenerator = new AdminGenerator(parser, project, config, formComponentGenerator, listComponentGenerator);

            await adminGenerator.generate(outputRoot);
            console.log('✅ Angular admin components generated.');
        }
    }

    new MainIndexGenerator(project, config, parser).generateMainIndex(outputRoot);
    console.log(`🎉 Generation complete! Output written to: ${path.resolve(outputRoot)}`);
}
