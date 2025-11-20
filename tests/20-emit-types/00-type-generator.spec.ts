// tests/20-emit-types/00-type-generator.spec.ts

import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { TypeGenerator } from '@src/service/emit/type/type.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types.js';
import { typeGenSpec } from '../shared/specs.js';

describe('Emitter: TypeGenerator', () => {
    const runGenerator = (spec: object, configOptions: Partial<GeneratorConfig['options']> = {}) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = {
            input: 'spec.json', output: '/out',
            options: { dateType: 'string', enumStyle: 'enum', ...configOptions },
        };
        const parser = new SwaggerParser(spec as any, config);
        new TypeGenerator(parser, project, config).generate('/out');
        return {
            file: project.getSourceFileOrThrow('/out/models/index.ts'),
            getText: () => project.getSourceFileOrThrow('/out/models/index.ts').getFullText()
        };
    };

    it('should generate a union type for enums when enumStyle is "union"', () => {
        const { getText } = runGenerator(typeGenSpec, { enumStyle: 'union' });
        expect(getText()).toContain(`export type Status = 'active' | 'inactive';`);
    });

    // ... (keeping previously passing tests, using new runGenerator return signature)

    it('should generate a TypeScript enum for string enums when enumStyle is "enum"', () => {
        const { getText } = runGenerator(typeGenSpec, { enumStyle: 'enum' });
        expect(getText()).toContain(`export enum Status`);
    });

    it('should generate a union type for non-string enums regardless of style', () => {
        const { getText } = runGenerator(typeGenSpec, { enumStyle: 'enum' });
        expect(getText()).toContain('export type NumericEnum = 1 | 2 | 3;');
    });

    it('should generate `any` for an empty enum', () => {
        const { getText } = runGenerator(typeGenSpec);
        expect(getText()).toContain('export type EmptyEnum = any;');
    });

    it('should generate composite types using `&` for `allOf`', () => {
        const { getText } = runGenerator(typeGenSpec);
        expect(getText()).toContain('export type Extended = Base & { name?: string };');
    });

    it('should generate union types using `|` for `anyOf`', () => {
        const { getText } = runGenerator(typeGenSpec);
        expect(getText()).toContain('export type AnyValue = string | number;');
    });

    it('should handle quoted property names', () => {
        const { getText } = runGenerator(typeGenSpec);
        expect(getText()).toContain('export interface QuotedProps');
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
        const specWithDocs = {
            openapi: '3.0.0', info: {}, paths: {},
            components: {
                schemas: {
                    DocModel: {
                        type: 'object',
                        externalDocs: { url: 'https://example.com', description: 'More info' }
                    }
                }
            }
        };
        const { getText } = runGenerator(specWithDocs);
        expect(getText()).toContain('@see https://example.com More info');
    });

    it('should generate types for webhook payloads', () => {
        const specWithWebhooks = {
            openapi: '3.1.0', info: {}, paths: {},
            webhooks: {
                'user.created': {
                    post: {
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            userId: { type: 'string' },
                                            timestamp: { type: 'string', format: 'date-time' }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        const { getText } = runGenerator(specWithWebhooks);
        // Name should be PascalCase(user.created) + Webhook -> UserCreatedWebhook
        expect(getText()).toContain('export interface UserCreatedWebhook');
        expect(getText()).toContain('userId?: string;');
        expect(getText()).toContain('timestamp?: string;');
    });

    // NEW Tests for Readonly/Writeonly Enforcement
    it('should generate readOnly properties as readonly and omit writeOnly from Response type', () => {
        const spec = {
            openapi: '3.0.0', info: {}, paths: {},
            components: {
                schemas: {
                    User: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', readOnly: true },
                            name: { type: 'string' },
                            password: { type: 'string', writeOnly: true }
                        }
                    }
                }
            }
        };
        const { file } = runGenerator(spec);
        // Check specific interface properties
        const userParams = file.getInterfaceOrThrow('User').getProperties();
        const paramNames = userParams.map(p => p.getName());

        expect(paramNames).toContain('id');
        expect(paramNames).toContain('name');
        expect(paramNames).not.toContain('password'); // writeOnly omitted

        const idParam = userParams.find(p => p.getName() === 'id')!;
        expect(idParam.isReadonly()).toBe(true); // marked readonly
    });

    it('should generate Request interface when readOnly/writeOnly properties exist', () => {
        const spec = {
            openapi: '3.0.0', info: {}, paths: {},
            components: {
                schemas: {
                    User: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', readOnly: true },
                            name: { type: 'string' },
                            password: { type: 'string', writeOnly: true }
                        }
                    }
                }
            }
        };
        const { file } = runGenerator(spec);
        const userRequestParams = file.getInterfaceOrThrow('UserRequest').getProperties();
        const paramNames = userRequestParams.map(p => p.getName());

        expect(paramNames).not.toContain('id'); // readOnly omitted
        expect(paramNames).toContain('name');
        expect(paramNames).toContain('password'); // writeOnly included
    });
});
