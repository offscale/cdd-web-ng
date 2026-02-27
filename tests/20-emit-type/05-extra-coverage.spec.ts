import { describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { TypeGenerator } from '@src/classes/emit.js';
import { SwaggerParser } from '@src/openapi/parse.js';
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

    it('should generate JSDoc tags for schema x- extensions', () => {
        const sourceFile = setup({
            ExtModel: {
                type: 'object',
                'x-entity': 'internal',
                'x-meta': { role: 'system' },
                properties: {
                    id: { type: 'string', 'x-prop': true },
                },
            },
        });

        const doc = sourceFile.getInterfaceOrThrow('ExtModel').getJsDocs()[0].getText();
        expect(doc).toContain('@x-entity "internal"');
        expect(doc).toContain('@x-meta {"role":"system"}');

        const propDoc = sourceFile.getInterfaceOrThrow('ExtModel').getPropertyOrThrow('id').getJsDocs()[0].getText();
        expect(propDoc).toContain('@x-prop true');
    });

    it('should generate JSDoc tags for schema constraints and metadata', () => {
        const sourceFile = setup({
            Constrained: {
                type: 'object',
                minProperties: 1,
                maxProperties: 5,
                propertyNames: { pattern: '^[a-z]+$' },
                properties: {
                    name: {
                        type: 'string',
                        minLength: 2,
                        maxLength: 5,
                        pattern: '^[a-z]+$',
                        format: 'uuid',
                    },
                    count: {
                        type: 'number',
                        minimum: 1,
                        maximum: 10,
                        exclusiveMinimum: 0,
                        multipleOf: 0.5,
                    },
                    tags: {
                        type: 'array',
                        minItems: 1,
                        maxItems: 3,
                        uniqueItems: true,
                    },
                    values: {
                        type: 'array',
                        contains: { type: 'string' },
                        minContains: 1,
                        maxContains: 2,
                    },
                    readSecret: {
                        type: 'string',
                        readOnly: true,
                    },
                    writeSecret: {
                        type: 'string',
                        writeOnly: true,
                    },
                    payload: {
                        type: 'string',
                        contentMediaType: 'application/json',
                        contentSchema: { type: 'object', properties: { id: { type: 'string' } } },
                    },
                    binary: {
                        type: 'string',
                        contentMediaType: 'image/png',
                        contentEncoding: 'base64',
                    },
                    xmlValue: {
                        type: 'string',
                        xml: { name: 'value', namespace: 'https://example.com', prefix: 'ex' },
                    },
                },
            },
            SchemaMeta: {
                type: 'object',
                $schema: 'https://spec.openapis.org/oas/3.1/dialect/base',
                $id: 'https://example.com/schemas/SchemaMeta',
                $anchor: 'SchemaMetaAnchor',
                $dynamicAnchor: 'SchemaMetaDynamic',
                patternProperties: { '^x-': { type: 'string' } },
                dependentSchemas: {
                    paymentMethod: {
                        properties: { cardNumber: { type: 'string' } },
                        required: ['cardNumber'],
                    },
                },
                dependentRequired: { paymentMethod: ['cardNumber'] },
                unevaluatedProperties: false,
                unevaluatedItems: { type: 'string' },
                properties: {
                    paymentMethod: { type: 'string' },
                },
            },
        });

        const modelDoc = sourceFile.getInterfaceOrThrow('Constrained').getJsDocs()[0].getText();
        expect(modelDoc).toContain('@minProperties 1');
        expect(modelDoc).toContain('@maxProperties 5');
        expect(modelDoc).toContain('@propertyNames {"pattern":"^[a-z]+$"}');

        const nameDoc = sourceFile
            .getInterfaceOrThrow('Constrained')
            .getPropertyOrThrow('name')
            .getJsDocs()[0]
            .getText();
        expect(nameDoc).toContain('@minLength 2');
        expect(nameDoc).toContain('@maxLength 5');
        expect(nameDoc).toContain('@pattern ^[a-z]+$');
        expect(nameDoc).toContain('@format uuid');

        const countDoc = sourceFile
            .getInterfaceOrThrow('Constrained')
            .getPropertyOrThrow('count')
            .getJsDocs()[0]
            .getText();
        expect(countDoc).toContain('@minimum 1');
        expect(countDoc).toContain('@maximum 10');
        expect(countDoc).toContain('@exclusiveMinimum 0');
        expect(countDoc).toContain('@multipleOf 0.5');

        const tagsDoc = sourceFile
            .getInterfaceOrThrow('Constrained')
            .getPropertyOrThrow('tags')
            .getJsDocs()[0]
            .getText();
        expect(tagsDoc).toContain('@minItems 1');
        expect(tagsDoc).toContain('@maxItems 3');
        expect(tagsDoc).toContain('@uniqueItems true');

        const valuesDoc = sourceFile
            .getInterfaceOrThrow('Constrained')
            .getPropertyOrThrow('values')
            .getJsDocs()[0]
            .getText();
        expect(valuesDoc).toContain('@contains {"type":"string"}');
        expect(valuesDoc).toContain('@minContains 1');
        expect(valuesDoc).toContain('@maxContains 2');

        const readSecretDoc = sourceFile
            .getInterfaceOrThrow('Constrained')
            .getPropertyOrThrow('readSecret')
            .getJsDocs()[0]
            .getText();
        expect(readSecretDoc).toContain('@readOnly');

        const writeSecretDoc = sourceFile
            .getInterfaceOrThrow('ConstrainedRequest')
            .getPropertyOrThrow('writeSecret')
            .getJsDocs()[0]
            .getText();
        expect(writeSecretDoc).toContain('@writeOnly');

        const payloadDoc = sourceFile
            .getInterfaceOrThrow('Constrained')
            .getPropertyOrThrow('payload')
            .getJsDocs()[0]
            .getText();
        expect(payloadDoc).toContain('@contentMediaType application/json');
        expect(payloadDoc).toContain('@contentSchema {"type":"object","properties":{"id":{"type":"string"}}}');

        const binaryDoc = sourceFile
            .getInterfaceOrThrow('Constrained')
            .getPropertyOrThrow('binary')
            .getJsDocs()[0]
            .getText();
        expect(binaryDoc).toContain('@contentMediaType image/png');
        expect(binaryDoc).toContain('@contentEncoding base64');

        const xmlDoc = sourceFile
            .getInterfaceOrThrow('Constrained')
            .getPropertyOrThrow('xmlValue')
            .getJsDocs()[0]
            .getText();
        expect(xmlDoc).toContain('@xml {"name":"value","namespace":"https://example.com","prefix":"ex"}');

        const schemaMetaNode = sourceFile.getInterface('SchemaMeta') ?? sourceFile.getTypeAliasOrThrow('SchemaMeta');
        const schemaMetaDoc = schemaMetaNode.getJsDocs()[0].getText();
        expect(schemaMetaDoc).toContain('@schemaDialect https://spec.openapis.org/oas/3.1/dialect/base');
        expect(schemaMetaDoc).toContain('@schemaId https://example.com/schemas/SchemaMeta');
        expect(schemaMetaDoc).toContain('@schemaAnchor SchemaMetaAnchor');
        expect(schemaMetaDoc).toContain('@schemaDynamicAnchor SchemaMetaDynamic');
        expect(schemaMetaDoc).toContain('@patternProperties {"^x-":{"type":"string"}}');
        expect(schemaMetaDoc).toContain(
            '@dependentSchemas {"paymentMethod":{"properties":{"cardNumber":{"type":"string"}},"required":["cardNumber"]}}',
        );
        expect(schemaMetaDoc).toContain('@dependentRequired {"paymentMethod":["cardNumber"]}');
        expect(schemaMetaDoc).toContain('@unevaluatedProperties false');
        expect(schemaMetaDoc).toContain('@unevaluatedItems {"type":"string"}');
    });

    it('should generate JSDoc tags for conditional, const, and union keywords', () => {
        const sourceFile = setup({
            Conditional: {
                type: 'object',
                if: { properties: { kind: { const: 'A' } } },
                then: { required: ['a'] },
                else: { required: ['b'] },
                not: { properties: { banned: { type: 'string' } } },
                properties: {
                    kind: { type: 'string' },
                    a: { type: 'string' },
                    b: { type: 'string' },
                },
            },
            ConstObject: {
                const: { status: 'fixed', count: 1 },
            },
            OneOfSchema: {
                oneOf: [{ type: 'string' }, { type: 'number' }],
            },
            AnyOfSchema: {
                anyOf: [{ type: 'string' }, { type: 'number' }],
            },
        });

        const conditionalDoc = sourceFile.getInterfaceOrThrow('Conditional').getJsDocs()[0].getText();
        expect(conditionalDoc).toContain('@if {"properties":{"kind":{"const":"A"}}}');
        expect(conditionalDoc).toContain('@then {"required":["a"]}');
        expect(conditionalDoc).toContain('@else {"required":["b"]}');
        expect(conditionalDoc).toContain('@not {"properties":{"banned":{"type":"string"}}}');

        const constDoc = sourceFile.getTypeAliasOrThrow('ConstObject').getJsDocs()[0].getText();
        expect(constDoc).toContain('@const {"status":"fixed","count":1}');

        const oneOfDoc = sourceFile.getTypeAliasOrThrow('OneOfSchema').getJsDocs()[0].getText();
        expect(oneOfDoc).toContain('@oneOf [{"type":"string"},{"type":"number"}]');

        const anyOfDoc = sourceFile.getTypeAliasOrThrow('AnyOfSchema').getJsDocs()[0].getText();
        expect(anyOfDoc).toContain('@anyOf [{"type":"string"},{"type":"number"}]');
    });

    it('should generate JSDoc @discriminator tag for schemas with discriminators', () => {
        const sourceFile = setup({
            Pet: {
                type: 'object',
                discriminator: {
                    propertyName: 'petType',
                    mapping: { cat: '#/components/schemas/Cat' },
                },
                oneOf: [{ $ref: '#/components/schemas/Cat' }],
                properties: {
                    petType: { type: 'string' },
                },
                required: ['petType'],
            },
            Cat: {
                type: 'object',
                properties: {
                    petType: { const: 'cat' },
                },
            },
        });

        const petNode = sourceFile.getInterface('Pet') ?? sourceFile.getTypeAliasOrThrow('Pet');
        const doc = petNode.getJsDocs()[0].getText();
        expect(doc).toContain('@discriminator {"propertyName":"petType","mapping":{"cat":"#/components/schemas/Cat"}}');
    });
});
