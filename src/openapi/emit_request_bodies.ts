import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';

/**
 * Generates the `request-bodies.ts` file.
 * Exposes reusable Request Body Objects from components.requestBodies.
 */
export class RequestBodiesGenerator {
    constructor(
        /* v8 ignore next */
        private readonly parser: SwaggerParser,
        /* v8 ignore next */
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const filePath = path.join(outputDir, 'request-bodies.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        const requestBodies = this.parser.spec.components?.requestBodies ?? {};
        /* v8 ignore next */
        const hasRequestBodies = Object.keys(requestBodies).length > 0;

        /* v8 ignore next */
        if (!hasRequestBodies) {
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
                    name: 'API_REQUEST_BODIES',
                    initializer: JSON.stringify(requestBodies, null, 2),
                },
            ],
            docs: ['Reusable Request Body Objects from components.requestBodies.'],
        });

        /* v8 ignore next */
        sourceFile.formatText();
        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }
}
