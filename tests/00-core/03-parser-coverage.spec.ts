import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { SwaggerParser } from '../../src/core/parser.js';
import { parserCoverageSpec } from '../shared/specs.js';
import { GeneratorConfig } from '@src/core/types.js';

/**
 * @fileoverview
 * This file contains targeted tests for `src/core/parser.ts` to cover specific
 * edge cases and branches related to parsing, especially for polymorphic schemas
 * and error handling during content loading.
 */
describe('Core: SwaggerParser (Coverage)', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('getPolymorphicSchemaOptions should return empty array for non-polymorphic schema', () => {
        const parser = new SwaggerParser({} as any, { options: {} } as GeneratorConfig);
        // Case 1: No oneOf or discriminator
        expect(parser.getPolymorphicSchemaOptions({ type: 'object' })).toEqual([]);
        // Case 2: Has discriminator but no oneOf
        expect(parser.getPolymorphicSchemaOptions({ discriminator: { propertyName: 'type' } })).toEqual([]);
    });

    it('should correctly use explicit discriminator mapping', () => {
        const parser = new SwaggerParser(parserCoverageSpec as any, { options: {} } as GeneratorConfig);
        const schema = parser.getDefinition('WithMapping');
        const options = parser.getPolymorphicSchemaOptions(schema!);
        expect(options).toHaveLength(1);
        expect(options[0].name).toBe('subtype3');
        expect(options[0].schema.properties).toHaveProperty('type');
    });

    it('should filter out unresolvable schemas from discriminator mapping', () => {
        const specWithBadMapping = {
            ...parserCoverageSpec,
            components: {
                ...parserCoverageSpec.components,
                schemas: {
                    ...parserCoverageSpec.components.schemas,
                    BadMap: {
                        discriminator: {
                            propertyName: 'type',
                            mapping: { 'bad': '#/non/existent' }
                        }
                    }
                }
            }
        };
        const parser = new SwaggerParser(specWithBadMapping as any, { options: {} } as GeneratorConfig);
        const schema = parser.getDefinition('BadMap');
        const options = parser.getPolymorphicSchemaOptions(schema!);
        expect(options).toEqual([]);
    });

    it('should correctly infer discriminator mapping when it is not explicitly provided', () => {
        const parser = new SwaggerParser(parserCoverageSpec as any, { options: {} } as GeneratorConfig);
        // This schema has a discriminator but no `mapping` property.
        const schema = parser.getDefinition('PolyWithInline');
        const options = parser.getPolymorphicSchemaOptions(schema!);
        // This covers the `|| {}` branch.
        expect(options).toHaveLength(1);
        expect(options[0].name).toBe('sub3'); // Inferred from the sub-schema's enum
    });

    it('getPolymorphicSchemaOptions should handle oneOf items that are not refs', () => {
        const parser = new SwaggerParser(parserCoverageSpec as any, { options: {} } as GeneratorConfig);
        const schema = parser.getDefinition('PolyWithInline');
        const options = parser.getPolymorphicSchemaOptions(schema!);
        expect(options.length).toBe(1);
        expect(options[0].name).toBe('sub3');
    });

    it('getPolymorphicSchemaOptions should handle refs to schemas without the discriminator property or enum', () => {
        const parser = new SwaggerParser(parserCoverageSpec as any, { options: {} } as GeneratorConfig);
        const schema = parser.getDefinition('PolyWithInvalidRefs');
        const options = parser.getPolymorphicSchemaOptions(schema!);
        expect(options.length).toBe(0);
    });

    it('loadContent should handle non-Error exceptions from fetch', async () => {
        global.fetch = vi.fn().mockImplementation(() => {
            // eslint-disable-next-line @typescript-eslint/no-throw-literal
            throw 'Network failure';
        });
        await expect(SwaggerParser.create('http://bad.url', {} as GeneratorConfig)).rejects.toThrow(
            'Failed to read content from "http://bad.url": Network failure',
        );
    });
});
