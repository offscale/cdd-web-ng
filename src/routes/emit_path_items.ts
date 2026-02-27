import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';

/**
 * Generates the `path-items.ts` file.
 * Exposes reusable Path Item Objects from components.pathItems.
 */
export class PathItemsGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, 'path-items.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        const pathItems = this.parser.spec.components?.pathItems ?? {};
        const hasPathItems = Object.keys(pathItems).length > 0;

        if (!hasPathItems) {
            sourceFile.replaceWithText(`${UTILITY_GENERATOR_HEADER_COMMENT}export { };\n`);
            return;
        }

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'API_PATH_ITEMS',
                    initializer: JSON.stringify(pathItems, null, 2),
                },
            ],
            docs: ['Reusable Path Item Objects from components.pathItems.'],
        });

        sourceFile.formatText();
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }
}
