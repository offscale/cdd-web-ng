import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { TypeGenerator } from "@src/generators/shared/type.generator.js";
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from "@src/core/types/index.js";

const typeGenSpec = {
    openapi: '3.0.0',
    info: { title: 'Test', version: '1.0' },
    paths: {},
    components: {
        schemas: {
            Simple: {
                type: 'object',
                description: 'A simple model.',
                properties: {
                    name: { type: 'string', description: 'The name.' }
                }
            },
            SplitModel: {
                type: 'object',
                properties: {
                    id: { type: 'string', readOnly: true, description: 'Auto-generated ID' },
                    data: { type: 'string' },
                    secret: { type: 'string', writeOnly: true, description: 'Write-only secret' }
                }
            },
            Documented: {
                type: 'object',
                deprecated: true,
                externalDocs: { url: 'https://example.com', description: 'More info' },
                properties: {
                    prop: {
                        type: 'string',
                        example: 'test-value',
                        default: 'default-val',
                        deprecated: true
                    }
                }
            },
            ExampleObj: {
                type: 'object',
                properties: { id: { type: 'integer' } },
                example: { id: 123, meta: 'test' }
            },
            WithMultipleExamples: {
                type: 'object',
                properties: { count: { type: 'integer' } },
                examples: [
                    { count: 1, desc: 'One' },
                    { count: 2, desc: 'Two' }
                ]
            },
            WithPatternProps: {
                type: 'object',
                patternProperties: {
                    '^[a-z]+$': { type: 'string' },
                    '^[0-9]+$': { type: 'number' }
                }
            },
            WithPatternsAndAdditional: {
                type: 'object',
                patternProperties: { '^S_': { type: 'string' } },
                additionalProperties: { type: 'boolean' }
            }
        }
    }
};

describe('Emitter: TypeGenerator', () => {

    const createEnvironment = () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = { input: '', output: '/out', options: { enumStyle: 'enum' } };
        const parser = new SwaggerParser(typeGenSpec as any, config);
        const generator = new TypeGenerator(parser, project, config);
        return { generator, project };
    };

    it('should generate basic interface with description', () => {
        const { generator, project } = createEnvironment();
        generator.generate('/out');
        const sourceFile = project.getSourceFileOrThrow('/out/models/index.ts');
        const iface = sourceFile.getInterfaceOrThrow('Simple');
        expect(iface.getJsDocs()[0].getText()).toContain('A simple model.');
        expect(iface.getPropertyOrThrow('name').getJsDocs()[0].getText()).toContain('The name.');
    });

    it('should split models with readOnly properties', () => {
        const { generator, project } = createEnvironment();
        generator.generate('/out');
        const sourceFile = project.getSourceFileOrThrow('/out/models/index.ts');

        const responseModel = sourceFile.getInterfaceOrThrow('SplitModel');
        expect(responseModel.getProperty('id')).toBeDefined();
        expect(responseModel.getProperty('data')).toBeDefined();
        expect(responseModel.getProperty('secret')).toBeUndefined();

        const requestModel = sourceFile.getInterfaceOrThrow('SplitModelRequest');
        expect(requestModel.getProperty('id')).toBeUndefined();
        expect(requestModel.getProperty('data')).toBeDefined();
        expect(requestModel.getProperty('secret')).toBeDefined();
    });

    it('should generate rich JSDoc annotations', () => {
        const { generator, project } = createEnvironment();
        generator.generate('/out');
        const sourceFile = project.getSourceFileOrThrow('/out/models/index.ts');
        const model = sourceFile.getInterfaceOrThrow('Documented');
        const prop = model.getPropertyOrThrow('prop');

        const modelDoc = model.getJsDocs()[0].getText();
        expect(modelDoc).toContain('@deprecated');
        expect(modelDoc).toContain('@see https://example.com - More info');

        const propDoc = prop.getJsDocs()[0].getText();
        expect(propDoc).toContain('@deprecated');
        expect(propDoc).toContain('@example "test-value"');
        expect(propDoc).toContain('@default "default-val"');
    });

    it('should handle multiline object examples', () => {
        const { generator, project } = createEnvironment();
        generator.generate('/out');
        const sourceFile = project.getSourceFileOrThrow('/out/models/index.ts');
        const model = sourceFile.getInterfaceOrThrow('ExampleObj');
        const doc = model.getJsDocs()[0].getText();
        expect(doc).toContain('@example');
        expect(doc).toContain('"id": 123');
    });

    it('should generate multiple @example tags for OAS 3.1+ examples array', () => {
        const { generator, project } = createEnvironment();
        generator.generate('/out');
        const sourceFile = project.getSourceFileOrThrow('/out/models/index.ts');
        const model = sourceFile.getInterfaceOrThrow('WithMultipleExamples');
        const doc = model.getJsDocs()[0].getText();

        // Ensure multiple @example blocks are generated
        const exampleMatches = doc.match(/@example/g);
        expect(exampleMatches?.length).toBe(2);
        expect(doc).toContain('"count": 1');
        expect(doc).toContain('"count": 2');
    });

    it('should generate index signature for patternProperties', () => {
        const { generator, project } = createEnvironment();
        generator.generate('/out');
        const sourceFile = project.getSourceFileOrThrow('/out/models/index.ts');
        const iface = sourceFile.getInterfaceOrThrow('WithPatternProps');
        const indexSig = iface.getIndexSignatures()[0];

        // It should unite string and number
        expect(indexSig.getReturnType().getText()).toContain('string | number');
        // It might be "number | string" or "string | number", order varies
    });

    it('should merge patternProperties and additionalProperties into index signature', () => {
        const { generator, project } = createEnvironment();
        generator.generate('/out');
        const sourceFile = project.getSourceFileOrThrow('/out/models/index.ts');
        const iface = sourceFile.getInterfaceOrThrow('WithPatternsAndAdditional');
        const indexSig = iface.getIndexSignatures()[0];

        // It should unite string and boolean
        expect(indexSig.getReturnType().getText()).toContain('string | boolean');
    });
});
