import { SwaggerParser } from '@src/core/parser.js';
import { writeOpenApiSnapshot } from '@src/core/utils/openapi-snapshot.js';
import { Project } from 'ts-morph';

/**
 * Generates OpenAPI snapshot files alongside generated client output.
 *
 * These snapshots preserve the input specification in JSON/YAML so the
 * `to_openapi` command can reconstruct the API contract from generated codebases.
 */
export class SpecSnapshotGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        writeOpenApiSnapshot(this.parser.getSpec(), outputDir, this.project.getFileSystem());
    }
}
