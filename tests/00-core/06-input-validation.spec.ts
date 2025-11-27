// tests/00-core/06-input-validation.spec.ts

import { describe, expect, it } from 'vitest';

import { SpecValidationError, validateSpec } from '@src/core/validator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';

describe('Core: Input Spec Validation', () => {
    const validInfo = { title: 'Valid API', version: '1.0.0' };
    const validConfig: GeneratorConfig = { input: '', output: '', options: {} };

    describe('Structural Validation', () => {
        it('should accept a valid Swagger 2.0 spec with paths', () => {
            const spec: any = {
                swagger: '2.0',
                info: validInfo,
                paths: {},
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept a valid OpenAPI 3.x spec with paths', () => {
            const spec: any = {
                openapi: '3.0.1',
                info: validInfo,
                paths: {},
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept a valid OpenAPI 3.x spec with components only (no paths)', () => {
            const spec: any = {
                openapi: '3.1.0',
                info: validInfo,
                components: { schemas: {} },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept a valid OpenAPI 3.x spec with webhooks only (no paths)', () => {
            const spec: any = {
                openapi: '3.1.0',
                info: validInfo,
                webhooks: {},
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should throw if spec object is null/undefined', () => {
            expect(() => validateSpec(null as any)).toThrow(SpecValidationError);
            expect(() => validateSpec(undefined as any)).toThrow(SpecValidationError);
        });

        it('should throw on missing version header', () => {
            const spec: any = { info: validInfo, paths: {} };
            expect(() => validateSpec(spec)).toThrow(/Unsupported or missing OpenAPI\/Swagger version/);
        });

        it('should throw on invalid version (e.g. 1.2)', () => {
            const spec: any = { swagger: '1.2', info: validInfo, paths: {} };
            expect(() => validateSpec(spec)).toThrow(/Unsupported or missing OpenAPI\/Swagger version/);
        });

        it('should throw on missing info object', () => {
            const spec: any = { openapi: '3.0.0', paths: {} };
            expect(() => validateSpec(spec)).toThrow(/must contain an 'info' object/);
        });

        it('should throw on missing info title', () => {
            const spec: any = { openapi: '3.0.0', info: { version: '1.0' }, paths: {} };
            expect(() => validateSpec(spec)).toThrow(/must contain a required string field: 'title'/);
        });

        it('should throw on missing info version', () => {
            const spec: any = { openapi: '3.0.0', info: { title: 'API' }, paths: {} };
            expect(() => validateSpec(spec)).toThrow(/must contain a required string field: 'version'/);
        });

        it('should throw if Swagger 2.0 has no paths', () => {
            const spec: any = { swagger: '2.0', info: validInfo }; // Missing paths
            expect(() => validateSpec(spec)).toThrow(/Swagger 2.0 specification must contain a 'paths' object/);
        });

        it('should throw if OpenAPI 3.x has no paths, components, or webhooks', () => {
            const spec: any = { openapi: '3.0.0', info: validInfo }; // Completely empty structure
            expect(() => validateSpec(spec)).toThrow(
                /must contain at least one of: 'paths', 'components', or 'webhooks'/,
            );
        });
    });

    describe('License Object Validation', () => {
        it('should throw if License contains both url and identifier (Mutually Exclusive)', () => {
            const spec: any = {
                openapi: '3.1.0',
                info: {
                    ...validInfo,
                    license: {
                        name: 'Apache 2.0',
                        url: 'https://apache.org',
                        identifier: 'Apache-2.0',
                    },
                },
                paths: {},
            };
            expect(() => validateSpec(spec)).toThrow(/mutually exclusive/);
        });

        it('should accept License with only url', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: {
                    ...validInfo,
                    license: {
                        name: 'MIT',
                        url: 'https://opensource.org/licenses/MIT',
                    },
                },
                paths: {},
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept License with only identifier (OAS 3.1+)', () => {
            const spec: any = {
                openapi: '3.1.0',
                info: {
                    ...validInfo,
                    license: {
                        name: 'MIT',
                        identifier: 'MIT',
                    },
                },
                paths: {},
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept License with neither url nor identifier (just name)', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: {
                    ...validInfo,
                    license: {
                        name: 'Proprietary',
                    },
                },
                paths: {},
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });
    });

    describe('Integration with SwaggerParser', () => {
        it('should validate spec upon construction', () => {
            const invalidSpec: any = { openapi: '3.0.0' }; // No info
            expect(() => new SwaggerParser(invalidSpec, validConfig)).toThrow(SpecValidationError);
        });

        it('should support custom validation callback from config', () => {
            const spec: any = { openapi: '3.0.0', info: validInfo, paths: {} };
            const config: GeneratorConfig = {
                ...validConfig,
                validateInput: s => s.info.title !== 'Forbidden Title',
            };

            // Should pass
            expect(() => new SwaggerParser(spec, config)).not.toThrow();

            // Should fail custom validation
            const badSpec = { ...spec, info: { ...validInfo, title: 'Forbidden Title' } };
            expect(() => new SwaggerParser(badSpec, config)).toThrow('Custom input validation failed');
        });
    });

    describe('Component Key Validation (OAS 3.x)', () => {
        it('should accept valid component keys', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {},
                components: {
                    schemas: {
                        User: {},
                        'User.Profile': {},
                        user_id: {},
                        'User-Type': {},
                    },
                    parameters: {
                        param1: {},
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should throw on invalid characters (space) in component keys', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {},
                components: {
                    schemas: {
                        'User Name': {},
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Invalid component key "User Name" in "components.schemas"/);
        });

        it('should throw on invalid symbols ($) in component keys', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        $limit: {},
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Invalid component key "\$limit" in "components.parameters"/);
        });

        it('should throw on invalid symbols (@) in securitySchemes keys', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {},
                components: {
                    securitySchemes: {
                        '@auth': { type: 'http', scheme: 'basic' },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Invalid component key "@auth" in "components.securitySchemes"/);
        });
    });

    describe('Path Template Validation', () => {
        it('should throw error when two paths have identical hierarchy but different param names', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {
                    '/pets/{id}': {},
                    '/pets/{name}': {},
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Ambiguous path definition detected/);
        });

        it('should accept paths with identical hierarchy if they are structurally different', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {
                    '/pets/{id}/info': {},
                    '/pets/{id}/details': {},
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept paths that differ only by fixed segments vs variables', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {
                    '/pets/mine': {},
                    '/pets/{id}': {},
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should throw for complex nested collisions', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {
                    '/api/{version}/upload': {},
                    '/api/{v}/upload': {},
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Ambiguous path definition detected/);
        });

        it('should traverse Swagger 2.0 swagger paths successfully', () => {
            const spec: any = {
                swagger: '2.0',
                info: validInfo,
                paths: {
                    '/api/{version}': {},
                    '/api/{v}': {},
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Ambiguous path definition detected/);
        });
    });

    describe('Parameter Validation (OAS 3.2 Strictness)', () => {
        it('should throw if "query" and "querystring" parameters coexist in same operation', () => {
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/search': {
                        get: {
                            parameters: [
                                { name: 'q', in: 'query' },
                                { name: 'filter', in: 'querystring' },
                            ],
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/contains both 'query' and 'querystring' parameters/);
        });

        it('should throw if "query" and "querystring" coexist via path-level and operation-level inheritance', () => {
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/search': {
                        parameters: [{ name: 'q', in: 'query' }],
                        get: {
                            parameters: [{ name: 'filter', in: 'querystring' }],
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/contains both 'query' and 'querystring' parameters/);
        });

        it('should throw if parameter has both "example" and "examples"', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [
                                {
                                    name: 'id',
                                    in: 'query',
                                    example: '123',
                                    examples: { default: { value: '123' } },
                                },
                            ],
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/contains both 'example' and 'examples'/);
        });

        it('should throw if component parameter has both "example" and "examples"', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        MyParam: {
                            name: 'id',
                            in: 'query',
                            example: '1',
                            examples: { a: { value: '1' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(
                /Component parameter 'MyParam' contains both 'example' and 'examples'/,
            );
        });

        it('should throw if parameter has both "schema" and "content"', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [
                                {
                                    name: 'id',
                                    in: 'query',
                                    schema: { type: 'string' },
                                    content: { 'application/json': { schema: { type: 'string' } } },
                                },
                            ],
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/contains both 'schema' and 'content'/);
        });

        it('should throw if component parameter has both "schema" and "content"', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        MyParam: {
                            name: 'id',
                            in: 'query',
                            schema: { type: 'string' },
                            content: { 'application/json': { schema: { type: 'string' } } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(
                /Component parameter 'MyParam' contains both 'schema' and 'content'/,
            );
        });

        it('should throw if parameter content map has multiple entries (OAS 3.2)', () => {
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [
                                {
                                    name: 'id',
                                    in: 'query',
                                    content: {
                                        'application/json': { schema: { type: 'string' } },
                                        'text/plain': { schema: { type: 'string' } },
                                    },
                                },
                            ],
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/has an invalid 'content' map. It MUST contain exactly one entry/);
        });

        it('should throw if component parameter content map has multiple entries (OAS 3.2)', () => {
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        MultiContent: {
                            name: 'id',
                            in: 'query',
                            content: { 'a/b': {}, 'c/d': {} },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/has an invalid 'content' map. It MUST contain exactly one entry/);
        });

        it('should throw if allowEmptyValue used with style (OAS 3.2)', () => {
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [
                                {
                                    name: 'id',
                                    in: 'query',
                                    style: 'form',
                                    allowEmptyValue: true,
                                },
                            ],
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/defines 'allowEmptyValue' alongside 'style'. This is forbidden/);
        });

        it('should throw if allowEmptyValue used on non-query param (OAS 3.2)', () => {
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [
                                {
                                    name: 'id',
                                    in: 'header',
                                    allowEmptyValue: true,
                                },
                            ],
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/defines 'allowEmptyValue' but location is not 'query'/);
        });

        it('should accept "example" only', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [{ name: 'id', in: 'query', example: '1' }],
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept "examples" only', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [{ name: 'id', in: 'query', examples: { a: { value: '1' } } }],
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept "schema" only', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [{ name: 'id', in: 'query', schema: { type: 'string' } }],
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept "content" only', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [
                                {
                                    name: 'id',
                                    in: 'query',
                                    content: { 'application/json': { schema: { type: 'string' } } },
                                },
                            ],
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });
    });

    describe('OAS 3.1+ jsonSchemaDialect Field', () => {
        it('should accept valid absolute URI', () => {
            const spec: any = {
                openapi: '3.1.0',
                info: validInfo,
                paths: {},
                jsonSchemaDialect: 'https://spec.openapis.org/oas/3.1/dialect/base',
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept URN URI', () => {
            const spec: any = {
                openapi: '3.1.0',
                info: validInfo,
                paths: {},
                jsonSchemaDialect: 'urn:ietf:params:xml:ns:yang:1',
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should throw on non-URI string', () => {
            const spec: any = {
                openapi: '3.1.0',
                info: validInfo,
                paths: {},
                jsonSchemaDialect: 'not-a-uri',
            };
            expect(() => validateSpec(spec)).toThrow(/must be a valid URI/);
        });

        it('should throw on non-string value', () => {
            const spec: any = {
                openapi: '3.1.0',
                info: validInfo,
                paths: {},
                jsonSchemaDialect: 123,
            };
            expect(() => validateSpec(spec)).toThrow(/must be a string/);
        });
    });
});
