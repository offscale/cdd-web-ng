import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../core/constants.js';
import { SwaggerParser } from '@src/core/parser.js';

/**
 * Generates the `request-bodies.ts` file.
 * Exposes reusable Request Body Objects from components.requestBodies.
 */
export class RequestBodiesGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, 'request-bodies.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        const requestBodies = this.parser.spec.components?.requestBodies ?? {};
        const hasRequestBodies = Object.keys(requestBodies).length > 0;

        if (!hasRequestBodies) {
            sourceFile.replaceWithText(`${UTILITY_GENERATOR_HEADER_COMMENT}export { };\n`);
            return;
        }

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'API_REQUEST_BODIES',
                    initializer: JSON.stringify(requestBodies, null, 2),
                },
            ],
            docs: ['Reusable Request Body Objects from components.requestBodies.'],
        });

        sourceFile.formatText();
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }
}
