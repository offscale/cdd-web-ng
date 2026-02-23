import { Project } from 'ts-morph';

import { posix as path } from 'node:path';

import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { camelCase, pascalCase } from '@src/core/utils/index.js';

import { AbstractClientGenerator } from '../../core/generator.js';

// Core Generators
import { TypeGenerator } from '@src/generators/shared/type.generator.js';

// Angular Generators
import { AdminGenerator } from './admin/admin.generator.js';
import { ServiceGenerator } from './service/service.generator.js';
import { ServiceTestGenerator } from './test/service-test-generator.js';

// Angular Utilities
import { TokenGenerator } from './utils/token.generator.js';
// NOTE: HttpParamsBuilderGenerator is replaced/gutted, ensuring only Codec generation if present,
// but typically for full abstraction we assume logic moved to shared.
// We keep it if it generates the ApiParameterCodec only.
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
import { LinkSetParserGenerator } from './utils/link-set-parser.generator.js';
import { ExtensionTokensGenerator } from './utils/extension-tokens.generator.js';
import { WebhookHelperGenerator } from './utils/webhook-helper.generator.js';

// Shared Utilities
import { ParameterSerializerGenerator } from '../shared/parameter-serializer.generator.js';
import { ServerGenerator } from '../shared/server.generator.js';
import { ServerUrlGenerator } from '../shared/server-url.generator.js';
import { XmlBuilderGenerator } from '../shared/xml-builder.generator.js';
import { XmlParserGenerator } from '../shared/xml-parser.generator.js';
import { ContentDecoderGenerator } from '../shared/content-decoder.generator.js';
import { ContentEncoderGenerator } from '../shared/content-encoder.generator.js';
import { InfoGenerator } from '../shared/info.generator.js';
import { MultipartBuilderGenerator } from '../shared/multipart-builder.generator.js';
import { ResponseHeaderRegistryGenerator } from '../shared/response-header-registry.generator.js';
import { CallbackGenerator } from '@src/generators/shared/callback.generator.js';
import { WebhookGenerator } from '@src/generators/shared/webhook.generator.js';
import { LinkGenerator } from '@src/generators/shared/link.generator.js';
import { DiscriminatorGenerator } from '@src/generators/shared/discriminator.generator.js';
import { SecurityGenerator } from '@src/generators/shared/security.generator.js';
import { TagGenerator } from '@src/generators/shared/tag.generator.js';
import { ExamplesGenerator } from '@src/generators/shared/examples.generator.js';
import { MediaTypesGenerator } from '@src/generators/shared/media-types.generator.js';
import { PathsGenerator } from '@src/generators/shared/paths.generator.js';
import { PathItemsGenerator } from '@src/generators/shared/path-items.generator.js';
import { HeadersGenerator } from '@src/generators/shared/headers.generator.js';
import { ParametersGenerator } from '@src/generators/shared/parameters.generator.js';
import { RequestBodiesGenerator } from '@src/generators/shared/request-bodies.generator.js';
import { ResponsesGenerator } from '@src/generators/shared/responses.generator.js';
import { SpecSnapshotGenerator } from '@src/generators/shared/spec-snapshot.generator.js';
import { DocumentMetaGenerator } from '@src/generators/shared/document-meta.generator.js';

// type-coverage:ignore-next-line
function getControllerCanonicalName(op: any): string {
    // type-coverage:ignore-next-line
    if (Array.isArray(op.tags) && op.tags[0]) {
        // type-coverage:ignore-next-line
        return pascalCase(op.tags[0].toString());
    }
    // type-coverage:ignore-next-line
    const firstSegment = op.path.split('/').filter(Boolean)[0];
    // type-coverage:ignore-next-line
    return firstSegment ? pascalCase(firstSegment) : 'Default';
}

function groupPathsByCanonicalController(parser: SwaggerParser): Record<string, any[]> {
    const groups: Record<string, any[]> = {};
    for (const op of parser.operations) {
        const group = getControllerCanonicalName(op);
        if (!groups[group]) groups[group] = [];
        groups[group].push(op);
    }
    return groups;
}

export class AngularClientGenerator extends AbstractClientGenerator {
    public async generate(
        project: Project,
        parser: SwaggerParser,
        config: GeneratorConfig,
        outputRoot: string,
    ): Promise<void> {
        // 1. Models
        new TypeGenerator(parser, project, config).generate(outputRoot);
        console.log('✅ Models generated.');

        // 2. Shared Utilities
        new InfoGenerator(parser, project).generate(outputRoot);
        new ServerGenerator(parser, project).generate(outputRoot);
        new ServerUrlGenerator(parser, project).generate(outputRoot);
        new ParameterSerializerGenerator(project).generate(outputRoot); // NEW

        new CallbackGenerator(parser, project).generate(outputRoot);
        new WebhookGenerator(parser, project).generate(outputRoot);
        new LinkGenerator(parser, project).generate(outputRoot);
        new DiscriminatorGenerator(parser, project).generate(outputRoot);
        new SecurityGenerator(parser, project).generate(outputRoot);
        new TagGenerator(parser, project).generate(outputRoot);
        new ExamplesGenerator(parser, project).generate(outputRoot);
        new MediaTypesGenerator(parser, project).generate(outputRoot);
        new PathsGenerator(parser, project).generate(outputRoot);
        new PathItemsGenerator(parser, project).generate(outputRoot);
        new HeadersGenerator(parser, project).generate(outputRoot);
        new ParametersGenerator(parser, project).generate(outputRoot);
        new RequestBodiesGenerator(parser, project).generate(outputRoot);
        new ResponsesGenerator(parser, project).generate(outputRoot);
        new DocumentMetaGenerator(parser, project).generate(outputRoot);
        new SpecSnapshotGenerator(parser, project).generate(outputRoot);

        // 3. Services and Angular Specifics
        if (config.options.generateServices ?? true) {
            const servicesDir = path.join(outputRoot, 'services');
            const controllerGroups = groupPathsByCanonicalController(parser);

            // Generate Services using the Refactored Service Generator
            new ServiceGenerator(parser, project, config).generate(servicesDir, controllerGroups);

            new ServiceIndexGenerator(project).generateIndex(outputRoot);
            console.log('✅ Services generated.');

            // Generate Utilities (tokens, helpers, etc)
            new TokenGenerator(project, config.clientName).generate(outputRoot);
            new ExtensionTokensGenerator(project).generate(outputRoot);
            // Note: This now likely only generates the ApiParameterCodec
            new HttpParamsBuilderGenerator(project).generate(outputRoot);

            new FileDownloadGenerator(project).generate(outputRoot);
            new XmlBuilderGenerator(project).generate(outputRoot);
            new XmlParserGenerator(project).generate(outputRoot);
            new ContentDecoderGenerator(project).generate(outputRoot);
            new ContentEncoderGenerator(project).generate(outputRoot);
            new MultipartBuilderGenerator(project).generate(outputRoot);
            new LinkServiceGenerator(parser, project).generate(outputRoot);
            new ResponseHeaderRegistryGenerator(parser, project).generate(outputRoot);
            new LinkSetParserGenerator(project).generate(outputRoot);
            new ResponseHeaderParserGenerator(project).generate(outputRoot);
            new WebhookHelperGenerator(parser, project).generate(outputRoot);

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
                const controllerGroupsForTest = groupPathsByCanonicalController(parser);
                for (const [controllerName, operations] of Object.entries(controllerGroupsForTest)) {
                    // type-coverage:ignore-next-line
                    for (const op of operations) {
                        // type-coverage:ignore-next-line
                        if (!op.methodName) {
                            // type-coverage:ignore-next-line
                            if (op.operationId) op.methodName = camelCase(op.operationId);
                        }
                    }
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
}
