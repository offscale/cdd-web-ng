import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { SwaggerParser } from '../../src/core/parser.js';
import { GeneratorConfig } from '../../src/core/types.js';

// Mock the fs module
vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof fs>();
    return {
        ...actual,
        existsSync: vi.fn(),
        readFileSync: vi.fn(),
    };
});

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Unit: SwaggerParser', () => {
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
        (fs.readFileSync as vi.Mock).mockReturnValue('{ "openapi": "3.0.0", "info": { "title": "test", "version": "1" } }');
        const parser = await SwaggerParser.create('spec.json', config);
        expect(parser.getSpec().openapi).toBe('3.0.0');
    });

    it('should create parser from local YAML file detected by extension', async () => {
        (fs.existsSync as vi.Mock).mockReturnValue(true);
        (fs.readFileSync as vi.Mock).mockReturnValue('openapi: 3.0.1\ninfo:\n  title: test\n  version: 1');
        const parser = await SwaggerParser.create('spec.yaml', config);
        expect(parser.getSpec().openapi).toBe('3.0.1');
        expect(parser.getSpecVersion()).toEqual({ type: 'openapi', version: '3.0.1' });
    });

    it('should create parser from local YAML file detected by content', async () => {
        (fs.existsSync as vi.Mock).mockReturnValue(true);
        (fs.readFileSync as vi.Mock).mockReturnValue('openapi: 3.0.1\ninfo:\n  title: test\n  version: 1');
        const parser = await SwaggerParser.create('spec-no-extension', config);
        expect(parser.getSpec().openapi).toBe('3.0.1');
    });

    it('should throw if local file does not exist', async () => {
        (fs.existsSync as vi.Mock).mockReturnValue(false);
        await expect(SwaggerParser.create('nonexistent.json', config)).rejects.toThrow('Input file not found');
    });

    it('should create parser from URL', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('{ "openapi": "3.0.2" }'),
        });
        const parser = await SwaggerParser.create('http://test.com/spec.json', config);
        expect(parser.getSpec().openapi).toBe('3.0.2');
    });

    it('should throw if URL fetch fails', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            statusText: 'Not Found',
        });
        await expect(SwaggerParser.create('http://test.com/fail.json', config)).rejects.toThrow('Failed to fetch spec from http://test.com/fail.json: Not Found');
    });

    it('should throw on invalid JSON content', async () => {
        (fs.existsSync as vi.Mock).mockReturnValue(true);
        (fs.readFileSync as vi.Mock).mockReturnValue('invalid json');
        await expect(SwaggerParser.create('spec.json', config)).rejects.toThrow(/Failed to parse content/);
    });

    it('should throw on invalid YAML content', async () => {
        (fs.existsSync as vi.Mock).mockReturnValue(true);
        (fs.readFileSync as vi.Mock).mockReturnValue('key: value:\n  - invalid');
        await expect(SwaggerParser.create('spec.yaml', config)).rejects.toThrow(/Failed to parse content/);
    });

    it('should resolve references', () => {
        const spec = { components: { schemas: { User: { type: 'string' } } } };
        const parser = new SwaggerParser(spec as any, config);
        const definition = parser.resolveReference('#/components/schemas/User');
        expect(definition).toEqual({ type: 'string' });
    });

    it('should warn and return undefined for invalid references', () => {
        const parser = new SwaggerParser({} as any, config);
        const definition = parser.resolveReference('invalid-ref');
        expect(definition).toBeUndefined();
        expect(console.warn).toHaveBeenCalledWith('[Parser] Encountered an unsupported or invalid reference: invalid-ref');
    });

    it('should get definitions from Swagger 2.0 `definitions` property', () => {
        const spec = { swagger: '2.0', definitions: { Pet: { type: 'object' } } };
        const parser = new SwaggerParser(spec as any, config);
        expect(parser.getDefinitions()).toHaveProperty('Pet');
        expect(parser.getDefinition('Pet')).toEqual({ type: 'object' });
        expect(parser.getSpecVersion()).toEqual({ type: 'swagger', version: '2.0' });
    });

    it('should check for valid spec versions', () => {
        const oai3 = new SwaggerParser({ openapi: '3.1.0' } as any, config);
        const sw2 = new SwaggerParser({ swagger: '2.0' } as any, config);
        const invalid = new SwaggerParser({} as any, config);
        expect(oai3.isValidSpec()).toBe(true);
        expect(sw2.isValidSpec()).toBe(true);
        expect(invalid.isValidSpec()).toBe(false);
    });

    it('should return null for getSpecVersion on invalid spec', () => {
        const invalid = new SwaggerParser({} as any, config);
        expect(invalid.getSpecVersion()).toBeNull();
    });
});
