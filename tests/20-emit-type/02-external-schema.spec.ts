import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';

import { SwaggerParser } from '@src/openapi/parse.js';
import { ReferenceResolver } from '@src/openapi/parse_reference_resolver.js';
import { TypeGenerator } from '@src/classes/emit.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types/index.js';
import { info } from '../fixtures/common.js';

describe('Emitter: TypeGenerator (External Schemas)', () => {
    it('should include schemas from referenced OpenAPI documents', () => {
        const entrySpec: SwaggerSpec = {
            openapi: '3.0.0',
            info,
            paths: {},
            components: {
                schemas: {
                    Wrapper: {
                        type: 'object',
                        properties: {
                            user: { $ref: 'schemas.json#/components/schemas/User' },
                        },
                    },
                },
            },
        };

        const externalSpec: SwaggerSpec = {
            openapi: '3.0.0',
            info,
            paths: {},
            components: {
                schemas: {
                    User: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                        },
                    },
                },
            },
        };

        const entryUri = 'file://entry.json';
        const externalUri = 'file://schemas.json';

        const cache = new Map<string, SwaggerSpec>([
            [entryUri, entrySpec],
            [externalUri, externalSpec],
        ]);

        ReferenceResolver.indexSchemaIds(entrySpec, entryUri, cache);
        ReferenceResolver.indexSchemaIds(externalSpec, externalUri, cache);

        const config: GeneratorConfig = { input: '', output: '/out', options: { enumStyle: 'enum' } };
        const parser = new SwaggerParser(entrySpec, config, cache, entryUri);

        const project = new Project({ useInMemoryFileSystem: true });
        const generator = new TypeGenerator(parser, project, config);
        generator.generate('/out');

        const sourceFile = project.getSourceFileOrThrow('/out/models/index.ts');
        expect(sourceFile.getInterface('User')).toBeDefined();

        const wrapper = sourceFile.getInterfaceOrThrow('Wrapper');
        const userProp = wrapper.getPropertyOrThrow('user');
        expect(userProp.getType().getText()).toContain('User');
    });
});
