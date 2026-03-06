import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { TagObject, OpenApiValue } from '@src/core/types/index.js';

export class TagGenerator {
    constructor(
        /* v8 ignore next */
        private readonly parser: SwaggerParser,
        /* v8 ignore next */
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const filePath = path.join(outputDir, 'tags.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        const tagsFound = this.parser.spec.tags || [];
        /* v8 ignore next */
        const extractExtensions = (tag: Record<string, OpenApiValue>) =>
            /* v8 ignore next */
            Object.fromEntries(Object.entries(tag).filter(([key]) => key.startsWith('x-')));

        // type-coverage:ignore-next-line
        /* v8 ignore next */
        const registry: TagObject[] = tagsFound.map((t: import('@src/core/types/index.js').TagObject) => ({
            // type-coverage:ignore-next-line
            name: t.name,
            // type-coverage:ignore-next-line
            ...(t.summary ? { summary: t.summary } : {}),
            // type-coverage:ignore-next-line
            ...(t.description ? { description: t.description } : {}),
            // type-coverage:ignore-next-line
            ...(t.externalDocs ? { externalDocs: t.externalDocs } : {}),
            // type-coverage:ignore-next-line
            ...(t.parent ? { parent: t.parent } : {}),
            // type-coverage:ignore-next-line
            ...(t.kind ? { kind: t.kind } : {}),
            ...extractExtensions(t),
        }));

        /* v8 ignore next */
        const mapRegistry: Record<string, TagObject> = {};
        /* v8 ignore next */
        registry.forEach(t => {
            /* v8 ignore next */
            mapRegistry[t.name] = t;
        });

        /* v8 ignore next */
        if (registry.length > 0) {
            /* v8 ignore next */
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: 'API_TAGS',
                        initializer: JSON.stringify(registry, null, 2),
                    },
                ],
                docs: ['List of API Tags with metadata.'],
            });

            /* v8 ignore next */
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: 'API_TAGS_MAP',
                        initializer: JSON.stringify(mapRegistry, null, 2),
                    },
                ],
                docs: ['Lookup map for API Tags by name.'],
            });
        } else {
            /* v8 ignore next */
            sourceFile.addStatements('export {};');
        }

        /* v8 ignore next */
        sourceFile.formatText();
        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }
}
