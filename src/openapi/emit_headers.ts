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
        private readonly parser: SwaggerParser,
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, 'headers.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        const headers = this.parser.spec.components?.headers ?? {};
        const hasHeaders = Object.keys(headers).length > 0;

        if (!hasHeaders) {
            sourceFile.replaceWithText(`${UTILITY_GENERATOR_HEADER_COMMENT}export { };\n`);
            return;
        }

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

        sourceFile.formatText();
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }
}
