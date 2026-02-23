// src/generators/shared/discriminator.generator.ts
import * as path from 'node:path';

import { Project, VariableDeclarationKind } from 'ts-morph';

import { pascalCase } from '@src/core/utils/index.js';

import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../core/constants.js';
import { SwaggerParser } from '@src/core/parser.js';
import { SwaggerDefinition } from '@src/core/types/openapi.js';

/**
 * Generates the `discriminators.ts` file.
 * This file acts as a runtime registry for handling polymorphism.
 */
export class DiscriminatorGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, 'discriminators.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        const registry: Record<
            string,
            {
                propertyName: string;
                mapping?: Record<string, string>;
                defaultMapping?: string;
            }
        > = {};
        let count = 0;

        this.parser.schemas.forEach(entry => {
            const schema = entry.definition;
            const modelName = entry.name;
            if (typeof schema === 'boolean') return;
            const rawDiscriminator = (schema as SwaggerDefinition).discriminator;

            if (!rawDiscriminator) {
                return;
            }

            let propertyName = '';
            let mapping: Record<string, string> | undefined = undefined;
            let defaultMapping: string | undefined = undefined;

            if (typeof rawDiscriminator === 'string') {
                propertyName = rawDiscriminator;
            } else {
                propertyName = rawDiscriminator.propertyName;
                if (rawDiscriminator.mapping) {
                    mapping = {};
                    Object.entries(rawDiscriminator.mapping).forEach(([key, refValue]) => {
                        const childModelName = this.resolveModelNameFromRef(refValue as string);
                        if (childModelName) {
                            mapping![key] = childModelName;
                        }
                    });
                }
                if (rawDiscriminator.defaultMapping) {
                    defaultMapping = this.resolveModelNameFromRef(rawDiscriminator.defaultMapping);
                }
            }

            if (propertyName) {
                registry[modelName] = { propertyName };
                if (mapping && Object.keys(mapping).length > 0) {
                    registry[modelName].mapping = mapping;
                }
                if (defaultMapping) {
                    registry[modelName].defaultMapping = defaultMapping;
                }
                count++;
            }
        });

        if (count > 0) {
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: 'API_DISCRIMINATORS',
                        initializer: JSON.stringify(registry, null, 2),
                    },
                ],
                docs: [
                    'Registry of Polymorphic Discriminators.',
                    'Keys are parent model names. Values contain the property name to check and an optional mapping of values to child model names.',
                ],
            });
        } else {
            sourceFile.addStatements('export {};');
        }

        sourceFile.formatText();
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }

    private resolveModelNameFromRef(ref: string): string {
        const resolvedSchema = this.parser.resolveReference(ref);
        if (resolvedSchema) {
            const found = this.parser.schemas.find(entry => entry.definition === resolvedSchema);
            if (found) {
                return found.name;
            }
        }
        const parts = ref.split('/');
        let candidate = parts[parts.length - 1];
        if (!candidate) return '';
        candidate = candidate.split('?')[0]?.split('#')[0] || candidate;
        candidate = candidate.replace(/\.[^/.]+$/, '');
        return pascalCase(candidate);
    }
}
