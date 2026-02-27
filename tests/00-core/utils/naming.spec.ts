import { describe, expect, it } from 'vitest';

import { MethodDeclaration } from 'ts-morph';

import * as naming from '@src/functions/utils_naming.js';

describe('Core Utils: Naming', () => {
    describe('Token Name Generation', () => {
        it('should generate unique token names based on clientName', () => {
            expect(naming.getBasePathTokenName('myClient')).toBe('BASE_PATH_MYCLIENT');
            expect(naming.getBasePathTokenName()).toBe('BASE_PATH_DEFAULT');
            expect(naming.getInterceptorsTokenName('My Client!')).toBe('HTTP_INTERCEPTORS_MY_CLIENT_');
            expect(naming.getClientContextTokenName('test-client')).toBe('CLIENT_CONTEXT_TOKEN_TEST_CLIENT');
        });

        it('should default interceptor token name when no client is provided', () => {
            expect(naming.getInterceptorsTokenName()).toBe('HTTP_INTERCEPTORS_DEFAULT');
        });

        it('should handle clean client names without replacement', () => {
            expect(naming.getInterceptorsTokenName('MYCLIENT')).toBe('HTTP_INTERCEPTORS_MYCLIENT');
        });
    });

    describe('General Helpers', () => {
        it('should detect duplicate function names', () => {
            const mockMethods = [{ getName: () => 'foo' }, { getName: () => 'bar' }] as MethodDeclaration[];
            expect(naming.hasDuplicateFunctionNames(mockMethods)).toBe(false);

            const mockDuplicateMethods = [
                { getName: () => 'foo' },
                { getName: () => 'bar' },
                { getName: () => 'foo' },
            ] as MethodDeclaration[];
            expect(naming.hasDuplicateFunctionNames(mockDuplicateMethods)).toBe(true);
        });

        it('should normalize security keys', () => {
            expect(naming.normalizeSecurityKey('myKey')).toBe('myKey');
            expect(naming.normalizeSecurityKey('#/components/securitySchemes/MyAuth')).toBe('MyAuth');
            expect(naming.normalizeSecurityKey('https://example.com/schemes.json#/ApiKey')).toBe('ApiKey');
        });
    });
});
