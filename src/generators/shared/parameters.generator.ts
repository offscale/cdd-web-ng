import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../core/constants.js';
import { SwaggerParser } from '@src/core/parser.js';

/**
 * Generates the `parameters.ts` file.
 * Exposes reusable Parameter Objects from components.parameters.
 */
export class ParametersGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, 'parameters.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        const parameters = this.parser.spec.components?.parameters ?? {};
        const hasParameters = Object.keys(parameters).length > 0;

        if (!hasParameters) {
            sourceFile.replaceWithText(`${UTILITY_GENERATOR_HEADER_COMMENT}export { };\n`);
            return;
        }

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'API_PARAMETERS',
                    initializer: JSON.stringify(parameters, null, 2),
                },
            ],
            docs: ['Reusable Parameter Objects from components.parameters.'],
        });

        sourceFile.formatText();
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }
}
