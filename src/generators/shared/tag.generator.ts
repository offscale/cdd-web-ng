import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../core/constants.js';
import { SwaggerParser } from '@src/core/parser.js';
import { TagObject } from '@src/core/types/index.js';

export class TagGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, 'tags.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        const tagsFound = this.parser.spec.tags || [];

        const registry: TagObject[] = tagsFound.map((t: any) => ({
            name: t.name,
            ...(t.summary ? { summary: t.summary } : {}),
            ...(t.description ? { description: t.description } : {}),
            ...(t.externalDocs ? { externalDocs: t.externalDocs } : {}),
            ...(t.parent ? { parent: t.parent } : {}),
            ...(t.kind ? { kind: t.kind } : {}),
        }));

        const mapRegistry: Record<string, TagObject> = {};
        registry.forEach(t => {
            mapRegistry[t.name] = t;
        });

        if (registry.length > 0) {
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
            sourceFile.addStatements('export {};');
        }

        sourceFile.formatText();
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }
}
