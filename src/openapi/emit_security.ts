import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';

export class SecurityGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        const schemes = this.parser.getSecuritySchemes();
        const securityRequirements = this.parser.getSpec().security;
        const hasSchemes = schemes && Object.keys(schemes).length > 0;
        const hasRequirements = securityRequirements !== undefined;

        if (!hasSchemes && !hasRequirements) {
            return;
        }

        const filePath = path.join(outputDir, 'security.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addTypeAlias({
            name: 'ApiSecurityRequirement',
            isExported: true,
            type: 'Record<string, string[]>',
            docs: ['OpenAPI Security Requirement object shape.'],
        });

        if (hasSchemes) {
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

        if (hasRequirements) {
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: 'API_SECURITY_REQUIREMENTS',
                        type: 'ApiSecurityRequirement[]',
                        initializer: JSON.stringify(securityRequirements ?? [], null, 2),
                    },
                ],
                docs: ['Global security requirements defined at the OpenAPI document level.'],
            });
        }

        sourceFile.formatText();
    }
}
