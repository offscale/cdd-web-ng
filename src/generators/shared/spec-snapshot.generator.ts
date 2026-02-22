import { SwaggerParser } from '@src/core/parser.js';
import { writeOpenApiSnapshot } from '@src/core/utils/openapi-snapshot.js';
import { Project } from 'ts-morph';

export class SpecSnapshotGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        writeOpenApiSnapshot(this.parser.getSpec(), outputDir, this.project.getFileSystem() as any);
    }
}
