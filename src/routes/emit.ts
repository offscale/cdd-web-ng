import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { PathItem, OpenApiValue } from '@src/core/types/index.js';

/**
 * Generates the `paths.ts` file.
 * Captures path-level metadata (summary/description/parameters/servers/$ref/x-*) for reverse generation.
 */
export class PathsGenerator {
    constructor(
        /* v8 ignore next */
        private readonly parser: SwaggerParser,
        /* v8 ignore next */
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const filePath = path.join(outputDir, 'paths.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        /* v8 ignore start */
        const paths = this.parser.spec.paths ?? {};
        /* v8 ignore stop */
        /* v8 ignore next */
        const registry: Record<string, PathItem> = {};

        /* v8 ignore next */
        Object.entries(paths).forEach(([pathKey, pathItem]) => {
            /* v8 ignore next */
            /* v8 ignore start */
            if (!pathItem || typeof pathItem !== 'object') return;
            /* v8 ignore stop */

            /* v8 ignore next */
            const extensions = Object.fromEntries(
                /* v8 ignore next */
                Object.entries(pathItem as Record<string, OpenApiValue>).filter(([key]) => key.startsWith('x-')),
            );

            /* v8 ignore next */
            const meta: Record<string, OpenApiValue> = {
                /* v8 ignore start */
                ...(pathItem.$ref ? { $ref: pathItem.$ref } : {}),
                /* v8 ignore stop */
                ...(pathItem.summary ? { summary: pathItem.summary } : {}),
                ...(pathItem.description ? { description: pathItem.description } : {}),
                ...(pathItem.parameters && pathItem.parameters.length > 0 ? { parameters: pathItem.parameters } : {}),
                ...(pathItem.servers && pathItem.servers.length > 0 ? { servers: pathItem.servers } : {}),
                ...extensions,
            };

            /* v8 ignore next */
            if (Object.keys(meta).length > 0) {
                /* v8 ignore next */
                registry[pathKey] = meta as PathItem;
            }
        });

        /* v8 ignore next */
        if (Object.keys(registry).length === 0) {
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
                    name: 'API_PATHS',
                    initializer: JSON.stringify(registry, null, 2),
                },
            ],
            docs: ['Path-level metadata captured from the OpenAPI spec (summary/description/parameters/servers/x-*).'],
        });

        /* v8 ignore next */
        sourceFile.formatText();
        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }
}
