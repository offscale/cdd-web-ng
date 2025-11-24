import { describe, expect, it } from 'vitest';
import { MethodDeclaration } from 'ts-morph';

import * as utils from "@src/core/utils/index.js";
import { GeneratorConfig, SwaggerDefinition } from "@src/core/types/index.js";

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
            expect(utils.kebabCase('__FOO_BAR__')).toBe('foo-bar'); // Updated test case
            expect(utils.kebabCase('--leading-trailing--')).toBe('leading-trailing'); // New test case for coverage
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
        it('should return `{ [key: string]: any }` for an object schema with no properties', () => {
            const schema: SwaggerDefinition = { type: 'object' };
            // Updated expectation: The generator now produces a more explicit index signature form
            // to support `unevaluatedProperties` logic consistency.
            expect(utils.getTypeScriptType(schema, config, [])).toBe('{ [key: string]: any }');
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
                '/test': {
                    post: {
                        responses: {},
                        parameters: [{ name: 'body', in: 'body', schema: { type: 'string' } }]
                    }
                }
            };
            const paths = utils.extractPaths(swaggerPaths as any);
            expect(paths.length).toBe(1);
            expect(paths[0].requestBody).toBeDefined();
            expect(paths[0].requestBody?.content?.['application/json'].schema).toEqual({ type: 'string' });
        });

        it('should handle path items with no top-level parameters', () => {
            const swaggerPaths = {
                '/test': { get: { operationId: 'test', responses: {} } } // No 'parameters' key on the path item
            };
            const paths = utils.extractPaths(swaggerPaths as any);
            expect(paths.length).toBe(1);
            expect(paths[0].parameters).toEqual([]); // Should default to empty array
        });

        it('should normalize Security Requirement keys defined as URI pointers', () => {
            const swaggerPaths = {
                '/secure': {
                    get: {
                        operationId: 'getSecure',
                        // Specifying security using a ref pointer instead of direct name
                        security: [{ '#/components/securitySchemes/MyAuth': ['read:scope'] }],
                        responses: {}
                    }
                }
            };
            const [pathInfo] = utils.extractPaths(swaggerPaths as any);

            expect(pathInfo.security).toBeDefined();
            expect(pathInfo.security![0]).toHaveProperty('MyAuth');
            expect(pathInfo.security![0]['MyAuth']).toEqual(['read:scope']);
            expect(pathInfo.security![0]).not.toHaveProperty('#/components/securitySchemes/MyAuth');
        });

        it('should extract and merge Path Item $ref properties', () => {
            const resolveRef = (ref: string) => {
                if (ref === '#/components/pathItems/StandardOp') {
                    return {
                        summary: 'Original Summary',
                        get: { operationId: 'getStandard', responses: {} }
                    };
                }
                return undefined;
            };

            const swaggerPaths = {
                '/merged': {
                    $ref: '#/components/pathItems/StandardOp',
                    summary: 'Overridden Summary', // Local override
                    description: 'New Description' // Local addition
                }
            };

            const [pathInfo] = utils.extractPaths(swaggerPaths as any, resolveRef as any);

            expect(pathInfo).toBeDefined();
            expect(pathInfo.summary).toBe('Overridden Summary');
            expect(pathInfo.description).toBe('New Description');
            expect(pathInfo.operationId).toBe('getStandard');
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
