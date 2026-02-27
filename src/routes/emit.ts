import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { PathItem } from '@src/core/types/index.js';

/**
 * Generates the `paths.ts` file.
 * Captures path-level metadata (summary/description/parameters/servers/$ref/x-*) for reverse generation.
 */
export class PathsGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, 'paths.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        const paths = this.parser.spec.paths ?? {};
        const registry: Record<string, PathItem> = {};

        Object.entries(paths).forEach(([pathKey, pathItem]) => {
            if (!pathItem || typeof pathItem !== 'object') return;

            const extensions = Object.fromEntries(
                Object.entries(pathItem as Record<string, unknown>).filter(([key]) => key.startsWith('x-')),
            );

            const meta: Record<string, unknown> = {
                ...(pathItem.$ref ? { $ref: pathItem.$ref } : {}),
                ...(pathItem.summary ? { summary: pathItem.summary } : {}),
                ...(pathItem.description ? { description: pathItem.description } : {}),
                ...(pathItem.parameters && pathItem.parameters.length > 0 ? { parameters: pathItem.parameters } : {}),
                ...(pathItem.servers && pathItem.servers.length > 0 ? { servers: pathItem.servers } : {}),
                ...extensions,
            };

            if (Object.keys(meta).length > 0) {
                registry[pathKey] = meta as PathItem;
            }
        });

        if (Object.keys(registry).length === 0) {
            sourceFile.replaceWithText(`${UTILITY_GENERATOR_HEADER_COMMENT}export { };\n`);
            return;
        }

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'API_PATHS',
                    initializer: JSON.stringify(registry, null, 2),
                },
            ],
            docs: ['Path-level metadata captured from the OpenAPI spec (summary/description/parameters/servers/x-*).'],
        });

        sourceFile.formatText();
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }
}
