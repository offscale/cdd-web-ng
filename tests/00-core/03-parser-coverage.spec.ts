// tests/00-core/03-parser-coverage.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { SwaggerParser } from '../../src/core/parser.js';
import { parserCoverageSpec } from '../shared/specs.js';

describe('Core: SwaggerParser (Coverage)', () => {

    it('getPolymorphicSchemaOptions should handle oneOf items that are not refs', () => {
        const parser = new SwaggerParser(parserCoverageSpec as any, { options: {} } as any);
        const schema = parser.getDefinition('Poly');
        const options = parser.getPolymorphicSchemaOptions(schema!);
        // The generator should gracefully ignore the non-$ref item
        expect(options.length).toBe(0);
    });

    it('getPolymorphicSchemaOptions should handle refs to schemas without the discriminator property or enum', () => {
        const parser = new SwaggerParser(parserCoverageSpec as any, { options: {} } as any);
        const schema = parser.getDefinition('Poly');
        const options = parser.getPolymorphicSchemaOptions(schema!);
        // The generator should gracefully ignore Sub1 (no 'type' prop) and Sub2 (no 'enum' on 'type' prop)
        expect(options.length).toBe(0);
    });

    it('loadContent should handle non-Error exceptions', async () => {
        global.fetch = vi.fn().mockImplementation(() => {
            // eslint-disable-next-line @typescript-eslint/no-throw-literal
            throw 'Network failure';
        });
        await expect(SwaggerParser.create('http://bad.url', {} as any)).rejects.toThrow('Failed to read content from "http://bad.url": Network failure');
    });
});
