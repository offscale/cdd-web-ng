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
        // Suppress console.warn for these specific tests to keep test output clean.
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('getPolymorphicSchemaOptions should handle oneOf items that are not refs', () => {
        const parser = new SwaggerParser(parserCoverageSpec as any, { options: {} } as GeneratorConfig);
        const schema = parser.getDefinition('PolyWithInline');
        const options = parser.getPolymorphicSchemaOptions(schema!);
        // The generator should gracefully ignore the non-$ref item and return only valid ones.
        expect(options.length).toBe(1);
        expect(options[0].name).toBe('sub3');
    });

    it('getPolymorphicSchemaOptions should handle refs to schemas without the discriminator property or enum', () => {
        const parser = new SwaggerParser(parserCoverageSpec as any, { options: {} } as GeneratorConfig);
        const schema = parser.getDefinition('PolyWithInvalidRefs');
        const options = parser.getPolymorphicSchemaOptions(schema!);
        // The generator should gracefully ignore Sub1 (no 'type' prop) and Sub2 (no 'enum' on 'type' prop).
        expect(options.length).toBe(0);
    });

    it('loadContent should handle non-Error exceptions from fetch', async () => {
        global.fetch = vi.fn().mockImplementation(() => {
            // Simulate a network error throwing a string, which can happen in some environments.
            // eslint-disable-next-line @typescript-eslint/no-throw-literal
            throw 'Network failure';
        });
        await expect(SwaggerParser.create('http://bad.url', {} as GeneratorConfig)).rejects.toThrow('Failed to read content from "http://bad.url": Network failure');
    });
});
