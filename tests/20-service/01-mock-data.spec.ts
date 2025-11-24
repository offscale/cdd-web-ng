import { describe, expect, it } from 'vitest';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from "@src/core/types.js";
import { MockDataGenerator } from "@src/generators/angular/service/mock-data.generator.js";

describe('Service: MockDataGenerator (Runtime)', () => {
    const config: GeneratorConfig = { input: '', output: '', options: { } };

    const minimalSpec = {
        openapi: '3.0.0',
        info: { title: 'Mock Spec', version: '1.0.0' },
        paths: {}
    };

    const setupGenerator = async (specs: Record<string, any>) => {
        const cache = new Map<string, any>();
        const rootKey = Object.keys(specs)[0];
        const rootUri = rootKey.startsWith('http') || rootKey.startsWith('file') ? rootKey : `file:///${rootKey}.json`;

        for (const [key, spec] of Object.entries(specs)) {
            const uri = key === rootKey ? rootUri : key;
            const finalSpec = (key === rootKey && !spec.openapi) ? { ...minimalSpec, ...spec } : spec;
            cache.set(uri, finalSpec);
        }

        const entrySpec = cache.get(rootUri);
        const parser = new SwaggerParser(entrySpec, config, cache as any, rootUri);
        return new MockDataGenerator();
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
        // The runtime generator recursively generates defaults
        expect(result).toEqual({ name: 'string_value', age: 0 });
    });
});
