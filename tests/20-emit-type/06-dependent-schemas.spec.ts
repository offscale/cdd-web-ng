import { describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { TypeGenerator } from '@src/generators/shared/type.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';

describe('Emitter: TypeGenerator (dependentSchemas)', () => {
    // type-coverage:ignore-next-line
    const setup = (schema: any) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = { input: '', output: '/out', options: {} };
        const spec = {
            openapi: '3.1.0',
            info: { title: 'Dependent', version: '1' },
            paths: {},
            // type-coverage:ignore-next-line
            components: { schemas: { DependentModel: schema } },
        };
        const parser = new SwaggerParser(spec as any, config);
        new TypeGenerator(parser, project, config).generate('/out');
        return project.getSourceFileOrThrow('/out/models/index.ts');
    };

    it('should generate an intersection type for dependentSchemas', () => {
        const sourceFile = setup({
            type: 'object',
            properties: {
                paymentMethod: { type: 'string', enum: ['credit_card', 'paypal'] },
            },
            dependentSchemas: {
                paymentMethod: {
                    properties: {
                        creditCardNumber: { type: 'string' },
                    },
                    required: ['creditCardNumber'],
                },
            },
        });

        const typeAlias = sourceFile.getTypeAliasOrThrow('DependentModel');
        const typeText = typeAlias.getTypeNodeOrThrow().getText();

        // Base part
        expect(typeText).toContain("paymentMethod?: 'credit_card' | 'paypal'");

        // Intersection part structure: (({ paymentMethod: any } & Dependency) | { paymentMethod?: never })
        // Adjusted expectation: inline objects inside intersection do not have trailing semicolons
        expect(typeText).toContain(
            '& (({ paymentMethod: any } & { creditCardNumber: string }) | { paymentMethod?: never })',
        );
    });

    it('should handle multiple dependentSchemas', () => {
        const sourceFile = setup({
            type: 'object',
            properties: {
                a: { type: 'string' },
                b: { type: 'string' },
            },
            dependentSchemas: {
                a: { properties: { c: { type: 'number' } } },
                b: { properties: { d: { type: 'boolean' } } },
            },
        });

        const typeText = sourceFile.getTypeAliasOrThrow('DependentModel').getTypeNodeOrThrow().getText();

        expect(typeText).toContain('& (({ a: any } & { c?: number }) | { a?: never })');
        expect(typeText).toContain('& (({ b: any } & { d?: boolean }) | { b?: never })');
    });

    it('should properly escape property names in dependentSchemas key', () => {
        const sourceFile = setup({
            type: 'object',
            properties: { 'my-prop': { type: 'string' } },
            dependentSchemas: {
                'my-prop': { properties: { extra: { type: 'string' } } },
            },
        });

        const typeText = sourceFile.getTypeAliasOrThrow('DependentModel').getTypeNodeOrThrow().getText();

        expect(typeText).toContain("(({ 'my-prop': any } & { extra?: string }) | { 'my-prop'?: never })");
    });
});

describe('Emitter: TypeGenerator (dependentRequired)', () => {
    // type-coverage:ignore-next-line
    const setup = (schema: any) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = { input: '', output: '/out', options: {} };
        const spec = {
            openapi: '3.1.0',
            info: { title: 'Dependent', version: '1' },
            paths: {},
            // type-coverage:ignore-next-line
            components: { schemas: { DependentModel: schema } },
        };
        const parser = new SwaggerParser(spec as any, config);
        new TypeGenerator(parser, project, config).generate('/out');
        return project.getSourceFileOrThrow('/out/models/index.ts');
    };

    it('should generate an intersection type for dependentRequired', () => {
        const sourceFile = setup({
            type: 'object',
            properties: {
                hasPhone: { type: 'boolean' },
                phoneNumber: { type: 'string' },
                phoneExtension: { type: 'string' },
            },
            dependentRequired: {
                hasPhone: ['phoneNumber', 'phoneExtension'],
            },
        });

        const typeText = sourceFile.getTypeAliasOrThrow('DependentModel').getTypeNodeOrThrow().getText();

        expect(typeText).toContain('hasPhone?: boolean');
        expect(typeText).toContain(
            '& (({ hasPhone: unknown } & { phoneNumber: unknown; phoneExtension: unknown }) | { hasPhone?: never })',
        );
    });
});
