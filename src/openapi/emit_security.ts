import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';

export class SecurityGenerator {
    constructor(
        /* v8 ignore next */
        private readonly parser: SwaggerParser,
        /* v8 ignore next */
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const schemes = this.parser.getSecuritySchemes();
        /* v8 ignore next */
        const securityRequirements = this.parser.getSpec().security;
        /* v8 ignore next */
        const hasSchemes = schemes && Object.keys(schemes).length > 0;
        /* v8 ignore next */
        const hasRequirements = securityRequirements !== undefined;

        /* v8 ignore next */
        if (!hasSchemes && !hasRequirements) {
            /* v8 ignore next */
            return;
        }

        /* v8 ignore next */
        const filePath = path.join(outputDir, 'security.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        /* v8 ignore next */
        sourceFile.addTypeAlias({
            name: 'ApiSecurityRequirement',
            isExported: true,
            type: 'Record<string, string[]>',
            docs: ['OpenAPI Security Requirement object shape.'],
        });

        /* v8 ignore next */
        /* v8 ignore start */
        if (hasSchemes) {
            /* v8 ignore stop */
            /* v8 ignore next */
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: 'API_SECURITY_SCHEMES',
                        initializer: JSON.stringify(schemes, null, 2),
                    },
                ],
                docs: ['The Security Schemes defined in the OpenAPI specification.'],
            });
        }

        /* v8 ignore next */
        if (hasRequirements) {
            /* v8 ignore next */
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: 'API_SECURITY_REQUIREMENTS',
                        type: 'ApiSecurityRequirement[]',
                        /* v8 ignore start */
                        initializer: JSON.stringify(securityRequirements ?? [], null, 2),
                        /* v8 ignore stop */
                    },
                ],
                docs: ['Global security requirements defined at the OpenAPI document level.'],
            });
        }

        /* v8 ignore next */
        sourceFile.formatText();
    }
}
