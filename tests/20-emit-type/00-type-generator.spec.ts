import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { TypeGenerator } from "@src/generators/shared/type.generator.js";
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from "@src/core/types/index.js";

const typeGenSpec = {
    openapi: '3.0.0',
    info: { title: 'Test', version: '1.0' },
    paths: {
        '/hooks': {
            post: {
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { userId: { type: 'string' }, timestamp: { type: 'string' } }
                            }
                        }
                    }
                }
            }
        }
    },
    webhooks: {
        'user.created': {
            post: {
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { userId: { type: 'string' }, timestamp: { type: 'string' } }
                            }
                        }
                    }
                }
            }
        }
    },
    components: {
        schemas: {
            Status: { type: 'string', enum: ['active', 'inactive'] },
            NumericEnum: { type: 'integer', enum: [1, 2, 3] },
            EmptyEnum: { type: 'string', enum: [] },
            Base: { type: 'object', properties: { id: { type: 'string' } } },
            Extended: {
                allOf: [{ $ref: '#/components/schemas/Base' }, {
                    type: 'object',
                    properties: { name: { type: 'string' } }
                }]
            },
            AnyValue: { anyOf: [{ type: 'string' }, { type: 'number' }] },
            QuotedProps: { type: 'object', properties: { 'with-hyphen': { type: 'string' } } },
            FreeObject: { type: 'object', additionalProperties: true },
            StringMap: { type: 'object', additionalProperties: { type: 'string' } },
            Description: { type: 'object', properties: { prop: { type: 'string', description: 'A test property.' } } },
            SimpleAlias: { type: 'string' },
            ComplexAlias: { anyOf: [{ type: 'string' }, { $ref: '#/components/schemas/Base' }] },
            DocModel: { type: 'object', externalDocs: { url: 'https://example.com', description: 'More info' } },
            ReadOnlyObj: { type: 'object', properties: { id: { type: 'string', readOnly: true } } },
            WriteOnlyObj: { type: 'object', properties: { id: { type: 'string', writeOnly: true } } }
        }
    }
};

describe('Emitter: TypeGenerator', () => {
    const runGenerator = (spec: any, options: any = {}) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = { input: '', output: '/out', options: { enumStyle: 'union', ...options } };
        const parser = new SwaggerParser(spec, config);
        new TypeGenerator(parser, project, config).generate('/out');
        const sourceFile = project.getSourceFileOrThrow('/out/models/index.ts');
        return { getText: () => sourceFile.getFullText(), sourceFile };
    };

    it('should generate a union type for enums when enumStyle is "union"', () => {
        const { getText } = runGenerator(typeGenSpec, { enumStyle: 'union' });
        expect(getText()).toContain("export type Status = 'active' | 'inactive';");
    });

    it('should generate a TypeScript enum for string enums when enumStyle is "enum"', () => {
        const { getText } = runGenerator(typeGenSpec, { enumStyle: 'enum' });
        expect(getText()).toContain('export enum Status {');
        expect(getText()).toContain('ACTIVE = "active"');
        expect(getText()).toContain('INACTIVE = "inactive"');
    });

    it('should generate a union type for non-string enums regardless of style', () => {
        // Even if enumStyle is 'enum', we can't make a TS enum for pure numbers easily without keys
        const { getText } = runGenerator(typeGenSpec, { enumStyle: 'enum' });
        expect(getText()).toContain('export type NumericEnum = 1 | 2 | 3;');
    });

    it('should generate `any` for an empty enum', () => {
        const { getText } = runGenerator(typeGenSpec);
        expect(getText()).toContain('export type EmptyEnum = any;');
    });

    it('should generate extended interfaces using `extends` for `allOf`', () => {
        const { getText } = runGenerator(typeGenSpec);
        expect(getText()).toContain('export interface Extended extends Base {');
        expect(getText()).toContain('name?: string;');
    });

    it('should generate union types using `|` for `anyOf`', () => {
        const { getText } = runGenerator(typeGenSpec);
        expect(getText()).toContain('export type AnyValue = string | number;');
    });

    it('should handle quoted property names', () => {
        const { getText } = runGenerator(typeGenSpec);
        expect(getText()).toContain("'with-hyphen'?: string;");
    });

    it('should generate an alias for non-object schemas', () => {
        const { getText } = runGenerator(typeGenSpec);
        expect(getText()).toContain('export type SimpleAlias = string;');
        expect(getText()).toContain('export type ComplexAlias = string | Base;');
    });

    it('should generate index signatures for `additionalProperties`', () => {
        const { getText } = runGenerator(typeGenSpec);
        expect(getText()).toContain('export interface FreeObject {\n    [key: string]: any;\n}');
        expect(getText()).toContain('export interface StringMap {\n    [key: string]: string;\n}');
    });

    it('should generate TSDoc comments from descriptions', () => {
        const { getText } = runGenerator(typeGenSpec);
        expect(getText()).toContain('/** A test property. */');
    });

    it('should generate JSDoc @see tags from externalDocs', () => {
        const { getText } = runGenerator(typeGenSpec);
        expect(getText()).toContain('@see https://example.com - More info');
    });

    it('should generate types for webhook payloads', () => {
        const { getText } = runGenerator(typeGenSpec);
        expect(getText()).toContain('export interface UserCreatedWebhook');
        expect(getText()).toContain('userId?: string;');
    });

    it('should generate readOnly properties as readonly and omit writeOnly from Response type', () => {
        const { sourceFile } = runGenerator(typeGenSpec);
        const readOnlyObj = sourceFile.getInterfaceOrThrow('ReadOnlyObj');
        const idProp = readOnlyObj.getPropertyOrThrow('id');
        // In response models, readOnly props exist and should technically be 'readonly' in TS
        // The current implementation marks them as such via isReadonly: options.excludeWriteOnly && !!propDef.readOnly
        // Wait, logic: isReadonly: options.excludeWriteOnly && !!propDef.readOnly. 
        // Response generation: excludeWriteOnly: true. So yes.
        expect(idProp.isReadonly()).toBe(true);

        const writeOnlyObj = sourceFile.getInterfaceOrThrow('WriteOnlyObj');
        expect(writeOnlyObj.getProperty('id')).toBeUndefined();
    });

    it('should generate Request interface when readOnly/writeOnly properties exist', () => {
        const { sourceFile } = runGenerator(typeGenSpec);

        // ReadOnlyObj -> ReadOnlyObjRequest should EXCLUDE id
        const roRequest = sourceFile.getInterfaceOrThrow('ReadOnlyObjRequest');
        expect(roRequest.getProperty('id')).toBeUndefined();

        // WriteOnlyObj -> WriteOnlyObjRequest should INCLUDE id
        const woRequest = sourceFile.getInterfaceOrThrow('WriteOnlyObjRequest');
        expect(woRequest.getProperty('id')).toBeDefined();
    });
});
