import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { SwaggerParser } from '../../src/core/parser.js';
import { GeneratorConfig } from '../../src/core/types.js';
import * as yaml from 'js-yaml';

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof fs>();
    return { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() };
});
vi.mock('js-yaml');
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Core: SwaggerParser', () => {
    let config: GeneratorConfig;

    beforeEach(() => {
        config = {
            input: 'spec.json',
            output: './out',
            options: { dateType: 'string', enumStyle: 'enum' },
        };
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        mockFetch.mockReset();
    });

    it('should create parser from local JSON file', async () => {
        (fs.existsSync as vi.Mock).mockReturnValue(true);
        (fs.readFileSync as vi.Mock).mockReturnValue('{ "openapi": "3.0.0" }');
        const parser = await SwaggerParser.create('spec.json', config);
        expect(parser.getSpec().openapi).toBe('3.0.0');
    });

    it('should create parser from local YAML file (by extension)', async () => {
        (fs.existsSync as vi.Mock).mockReturnValue(true);
        (fs.readFileSync as vi.Mock).mockReturnValue('openapi: 3.0.1');
        (yaml.load as vi.Mock).mockReturnValue({ openapi: '3.0.1' });
        const parser = await SwaggerParser.create('spec.yaml', config);
        expect(parser.getSpec().openapi).toBe('3.0.1');
        expect(parser.getSpecVersion()).toEqual({ type: 'openapi', version: '3.0.1' });
    });

    it('should create parser from local YAML file (by content)', async () => {
        (fs.existsSync as vi.Mock).mockReturnValue(true);
        (fs.readFileSync as vi.Mock).mockReturnValue('openapi: 3.0.1');
        (yaml.load as vi.Mock).mockReturnValue({ openapi: '3.0.1' });
        const parser = await SwaggerParser.create('spec-no-ext', config);
        expect(parser.getSpec().openapi).toBe('3.0.1');
    });

    it('should throw if local file does not exist', async () => {
        (fs.existsSync as vi.Mock).mockReturnValue(false);
        await expect(SwaggerParser.create('nonexistent.json', config)).rejects.toThrow('Input file not found');
    });

    it('should create parser from URL', async () => {
        mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('{ "openapi": "3.0.2" }') });
        const parser = await SwaggerParser.create('http://test.com/spec.json', config);
        expect(parser.getSpec().openapi).toBe('3.0.2');
    });

    it('should throw if URL fetch fails', async () => {
        mockFetch.mockResolvedValue({ ok: false, statusText: 'Not Found' });
        await expect(SwaggerParser.create('http://test.com/fail.json', config)).rejects.toThrow('Failed to fetch spec from http://test.com/fail.json: Not Found');
    });

    it('should throw on invalid JSON', async () => {
        (fs.existsSync as vi.Mock).mockReturnValue(true);
        (fs.readFileSync as vi.Mock).mockReturnValue('invalid');
        await expect(SwaggerParser.create('spec.json', config)).rejects.toThrow(/Failed to parse content/);
    });

    it('should throw on invalid YAML', async () => {
        (fs.existsSync as vi.Mock).mockReturnValue(true);
        (fs.readFileSync as vi.Mock).mockReturnValue('key: value:\n  - invalid');
        (yaml.load as vi.Mock).mockImplementation(() => { throw new Error('YAML error'); });
        await expect(SwaggerParser.create('spec.yaml', config)).rejects.toThrow(/Failed to parse content/);
    });

    it('should throw with non-Error object during parsing', async () => {
        (fs.existsSync as vi.Mock).mockReturnValue(true);
        (fs.readFileSync as vi.Mock).mockReturnValue('invalid json');
        JSON.parse = vi.fn().mockImplementation(() => { throw 'a string error'; });
        await expect(SwaggerParser.create('spec.json', config)).rejects.toThrow('Failed to parse content from spec.json. Error: a string error');
    });

    describe('resolve()', () => {
        const spec = { components: { schemas: { User: { type: 'string' } } } };
        const parser = new SwaggerParser(spec as any, config);

        it('should resolve a valid local reference object', () => {
            const result = parser.resolve<{ type: string }>({ $ref: '#/components/schemas/User' });
            expect(result).toEqual({ type: 'string' });
        });

        it('should return the object itself if it is not a reference', () => {
            const obj = { type: 'number' };
            const result = parser.resolve(obj);
            expect(result).toBe(obj);
        });

        it('should warn and return undefined for external references', () => {
            const result = parser.resolve({ $ref: 'external.json#/User' });
            expect(result).toBeUndefined();
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Unsupported external'));
        });

        it('should warn and return undefined for invalid reference paths', () => {
            const result = parser.resolve({ $ref: '#/components/schemas/NonExistent' });
            expect(result).toBeUndefined();
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to resolve reference part "NonExistent"'));
        });

        it('should return undefined for a null/undefined object', () => {
            expect(parser.resolve(null as any)).toBeNull();
            expect(parser.resolve(undefined as any)).toBeUndefined();
        });
    });

    it('should resolve references via resolveReference', () => {
        const spec = { components: { schemas: { User: { type: 'string' } } } };
        const parser = new SwaggerParser(spec as any, config);
        expect(parser.resolveReference('#/components/schemas/User')).toEqual({ type: 'string' });
    });

    it('should warn and return undefined for invalid references', () => {
        const parser = new SwaggerParser({} as any, config);
        expect(parser.resolveReference('invalid-ref')).toBeUndefined();
        expect(console.warn).toHaveBeenCalledWith('[Parser] Encountered an unsupported or invalid reference: invalid-ref');
    });

    it('should get definitions from Swagger 2.0 `definitions`', () => {
        const spec = { swagger: '2.0', definitions: { Pet: { type: 'object' } } };
        const parser = new SwaggerParser(spec as any, config);
        expect(parser.getDefinitions()).toHaveProperty('Pet');
        expect(parser.getDefinition('Pet')).toEqual({ type: 'object' });
    });

    it('should get security schemes from Swagger 2.0 `securityDefinitions`', () => {
        const spec = { swagger: '2.0', securityDefinitions: { ApiKey: { type: 'apiKey' } } };
        const parser = new SwaggerParser(spec as any, config);
        expect(parser.getSecuritySchemes()).toHaveProperty('ApiKey');
    });

    it('should validate spec versions correctly', () => {
        expect(new SwaggerParser({ openapi: '3.1.0' } as any, config).isValidSpec()).toBe(true);
        expect(new SwaggerParser({ swagger: '2.0' } as any, config).isValidSpec()).toBe(true);
        expect(new SwaggerParser({} as any, config).isValidSpec()).toBe(false);
    });

    it('should return null for getSpecVersion on invalid spec', () => {
        expect(new SwaggerParser({} as any, config).getSpecVersion()).toBeNull();
    });
});
