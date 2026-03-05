import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';

/**
 * Generates the `headers.ts` file.
 * Exposes reusable Header Objects from components.headers.
 */
export class HeadersGenerator {
    constructor(
        /* v8 ignore next */
        private readonly parser: SwaggerParser,
        /* v8 ignore next */
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const filePath = path.join(outputDir, 'headers.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        const headers = this.parser.spec.components?.headers ?? {};
        /* v8 ignore next */
        const hasHeaders = Object.keys(headers).length > 0;

        /* v8 ignore next */
        if (!hasHeaders) {
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
                    name: 'API_HEADERS',
                    initializer: JSON.stringify(headers, null, 2),
                },
            ],
            docs: ['Reusable Header Objects from components.headers.'],
        });

        /* v8 ignore next */
        sourceFile.formatText();
        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }
}
