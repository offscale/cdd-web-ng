import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';

/**
 * Generates the `parameters.ts` file.
 * Exposes reusable Parameter Objects from components.parameters.
 */
export class ParametersGenerator {
    constructor(
        /* v8 ignore next */
        private readonly parser: SwaggerParser,
        /* v8 ignore next */
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const filePath = path.join(outputDir, 'parameters.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        const parameters = this.parser.spec.components?.parameters ?? {};
        /* v8 ignore next */
        const hasParameters = Object.keys(parameters).length > 0;

        /* v8 ignore next */
        if (!hasParameters) {
            /* v8 ignore next */
            sourceFile.replaceWithText(`${UTILITY_GENERATOR_HEADER_COMMENT}export { };\n`);
            /* v8 ignore next */
            return;
        }

        /* v8 ignore next */
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

        /* v8 ignore next */
        sourceFile.formatText();
        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }
}
