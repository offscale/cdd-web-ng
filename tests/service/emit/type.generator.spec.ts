import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { TypeGenerator } from '../../../src/service/emit/type/type.generator.js';
import { SwaggerParser } from '../../../src/core/parser.js';
import { GeneratorConfig } from '../../../src/core/types.js';

describe('Unit: TypeGenerator', () => {
    const runGenerator = (spec: object, configOptions: Partial<GeneratorConfig['options']> = {}) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = {
            input: 'spec.json',
            output: '/generated',
            options: {
                dateType: 'string',
                enumStyle: 'enum',
                ...configOptions,
            },
        };
        const parser = new SwaggerParser(spec as any, config);
        new TypeGenerator(parser, project, config).generate('/generated');
        return project.getSourceFileOrThrow('/generated/models/index.ts').getFullText();
    };

    it('should generate a union type for enums when enumStyle is "union"', () => {
        const spec = {
            components: {
                schemas: {
                    Status: { type: 'string', enum: ['active', 'inactive'] }
                }
            }
        };
        const output = runGenerator(spec, { enumStyle: 'union' });
        expect(output).toContain(`export type Status = 'active' | 'inactive';`);
    });

    it('should generate a composite type using `&` for `allOf`', () => {
        const spec = {
            components: {
                schemas: {
                    Base: { type: 'object', properties: { id: { type: 'string' } } },
                    Extended: { allOf: [{ $ref: '#/components/schemas/Base' }, { type: 'object', properties: { name: { type: 'string' } } }] }
                }
            }
        };
        const output = runGenerator(spec);
        expect(output).toContain('export type Extended = Base & { name?: string };');
    });

    it('should generate a union type for `anyOf`', () => {
        const spec = {
            components: {
                schemas: {
                    AnyValue: { anyOf: [{ type: 'string' }, { type: 'number' }] }
                }
            }
        };
        const output = runGenerator(spec);
        expect(output).toContain('export type AnyValue = string | number;');
    });

    it('should fall back to `any` for empty `anyOf` array', () => {
        const spec = { components: { schemas: { AnyValue: { anyOf: [] } } } };
        const output = runGenerator(spec);
        expect(output).toContain('export type AnyValue = any;');
    });

    it('should generate a `never` type for an empty enum array', () => {
        const spec = { components: { schemas: { Empty: { type: 'string', enum: [] } } } };
        const output = runGenerator(spec, { enumStyle: 'union' });
        expect(output).toContain('export type Empty = never;');
    });

    it('should generate an empty interface for an object with no properties', () => {
        const spec = { components: { schemas: { EmptyObject: { type: 'object' } } } };
        const output = runGenerator(spec);
        expect(output).toContain('export interface EmptyObject {\n}');
    });

    it('should generate TSDoc comments from descriptions', () => {
        const spec = {
            components: {
                schemas: {
                    User: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', description: 'The unique identifier for the user.' }
                        }
                    }
                }
            }
        };
        const output = runGenerator(spec);
        expect(output).toContain('/** The unique identifier for the user. */\n    id?: string;');
    });

    it('should generate an index signature for `additionalProperties: true`', () => {
        const spec = {
            components: {
                schemas: {
                    FreeObject: { type: 'object', additionalProperties: true }
                }
            }
        };
        const output = runGenerator(spec);
        expect(output).toContain('export interface FreeObject {\n    [key: string]: any;\n}');
    });

    it('should generate a typed index signature for `additionalProperties: { type: "..." }`', () => {
        const spec = {
            components: {
                schemas: {
                    StringMap: { type: 'object', additionalProperties: { type: 'string' } }
                }
            }
        };
        const output = runGenerator(spec);
        expect(output).toContain('export interface StringMap {\n    [key: string]: string;\n}');
    });

    it('should handle non-string enums for union style', () => {
        const spec = {
            components: {
                schemas: {
                    NumericEnum: { type: 'number', enum: [1, 2, 3] }
                }
            }
        };
        // This will always generate a union type regardless of the config option
        const output = runGenerator(spec, { enumStyle: 'enum' });
        expect(output).toContain('export type NumericEnum = 1 | 2 | 3;');
    });
});
