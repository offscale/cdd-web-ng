import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../core/constants.js';
import { SwaggerParser } from '@src/core/parser.js';

/**
 * Generates the `media-types.ts` file.
 * Exposes reusable Media Type Objects from components.mediaTypes.
 */
export class MediaTypesGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, 'media-types.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        const mediaTypes = this.parser.spec.components?.mediaTypes ?? {};
        const hasMediaTypes = Object.keys(mediaTypes).length > 0;

        if (!hasMediaTypes) {
            sourceFile.replaceWithText(`${UTILITY_GENERATOR_HEADER_COMMENT}export { };\n`);
            return;
        }

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'API_MEDIA_TYPES',
                    initializer: JSON.stringify(mediaTypes, null, 2),
                },
            ],
            docs: ['Reusable Media Type Objects from components.mediaTypes.'],
        });

        sourceFile.formatText();
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }
}
