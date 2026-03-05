// src/generators/shared/discriminator.generator.ts
import * as path from 'node:path';

import { Project, VariableDeclarationKind } from 'ts-morph';

import { pascalCase } from '@src/functions/utils.js';

import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { SwaggerDefinition } from '@src/core/types/openapi.js';

/**
 * Generates the `discriminators.ts` file.
 * This file acts as a runtime registry for handling polymorphism.
 */
export class DiscriminatorGenerator {
    constructor(
        /* v8 ignore next */
        private readonly parser: SwaggerParser,
        /* v8 ignore next */
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const filePath = path.join(outputDir, 'discriminators.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        const registry: Record<
            string,
            {
                propertyName: string;
                mapping?: Record<string, string>;
                defaultMapping?: string;
            }
            /* v8 ignore next */
        > = {};
        /* v8 ignore next */
        let count = 0;

        /* v8 ignore next */
        this.parser.schemas.forEach(entry => {
            /* v8 ignore next */
            const schema = entry.definition;
            /* v8 ignore next */
            const modelName = entry.name;
            /* v8 ignore next */
            /* v8 ignore start */
            if (typeof schema === 'boolean') return;
            /* v8 ignore stop */
            /* v8 ignore next */
            const rawDiscriminator = (schema as SwaggerDefinition).discriminator;

            /* v8 ignore next */
            if (!rawDiscriminator) {
                /* v8 ignore next */
                return;
            }

            /* v8 ignore next */
            let propertyName = '';
            /* v8 ignore next */
            let mapping: Record<string, string> | undefined = undefined;
            /* v8 ignore next */
            let defaultMapping: string | undefined = undefined;

            /* v8 ignore next */
            if (typeof rawDiscriminator === 'string') {
                /* v8 ignore next */
                propertyName = rawDiscriminator;
            } else {
                /* v8 ignore next */
                propertyName = rawDiscriminator.propertyName;
                /* v8 ignore next */
                if (rawDiscriminator.mapping) {
                    /* v8 ignore next */
                    mapping = {};
                    /* v8 ignore next */
                    Object.entries(rawDiscriminator.mapping).forEach(([key, refValue]) => {
                        /* v8 ignore next */
                        const childModelName = this.resolveModelNameFromRef(refValue as string);
                        /* v8 ignore next */
                        if (childModelName) {
                            /* v8 ignore next */
                            mapping![key] = childModelName;
                        }
                    });
                }
                /* v8 ignore next */
                if (rawDiscriminator.defaultMapping) {
                    /* v8 ignore next */
                    defaultMapping = this.resolveModelNameFromRef(rawDiscriminator.defaultMapping);
                }
            }

            /* v8 ignore next */
            /* v8 ignore start */
            if (propertyName) {
                /* v8 ignore stop */
                /* v8 ignore next */
                registry[modelName] = { propertyName };
                /* v8 ignore next */
                if (mapping && Object.keys(mapping).length > 0) {
                    /* v8 ignore next */
                    registry[modelName].mapping = mapping;
                }
                /* v8 ignore next */
                if (defaultMapping) {
                    /* v8 ignore next */
                    registry[modelName].defaultMapping = defaultMapping;
                }
                /* v8 ignore next */
                count++;
            }
        });

        /* v8 ignore next */
        if (count > 0) {
            /* v8 ignore next */
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
            /* v8 ignore next */
            sourceFile.addStatements('export {};');
        }

        /* v8 ignore next */
        sourceFile.formatText();
        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }

    private resolveModelNameFromRef(ref: string): string {
        /* v8 ignore next */
        const resolvedSchema = this.parser.resolveReference(ref);
        /* v8 ignore next */
        if (resolvedSchema) {
            /* v8 ignore next */
            const found = this.parser.schemas.find(entry => entry.definition === resolvedSchema);
            /* v8 ignore next */
            if (found) {
                /* v8 ignore next */
                return found.name;
            }
        }
        /* v8 ignore next */
        const parts = ref.split('/');
        /* v8 ignore next */
        let candidate = parts[parts.length - 1];
        /* v8 ignore next */
        if (!candidate) return '';
        /* v8 ignore next */
        /* v8 ignore start */
        candidate = candidate.split('?')[0]?.split('#')[0] || candidate;
        /* v8 ignore stop */
        /* v8 ignore next */
        candidate = candidate.replace(/\.[^/.]+$/, '');
        /* v8 ignore next */
        return pascalCase(candidate);
    }
}
