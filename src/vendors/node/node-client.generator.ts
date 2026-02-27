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
import { NodeServiceGenerator } from './service/service.generator.js';

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
import { NodeServiceIndexGenerator, NodeMainIndexGenerator } from './utils/index.generator.js';

function getControllerCanonicalName(op: any): string {
    if (Array.isArray(op.tags) && op.tags[0]) {
        return pascalCase(op.tags[0].toString());
    }
    const firstSegment = op.path.split('/').filter(Boolean)[0];
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

/**
 * Generates an entire API client using the Node.js implementation.
 * It coordinates the generation of models, utility functions, and the
 * Node-specific service classes.
 */
export class NodeClientGenerator extends AbstractClientGenerator {
    /**
     * Executes the generation pipeline for the node client.
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
        new TypeGenerator(parser, project, config).generate(outputRoot);

        // 2. Shared Utilities
        new InfoGenerator(parser, project).generate(outputRoot);
        new ServerGenerator(parser, project).generate(outputRoot);
        new ServerUrlGenerator(parser, project).generate(outputRoot);
        new ParameterSerializerGenerator(project).generate(outputRoot);

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

        // 3. Services and Node Specifics
        if (config.options.generateServices ?? true) {
            const servicesDir = path.join(outputRoot, 'services');
            const controllerGroups = groupPathsByCanonicalController(parser);

            // Generate Services
            new NodeServiceGenerator(parser, project, config).generate(servicesDir, controllerGroups);
            new NodeServiceIndexGenerator(project).generateIndex(outputRoot);

            if (config.options.generateServiceTests ?? true) {
                // To be implemented: Service tests
            }
        }

        new NodeMainIndexGenerator(project, config, parser).generateMainIndex(outputRoot);
    }
}
