import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import * as fs from 'node:fs';

import { SpecLoader } from '@src/core/parser/spec-loader.js';
import { ReferenceResolver } from '@src/core/parser/reference-resolver.js';
import { validateSpec } from '@src/core/validator.js';

vi.mock('@src/core/validator.js');
vi.mock('node:fs');

describe('Core Utils: SpecLoader', () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    beforeEach(() => {
        vi.clearAllMocks();
        // Mock validation to pass by default
        (validateSpec as Mock).mockImplementation(() => {});
        (fs.existsSync as Mock).mockReturnValue(true);
        (fs.readFileSync as Mock).mockReturnValue('{"openapi":"3.0.0"}');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        mockFetch.mockReset();
    });

    it('should load from URL successfully', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('{"openapi":"3.0.0"}'),
        });
        const result = await SpecLoader.load('http://api.com/spec.json');
        expect(result.entrySpec).toBeDefined();
        expect(result.documentUri).toBe('http://api.com/spec.json');
    });

    it('should throw if fetch fails with non-OK status', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            statusText: 'Not Found',
        });
        await expect(SpecLoader.load('http://api.com/404.json')).rejects.toThrow(
            'Failed to fetch spec from http://api.com/404.json: Not Found',
        );
    });

    it('should throw if file read fails unexpectedly (e.g. permissions)', async () => {
        (fs.existsSync as Mock).mockReturnValue(true);
        (fs.readFileSync as Mock).mockImplementation(() => {
            throw new Error('Permission denied');
        });
        await expect(SpecLoader.load('protected.json')).rejects.toThrow('Failed to read content from');
    });

    it('should wrap non-Error throw values when reading files', async () => {
        (fs.existsSync as Mock).mockReturnValue(true);
        (fs.readFileSync as Mock).mockImplementation(() => {
            throw 'string failure';
        });
        await expect(SpecLoader.load('weird.json')).rejects.toThrow('Failed to read content from "file://');
        await expect(SpecLoader.load('weird.json')).rejects.toThrow('string failure');
    });

    it('should cache spec under $self URI alias if present', async () => {
        const specWithSelf = JSON.stringify({
            openapi: '3.0.0',
            $self: 'http://canonical.com/spec.json',
            paths: {},
        });
        mockFetch.mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(specWithSelf),
        });

        const result = await SpecLoader.load('http://alias.com/spec.json');
        // Should be cached under both the requested URL and the $self URL
        expect(result.cache.has('http://alias.com/spec.json')).toBe(true);
        expect(result.cache.has('http://canonical.com/spec.json')).toBe(true);
    });

    it('should stop recursion if URI is already visited', async () => {
        // Mock `findRefs` to return a circular reference
        vi.spyOn(ReferenceResolver, 'findRefs').mockReturnValue(['http://loop.com/spec.json']);
        mockFetch.mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('{"openapi":"3.0.0"}'),
        });

        const result = await SpecLoader.load('http://loop.com/spec.json');
        // It should finish without infinite loop error
        expect(result.entrySpec).toBeDefined();
        // Fetch should be called once, recursion stops on second hit
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle internal errors wrapping expectations', async () => {
        // Verify the throw logic failure in loadContent wrapping
        mockFetch.mockRejectedValue(new Error('Network Error'));
        await expect(SpecLoader.load('http://fail.com')).rejects.toThrow(
            'Failed to read content from "http://fail.com": Network Error',
        );
    });

    it('should skip parsing of invalid ref URIs inside recursive load', async () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        // Use a malformed absolute URL to guarantee URL constructor failure
        vi.spyOn(ReferenceResolver, 'findRefs').mockReturnValue(['http://[invalid]']);

        // First file loads, finds ref, tries to resolve next URI failure
        mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('{"openapi":"3.0.0"}') });

        await SpecLoader.load('http://test.com');
        // It shouldn't crash, just log warning
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to resolve referenced URI'));
    });

    it('should support file:// URLs when loading from disk', async () => {
        (fs.existsSync as Mock).mockReturnValue(true);
        (fs.readFileSync as Mock).mockReturnValue('{"openapi":"3.0.0"}');
        const result = await SpecLoader.load('file:///tmp/spec.json');
        expect(result.entrySpec).toBeDefined();
    });

    it('should parse YAML content without extension when JSON parsing fails', async () => {
        const yamlSchema = `
type: object
properties:
  name:
    type: string
`;
        mockFetch.mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(yamlSchema),
        });

        const result = await SpecLoader.load('http://api.com/spec');
        expect(result.entrySpec).toBeDefined();
        // type-coverage:ignore-next-line
        expect((result.entrySpec as any).type).toBe('object');
        // type-coverage:ignore-next-line
        expect((result.entrySpec as any).properties?.name?.type).toBe('string');
    });

    it('should handle non-url paths when calling loadContent directly', async () => {
        (fs.existsSync as Mock).mockReturnValue(true);
        (fs.readFileSync as Mock).mockReturnValue('{"openapi":"3.0.0"}');
        // type-coverage:ignore-next-line
        const content = await (SpecLoader as any).loadContent('plain.json');
        // type-coverage:ignore-next-line
        expect(content).toBe('{"openapi":"3.0.0"}');
    });

    it('should ignore internal-only refs during recursive load', async () => {
        vi.spyOn(ReferenceResolver, 'findRefs').mockReturnValue(['#/components/schemas/Foo']);
        mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('{"openapi":"3.0.0"}') });
        const result = await SpecLoader.load('http://internal.com/spec.json');
        expect(result.entrySpec).toBeDefined();
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should preload external specs referenced by Link operationRef', async () => {
        const entrySpec = JSON.stringify({
            openapi: '3.2.0',
            info: { title: 'Entry', version: '1.0' },
            paths: {
                '/entry': {
                    get: {
                        operationId: 'getEntry',
                        responses: {
                            '200': {
                                description: 'ok',
                                links: {
                                    ExternalLink: {
                                        operationRef: 'other.json#/paths/~1external/get',
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        const externalSpec = JSON.stringify({
            openapi: '3.2.0',
            info: { title: 'External', version: '1.0' },
            paths: {
                '/external': {
                    get: {
                        operationId: 'getExternal',
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        });

        mockFetch.mockImplementation((url: string) => {
            if (url === 'http://api.com/spec.json') {
                return Promise.resolve({ ok: true, text: () => Promise.resolve(entrySpec) });
            }
            if (url === 'http://api.com/other.json') {
                return Promise.resolve({ ok: true, text: () => Promise.resolve(externalSpec) });
            }
            return Promise.resolve({ ok: false, statusText: 'Not Found' });
        });

        const result = await SpecLoader.load('http://api.com/spec.json');

        expect(result.entrySpec).toBeDefined();
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(result.cache.has('http://api.com/other.json')).toBe(true);
    });

    it('should throw when duplicate operationId values exist across documents in the OAD', async () => {
        const entrySpec = JSON.stringify({
            openapi: '3.2.0',
            info: { title: 'Entry', version: '1.0' },
            paths: {
                '/entry': {
                    get: {
                        operationId: 'duplicateOp',
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
            components: {
                schemas: {
                    Foo: {
                        $ref: 'external.json#/components/schemas/Foo',
                    },
                },
            },
        });

        const externalSpec = JSON.stringify({
            openapi: '3.2.0',
            info: { title: 'External', version: '1.0' },
            paths: {
                '/external': {
                    get: {
                        operationId: 'duplicateOp',
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
            components: {
                schemas: {
                    Foo: { type: 'string' },
                },
            },
        });

        mockFetch.mockImplementation((url: string) => {
            if (url === 'http://api.com/spec.json') {
                return Promise.resolve({ ok: true, text: () => Promise.resolve(entrySpec) });
            }
            if (url === 'http://api.com/external.json') {
                return Promise.resolve({ ok: true, text: () => Promise.resolve(externalSpec) });
            }
            return Promise.resolve({ ok: false, statusText: 'Not Found' });
        });

        await expect(SpecLoader.load('http://api.com/spec.json')).rejects.toThrow(
            /Duplicate operationId .* across OpenAPI documents/,
        );
    });

    it('should validate referenced OpenAPI documents in the cache', async () => {
        const entrySpec = JSON.stringify({
            openapi: '3.2.0',
            info: { title: 'Entry', version: '1.0' },
            paths: {
                '/entry': {
                    $ref: 'other.json#/paths/~1external',
                },
            },
        });

        const externalSpec = JSON.stringify({
            openapi: '3.2.0',
            info: { title: 'External', version: '1.0' },
            paths: {
                '/external': {
                    get: {
                        operationId: 'getExternal',
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        });

        mockFetch.mockImplementation((url: string) => {
            if (url === 'http://api.com/spec.json') {
                return Promise.resolve({ ok: true, text: () => Promise.resolve(entrySpec) });
            }
            if (url === 'http://api.com/other.json') {
                return Promise.resolve({ ok: true, text: () => Promise.resolve(externalSpec) });
            }
            return Promise.resolve({ ok: false, statusText: 'Not Found' });
        });

        await SpecLoader.load('http://api.com/spec.json');

        expect(validateSpec).toHaveBeenCalledTimes(2);
    });

    it('should throw if load does not populate entry spec', async () => {
        vi.spyOn(SpecLoader as any, 'loadAndCacheSpecRecursive').mockResolvedValueOnce(undefined);
        await expect(SpecLoader.load('http://empty.com/spec.json')).rejects.toThrow(
            'Failed to load entry spec from http://empty.com/spec.json',
        );
    });
});
