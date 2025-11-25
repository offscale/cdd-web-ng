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
        // Mock validation to pass by default
        (validateSpec as Mock).mockImplementation(() => {
        });
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
            text: () => Promise.resolve('{"openapi":"3.0.0"}')
        });
        const result = await SpecLoader.load('http://api.com/spec.json');
        expect(result.entrySpec).toBeDefined();
        expect(result.documentUri).toBe('http://api.com/spec.json');
    });

    it('should throw if fetch fails with non-OK status', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            statusText: 'Not Found'
        });
        await expect(SpecLoader.load('http://api.com/404.json')).rejects.toThrow('Failed to fetch spec from http://api.com/404.json: Not Found');
    });

    it('should throw if file read fails unexpectedly (e.g. permissions)', async () => {
        (fs.existsSync as Mock).mockReturnValue(true);
        (fs.readFileSync as Mock).mockImplementation(() => {
            throw new Error('Permission denied');
        });
        await expect(SpecLoader.load('protected.json')).rejects.toThrow('Failed to read content from');
    });

    it('should cache spec under $self URI alias if present', async () => {
        const specWithSelf = JSON.stringify({
            openapi: '3.0.0',
            $self: 'http://canonical.com/spec.json',
            paths: {}
        });
        mockFetch.mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(specWithSelf)
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
            text: () => Promise.resolve('{"openapi":"3.0.0"}')
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
        await expect(SpecLoader.load('http://fail.com')).rejects.toThrow('Failed to read content from "http://fail.com": Network Error');
    });

    it('should skip parsing of invalid ref URIs inside recursive load', async () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        });
        // Use a malformed absolute URL to guarantee URL constructor failure
        vi.spyOn(ReferenceResolver, 'findRefs').mockReturnValue(['http://[invalid]']);

        // First file loads, finds ref, tries to resolve next URI failure
        mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('{"openapi":"3.0.0"}') });

        await SpecLoader.load('http://test.com');
        // It shouldn't crash, just log warning
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to resolve referenced URI'));
    });
});
