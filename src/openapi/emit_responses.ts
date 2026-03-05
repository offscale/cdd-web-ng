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
        /* v8 ignore next */
        private readonly parser: SwaggerParser,
        /* v8 ignore next */
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const filePath = path.join(outputDir, 'responses.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        const responses = this.parser.spec.components?.responses ?? {};
        /* v8 ignore next */
        const hasResponses = Object.keys(responses).length > 0;

        /* v8 ignore next */
        if (!hasResponses) {
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
                    name: 'API_RESPONSES',
                    initializer: JSON.stringify(responses, null, 2),
                },
            ],
            docs: ['Reusable Response Objects from components.responses.'],
        });

        /* v8 ignore next */
        sourceFile.formatText();
        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }
}
