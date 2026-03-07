import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';

/**
 * Generates the `info.ts` file.
 * Exports API metadata (info, tags, externalDocs).
 */
export class InfoGenerator {
    constructor(
        /* v8 ignore next */
        private parser: SwaggerParser,
        /* v8 ignore next */
        private project: Project,
    ) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const filePath = path.join(outputDir, 'info.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        /* v8 ignore next */
        sourceFile.addInterface({
            name: 'ApiContact',
            isExported: true,
            properties: [
                { name: 'name', type: 'string', hasQuestionToken: true },
                { name: 'url', type: 'string', hasQuestionToken: true },
                { name: 'email', type: 'string', hasQuestionToken: true },
            ],
            indexSignatures: [
                {
                    keyName: 'key',
                    keyType: 'string',
                    returnType: 'string | number | boolean | object | undefined | null',
                },
            ],
            docs: ['Contact information for the API (OAS Contact Object).'],
        });

        /* v8 ignore next */
        sourceFile.addInterface({
            name: 'ApiLicense',
            isExported: true,
            properties: [
                { name: 'name', type: 'string' },
                { name: 'url', type: 'string', hasQuestionToken: true },
                { name: 'identifier', type: 'string', hasQuestionToken: true },
            ],
            indexSignatures: [
                {
                    keyName: 'key',
                    keyType: 'string',
                    returnType: 'string | number | boolean | object | undefined | null',
                },
            ],
            docs: ['License metadata for the API (OAS License Object).'],
        });

        /* v8 ignore next */
        sourceFile.addInterface({
            name: 'ApiExternalDocs',
            isExported: true,
            properties: [
                { name: 'description', type: 'string', hasQuestionToken: true },
                { name: 'url', type: 'string' },
            ],
            indexSignatures: [
                {
                    keyName: 'key',
                    keyType: 'string',
                    returnType: 'string | number | boolean | object | undefined | null',
                },
            ],
            docs: ['External documentation metadata (OAS External Documentation Object).'],
        });

        // Generate ApiInfo Interface
        /* v8 ignore next */
        sourceFile.addInterface({
            name: 'ApiInfo',
            isExported: true,
            properties: [
                { name: 'title', type: 'string' },
                { name: 'version', type: 'string' },
                { name: 'description', type: 'string', hasQuestionToken: true },
                {
                    name: 'summary',
                    type: 'string',
                    hasQuestionToken: true,
                    docs: ['Short summary of the API (OAS 3.1+).'],
                },
                { name: 'termsOfService', type: 'string', hasQuestionToken: true },
                {
                    name: 'contact',
                    type: 'ApiContact',
                    hasQuestionToken: true,
                },
                {
                    name: 'license',
                    type: 'ApiLicense',
                    hasQuestionToken: true,
                },
            ],
            indexSignatures: [
                {
                    keyName: 'key',
                    keyType: 'string',
                    returnType: 'string | number | boolean | object | undefined | null',
                },
            ],
            docs: ['Interface representing the metadata of the API.'],
        });

        // Generate ApiTag Interface
        /* v8 ignore next */
        sourceFile.addInterface({
            name: 'ApiTag',
            isExported: true,
            properties: [
                { name: 'name', type: 'string' },
                { name: 'description', type: 'string', hasQuestionToken: true },
                {
                    name: 'summary',
                    type: 'string',
                    hasQuestionToken: true,
                    docs: ['Short summary of the tag (OAS 3.1+).'],
                },
                {
                    name: 'parent',
                    type: 'string',
                    hasQuestionToken: true,
                    docs: ['Parent tag naming for grouping (Extensions).'],
                },
                { name: 'kind', type: 'string', hasQuestionToken: true, docs: ['Tag categorization (Extensions).'] },
                {
                    name: 'externalDocs',
                    type: 'ApiExternalDocs',
                    hasQuestionToken: true,
                },
            ],
            indexSignatures: [
                {
                    keyName: 'key',
                    keyType: 'string',
                    returnType: 'string | number | boolean | object | undefined | null',
                },
            ],
            docs: ['Interface representing a tag defined in the API.'],
        });

        // Export API_INFO constant
        // We use JSON.stringify to ensure safe embedding of strings (quotes, etc.)
        /* v8 ignore next */
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'API_INFO',
                    type: 'ApiInfo',
                    initializer: JSON.stringify(this.parser.getSpec().info || {}, null, 2),
                },
            ],
            docs: ['Metadata about the API defined in the OpenAPI specification.'],
        });

        // Export API_TAGS constant
        /* v8 ignore next */
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'API_TAGS',
                    type: 'ApiTag[]',
                    initializer: JSON.stringify(this.parser.getSpec().tags || [], null, 2),
                },
            ],
            docs: ['List of tags defined in the OpenAPI specification.'],
        });

        // Export API_EXTERNAL_DOCS constant
        /* v8 ignore next */
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'API_EXTERNAL_DOCS',
                    type: 'ApiExternalDocs | undefined',
                    initializer: JSON.stringify(this.parser.getSpec().externalDocs, null, 2),
                },
            ],
            docs: ['Global external documentation defined in the OpenAPI specification.'],
        });

        /* v8 ignore next */
        sourceFile.formatText();
    }
}
