import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { SpecLoader } from '@src/core/parser/spec-loader.js';
import { ReferenceResolver } from '@src/core/parser/reference-resolver.js';
import { validateSpec } from '@src/core/validator.js';

vi.mock('@src/core/validator.js');

describe('Core Utils: SpecLoader', () => {
    beforeEach(() => {
        // Mock the validator for these specific tests to prevent it from
        // running its logic on our minimal, controlled test specs.
        (validateSpec as Mock).mockImplementation(() => {
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should throw an error if the entry spec is not found in cache after loading', async () => {
        // This test simulates a condition where the recursive loader
        // completes but fails to populate the cache. We mock it with an empty
        // implementation to ensure it does nothing.
        const loaderSpy = vi.spyOn(SpecLoader as any, 'loadAndCacheSpecRecursive').mockImplementation(async () => {
        });

        // Use a regex to match the error message regardless of the absolute path
        await expect(SpecLoader.load('spec.json')).rejects.toThrow(
            /^Failed to load entry spec from file:.*spec\.json$/
        );

        loaderSpy.mockRestore();
    });

    it('should warn and skip refs with invalid URIs', async () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        });

        // Mock `findRefs` to return an invalid URI that will cause the URL constructor to throw
        const findRefsSpy = vi.spyOn(ReferenceResolver, 'findRefs').mockReturnValue(['http://[invalid-uri]']);

        // Mock `loadContent` to return a minimal spec object that the loader can parse
        const loadContentSpy = vi.spyOn(SpecLoader as any, 'loadContent').mockResolvedValue('{"openapi":"3.0.0"}');

        // Path does not matter as we mock the content loader
        await SpecLoader.load('spec.json');

        // Verify that the invalid URI was caught and logged.
        // The `await` will complete successfully because the error is caught and handled.
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            '[SpecLoader] Failed to resolve referenced URI: http://[invalid-uri]. Skipping.'
        );

        consoleWarnSpy.mockRestore();
        loadContentSpy.mockRestore();
        findRefsSpy.mockRestore();
    });
});
