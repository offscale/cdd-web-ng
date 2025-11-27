import { describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { TypeGenerator } from '@src/generators/shared/type.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types/index.js';

describe('Emitter: TypeGenerator (Sanitization)', () => {
    const runGenerator = (spec: SwaggerSpec) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = { input: '', output: '/out', options: {} };
        const parser = new SwaggerParser(spec, config);
        new TypeGenerator(parser, project, config).generate('/out');
        return project.getSourceFileOrThrow('/out/models/index.ts');
    };

    it('should sanitize description in JSDoc', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'T', version: '1' },
            paths: {},
            components: {
                schemas: {
                    Unsafe: {
                        type: 'object',
                        description: 'Contains */ termination and <script>alert(1)</script>',
                        properties: {
                            prop: { type: 'string', description: 'Also <script>bad</script>' },
                        },
                    },
                },
            },
        };

        const sourceFile = runGenerator(spec as any);
        const iface = sourceFile.getInterfaceOrThrow('Unsafe');
        const doc = iface.getJsDocs()[0].getDescription();

        expect(doc).not.toContain('*/');
        expect(doc).toContain('*\\/');
        expect(doc).not.toContain('<script>');
        expect(doc).toContain('Contains *\\/ termination and');

        const propDoc = iface.getPropertyOrThrow('prop').getJsDocs()[0].getDescription();
        expect(propDoc).not.toContain('<script>');
        expect(propDoc).toBe('Also');
    });

    it('should sanitize externalDocs description', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'T', version: '1' },
            paths: {},
            components: {
                schemas: {
                    Doc: {
                        type: 'string',
                        externalDocs: { url: 'http://link', description: '<iframe src="x"></iframe>' },
                    },
                },
            },
        };

        const sourceFile = runGenerator(spec as any);
        const typeAlias = sourceFile.getTypeAliasOrThrow('Doc');
        const tags = typeAlias.getJsDocs()[0].getTags();
        const seeTag = tags.find(t => t.getTagName() === 'see');

        expect(seeTag?.getText()).not.toContain('iframe');
        expect(seeTag?.getText()).toContain('@see http://link');
    });
});
