import { describe, it, expect } from 'vitest';
import * as utils from '../../src/core/utils.js';
import { GeneratorConfig } from '../../src/core/types.js';
import { MethodDeclaration } from 'ts-morph';

describe('Core: utils.ts', () => {
    const config: GeneratorConfig = {
        input: 'spec.json',
        output: './out',
        options: { dateType: 'string', enumStyle: 'enum' },
    };

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
            expect(utils.kebabCase('')).toBe('');
        });
    });

    describe('String Manipulation', () => {
        it('should correctly singularize words', () => {
            expect(utils.singular('tests')).toBe('test');
            expect(utils.singular('stories')).toBe('story');
            expect(utils.singular('test')).toBe('test');
        });
    });

    describe('Type Resolution', () => {
        it('should return "Record<string, any>" for object without properties', () => {
            const schema = { type: 'object' };
            const type = utils.getTypeScriptType(schema as any, config);
            expect(type).toBe('Record<string, any>');
        });

        it('should return "any" for unknown schema types', () => {
            const schema = { type: 'unknown_type' };
            const type = utils.getTypeScriptType(schema as any, config);
            expect(type).toBe('any');
        });
    });

    describe('OpenAPI Helpers', () => {
        it('should handle empty paths object in extractPaths', () => {
            const paths = utils.extractPaths({});
            expect(paths).toEqual([]);
        });

        it('should extract Swagger 2.0 body parameters correctly', () => {
            const swaggerPaths = {
                '/test': { post: { parameters: [{ name: 'body', in: 'body', schema: { type: 'string' } }] } }
            };
            const paths = utils.extractPaths(swaggerPaths as any);
            expect(paths.length).toBe(1);
            expect(paths[0].requestBody).toBeDefined();
            expect(paths[0].requestBody?.content?.['application/json'].schema).toEqual({ type: 'string' });
        });
    });

    describe('Token Name Generation', () => {
        it('should generate unique token names based on clientName', () => {
            expect(utils.getBasePathTokenName('myClient')).toBe('BASE_PATH_MYCLIENT');
            expect(utils.getBasePathTokenName()).toBe('BASE_PATH_DEFAULT');
            expect(utils.getInterceptorsTokenName('My Client!')).toBe('HTTP_INTERCEPTORS_MY_CLIENT_');
        });
    });

    describe('General Helpers', () => {
        it('should detect duplicate function names', () => {
            const mockMethods = [{ getName: () => 'foo' }, { getName: () => 'bar' }] as MethodDeclaration[];
            expect(utils.hasDuplicateFunctionNames(mockMethods)).toBe(false);

            const mockDuplicateMethods = [{ getName: () => 'foo' }, { getName: () => 'bar' }, { getName: () => 'foo' }] as MethodDeclaration[];
            expect(utils.hasDuplicateFunctionNames(mockDuplicateMethods)).toBe(true);
        });
    });
});
