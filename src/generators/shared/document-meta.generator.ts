import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../core/constants.js';
import { SwaggerParser } from '@src/core/parser.js';

/**
 * Generates the `document.ts` file.
 * Exports document-level OpenAPI/Swagger metadata to support reverse generation.
 */
export class DocumentMetaGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, 'document.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addInterface({
            name: 'ApiDocumentMeta',
            isExported: true,
            properties: [
                { name: 'openapi', type: 'string', hasQuestionToken: true },
                { name: 'swagger', type: 'string', hasQuestionToken: true },
                { name: '$self', type: 'string', hasQuestionToken: true },
                { name: 'jsonSchemaDialect', type: 'string', hasQuestionToken: true },
            ],
            docs: ['Document-level OpenAPI/Swagger metadata captured from the source spec.'],
        });

        const spec = this.parser.getSpec();
        const meta = {
            ...(spec.openapi ? { openapi: spec.openapi } : {}),
            ...(spec.swagger ? { swagger: spec.swagger } : {}),
            ...(spec.$self ? { $self: spec.$self } : {}),
            ...(spec.jsonSchemaDialect ? { jsonSchemaDialect: spec.jsonSchemaDialect } : {}),
        };

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'API_DOCUMENT_META',
                    type: 'ApiDocumentMeta',
                    initializer: JSON.stringify(meta, null, 2),
                },
            ],
            docs: ['OpenAPI document metadata used for reverse generation.'],
        });

        sourceFile.formatText();
    }
}
