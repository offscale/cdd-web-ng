import { describe, expect, it } from 'vitest';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from "@src/core/types.js";
import { MockDataGenerator } from "@src/core/types/index.js";

describe('Service: MockDataGenerator', () => {
    // Basic config for parser init
    const config: GeneratorConfig = { input: '', output: '', options: { } };

    // Valid minimal spec base to pass validation
    const minimalSpec = {
        openapi: '3.0.0',
        info: { title: 'Mock Spec', version: '1.0.0' },
        paths: {}
    };

    // Helper to setup generator with a primed parser
    const setupGenerator = async (specs: Record<string, any>) => {
        const cache = new Map<string, any>();

        const rootKey = Object.keys(specs)[0];
        // Use a valid URI for the root to prevent URL constructor errors during resolution
        const rootUri = rootKey.startsWith('http') || rootKey.startsWith('file')
            ? rootKey
            : `file:///${rootKey}.json`;

        for (const [key, spec] of Object.entries(specs)) {
            // If the key provided in the test mapping matches our logical root, alias it or use strict match
            // For the test case "root", we map it to "file:///root.json" inside the cache so resolution works against the base.
            const uri = key === rootKey ? rootUri : key;

            // If it's the root spec and missing structural fields, merge with minimal base
            const finalSpec = (key === rootKey && !spec.openapi)
                ? { ...minimalSpec, ...spec }
                : spec;

            cache.set(uri, finalSpec);
        }

        // Use the valid base URI for parser initialization
        const entrySpec = cache.get(rootUri);

        const parser = new SwaggerParser(entrySpec, config, cache as any, rootUri);
        return new MockDataGenerator(parser);
    };

    it('should use "example" property if present', async () => {
        const gen = await setupGenerator({ 'root': {} });
        const schema = { type: 'string', example: 'explicit' } as any;
        expect(gen.generate(schema)).toBe('explicit');
    });

    it('should use "default" if example is missing', async () => {
        const gen = await setupGenerator({ 'root': {} });
        const schema = { type: 'number', default: 42 } as any;
        expect(gen.generate(schema)).toBe(42);
    });

    it('should use explicit examples (MediaType)', async () => {
        const gen = await setupGenerator({ 'root': {} });
        const schema = { type: 'string' } as any;
        const examples = {
            'foo': { value: 'bar' }
        };
        expect(gen.generate(schema, examples)).toBe('bar');
    });

    it('should resolve externalValue via parser if cached', async () => {
        // Setup: Main spec refers to external example. External file is in cache.
        const extJson = { status: 'ok' };

        // Note: We use a real-looking URI structure to ensure parser matching works
        const specs = {
            'root': {},
            'http://example.com/data.json': extJson
        };
        const gen = await setupGenerator(specs);

        const schema = { type: 'object' } as any;
        const examples = {
            'ext': { externalValue: 'http://example.com/data.json' }
        };

        const result = gen.generate(schema, examples);
        expect(result).toEqual(extJson);
    });

    it('should return placeholder for externalValue if not in cache', async () => {
        // Base URI will be file:///root.json, attempting to resolve absolute http URI will work syntactically but fail lookup
        const gen = await setupGenerator({ 'root': {} });
        const schema = { type: 'object' } as any;
        const examples = {
            'ext': { externalValue: 'http://missing.com/data.json' }
        };

        const result = gen.generate(schema, examples);
        expect(result).toContain('[Mock Data: External Value at http://missing.com/data.json]');
    });

    it('should generate basic types if no examples provided', async () => {
        const gen = await setupGenerator({ 'root': {} });
        const schema = {
            type: 'object',
            properties: {
                name: { type: 'string' },
                age: { type: 'integer' }
            }
        } as any;

        const result = gen.generate(schema);
        expect(result).toEqual({ name: 'string_value', age: 0 });
    });
});
