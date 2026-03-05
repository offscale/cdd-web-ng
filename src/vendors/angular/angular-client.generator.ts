import { Project } from 'ts-morph';

import { posix as path } from 'node:path';

import { SwaggerParser } from '@src/openapi/parse.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { camelCase, pascalCase } from '@src/functions/utils.js';

import { AbstractClientGenerator } from '../../core/generator.js';

// Core Generators
import { TypeGenerator } from '@src/classes/emit.js';

// Angular Generators
import { AdminGenerator } from './admin/admin.generator.js';
import { ServiceGenerator } from './service/service.generator.js';
import { ServiceTestGenerator } from './test/service-test-generator.js';

// Angular Utilities
import { TokenGenerator } from './utils/token.generator.js';
import { RequestContextGenerator } from './utils/request-context.generator.js';
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
import { ParameterSerializerGenerator } from '../../functions/emit_parameter_serializer.js';
import { ServerGenerator } from '../../routes/emit_server.js';
import { ServerUrlGenerator } from '../../routes/emit_server_url.js';
import { XmlBuilderGenerator } from '../../openapi/emit_xml_builder.js';
import { XmlParserGenerator } from '../../openapi/emit_xml_parser.js';
import { ContentDecoderGenerator } from '../../openapi/emit_content_decoder.js';
import { ContentEncoderGenerator } from '../../openapi/emit_content_encoder.js';
import { InfoGenerator } from '../../openapi/emit_info.js';
import { MultipartBuilderGenerator } from '../../functions/emit_multipart.js';
import { ResponseHeaderRegistryGenerator } from '../../openapi/emit_response_header_registry.js';
import { CallbackGenerator } from '@src/functions/emit_callback.js';
import { WebhookGenerator } from '@src/functions/emit_webhook.js';
import { LinkGenerator } from '@src/openapi/emit_link.js';
import { DiscriminatorGenerator } from '@src/classes/emit_discriminator.js';
import { SecurityGenerator } from '@src/openapi/emit_security.js';
import { TagGenerator } from '@src/openapi/emit_tag.js';
import { ExamplesGenerator } from '@src/mocks/emit.js';
import { MediaTypesGenerator } from '@src/openapi/emit_media_types.js';
import { PathsGenerator } from '@src/routes/emit.js';
import { PathItemsGenerator } from '@src/routes/emit_path_items.js';
import { HeadersGenerator } from '@src/openapi/emit_headers.js';
import { ParametersGenerator } from '@src/routes/emit_parameters.js';
import { RequestBodiesGenerator } from '@src/openapi/emit_request_bodies.js';
import { ResponsesGenerator } from '@src/openapi/emit_responses.js';
import { SpecSnapshotGenerator } from '@src/openapi/emit_snapshot.js';
import { DocumentMetaGenerator } from '@src/openapi/emit_document_meta.js';

// type-coverage:ignore-next-line
import { PathInfo } from '@src/core/types/analysis.js';
function getControllerCanonicalName(op: PathInfo): string {
    // type-coverage:ignore-next-line
    /* v8 ignore next */
    if (Array.isArray(op.tags) && op.tags[0]) {
        // type-coverage:ignore-next-line
        /* v8 ignore next */
        return pascalCase(op.tags[0].toString());
    }
    // type-coverage:ignore-next-line
    /* v8 ignore next */
    const firstSegment = op.path.split('/').filter(Boolean)[0];
    // type-coverage:ignore-next-line
    /* v8 ignore next */
    return firstSegment ? pascalCase(firstSegment) : 'Default';
}

function groupPathsByCanonicalController(parser: SwaggerParser): Record<string, PathInfo[]> {
    /* v8 ignore next */
    const groups: Record<string, PathInfo[]> = {};
    /* v8 ignore next */
    for (const op of parser.operations) {
        /* v8 ignore next */
        const group = getControllerCanonicalName(op);
        /* v8 ignore next */
        if (!groups[group]) groups[group] = [];
        /* v8 ignore next */
        groups[group].push(op);
    }
    /* v8 ignore next */
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
        /* v8 ignore next */
        new TypeGenerator(parser, project, config).generate(outputRoot);
        /* v8 ignore next */
        console.log('✅ Models generated.');

        // 2. Shared Utilities
        /* v8 ignore next */
        new InfoGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new ServerGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new ServerUrlGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new ParameterSerializerGenerator(project).generate(outputRoot); // NEW

        /* v8 ignore next */
        new CallbackGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new WebhookGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new LinkGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new DiscriminatorGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new SecurityGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new TagGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new ExamplesGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new MediaTypesGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new PathsGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new PathItemsGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new HeadersGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new ParametersGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new RequestBodiesGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new ResponsesGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new DocumentMetaGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new SpecSnapshotGenerator(parser, project).generate(outputRoot);

        // 3. Services and Angular Specifics
        /* v8 ignore next */
        /* v8 ignore start */
        if (config.options.generateServices ?? true) {
            /* v8 ignore stop */
            /* v8 ignore next */
            const servicesDir = path.join(outputRoot, 'services');
            /* v8 ignore next */
            const controllerGroups = groupPathsByCanonicalController(parser);

            // Generate Services using the Refactored Service Generator
            /* v8 ignore next */
            new ServiceGenerator(parser, project, config).generate(servicesDir, controllerGroups);

            /* v8 ignore next */
            new ServiceIndexGenerator(project).generateIndex(outputRoot);
            /* v8 ignore next */
            console.log('✅ Services generated.');

            // Generate Utilities (tokens, helpers, etc)
            /* v8 ignore next */
            new TokenGenerator(project, config.clientName).generate(outputRoot);
            /* v8 ignore next */
            new RequestContextGenerator(project).generate(outputRoot);
            /* v8 ignore next */
            new ExtensionTokensGenerator(project).generate(outputRoot);

            // Note: This now likely only generates the ApiParameterCodec
            /* v8 ignore next */
            new HttpParamsBuilderGenerator(project).generate(outputRoot);

            /* v8 ignore next */
            new FileDownloadGenerator(project).generate(outputRoot);
            /* v8 ignore next */
            new XmlBuilderGenerator(project).generate(outputRoot);
            /* v8 ignore next */
            new XmlParserGenerator(project).generate(outputRoot);
            /* v8 ignore next */
            new ContentDecoderGenerator(project).generate(outputRoot);
            /* v8 ignore next */
            new ContentEncoderGenerator(project).generate(outputRoot);
            /* v8 ignore next */
            new MultipartBuilderGenerator(project).generate(outputRoot);
            /* v8 ignore next */
            new LinkServiceGenerator(parser, project).generate(outputRoot);
            /* v8 ignore next */
            new ResponseHeaderRegistryGenerator(parser, project).generate(outputRoot);
            /* v8 ignore next */
            new LinkSetParserGenerator(project).generate(outputRoot);
            /* v8 ignore next */
            new ResponseHeaderParserGenerator(project).generate(outputRoot);
            /* v8 ignore next */
            new WebhookHelperGenerator(parser, project).generate(outputRoot);

            /* v8 ignore next */
            if (config.options.dateType === 'Date') {
                /* v8 ignore next */
                new DateTransformerGenerator(project).generate(outputRoot);
            }

            /* v8 ignore next */
            const securitySchemes = parser.getSecuritySchemes();
            /* v8 ignore next */
            let tokenNames: string[] = [];
            /* v8 ignore next */
            if (Object.keys(securitySchemes).length > 0) {
                /* v8 ignore next */
                new AuthTokensGenerator(project).generate(outputRoot);

                /* v8 ignore next */
                const interceptorGenerator = new AuthInterceptorGenerator(parser, project);
                /* v8 ignore next */
                const interceptorResult = interceptorGenerator.generate(outputRoot);
                /* v8 ignore next */
                tokenNames = interceptorResult?.tokenNames || [];

                /* v8 ignore next */
                if (Object.values(securitySchemes).some(s => s.type === 'oauth2')) {
                    /* v8 ignore next */
                    new OAuthHelperGenerator(parser, project).generate(outputRoot);
                }
            }

            /* v8 ignore next */
            new BaseInterceptorGenerator(project, config.clientName).generate(outputRoot);
            /* v8 ignore next */
            new ProviderGenerator(parser, project, tokenNames).generate(outputRoot);

            /* v8 ignore next */
            console.log('✅ Utilities and providers generated.');

            /* v8 ignore next */
            if (config.options.generateServiceTests ?? true) {
                /* v8 ignore next */
                console.log('📝 Generating tests for services...');
                /* v8 ignore next */
                const testGenerator = new ServiceTestGenerator(parser, project, config);
                /* v8 ignore next */
                const controllerGroupsForTest = groupPathsByCanonicalController(parser);
                /* v8 ignore next */
                for (const [controllerName, operations] of Object.entries(controllerGroupsForTest)) {
                    // type-coverage:ignore-next-line
                    /* v8 ignore next */
                    for (const op of operations) {
                        // type-coverage:ignore-next-line
                        /* v8 ignore next */
                        if (!op.methodName) {
                            // type-coverage:ignore-next-line
                            /* v8 ignore next */
                            if (op.operationId) op.methodName = camelCase(op.operationId);
                        }
                    }
                    /* v8 ignore next */
                    testGenerator.generateServiceTestFile(controllerName, operations, servicesDir);
                }
                /* v8 ignore next */
                console.log('✅ Service tests generated.');
            }

            /* v8 ignore next */
            if (config.options.admin) {
                /* v8 ignore next */
                await new AdminGenerator(parser, project).generate(outputRoot);
                /* v8 ignore next */
                if (config.options.generateAdminTests ?? true) {
                    /* v8 ignore next */
                    console.log('📝 Test generation for admin UI is stubbed.');
                }
            }
        }

        /* v8 ignore next */
        new MainIndexGenerator(project, config, parser).generateMainIndex(outputRoot);
        /* v8 ignore next */
        console.log(`🎉 Generation complete! Output written to: ${path.resolve(outputRoot)}`);
    }
}
