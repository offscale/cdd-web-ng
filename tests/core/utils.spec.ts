import { describe, it, expect } from 'vitest';
import { camelCase, pascalCase, getBasePathTokenName, hasDuplicateFunctionNames, extractPaths } from '../../src/core/utils.js';
import { MethodDeclaration } from 'ts-morph';

describe('Unit: Core Utils', () => {
    it('should convert strings to camelCase', () => {
        expect(camelCase('hello world')).toBe('helloWorld');
        expect(camelCase('Hello-World')).toBe('helloWorld');
        expect(camelCase('__FOO_BAR__')).toBe('fooBar');
    });

    it('should convert strings to PascalCase', () => {
        expect(pascalCase('hello world')).toBe('HelloWorld');
        expect(pascalCase('hello-world')).toBe('HelloWorld');
        expect(pascalCase('__FOO_BAR__')).toBe('FooBar');
        expect(pascalCase('')).toBe(''); // Cover empty string case
    });

    it('should generate unique token names', () => {
        expect(getBasePathTokenName('myClient')).toBe('BASE_PATH_MYCLIENT');
        expect(getBasePathTokenName('default')).toBe('BASE_PATH_DEFAULT');
        expect(getBasePathTokenName('Client With Spaces')).toBe('BASE_PATH_CLIENT_WITH_SPACES');
    });

    it('should detect duplicate function names', () => {
        const mockMethods = [{ getName: () => 'foo' }, { getName: () => 'bar' }] as MethodDeclaration[];
        expect(hasDuplicateFunctionNames(mockMethods)).toBe(false);

        const mockDuplicateMethods = [{ getName: () => 'foo' }, { getName: () => 'bar' }, { getName: () => 'foo' }] as MethodDeclaration[];
        expect(hasDuplicateFunctionNames(mockDuplicateMethods)).toBe(true);
    });

    it('should extract Swagger 2.0 body parameters', () => {
        const swaggerPaths = {
            '/test': {
                post: {
                    parameters: [
                        { name: 'body', in: 'body', schema: { type: 'string' } }
                    ]
                }
            }
        };
        const paths = extractPaths(swaggerPaths as any);
        expect(paths.length).toBe(1);
        expect(paths[0].requestBody).toBeDefined();
        expect(paths[0].requestBody?.content?.['application/json'].schema).toEqual({ type: 'string' });
    });
});
