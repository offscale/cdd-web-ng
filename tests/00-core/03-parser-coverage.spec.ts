import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SwaggerParser } from '@src/core/parser.js';
import { parserCoverageSpec } from '../shared/specs.js';
import { GeneratorConfig } from '@src/core/types.js';
import { JSON_SCHEMA_2020_12_DIALECT, OAS_3_1_DIALECT } from '@src/core/constants.js';

/**
 * @fileoverview
 * This file contains targeted tests for `src/core/parser.ts` to cover specific
 * edge cases and branches related to parsing, especially for polymorphic schemas
 *, dialect validation, and error handling during content loading.
 */
describe('Core: SwaggerParser (Coverage)', () => {
    const validSpecBase = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
    };

    let consoleWarnSpy: any;

    beforeEach(() => {
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('getPolymorphicSchemaOptions should return empty array for non-polymorphic schema', () => {
        const parser = new SwaggerParser(validSpecBase as any, { options: {} } as GeneratorConfig);
        expect(parser.getPolymorphicSchemaOptions({ type: 'object' })).toEqual([]);
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
                        oneOf: [],
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
        const schema = parser.getDefinition('PolyWithInline');
        const options = parser.getPolymorphicSchemaOptions(schema!);
        expect(options).toHaveLength(1);
        expect(options[0].name).toBe('sub3');
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
            throw 'Network failure';
        });
        await expect(SwaggerParser.create('http://bad.url', {} as GeneratorConfig)).rejects.toThrow(
            'Failed to read content from "http://bad.url": Network failure',
        );
    });

    describe('Reference Override Support (OAS 3.1+)', () => {
        const REF_TARGET = { type: 'string', description: 'Original' };
        const specWithOverrides = {
            ...validSpecBase,
            components: {
                schemas: {
                    Target: REF_TARGET,
                    WithOverride: {
                        $ref: '#/components/schemas/Target',
                        description: 'Overridden Description',
                        summary: 'New Summary'
                    },
                    WithoutOverride: {
                        $ref: '#/components/schemas/Target'
                    }
                }
            }
        };

        it('should merge sibling description into resolved object', () => {
            const parser = new SwaggerParser(specWithOverrides as any, { options: {} } as GeneratorConfig);
            // We resolve the wrapper object itself that has $ref + description
            const refObj = specWithOverrides.components.schemas.WithOverride;
            const resolved = parser.resolve<any>(refObj);

            expect(resolved).not.toBe(REF_TARGET); // Should be a new object reference (clone)
            expect(resolved?.type).toBe('string');
            expect(resolved?.description).toBe('Overridden Description');
            expect((resolved as any).summary).toBe('New Summary');
        });

        it('should return standard resolution if no overrides are present within the ref definition', () => {
            const parser = new SwaggerParser(specWithOverrides as any, { options: {} } as GeneratorConfig);
            const refObj = specWithOverrides.components.schemas.WithoutOverride;
            const resolved = parser.resolve<any>(refObj);

            // When no overrides, it might return the original reference if optimization allows,
            // but our implementation currently delegates logic.
            expect(resolved?.description).toBe('Original');
            expect((resolved as any).summary).toBeUndefined();
        });
    });

    describe('Dialect Validation', () => {
        it('should accept OAS 3.1 default dialect silently', () => {
            const spec = {
                ...validSpecBase,
                openapi: '3.1.0',
                jsonSchemaDialect: OAS_3_1_DIALECT
            };
            new SwaggerParser(spec as any, { options: {} } as GeneratorConfig);
            expect(consoleWarnSpy).not.toHaveBeenCalled();
        });

        it('should accept JSON Schema 2020-12 dialect silently', () => {
            const spec = {
                ...validSpecBase,
                openapi: '3.1.0',
                jsonSchemaDialect: JSON_SCHEMA_2020_12_DIALECT
            };
            new SwaggerParser(spec as any, { options: {} } as GeneratorConfig);
            expect(consoleWarnSpy).not.toHaveBeenCalled();
        });

        it('should warn when a custom dialect is used', () => {
            const spec = {
                ...validSpecBase,
                openapi: '3.1.0',
                jsonSchemaDialect: 'https://spec.openapis.org/oas/3.0/dialect' // Custom or older
            };
            new SwaggerParser(spec as any, { options: {} } as GeneratorConfig);
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('custom jsonSchemaDialect'));
        });
    });
});
