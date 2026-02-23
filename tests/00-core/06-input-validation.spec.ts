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
            // type-coverage:ignore-next-line
            const spec: any = {
                swagger: '2.0',
                info: validInfo,
                paths: {},
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept a valid OpenAPI 3.x spec with paths', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.0.1',
                info: validInfo,
                paths: {},
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept a valid OpenAPI 3.x spec with components only (no paths)', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.1.0',
                info: validInfo,
                components: { schemas: {} },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept a valid OpenAPI 3.x spec with webhooks only (no paths)', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.1.0',
                info: validInfo,
                webhooks: {},
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept a valid $self URI reference', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                $self: '/api/openapi',
                paths: {},
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should reject an invalid $self URI reference', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                $self: 'not a uri',
                paths: {},
            };
            expect(() => validateSpec(spec)).toThrow(/\$self.*URI reference/);
        });

        it('should throw if spec object is null/undefined', () => {
            expect(() => validateSpec(null as any)).toThrow(SpecValidationError);
            expect(() => validateSpec(undefined as any)).toThrow(SpecValidationError);
        });

        it('should throw on missing version header', () => {
            // type-coverage:ignore-next-line
            const spec: any = { info: validInfo, paths: {} };
            expect(() => validateSpec(spec)).toThrow(/Unsupported or missing OpenAPI\/Swagger version/);
        });

        it('should throw on invalid version (e.g. 1.2)', () => {
            // type-coverage:ignore-next-line
            const spec: any = { swagger: '1.2', info: validInfo, paths: {} };
            expect(() => validateSpec(spec)).toThrow(/Unsupported or missing OpenAPI\/Swagger version/);
        });

        it('should throw on missing info object', () => {
            // type-coverage:ignore-next-line
            const spec: any = { openapi: '3.0.0', paths: {} };
            expect(() => validateSpec(spec)).toThrow(/must contain an 'info' object/);
        });

        it('should throw on missing info title', () => {
            // type-coverage:ignore-next-line
            const spec: any = { openapi: '3.0.0', info: { version: '1.0' }, paths: {} };
            expect(() => validateSpec(spec)).toThrow(/must contain a required string field: 'title'/);
        });

        it('should throw on missing info version', () => {
            // type-coverage:ignore-next-line
            const spec: any = { openapi: '3.0.0', info: { title: 'API' }, paths: {} };
            expect(() => validateSpec(spec)).toThrow(/must contain a required string field: 'version'/);
        });

        it('should reject invalid termsOfService URI', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: { ...validInfo, termsOfService: 'not a uri' },
                paths: {},
            };
            expect(() => validateSpec(spec)).toThrow(/termsOfService must be a valid URI/i);
        });

        it('should reject invalid contact url and email', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: {
                    ...validInfo,
                    contact: {
                        url: 'ht!tp://bad',
                        email: 'not-an-email',
                    },
                },
                paths: {},
            };
            expect(() => validateSpec(spec)).toThrow(
                /contact.url must be a valid URI|contact.email must be a valid email/i,
            );
        });

        it('should accept valid contact url and email', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: {
                    ...validInfo,
                    contact: {
                        url: 'https://example.com/support',
                        email: 'support@example.com',
                    },
                },
                paths: {},
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should reject invalid externalDocs at root', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                externalDocs: { url: 'not a uri' },
            };
            expect(() => validateSpec(spec)).toThrow(/ExternalDocs\.url must be a valid URI/i);
        });

        it('should reject invalid externalDocs on tag', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                tags: [{ name: 'bad', externalDocs: { url: 'bad uri' } }],
            };
            expect(() => validateSpec(spec)).toThrow(/tags\.bad\.externalDocs/i);
        });

        it('should reject invalid externalDocs on operation', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            externalDocs: { url: 'invalid uri' },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/externalDocs/i);
        });

        it('should reject invalid externalDocs on schema', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    schemas: {
                        BadSchema: {
                            type: 'object',
                            externalDocs: { url: 'not a uri' },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/components\.schemas\.BadSchema\.externalDocs/i);
        });

        it('should reject invalid schema $id and $schema URIs', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    schemas: {
                        BadId: {
                            type: 'object',
                            $id: 'not a uri',
                        },
                        BadSchema: {
                            type: 'object',
                            $schema: 'also not a uri',
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Schema Object.*\$id|\$schema/);
        });

        it('should reject invalid schema $ref and $dynamicRef URIs', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    schemas: {
                        BadRef: {
                            $ref: 'not a uri',
                        },
                        BadDynamic: {
                            $dynamicRef: 'not a uri',
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Schema Object.*\$(ref|dynamicRef)/);
        });

        it('should reject invalid schema anchors', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    schemas: {
                        BadAnchor: {
                            type: 'object',
                            $anchor: '',
                        },
                        BadDynamicAnchor: {
                            type: 'object',
                            $dynamicAnchor: 123,
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Schema Object.*\$(anchor|dynamicAnchor)/);
        });

        it('should ignore reserved header parameters (Accept/Content-Type/Authorization)', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [
                                { name: 'Accept', in: 'header' },
                                { name: 'Content-Type', in: 'header' },
                                { name: 'Authorization', in: 'header' },
                            ],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should reject paths keys that do not start with "/"', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    users: {
                        get: {
                            responses: {
                                '200': { description: 'ok' },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Path key "users" must start with \"\/\"/);
        });

        it('should reject invalid response status code keys', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/bad': {
                        get: {
                            responses: {
                                '600': { description: 'nope' },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/invalid status code '600'/i);
        });

        it('should accept response code ranges and default', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/ok': {
                        get: {
                            responses: {
                                '2XX': { description: 'ok' },
                                default: { description: 'fallback' },
                            },
                        },
                    },
                },
                components: {
                    responses: {
                        SuccessRange: { description: 'ok', content: {} },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should throw if Swagger 2.0 has no paths', () => {
            // type-coverage:ignore-next-line
            const spec: any = { swagger: '2.0', info: validInfo }; // Missing paths
            expect(() => validateSpec(spec)).toThrow(/Swagger 2.0 specification must contain a 'paths' object/);
        });

        it('should throw if OpenAPI 3.x has no paths, components, or webhooks', () => {
            // type-coverage:ignore-next-line
            const spec: any = { openapi: '3.0.0', info: validInfo }; // Completely empty structure
            expect(() => validateSpec(spec)).toThrow(
                /must contain at least one of: 'paths', 'components', or 'webhooks'/,
            );
        });
    });

    describe('License Object Validation', () => {
        it('should throw if License is missing required name', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: {
                    ...validInfo,
                    license: {
                        url: 'https://opensource.org/licenses/MIT',
                    },
                },
                paths: {},
            };
            expect(() => validateSpec(spec)).toThrow(/License object must contain a required string field: 'name'/);
        });

        it('should throw if License contains both url and identifier (Mutually Exclusive)', () => {
            // type-coverage:ignore-next-line
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
            // type-coverage:ignore-next-line
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
            // type-coverage:ignore-next-line
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
            // type-coverage:ignore-next-line
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

    describe('Path Parameter Validation', () => {
        it('should reject when a templated path is missing a path parameter definition', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/users/{id}': {
                        get: { responses: { '200': { description: 'ok' } } },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/missing a corresponding 'in: path'/i);
        });

        it('should allow templated paths to omit path params when the path item is empty (ACL exception)', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/users/{id}': {
                        summary: 'ACL-hidden path',
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should reject when a path parameter is not required', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/users/{id}': {
                        get: {
                            parameters: [{ name: 'id', in: 'path', required: false, schema: { type: 'string' } }],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/must be marked as required/i);
        });

        it('should reject when a path parameter does not match the template', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/users': {
                        get: {
                            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/does not match any template variable/i);
        });

        it('should accept when path parameters are defined at the path level', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/users/{id}': {
                        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                        get: { responses: { '200': { description: 'ok' } } },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });
    });

    describe('Components Key Validation', () => {
        it('should accept mediaTypes and webhooks component keys that match the regex', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                components: {
                    mediaTypes: { 'My.Media_Type-1': { schema: { type: 'string' } } },
                    webhooks: { ValidWebhook: { post: { responses: { '200': { description: 'ok' } } } } },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should reject invalid mediaTypes component keys', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                components: {
                    mediaTypes: { 'Bad Key!': { schema: { type: 'string' } } },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Invalid component key/);
        });

        it('should reject invalid webhooks component keys', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                components: {
                    webhooks: { 'Bad/Key': { post: { responses: { '200': { description: 'ok' } } } } },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Invalid component key/);
        });
    });

    describe('Responses Validation', () => {
        it('should reject operations missing responses', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/missing-responses': {
                        get: {},
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/must define 'responses'/i);
        });

        it('should reject response objects without description', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/missing-description': {
                        get: { responses: { '200': {} } },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Response Object.*description/i);
        });

        it('should reject responses objects with no entries', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/empty-responses': {
                        get: { responses: {} },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Responses Object.*at least one response code/i);
        });

        it('should accept response objects with descriptions', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/with-description': {
                        get: { responses: { '200': { description: 'ok' } } },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });
    });

    describe('Component Path Item Validation', () => {
        it('should validate component pathItems operations', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    pathItems: {
                        BadItem: {
                            get: { responses: { '200': {} } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Response Object.*description/i);
        });

        it('should validate component webhooks operations', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    webhooks: {
                        BadHook: {
                            post: { responses: {} },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Responses Object.*at least one response code/i);
        });
    });

    describe('OperationId Uniqueness', () => {
        it('should throw when operationIds are duplicated across paths', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/one': {
                        get: { operationId: 'dup', responses: { '200': { description: 'ok' } } },
                    },
                    '/two': {
                        post: { operationId: 'dup', responses: { '200': { description: 'ok' } } },
                    },
                },
            };

            expect(() => validateSpec(spec)).toThrow(/Duplicate operationId "dup"/);
        });

        it('should throw when operationIds are duplicated across webhooks', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                webhooks: {
                    eventA: { post: { operationId: 'whDup', responses: { '200': { description: 'ok' } } } },
                    eventB: { post: { operationId: 'whDup', responses: { '200': { description: 'ok' } } } },
                },
            };

            expect(() => validateSpec(spec)).toThrow(/Duplicate operationId "whDup"/);
        });

        it('should allow unique operationIds across paths and webhooks', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/one': {
                        get: { operationId: 'getOne', responses: { '200': { description: 'ok' } } },
                    },
                },
                webhooks: {
                    eventA: { post: { operationId: 'hookA', responses: { '200': { description: 'ok' } } } },
                },
            };

            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should throw when operationIds are duplicated across callbacks', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/ping': {
                        post: {
                            operationId: 'dupCallback',
                            responses: { '200': { description: 'ok' } },
                            callbacks: {
                                onPing: {
                                    '{$request.body#/callbackUrl}': {
                                        post: {
                                            operationId: 'dupCallback',
                                            responses: { '200': { description: 'ok' } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };

            expect(() => validateSpec(spec)).toThrow(/Duplicate operationId "dupCallback"/);
        });

        it('should throw when operationIds are duplicated across paths and components.pathItems', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/one': {
                        get: { operationId: 'dupComponent', responses: { '200': { description: 'ok' } } },
                    },
                },
                components: {
                    pathItems: {
                        SharedItem: {
                            post: { operationId: 'dupComponent', responses: { '200': { description: 'ok' } } },
                        },
                    },
                },
            };

            expect(() => validateSpec(spec)).toThrow(/Duplicate operationId "dupComponent"/);
        });

        it('should throw when operationIds are duplicated inside components.pathItems', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    pathItems: {
                        One: {
                            get: { operationId: 'dupPathItem', responses: { '200': { description: 'ok' } } },
                        },
                        Two: {
                            post: { operationId: 'dupPathItem', responses: { '200': { description: 'ok' } } },
                        },
                    },
                },
            };

            expect(() => validateSpec(spec)).toThrow(/Duplicate operationId "dupPathItem"/);
        });
    });

    describe('Integration with SwaggerParser', () => {
        it('should validate spec upon construction', () => {
            // type-coverage:ignore-next-line
            const invalidSpec: any = { openapi: '3.0.0' }; // No info
            expect(() => new SwaggerParser(invalidSpec, validConfig)).toThrow(SpecValidationError);
        });

        it('should support custom validation callback from config', () => {
            // type-coverage:ignore-next-line
            const spec: any = { openapi: '3.0.0', info: validInfo, paths: {} };
            const config: GeneratorConfig = {
                ...validConfig,
                validateInput: s => s.info.title !== 'Forbidden Title',
            };

            // Should pass
            expect(() => new SwaggerParser(spec, config)).not.toThrow();

            // Should fail custom validation
            // type-coverage:ignore-next-line
            const badSpec = { ...spec, info: { ...validInfo, title: 'Forbidden Title' } };
            expect(() => new SwaggerParser(badSpec, config)).toThrow('Custom input validation failed');
        });
    });

    describe('Component Key Validation (OAS 3.x)', () => {
        it('should accept valid component keys', () => {
            // type-coverage:ignore-next-line
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
                        param1: { name: 'param1', in: 'query', schema: { type: 'string' } },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should throw on invalid characters (space) in component keys', () => {
            // type-coverage:ignore-next-line
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
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        $limit: { name: 'limit', in: 'query', schema: { type: 'integer' } },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Invalid component key "\$limit" in "components.parameters"/);
        });

        it('should throw on invalid symbols (@) in securitySchemes keys', () => {
            // type-coverage:ignore-next-line
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

    describe('Component Parameter Validation (OAS 3.2)', () => {
        it('should throw if a component parameter is not an object or reference', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        BadParam: 'not-an-object',
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(
                /Component parameter 'BadParam' must be an object or Reference Object/,
            );
        });

        it('should throw if a component parameter is missing name', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        MissingName: { in: 'query', schema: { type: 'string' } },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(
                /Component parameter 'MissingName' must define a non-empty string 'name'/,
            );
        });

        it('should throw if a component parameter is missing in', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        MissingIn: { name: 'q', schema: { type: 'string' } },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(
                /Component parameter 'MissingIn' must define a non-empty string 'in'/,
            );
        });
    });

    describe('Server Object Validation (OAS 3.x)', () => {
        it('should reject server URLs containing query or fragment', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                servers: [{ url: 'https://example.com/api?x=1' }],
                paths: {},
            };
            expect(() => validateSpec(spec)).toThrow(/MUST NOT include query or fragment/);
        });

        it('should reject server URLs with unmatched braces', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                servers: [{ url: 'https://{region.example.com' }],
                paths: {},
            };
            expect(() => validateSpec(spec)).toThrow(/opening.*matching/i);
        });

        it('should reject server URLs with empty template expressions', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                servers: [{ url: 'https://example.com/{}' }],
                paths: {},
            };
            expect(() => validateSpec(spec)).toThrow(/empty template expression/);
        });

        it('should reject server variables with empty enum', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                servers: [
                    {
                        url: 'https://{region}.example.com',
                        variables: {
                            region: { enum: [], default: 'us' },
                        },
                    },
                ],
                paths: {},
            };
            expect(() => validateSpec(spec)).toThrow(/enum MUST NOT be empty/);
        });

        it('should reject server variables with non-string enum values', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                servers: [
                    {
                        url: 'https://{region}.example.com',
                        variables: {
                            region: { enum: ['us', 123], default: 'us' },
                        },
                    },
                ],
                paths: {},
            };
            expect(() => validateSpec(spec)).toThrow(/enum MUST contain only strings/);
        });

        it('should reject server variables whose default is not in enum', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                servers: [
                    {
                        url: 'https://{region}.example.com',
                        variables: {
                            region: { enum: ['eu'], default: 'us' },
                        },
                    },
                ],
                paths: {},
            };
            expect(() => validateSpec(spec)).toThrow(/default MUST be present in enum/);
        });

        it('should reject server variables that appear more than once', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                servers: [
                    {
                        url: 'https://{region}.example.com/{region}',
                        variables: { region: { default: 'us' } },
                    },
                ],
                paths: {},
            };
            expect(() => validateSpec(spec)).toThrow(/appears more than once/);
        });
    });

    describe('Tag Parent Validation (OAS 3.2)', () => {
        it('should reject duplicate tag names', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                tags: [{ name: 'dup' }, { name: 'dup' }],
            };
            expect(() => validateSpec(spec)).toThrow(/Duplicate tag name/);
        });

        it('should reject tags whose parent does not exist', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                tags: [{ name: 'child', parent: 'missing' }],
            };
            expect(() => validateSpec(spec)).toThrow(/parent "missing" which does not exist/);
        });

        it('should reject circular tag parent references', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                tags: [
                    { name: 'a', parent: 'b' },
                    { name: 'b', parent: 'a' },
                ],
            };
            expect(() => validateSpec(spec)).toThrow(/Circular tag parent reference/);
        });

        it('should accept valid tag parent references', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                tags: [{ name: 'root' }, { name: 'child', parent: 'root' }],
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });
    });

    describe('Path Template Validation', () => {
        it('should throw error when two paths have identical hierarchy but different param names', () => {
            // type-coverage:ignore-next-line
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

        it('should throw when a path template repeats the same variable', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/pets/{id}/{id}': {},
                },
            };
            expect(() => validateSpec(spec)).toThrow(/repeats template variable/);
        });

        it('should throw when a path template has unmatched braces', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/pets/{id': {},
                },
            };
            expect(() => validateSpec(spec)).toThrow(/opening.*matching/i);
        });

        it('should throw when a path template has empty expressions', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/pets/{}': {},
                },
            };
            expect(() => validateSpec(spec)).toThrow(/empty template expression/);
        });

        it('should accept paths with identical hierarchy if they are structurally different', () => {
            // type-coverage:ignore-next-line
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
            // type-coverage:ignore-next-line
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
            // type-coverage:ignore-next-line
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
            // type-coverage:ignore-next-line
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
        it('should throw if a parameter is missing name', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [{ in: 'query', schema: { type: 'string' } }],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/non-empty string 'name'/);
        });

        it('should throw if a parameter is missing in', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [{ name: 'q', schema: { type: 'string' } }],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/non-empty string 'in'/);
        });

        it('should throw if a parameters array contains non-objects', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: ['not-an-object'],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/must be an object or Reference Object/);
        });

        it('should throw if "query" and "querystring" parameters coexist in same operation', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/search': {
                        get: {
                            parameters: [
                                { name: 'q', in: 'query', schema: { type: 'string' } },
                                {
                                    name: 'filter',
                                    in: 'querystring',
                                    content: {
                                        'application/x-www-form-urlencoded': {
                                            schema: { type: 'string' },
                                        },
                                    },
                                },
                            ],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/contains both 'query' and 'querystring' parameters/);
        });

        it('should throw if "query" and "querystring" coexist via path-level and operation-level inheritance', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/search': {
                        parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }],
                        get: {
                            parameters: [
                                {
                                    name: 'filter',
                                    in: 'querystring',
                                    content: {
                                        'application/x-www-form-urlencoded': {
                                            schema: { type: 'string' },
                                        },
                                    },
                                },
                            ],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/contains both 'query' and 'querystring' parameters/);
        });

        it('should throw if path-level parameters contain duplicates', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        parameters: [
                            { name: 'dup', in: 'query', schema: { type: 'string' } },
                            { name: 'dup', in: 'query', schema: { type: 'string' } },
                        ],
                        get: {
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Duplicate parameter 'dup'/);
        });

        it('should throw if operation parameters contain duplicates', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [
                                { name: 'dup', in: 'query', schema: { type: 'string' } },
                                { name: 'dup', in: 'query', schema: { type: 'string' } },
                            ],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Duplicate parameter 'dup'/);
        });

        it('should treat header parameter names as case-insensitive for duplicates', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [
                                { name: 'X-Token', in: 'header', schema: { type: 'string' } },
                                { name: 'x-token', in: 'header', schema: { type: 'string' } },
                            ],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Duplicate parameter/);
        });

        it('should allow operation parameters to override path-level parameters', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }],
                        get: {
                            parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should throw if parameter has both "example" and "examples"', () => {
            // type-coverage:ignore-next-line
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
                                    example: '123',
                                    examples: { default: { value: '123' } },
                                },
                            ],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/contains both 'example' and 'examples'/);
        });

        it('should throw if a parameter defines neither schema nor content', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [{ name: 'q', in: 'query' }],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/must define either 'schema' or 'content'/);
        });

        it('should throw if component parameter has both "example" and "examples"', () => {
            // type-coverage:ignore-next-line
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

        it('should throw if component parameter defines neither schema nor content', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        MyParam: {
                            name: 'id',
                            in: 'query',
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(
                /Component parameter 'MyParam' must define either 'schema' or 'content'/,
            );
        });

        it('should throw if parameter uses an invalid location in OpenAPI 3.x', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [{ name: 'file', in: 'formData', schema: { type: 'string' } }],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/invalid location 'formData'/);
        });

        it('should throw if parameter uses an invalid style for its location', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [{ name: 'q', in: 'query', style: 'matrix', schema: { type: 'string' } }],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/invalid style 'matrix' for location 'query'/);
        });

        it('should throw if deepObject style is used on a non-object schema', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [{ name: 'q', in: 'query', style: 'deepObject', schema: { type: 'string' } }],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/deepObject.*schema is not an object/);
        });

        it('should throw if spaceDelimited style uses explode=true', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [
                                {
                                    name: 'q',
                                    in: 'query',
                                    style: 'spaceDelimited',
                                    explode: true,
                                    schema: { type: 'array', items: { type: 'string' } },
                                },
                            ],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/spaceDelimited.*explode=true/);
        });

        it('should throw if pipeDelimited style uses explode=true', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [
                                {
                                    name: 'q',
                                    in: 'query',
                                    style: 'pipeDelimited',
                                    explode: true,
                                    schema: { type: 'array', items: { type: 'string' } },
                                },
                            ],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/pipeDelimited.*explode=true/);
        });

        it('should throw if component parameter uses an invalid style', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        BadParam: { name: 'id', in: 'header', style: 'form', schema: { type: 'string' } },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/invalid style 'form' for location 'header'/);
        });

        it('should throw if parameter has both "schema" and "content"', () => {
            // type-coverage:ignore-next-line
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
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/contains both 'schema' and 'content'/);
        });

        it('should throw if component parameter has both "schema" and "content"', () => {
            // type-coverage:ignore-next-line
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
            // type-coverage:ignore-next-line
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
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/has an invalid 'content' map. It MUST contain exactly one entry/);
        });

        it('should throw if component parameter content map has multiple entries (OAS 3.2)', () => {
            // type-coverage:ignore-next-line
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

        it('should accept component parameter content map with a single entry', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        SingleContent: {
                            name: 'id',
                            in: 'query',
                            content: { 'application/json': { schema: { type: 'string' } } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should throw if allowEmptyValue used with style (OAS 3.2)', () => {
            // type-coverage:ignore-next-line
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
                                    schema: { type: 'string' },
                                },
                            ],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/defines 'allowEmptyValue' alongside 'style'. This is forbidden/);
        });

        it('should accept allowEmptyValue on query parameter when style is absent', () => {
            // type-coverage:ignore-next-line
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
                                    allowEmptyValue: true,
                                    schema: { type: 'string' },
                                },
                            ],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should throw if allowEmptyValue used on non-query param (OAS 3.2)', () => {
            // type-coverage:ignore-next-line
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
                                    schema: { type: 'string' },
                                },
                            ],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/defines 'allowEmptyValue' but location is not 'query'/);
        });

        it('should throw if querystring parameter defines style/explode/allowReserved', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [
                                {
                                    name: 'q',
                                    in: 'querystring',
                                    style: 'form',
                                    explode: true,
                                    allowReserved: true,
                                    content: {
                                        'application/x-www-form-urlencoded': {
                                            schema: { type: 'string' },
                                        },
                                    },
                                },
                            ],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(
                /location 'querystring' but defines style\/explode\/allowReserved/,
            );
        });

        it('should throw if querystring parameter is missing content', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [{ name: 'q', in: 'querystring', schema: { type: 'string' } }],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/location 'querystring' but defines 'schema'/);
        });

        it('should throw if querystring parameter defines schema', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [
                                {
                                    name: 'q',
                                    in: 'querystring',
                                    schema: { type: 'string' },
                                    content: {
                                        'application/x-www-form-urlencoded': {
                                            schema: { type: 'string' },
                                        },
                                    },
                                },
                            ],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/contains both 'schema' and 'content'/);
        });

        it('should throw if operation defines more than one querystring parameter', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [
                                {
                                    name: 'q',
                                    in: 'querystring',
                                    content: {
                                        'application/x-www-form-urlencoded': {
                                            schema: { type: 'string' },
                                        },
                                    },
                                },
                                {
                                    name: 'q2',
                                    in: 'querystring',
                                    content: {
                                        'application/x-www-form-urlencoded': {
                                            schema: { type: 'string' },
                                        },
                                    },
                                },
                            ],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/defines more than one 'querystring' parameter/);
        });

        it('should throw if component parameter allowEmptyValue used on non-query', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        BadAllow: {
                            name: 'id',
                            in: 'header',
                            allowEmptyValue: true,
                            schema: { type: 'string' },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/defines 'allowEmptyValue' but location is not 'query'/);
        });

        it('should throw if component parameter allowEmptyValue used with style', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        BadAllowStyle: {
                            name: 'id',
                            in: 'query',
                            allowEmptyValue: true,
                            style: 'form',
                            schema: { type: 'string' },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/defines 'allowEmptyValue' alongside 'style'/);
        });

        it('should accept component parameter allowEmptyValue when style is absent', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        OkAllow: {
                            name: 'id',
                            in: 'query',
                            allowEmptyValue: true,
                            schema: { type: 'string' },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should throw if component parameter querystring defines style/explode/allowReserved', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        BadQuerystring: {
                            name: 'q',
                            in: 'querystring',
                            style: 'form',
                            content: {
                                'application/x-www-form-urlencoded': {
                                    schema: { type: 'string' },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(
                /location 'querystring' but defines style\/explode\/allowReserved/,
            );
        });

        it('should accept component parameter querystring without style/explode/allowReserved', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        GoodQuerystring: {
                            name: 'q',
                            in: 'querystring',
                            content: {
                                'application/x-www-form-urlencoded': {
                                    schema: { type: 'string' },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should throw if component parameter querystring is missing content', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        BadQuerystring: {
                            name: 'q',
                            in: 'querystring',
                            schema: { type: 'string' },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/location 'querystring' but defines 'schema'/);
        });

        it('should accept "example" only', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [{ name: 'id', in: 'query', schema: { type: 'string' }, example: '1' }],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept "examples" only', () => {
            // type-coverage:ignore-next-line
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
                                    examples: { a: { value: '1' } },
                                },
                            ],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept "schema" only', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [{ name: 'id', in: 'query', schema: { type: 'string' } }],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept "content" only', () => {
            // type-coverage:ignore-next-line
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
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });
    });

    describe('OAS 3.2 Header, MediaType, and Link Validation', () => {
        it('should reject header objects that define a name', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    description: 'ok',
                                    headers: {
                                        'X-Test': {
                                            name: 'X-Test',
                                            schema: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Header Object.*name/);
        });

        it('should reject header objects that define an in', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    description: 'ok',
                                    headers: {
                                        'X-Test': {
                                            in: 'header',
                                            schema: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Header Object.*in/);
        });

        it('should reject header objects that define allowEmptyValue', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    description: 'ok',
                                    headers: {
                                        'X-Test': {
                                            allowEmptyValue: true,
                                            schema: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/allowEmptyValue/);
        });

        it('should reject header objects missing schema and content', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    description: 'ok',
                                    headers: {
                                        'X-Test': {},
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/must define either 'schema' or 'content'/);
        });

        it('should reject header objects with a non-simple style', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    description: 'ok',
                                    headers: {
                                        'X-Test': {
                                            style: 'form',
                                            schema: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/invalid 'style'/);
        });

        it('should reject header objects with example and examples', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    description: 'ok',
                                    headers: {
                                        'X-Test': {
                                            schema: { type: 'string' },
                                            example: 'a',
                                            examples: { one: { value: 'b' } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/example.*examples/);
        });

        it('should reject header objects with schema and content', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    description: 'ok',
                                    headers: {
                                        'X-Test': {
                                            schema: { type: 'string' },
                                            content: {
                                                'text/plain': { schema: { type: 'string' } },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/schema.*content/);
        });

        it('should reject header content maps with multiple entries', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    description: 'ok',
                                    headers: {
                                        'X-Test': {
                                            content: {
                                                'text/plain': { schema: { type: 'string' } },
                                                'text/html': { schema: { type: 'string' } },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/content.*exactly one entry/);
        });

        it('should accept header content maps with single entry and valid media type', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    description: 'ok',
                                    headers: {
                                        'X-Test': {
                                            content: {
                                                'text/plain': { schema: { type: 'string' } },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should reject media types that define example and examples', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    description: 'ok',
                                    content: {
                                        'application/json': {
                                            schema: { type: 'object' },
                                            example: { ok: true },
                                            examples: { one: { value: { ok: false } } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Media Type Object.*example.*examples/);
        });

        it('should reject itemSchema on non-sequential media types', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    description: 'ok',
                                    content: {
                                        'application/json': {
                                            itemSchema: { type: 'object' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/itemSchema.*not sequential/);
        });

        it('should allow itemSchema on custom JSON media types', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    description: 'ok',
                                    content: {
                                        'application/vnd.acme+json': {
                                            itemSchema: { type: 'object' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should allow itemSchema on sequential media types', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    description: 'ok',
                                    content: {
                                        'application/x-ndjson': {
                                            itemSchema: { type: 'object' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should reject media types that mix encoding with prefixEncoding', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        post: {
                            requestBody: {
                                content: {
                                    'multipart/form-data': {
                                        schema: { type: 'object' },
                                        encoding: { file: { contentType: 'image/png' } },
                                        prefixEncoding: [{ contentType: 'image/png' }],
                                    },
                                },
                            },
                            responses: {
                                '204': { description: 'ok' },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/encoding.*prefixEncoding.*mutually exclusive/);
        });

        it('should reject encoding on non-form/non-multipart media types', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        post: {
                            requestBody: {
                                content: {
                                    'application/json': {
                                        schema: { type: 'object' },
                                        encoding: { foo: { contentType: 'text/plain' } },
                                    },
                                },
                            },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/media type.*encoding/i);
        });

        it('should reject encoding headers that define Content-Type', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        post: {
                            requestBody: {
                                content: {
                                    'multipart/form-data': {
                                        schema: {
                                            type: 'object',
                                            properties: { file: { type: 'string', format: 'binary' } },
                                        },
                                        encoding: {
                                            file: {
                                                headers: {
                                                    'Content-Type': { schema: { type: 'string' } },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Content-Type.*headers/i);
        });

        it('should reject encoding objects with non-string contentType', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        post: {
                            requestBody: {
                                content: {
                                    'multipart/form-data': {
                                        schema: {
                                            type: 'object',
                                            properties: { file: { type: 'string', format: 'binary' } },
                                        },
                                        encoding: {
                                            file: { contentType: 123 },
                                        },
                                    },
                                },
                            },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/contentType/i);
        });

        it('should reject encoding objects with invalid style', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        post: {
                            requestBody: {
                                content: {
                                    'multipart/form-data': {
                                        schema: {
                                            type: 'object',
                                            properties: { file: { type: 'string', format: 'binary' } },
                                        },
                                        encoding: {
                                            file: { style: 'matrix' },
                                        },
                                    },
                                },
                            },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Encoding Object.*invalid 'style'/);
        });

        it('should reject requestBody objects without content', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        post: {
                            requestBody: {},
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/RequestBody Object.*content/);
        });

        it('should allow requestBody objects with empty content maps (implementation-defined)', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        post: {
                            requestBody: { content: {} },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept requestBody objects with at least one content entry', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        post: {
                            requestBody: { content: { 'application/json': {} } },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should reject link objects that define both operationId and operationRef', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    links: {
                        BadLink: {
                            operationId: 'getUser',
                            operationRef: '#/paths/~1users/get',
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/both 'operationId' and 'operationRef'/);
        });

        it('should reject link objects with invalid operationRef URIs', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    links: {
                        BadRef: {
                            operationRef: 'not a uri',
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/operationRef.*URI reference/);
        });

        it('should reject link objects that define neither operationId nor operationRef', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    description: 'ok',
                                    links: {
                                        MissingLink: {},
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/must define either 'operationId' or 'operationRef'/);
        });

        it('should reject link parameters with invalid runtime expressions', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    description: 'ok',
                                    links: {
                                        BadParam: {
                                            operationId: 'getUser',
                                            parameters: {
                                                id: '$request.body#bad',
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Runtime expression.*valid runtime expression/);
        });

        it('should reject link requestBody templates with invalid runtime expressions', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    description: 'ok',
                                    links: {
                                        BadBody: {
                                            operationId: 'getUser',
                                            requestBody: '{not-a-runtime}',
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Runtime expression.*invalid runtime expression/);
        });

        it('should reject link objects with invalid server urls', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    description: 'ok',
                                    links: {
                                        BadServer: {
                                            operationId: 'getUser',
                                            server: { url: 'https://example.com/api?x=1' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Server url MUST NOT include query or fragment/);
        });

        it('should reject callback expressions with invalid runtime syntax', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/ping': {
                        post: {
                            responses: { '200': { description: 'ok' } },
                            callbacks: {
                                onPing: {
                                    '{not-a-runtime}': {
                                        post: { responses: { '200': { description: 'ok' } } },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Callback expression.*runtime expression/);
        });

        it('should reject component callback expressions with invalid runtime syntax', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    callbacks: {
                        BadCallback: {
                            '{not-a-runtime}': {
                                post: { responses: { '200': { description: 'ok' } } },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/Callback expression.*runtime expression/);
        });

        it('should accept callback expressions with embedded runtime templates', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/ping': {
                        post: {
                            responses: { '200': { description: 'ok' } },
                            callbacks: {
                                onPing: {
                                    'https://example.com?url={$request.body#/callbackUrl}': {
                                        post: { responses: { '200': { description: 'ok' } } },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should validate webhooks additionalOperations content and responses', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                webhooks: {
                    hook: {
                        additionalOperations: {
                            POST: {
                                requestBody: {
                                    content: {
                                        'application/json': {
                                            schema: { type: 'object' },
                                        },
                                    },
                                },
                                responses: {
                                    '200': {
                                        description: 'ok',
                                        content: {
                                            'application/json': {
                                                schema: { type: 'object' },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });
    });

    describe('OAS 3.1+ jsonSchemaDialect Field', () => {
        it('should accept valid absolute URI', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.1.0',
                info: validInfo,
                paths: {},
                jsonSchemaDialect: 'https://spec.openapis.org/oas/3.1/dialect/base',
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept URN URI', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.1.0',
                info: validInfo,
                paths: {},
                jsonSchemaDialect: 'urn:ietf:params:xml:ns:yang:1',
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should throw on non-URI string', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.1.0',
                info: validInfo,
                paths: {},
                jsonSchemaDialect: 'not-a-uri',
            };
            expect(() => validateSpec(spec)).toThrow(/must be a valid URI/);
        });

        it('should accept dialect strings that satisfy URI scheme regex when URL parsing fails', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.1.0',
                info: validInfo,
                paths: {},
                jsonSchemaDialect: 'http://',
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should throw on non-string value', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.1.0',
                info: validInfo,
                paths: {},
                jsonSchemaDialect: 123,
            };
            expect(() => validateSpec(spec)).toThrow(/must be a string/);
        });
    });

    describe('OAS 3.2 $self Field', () => {
        it('should accept valid URI references', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                $self: '/api/openapi',
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should reject invalid URI references', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                $self: 'not a uri',
            };
            expect(() => validateSpec(spec)).toThrow(/\$self.*valid URI reference/i);
        });
    });

    describe('OAS 3.2 Discriminator Validation', () => {
        it('should require oneOf/anyOf/allOf when discriminator is present', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                components: {
                    schemas: {
                        Pet: {
                            type: 'object',
                            discriminator: { propertyName: 'petType' },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/only valid alongside oneOf\/anyOf\/allOf/);
        });

        it('should require defaultMapping when discriminator property is optional', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                components: {
                    schemas: {
                        Pet: {
                            type: 'object',
                            discriminator: { propertyName: 'petType' },
                            oneOf: [{ $ref: '#/components/schemas/Cat' }],
                        },
                        Cat: {
                            type: 'object',
                            properties: { petType: { const: 'cat' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/defaultMapping.*required/);
        });

        it('should accept discriminator when property is required', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                components: {
                    schemas: {
                        Pet: {
                            type: 'object',
                            required: ['petType'],
                            discriminator: { propertyName: 'petType' },
                            oneOf: [{ $ref: '#/components/schemas/Cat' }],
                        },
                        Cat: {
                            type: 'object',
                            properties: { petType: { const: 'cat' } },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });
    });

    describe('XML Object Validation (OAS 3.2)', () => {
        it('should reject xml.nodeType combined with deprecated attribute/wrapped fields', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                components: {
                    schemas: {
                        BadXml: {
                            type: 'string',
                            xml: { nodeType: 'element', attribute: true },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/MUST NOT define 'attribute' when 'nodeType' is present/);
        });

        it('should reject xml.wrapped on non-array schemas', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                components: {
                    schemas: {
                        BadWrapped: {
                            type: 'object',
                            xml: { wrapped: true },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/defines 'wrapped' but the schema is not an array/);
        });

        it('should reject xml.namespace that is not an absolute IRI', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                components: {
                    schemas: {
                        BadNamespace: {
                            type: 'string',
                            xml: { namespace: './relative' },
                        },
                    },
                },
            };
            expect(() => validateSpec(spec)).toThrow(/non-relative IRI/);
        });
    });

    describe('Reference Object Strictness', () => {
        it('should allow reference objects with extra fields in responses (ignored by spec)', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    $ref: '#/components/responses/Ok',
                                    extra: true,
                                },
                            },
                        },
                    },
                },
                components: {
                    responses: {
                        Ok: { description: 'ok' },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should allow reference objects with extra fields in parameters (ignored by spec)', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [
                                {
                                    $ref: '#/components/parameters/Id',
                                    extra: 'nope',
                                },
                            ],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
                components: {
                    parameters: {
                        Id: { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should allow reference objects with summary/description overrides', () => {
            // type-coverage:ignore-next-line
            const spec: any = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            responses: {
                                '200': {
                                    $ref: '#/components/responses/Ok',
                                    summary: 'Short summary',
                                    description: 'Override description',
                                },
                            },
                        },
                    },
                },
                components: {
                    responses: {
                        Ok: { description: 'ok' },
                    },
                },
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });
    });
});
