import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';

/**
 * Generates the `examples.ts` file.
 * Exposes reusable Example Objects from components.examples.
 */
export class ExamplesGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, 'examples.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        const examples = this.parser.spec.components?.examples ?? {};
        const hasExamples = Object.keys(examples).length > 0;

        if (!hasExamples) {
            sourceFile.replaceWithText(`${UTILITY_GENERATOR_HEADER_COMMENT}export { };\n`);
            return;
        }

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'API_EXAMPLES',
                    initializer: JSON.stringify(examples, null, 2),
                },
            ],
            docs: ['Reusable Example Objects from components.examples.'],
        });

        sourceFile.formatText();
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }
}
