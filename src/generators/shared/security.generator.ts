import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../core/constants.js';
import { SwaggerParser } from '@src/core/parser.js';

export class SecurityGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        const schemes = this.parser.getSecuritySchemes();

        if (!schemes || Object.keys(schemes).length === 0) {
            return;
        }

        const filePath = path.join(outputDir, 'security.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

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

        sourceFile.formatText();
    }
}
