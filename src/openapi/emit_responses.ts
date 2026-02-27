import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';

/**
 * Generates the `responses.ts` file.
 * Exposes reusable Response Objects from components.responses.
 */
export class ResponsesGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, 'responses.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        const responses = this.parser.spec.components?.responses ?? {};
        const hasResponses = Object.keys(responses).length > 0;

        if (!hasResponses) {
            sourceFile.replaceWithText(`${UTILITY_GENERATOR_HEADER_COMMENT}export { };\n`);
            return;
        }

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'API_RESPONSES',
                    initializer: JSON.stringify(responses, null, 2),
                },
            ],
            docs: ['Reusable Response Objects from components.responses.'],
        });

        sourceFile.formatText();
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }
}
