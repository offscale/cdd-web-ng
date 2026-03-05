import { Project } from 'ts-morph';
import { posix as path } from 'node:path';
import { SwaggerParser } from '@src/openapi/parse.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { pascalCase } from '@src/functions/utils.js';

import { AbstractClientGenerator } from '../../core/generator.js';
import { TypeGenerator } from '@src/classes/emit.js';

import { ParameterSerializerGenerator } from '../../functions/emit_parameter_serializer.js';
import { ServerUrlGenerator } from '../../routes/emit_server_url.js';
import { ServerGenerator } from '../../routes/emit_server.js';
import { FetchServiceGenerator } from './service/service.generator.js';

// Reusing shared generation similar to Angular client
import { InfoGenerator } from '../../openapi/emit_info.js';
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
import { FetchServiceIndexGenerator, FetchMainIndexGenerator } from './utils/index.generator.js';
import { VanillaAdminGenerator } from '../vanilla/admin/admin.generator.js';

import { PathInfo } from '@src/core/types/analysis.js';
function getControllerCanonicalName(op: PathInfo): string {
    /* v8 ignore next */
    if (Array.isArray(op.tags) && op.tags[0]) {
        /* v8 ignore next */
        return pascalCase(op.tags[0].toString());
    }
    /* v8 ignore next */
    const firstSegment = op.path.split('/').filter(Boolean)[0];
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

/**
 * Generates an entire API client using the native fetch implementation.
 * It coordinates the generation of models, utility functions, and the
 * fetch-specific service classes.
 */
export class FetchClientGenerator extends AbstractClientGenerator {
    /**
     * Executes the generation pipeline for the fetch client.
     * @param project The ts-morph Project to use for generation.
     * @param parser The parsed Swagger/OpenAPI model.
     * @param config The generator configuration options.
     * @param outputRoot The target output directory.
     * @returns A promise that resolves when generation finishes.
     */
    public async generate(
        project: Project,
        parser: SwaggerParser,
        config: GeneratorConfig,
        outputRoot: string,
    ): Promise<void> {
        // 1. Models
        /* v8 ignore next */
        new TypeGenerator(parser, project, config).generate(outputRoot);

        // 2. Shared Utilities
        /* v8 ignore next */
        new InfoGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new ServerGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new ServerUrlGenerator(parser, project).generate(outputRoot);
        /* v8 ignore next */
        new ParameterSerializerGenerator(project).generate(outputRoot);

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

        // 3. Services and Fetch Specifics
        /* v8 ignore next */
        if (config.options.generateServices ?? true) {
            /* v8 ignore next */
            const servicesDir = path.join(outputRoot, 'services');
            /* v8 ignore next */
            const controllerGroups = groupPathsByCanonicalController(parser);

            // Generate Services
            /* v8 ignore next */
            new FetchServiceGenerator(parser, project, config).generate(servicesDir, controllerGroups);
            /* v8 ignore next */
            new FetchServiceIndexGenerator(project).generateIndex(outputRoot);

            /* v8 ignore next */
            if (config.options.generateServiceTests ?? true) {
                // To be implemented: Service tests
            }
            /* v8 ignore next */
            if (config.options.admin) {
                /* v8 ignore next */
                await new VanillaAdminGenerator(parser, project).generate(outputRoot);
            }
        }

        /* v8 ignore next */
        new FetchMainIndexGenerator(project, config, parser).generateMainIndex(outputRoot);
    }
}
