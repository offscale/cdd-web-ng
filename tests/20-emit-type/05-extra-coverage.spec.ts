import { describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { TypeGenerator } from '@src/generators/shared/type.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';

describe('Emitter: TypeGenerator (Extra Coverage)', () => {
    const setup = (schemas: Record<string, any>) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = { input: '', output: '/out', options: {} };
        const parser = new SwaggerParser(
            {
                openapi: '3.0.0',
                info: { title: 'T', version: '1' },
                paths: {},
                components: { schemas },
            } as any,
            config,
        );
        new TypeGenerator(parser, project, config).generate('/out');
        return project.getSourceFileOrThrow('/out/models/index.ts');
    };

    it('should generate JSDoc @see tag for externalDocs without description', () => {
        const sourceFile = setup({
            DocModel: {
                type: 'object',
                externalDocs: { url: 'http://example.com' },
            },
        });
        const doc = sourceFile.getInterfaceOrThrow('DocModel').getJsDocs()[0].getText();
        expect(doc).toContain('@see http://example.com');
        expect(doc).not.toContain(' - ');
    });

    it('should generate JSDoc @deprecated tag without description', () => {
        const sourceFile = setup({
            OldModel: {
                type: 'object',
                deprecated: true,
            },
        });
        const doc = sourceFile.getInterfaceOrThrow('OldModel').getJsDocs()[0].getText();
        expect(doc).toContain('@deprecated');
        expect(doc).not.toContain('undefined');
    });

    it('should generate JSDoc @default tag', () => {
        const sourceFile = setup({
            Config: {
                type: 'object',
                properties: {
                    retries: { type: 'integer', default: 3 },
                },
            },
        });
        const prop = sourceFile.getInterfaceOrThrow('Config').getPropertyOrThrow('retries');
        expect(prop.getJsDocs()[0].getText()).toContain('@default 3');
    });

    it('should generate JSDoc @example tag', () => {
        const sourceFile = setup({
            Data: {
                type: 'string',
                example: 'sample',
            },
        });
        // Type alias docs
        const alias = sourceFile.getTypeAliasOrThrow('Data');
        expect(alias.getJsDocs()[0].getText()).toContain('@example "sample"');
    });
});
