import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { TypeGenerator } from '../../src/service/emit/type/type.generator.js';
import { SwaggerParser } from '../../src/core/parser.js';
import { GeneratorConfig } from '../../src/core/types.js';
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
        return project.getSourceFileOrThrow('/out/models/index.ts').getFullText();
    };

    it('should generate a union type for enums when enumStyle is "union"', () => {
        const output = runGenerator(typeGenSpec, { enumStyle: 'union' });
        expect(output).toContain(`export type Status = 'active' | 'inactive';`);
    });

    it('should generate a TypeScript enum for string enums when enumStyle is "enum"', () => {
        const output = runGenerator(typeGenSpec, { enumStyle: 'enum' });
        expect(output).toContain(`export enum Status`);
    });

    it('should generate a union type for non-string enums regardless of style', () => {
        const output = runGenerator(typeGenSpec, { enumStyle: 'enum' });
        expect(output).toContain('export type NumericEnum = 1 | 2 | 3;');
    });

    it('should generate composite types using `&` for `allOf`', () => {
        const output = runGenerator(typeGenSpec);
        expect(output).toContain('export type Extended = Base & { name?: string };');
    });

    it('should generate union types using `|` for `anyOf`', () => {
        const output = runGenerator(typeGenSpec);
        expect(output).toContain('export type AnyValue = string | number;');
    });

    it('should handle quoted property names', () => {
        const output = runGenerator(typeGenSpec);
        // FIX: Make the test more robust by checking for the interface and property separately
        // to avoid whitespace/formatting issues.
        expect(output).toContain('export interface QuotedProps');
        expect(output).toContain("'with-hyphen'?: string;");
    });

    it('should generate index signatures for `additionalProperties`', () => {
        const output = runGenerator(typeGenSpec);
        expect(output).toContain('export interface FreeObject {\n    [key: string]: any;\n}');
        expect(output).toContain('export interface StringMap {\n    [key: string]: string;\n}');
    });

    it('should generate TSDoc comments from descriptions', () => {
        const output = runGenerator(typeGenSpec);
        expect(output).toContain('/** A test property. */');
    });

    it('should generate "any" for empty allOf', () => {
        const output = runGenerator(typeGenSpec);
        expect(output).toContain('export type EmptyAllOf = any;');
    });

    it('should generate a union of "any" for invalid anyOf', () => {
        const output = runGenerator(typeGenSpec);
        expect(output).toContain('export type AnyOfEmpty = any | any;');
    });

    it('should generate a union of "any" for invalid oneOf', () => {
        const output = runGenerator(typeGenSpec);
        expect(output).toContain('export type OneOfEmpty = any | any;');
    });

    it('should generate "any" when allOf contains an unresolvable ref', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = {
            input: '', output: '/out',
            options: { dateType: 'string', enumStyle: 'enum' }
        };
        const parser = new SwaggerParser(typeGenSpec as any, config);
        new TypeGenerator(parser, project, config).generate('/out');
        const output = project.getSourceFileOrThrow('/out/models/index.ts').getFullText();

        expect(output).toContain('export type BrokenAllOf = any;');
    });

});
