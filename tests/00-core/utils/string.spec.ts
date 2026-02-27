import { describe, expect, it } from 'vitest';

import * as utils from '@src/functions/utils_string.js';

describe('Core Utils: String', () => {
    describe('Case Conversion', () => {
        it('should handle various strings for camelCase', () => {
            expect(utils.camelCase('hello world')).toBe('helloWorld');
            expect(utils.camelCase('Hello-World')).toBe('helloWorld');
            expect(utils.camelCase('__FOO_BAR__')).toBe('fooBar');
            expect(utils.camelCase('')).toBe('');
            expect(utils.camelCase('get /')).toBe('get');
        });

        it('should handle various strings for pascalCase', () => {
            expect(utils.pascalCase('hello world')).toBe('HelloWorld');
            expect(utils.pascalCase('hello-world')).toBe('HelloWorld');
            expect(utils.pascalCase('__FOO_BAR__')).toBe('FooBar');
            expect(utils.pascalCase('')).toBe('');
        });

        it('should handle various strings for kebabCase', () => {
            expect(utils.kebabCase('helloWorld')).toBe('hello-world');
            expect(utils.kebabCase('HelloWorld')).toBe('hello-world');
            expect(utils.kebabCase('__FOO_BAR__')).toBe('foo-bar');
            expect(utils.kebabCase('--leading-trailing--')).toBe('leading-trailing');
            expect(utils.kebabCase('')).toBe('');
        });
    });

    describe('String Manipulation', () => {
        it('should correctly singularize words', () => {
            expect(utils.singular('tests')).toBe('test');
            expect(utils.singular('stories')).toBe('story');
            expect(utils.singular('test')).toBe('test');
        });

        it('should check for valid URLs', () => {
            expect(utils.isUrl('https://example.com')).toBe(true);
            expect(utils.isUrl('not-a-url')).toBe(false);
        });

        it('should detect URI references', () => {
            expect(utils.isUriReference('#/components/securitySchemes/ApiKey')).toBe(true);
            expect(utils.isUriReference('./ApiKey')).toBe(true);
            expect(utils.isUriReference('../security.json#/ApiKey')).toBe(true);
            expect(utils.isUriReference('https://example.com/schemes.json#/ApiKey')).toBe(true);
            expect(utils.isUriReference('urn:example:security:ApiKey')).toBe(true);
            expect(utils.isUriReference('ApiKey')).toBe(false);
            expect(utils.isUriReference('api_key')).toBe(false);
        });
    });
});
