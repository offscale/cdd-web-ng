import { SwaggerParser } from '@src/openapi/parse.js';
import { writeOpenApiSnapshot } from '@src/openapi/parse_snapshot.js';
import { Project } from 'ts-morph';
import { OpenApiValue } from '@src/core/types/index.js';

export class SpecSnapshotGenerator {
    constructor(
        /* v8 ignore next */
        private readonly parser: SwaggerParser,
        /* v8 ignore next */
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        writeOpenApiSnapshot(
            this.parser.getSpec(),
            outputDir,
            this.project.getFileSystem() as OpenApiValue as import('@src/openapi/parse_snapshot.js').SnapshotFileSystem,
        );
    }
}
