// tests/00-core/06-input-validation.spec.ts

import { describe, expect, it } from 'vitest';

import { SpecValidationError, validateSpec } from '@src/openapi/parse_validator.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { GeneratorConfig } from '@src/core/types/index.js';

describe('Core: Input Spec Validation', () => {
    const validInfo = { title: 'Valid API', version: '1.0.0' };
    const validConfig: GeneratorConfig = { input: '', output: '', options: {} };

    describe('Structural Validation', () => {
        it('should accept a valid Swagger 2.0 spec with paths', () => {
            // type-coverage:ignore-next-line
            const spec = {
                swagger: '2.0',
                info: validInfo,
                paths: {},
            };
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should accept a valid OpenAPI 3.x spec with paths', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.0.1',
                info: validInfo,
                paths: {},
            };
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should accept a valid OpenAPI 3.x spec with components only (no paths)', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.1.0',
                info: validInfo,
                components: { schemas: {} },
            };
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should accept a valid OpenAPI 3.x spec with webhooks only (no paths)', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.1.0',
                info: validInfo,
                webhooks: {},
            };
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should accept a valid $self URI reference', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                $self: '/api/openapi',
                paths: {},
            };
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should reject an invalid $self URI reference', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                $self: 'not a uri',
                paths: {},
            };
            expect(() => validateSpec(spec as never)).toThrow(/\$self.*URI reference/);
        });

        it('should throw if spec object is null/undefined', () => {
            expect(() => validateSpec(null as any)).toThrow(SpecValidationError);
            expect(() => validateSpec(undefined as any)).toThrow(SpecValidationError);
        });

        it('should throw on missing version header', () => {
            // type-coverage:ignore-next-line
            const spec = { info: validInfo, paths: {} };
            expect(() => validateSpec(spec as never)).toThrow(/Unsupported or missing OpenAPI\/Swagger version/);
        });

        it('should throw on invalid version (e.g. 1.2)', () => {
            // type-coverage:ignore-next-line
            const spec = { swagger: '1.2', info: validInfo, paths: {} };
            expect(() => validateSpec(spec as never)).toThrow(/Unsupported or missing OpenAPI\/Swagger version/);
        });

        it('should throw on missing info object', () => {
            // type-coverage:ignore-next-line
            const spec = { openapi: '3.0.0', paths: {} };
            expect(() => validateSpec(spec as never)).toThrow(/must contain an 'info' object/);
        });

        it('should throw on missing info title', () => {
            // type-coverage:ignore-next-line
            const spec = { openapi: '3.0.0', info: { version: '1.0' }, paths: {} };
            expect(() => validateSpec(spec as never)).toThrow(/must contain a required string field: 'title'/);
        });

        it('should throw on missing info version', () => {
            // type-coverage:ignore-next-line
            const spec = { openapi: '3.0.0', info: { title: 'API' }, paths: {} };
            expect(() => validateSpec(spec as never)).toThrow(/must contain a required string field: 'version'/);
        });

        it('should reject invalid termsOfService URI', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: { ...validInfo, termsOfService: 'not a uri' },
                paths: {},
            };
            expect(() => validateSpec(spec as never)).toThrow(/termsOfService must be a valid URI/i);
        });

        it('should reject invalid contact url and email', () => {
            const specUrl = {
                openapi: '3.2.0',
                info: {
                    ...validInfo,
                    contact: {
                        url: 'ht!tp://bad',
                    },
                },
                paths: {},
            };
            expect(() => validateSpec(specUrl as never)).toThrow(/contact.url must be a valid URI/i);

            const specEmail = {
                openapi: '3.2.0',
                info: {
                    ...validInfo,
                    contact: {
                        email: 'not-an-email',
                    },
                },
                paths: {},
            };
            expect(() => validateSpec(specEmail as never)).toThrow(/contact.email must be a valid email/i);
        });

        it('should accept valid contact url and email', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should reject invalid externalDocs at root', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                externalDocs: { url: 'not a uri' },
            };
            expect(() => validateSpec(spec as never)).toThrow(/ExternalDocs\.url must be a valid URI/i);
        });

        it('should reject invalid externalDocs on tag', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                tags: [{ name: 'bad', externalDocs: { url: 'bad uri' } }],
            };
            expect(() => validateSpec(spec as never)).toThrow(/tags\.bad\.externalDocs/i);
        });

        it('should reject invalid externalDocs on operation', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/externalDocs/i);
        });

        it('should reject invalid externalDocs on schema', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/components\.schemas\.BadSchema\.externalDocs/i);
        });

        it('should reject invalid schema $id and $schema URIs', () => {
            expect(() =>
                validateSpec({
                    openapi: '3.2.0',
                    info: validInfo,
                    paths: {},
                    components: { schemas: { BadId: { type: 'object', $id: 'not a uri' } } },
                } as any),
            ).toThrow(/Schema Object.*\$id/);

            expect(() =>
                validateSpec({
                    openapi: '3.2.0',
                    info: validInfo,
                    paths: {},
                    components: { schemas: { BadSchema: { type: 'object', $schema: 'also not a uri' } } },
                } as any),
            ).toThrow(/Schema Object.*\$schema/);
        });

        it('should reject invalid schema $ref and $dynamicRef URIs', () => {
            expect(() =>
                validateSpec({
                    openapi: '3.2.0',
                    info: validInfo,
                    paths: {},
                    components: { schemas: { BadRef: { $ref: 'not a uri' } } },
                } as any),
            ).toThrow(/Schema Object.*\$ref/);

            expect(() =>
                validateSpec({
                    openapi: '3.2.0',
                    info: validInfo,
                    paths: {},
                    components: { schemas: { BadDynamic: { $dynamicRef: 'not a uri' } } },
                } as any),
            ).toThrow(/Schema Object.*\$dynamicRef/);
        });

        it('should reject invalid schema anchors', () => {
            expect(() =>
                validateSpec({
                    openapi: '3.2.0',
                    info: validInfo,
                    paths: {},
                    components: { schemas: { BadAnchor: { type: 'object', $anchor: '' } } },
                } as any),
            ).toThrow(/invalid '\$anchor'/);

            expect(() =>
                validateSpec({
                    openapi: '3.2.0',
                    info: validInfo,
                    paths: {},
                    components: { schemas: { BadDynamicAnchor: { type: 'object', $dynamicAnchor: 123 } } },
                } as any),
            ).toThrow(/invalid '\$dynamicAnchor'/);
        });

        it('should ignore reserved header parameters (Accept/Content-Type/Authorization)', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should reject paths keys that do not start with "/"', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/Path key "users" must start with \"\/\"/);
        });

        it('should reject invalid response status code keys', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/invalid status code '600'/i);
        });

        it('should accept response code ranges and default', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should throw if Swagger 2.0 has no paths', () => {
            // type-coverage:ignore-next-line
            const spec = { swagger: '2.0', info: validInfo }; // Missing paths
            expect(() => validateSpec(spec as never)).toThrow(
                /Swagger 2.0 specification must contain a 'paths' object/,
            );
        });

        it('should throw if OpenAPI 3.x has no paths, components, or webhooks', () => {
            // type-coverage:ignore-next-line
            const spec = { openapi: '3.0.0', info: validInfo }; // Completely empty structure
            expect(() => validateSpec(spec as never)).toThrow(
                /must contain at least one of: 'paths', 'components', or 'webhooks'/,
            );
        });
    });

    describe('License Object Validation', () => {
        it('should throw if License is missing required name', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: {
                    ...validInfo,
                    license: {
                        url: 'https://opensource.org/licenses/MIT',
                    },
                },
                paths: {},
            };
            expect(() => validateSpec(spec as never)).toThrow(
                /License object must contain a required string field: 'name'/,
            );
        });

        it('should throw if License contains both url and identifier (Mutually Exclusive)', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/mutually exclusive/);
        });

        it('should accept License with only url', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should accept License with only identifier (OAS 3.1+)', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should accept License with neither url nor identifier (just name)', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.0.0',
                info: {
                    ...validInfo,
                    license: {
                        name: 'Proprietary',
                    },
                },
                paths: {},
            };
            expect(() => validateSpec(spec as never)).not.toThrow();
        });
    });

    describe('Path Parameter Validation', () => {
        it('should reject when a templated path is missing a path parameter definition', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/users/{id}': {
                        get: { responses: { '200': { description: 'ok' } } },
                    },
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(/missing a corresponding 'in: path'/i);
        });

        it('should allow templated paths to omit path params when the path item is empty (ACL exception)', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/users/{id}': {
                        summary: 'ACL-hidden path',
                    },
                },
            };
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should reject when a path parameter is not required', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/must be marked as required/i);
        });

        it('should reject when a path parameter does not match the template', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/does not match any template variable/i);
        });

        it('should accept when path parameters are defined at the path level', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/users/{id}': {
                        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                        get: { responses: { '200': { description: 'ok' } } },
                    },
                },
            };
            expect(() => validateSpec(spec as never)).not.toThrow();
        });
    });

    describe('Components Key Validation', () => {
        it('should accept mediaTypes and webhooks component keys that match the regex', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                components: {
                    mediaTypes: { 'My.Media_Type-1': { schema: { type: 'string' } } },
                    webhooks: { ValidWebhook: { post: { responses: { '200': { description: 'ok' } } } } },
                },
            };
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should reject invalid mediaTypes component keys', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                components: {
                    mediaTypes: { 'Bad Key!': { schema: { type: 'string' } } },
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(/Invalid component key/);
        });

        it('should reject invalid webhooks component keys', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                components: {
                    webhooks: { 'Bad/Key': { post: { responses: { '200': { description: 'ok' } } } } },
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(/Invalid component key/);
        });
    });

    describe('Responses Validation', () => {
        it('should reject operations missing responses', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/missing-responses': {
                        get: {},
                    },
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(/must define 'responses'/i);
        });

        it('should reject response objects without description', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/missing-description': {
                        get: { responses: { '200': {} } },
                    },
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(/Response Object.*description/i);
        });

        it('should reject responses objects with no entries', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/empty-responses': {
                        get: { responses: {} },
                    },
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(/Responses Object.*at least one response code/i);
        });

        it('should accept response objects with descriptions', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/with-description': {
                        get: { responses: { '200': { description: 'ok' } } },
                    },
                },
            };
            expect(() => validateSpec(spec as never)).not.toThrow();
        });
    });

    describe('Component Path Item Validation', () => {
        it('should validate component pathItems operations', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/Response Object.*description/i);
        });

        it('should validate component webhooks operations', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/Responses Object.*at least one response code/i);
        });
    });

    describe('OperationId Uniqueness', () => {
        it('should throw when operationIds are duplicated across paths', () => {
            // type-coverage:ignore-next-line
            const spec = {
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

            expect(() => validateSpec(spec as never)).toThrow(/Duplicate operationId "dup"/);
        });

        it('should throw when operationIds are duplicated across webhooks', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                webhooks: {
                    eventA: { post: { operationId: 'whDup', responses: { '200': { description: 'ok' } } } },
                    eventB: { post: { operationId: 'whDup', responses: { '200': { description: 'ok' } } } },
                },
            };

            expect(() => validateSpec(spec as never)).toThrow(/Duplicate operationId "whDup"/);
        });

        it('should allow unique operationIds across paths and webhooks', () => {
            // type-coverage:ignore-next-line
            const spec = {
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

            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should throw when operationIds are duplicated across callbacks', () => {
            // type-coverage:ignore-next-line
            const spec = {
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

            expect(() => validateSpec(spec as never)).toThrow(/Duplicate operationId "dupCallback"/);
        });

        it('should throw when operationIds are duplicated across paths and components.pathItems', () => {
            // type-coverage:ignore-next-line
            const spec = {
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

            expect(() => validateSpec(spec as never)).toThrow(/Duplicate operationId "dupComponent"/);
        });

        it('should throw when operationIds are duplicated inside components.pathItems', () => {
            // type-coverage:ignore-next-line
            const spec = {
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

            expect(() => validateSpec(spec as never)).toThrow(/Duplicate operationId "dupPathItem"/);
        });
    });

    describe('Integration with SwaggerParser', () => {
        it('should validate spec upon construction', () => {
            // type-coverage:ignore-next-line
            const invalidSpec = { openapi: '3.0.0' }; // No info
            expect(() => new SwaggerParser(invalidSpec, validConfig)).toThrow(SpecValidationError);
        });

        it('should support custom validation callback from config', () => {
            // type-coverage:ignore-next-line
            const spec = { openapi: '3.0.0', info: validInfo, paths: {} };
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
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should throw on invalid characters (space) in component keys', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {},
                components: {
                    schemas: {
                        'User Name': {},
                    },
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(
                /Invalid component key "User Name" in "components.schemas"/,
            );
        });

        it('should throw on invalid symbols ($) in component keys', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        $limit: { name: 'limit', in: 'query', schema: { type: 'integer' } },
                    },
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(
                /Invalid component key "\$limit" in "components.parameters"/,
            );
        });

        it('should throw on invalid symbols (@) in securitySchemes keys', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {},
                components: {
                    securitySchemes: {
                        '@auth': { type: 'http', scheme: 'basic' },
                    },
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(
                /Invalid component key "@auth" in "components.securitySchemes"/,
            );
        });
    });

    describe('Component Parameter Validation (OAS 3.2)', () => {
        it('should throw if a component parameter is not an object or reference', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        BadParam: 'not-an-object',
                    },
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(
                /Component parameter 'BadParam' must be an object or Reference Object/,
            );
        });

        it('should throw if a component parameter is missing name', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        MissingName: { in: 'query', schema: { type: 'string' } },
                    },
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(
                /Component parameter 'MissingName' must define a non-empty string 'name'/,
            );
        });

        it('should throw if a component parameter is missing in', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        MissingIn: { name: 'q', schema: { type: 'string' } },
                    },
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(
                /Component parameter 'MissingIn' must define a non-empty string 'in'/,
            );
        });
    });

    describe('Server Object Validation (OAS 3.x)', () => {
        it('should reject server URLs containing query or fragment', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                servers: [{ url: 'https://example.com/api?x=1' }],
                paths: {},
            };
            expect(() => validateSpec(spec as never)).toThrow(/MUST NOT include query or fragment/);
        });

        it('should reject server URLs with unmatched braces', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                servers: [{ url: 'https://{region.example.com' }],
                paths: {},
            };
            expect(() => validateSpec(spec as never)).toThrow(/opening.*matching/i);
        });

        it('should reject server URLs with unmatched closing braces', () => {
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                servers: [{ url: 'https://region}.example.com' }],
                paths: {},
            };
            expect(() => validateSpec(spec as never)).toThrow(/contains a closing "}" without a matching/i);
        });

        it('should reject server URLs with nested braces', () => {
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                servers: [{ url: 'https://{{region}}.example.com' }],
                paths: {},
            };
            expect(() => validateSpec(spec as never)).toThrow(/contains nested "{" characters/i);
        });

        it('should reject server URLs with empty template expressions', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                servers: [{ url: 'https://example.com/{}' }],
                paths: {},
            };
            expect(() => validateSpec(spec as never)).toThrow(/empty template expression/);
        });

        it('should reject server variables with empty enum', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/enum MUST NOT be empty/);
        });

        it('should reject server variables with non-string enum values', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/enum MUST contain only strings/);
        });

        it('should reject server variables whose default is not in enum', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/default MUST be present in enum/);
        });

        it('should reject server variables that appear more than once', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/appears more than once/);
        });

        it('should reject server URLs defining template variables but missing variables object entirely', () => {
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                servers: [{ url: 'https://{region}.example.com' }],
                paths: {},
            };
            expect(() => validateSpec(spec as never)).toThrow(/defines template variables but 'variables' is missing/);
        });

        it('should reject empty or non-string server url', () => {
            const spec1 = { openapi: '3.2.0', info: validInfo, servers: [{ url: '' }], paths: {} };
            const spec2 = { openapi: '3.2.0', info: validInfo, servers: [{ url: 123 }], paths: {} };
            expect(() => validateSpec(spec1)).toThrow(/must be a non-empty string/);
            expect(() => validateSpec(spec2)).toThrow(/must be a non-empty string/);
        });

        it('should reject duplicate server names', () => {
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                servers: [
                    { url: 'https://api.example.com', name: 'prod' },
                    { url: 'https://staging.example.com', name: 'prod' },
                ],
                paths: {},
            };
            expect(() => validateSpec(spec as never)).toThrow(/Server name "prod" must be unique/);
        });

        it('should reject server URLs with undefined template variables', () => {
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                servers: [
                    {
                        url: 'https://{region}.example.com',
                        variables: { env: { default: 'prod' } },
                    },
                ],
                paths: {},
            };
            expect(() => validateSpec(spec as never)).toThrow(/not defined in variables/);
        });

        it('should reject server variables missing required default', () => {
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                servers: [
                    {
                        url: 'https://{env}.example.com',
                        variables: { env: {} },
                    },
                ],
                paths: {},
            };
            expect(() => validateSpec(spec as never)).toThrow(/must define a string default/);
        });
    });

    describe('Tag Parent Validation (OAS 3.2)', () => {
        it('should reject duplicate tag names', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                tags: [{ name: 'dup' }, { name: 'dup' }],
            };
            expect(() => validateSpec(spec as never)).toThrow(/Duplicate tag name/);
        });

        it('should reject tags whose parent does not exist', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                tags: [{ name: 'child', parent: 'missing' }],
            };
            expect(() => validateSpec(spec as never)).toThrow(/parent "missing" which does not exist/);
        });

        it('should reject circular tag parent references', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                tags: [
                    { name: 'a', parent: 'b' },
                    { name: 'b', parent: 'a' },
                ],
            };
            expect(() => validateSpec(spec as never)).toThrow(/Circular tag parent reference/);
        });

        it('should accept valid tag parent references', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                tags: [{ name: 'root' }, { name: 'child', parent: 'root' }],
            };
            expect(() => validateSpec(spec as never)).not.toThrow();
        });
    });

    describe('Path Template Validation', () => {
        it('should throw error when two paths have identical hierarchy but different param names', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {
                    '/pets/{id}': {},
                    '/pets/{name}': {},
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(/Ambiguous path definition detected/);
        });

        it('should throw when a path template repeats the same variable', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/pets/{id}/{id}': {},
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(/repeats template variable/);
        });

        it('should throw when a path template has unmatched braces', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/pets/{id': {},
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(/opening.*matching/i);
        });

        it('should throw when a path template has empty expressions', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/pets/{}': {},
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(/empty template expression/);
        });

        it('should accept paths with identical hierarchy if they are structurally different', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {
                    '/pets/{id}/info': {},
                    '/pets/{id}/details': {},
                },
            };
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should accept paths that differ only by fixed segments vs variables', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {
                    '/pets/mine': {},
                    '/pets/{id}': {},
                },
            };
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should throw for complex nested collisions', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {
                    '/api/{version}/upload': {},
                    '/api/{v}/upload': {},
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(/Ambiguous path definition detected/);
        });

        it('should traverse Swagger 2.0 swagger paths successfully', () => {
            // type-coverage:ignore-next-line
            const spec = {
                swagger: '2.0',
                info: validInfo,
                paths: {
                    '/api/{version}': {},
                    '/api/{v}': {},
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(/Ambiguous path definition detected/);
        });
    });

    describe('Parameter Validation (OAS 3.2 Strictness)', () => {
        it('should throw if a parameter is missing name', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/non-empty string 'name'/);
        });

        it('should throw if a parameter is missing in', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/non-empty string 'in'/);
        });

        it('should throw if a parameters array contains non-objects', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/must be an object or Reference Object/);
        });

        it('should throw if "query" and "querystring" parameters coexist in same operation', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/contains both 'query' and 'querystring' parameters/);
        });

        it('should throw if "query" and "querystring" coexist via path-level and operation-level inheritance', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/contains both 'query' and 'querystring' parameters/);
        });

        it('should throw if path-level parameters contain duplicates', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/Duplicate parameter 'dup'/);
        });

        it('should throw if operation parameters contain duplicates', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/Duplicate parameter 'dup'/);
        });

        it('should treat header parameter names as case-insensitive for duplicates', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/Duplicate parameter/);
        });

        it('should allow operation parameters to override path-level parameters', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should throw if parameter has both "example" and "examples"', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/contains both 'example' and 'examples'/);
        });

        it('should throw if a parameter defines neither schema nor content', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/must define either 'schema' or 'content'/);
        });

        it('should throw if component parameter has both "example" and "examples"', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(
                /Component parameter 'MyParam' contains both 'example' and 'examples'/,
            );
        });

        it('should throw if component parameter defines neither schema nor content', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(
                /Component parameter 'MyParam' must define either 'schema' or 'content'/,
            );
        });

        it('should throw if parameter uses an invalid location in OpenAPI 3.x', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/invalid location 'formData'/);
        });

        it('should throw if parameter uses an invalid style for its location', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/invalid style 'matrix' for location 'query'/);
        });

        it('should throw if deepObject style is used on a non-object schema', () => {
            // type-coverage:ignore-next-line
            const createSpec = (schema: import('@src/core/types/openapi.js').SwaggerSpec) => ({
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [{ name: 'q', in: 'query', style: 'deepObject', schema }],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            });
            expect(() => validateSpec(createSpec({ type: 'string' }))).toThrow(/deepObject.*schema is not an object/);

            // Should also reject array types (OAS 3.1)
            expect(() => validateSpec(createSpec({ type: ['string', 'null'] }))).toThrow(
                /deepObject.*schema is not an object/,
            );

            // Should accept 'unknown' types that might resolve to object later or are free-form
            expect(() => validateSpec(createSpec({ type: 'not-a-type' }))).not.toThrow();
            expect(() => validateSpec(createSpec({ type: ['string', 'number'] }))).not.toThrow();
        });

        it('should throw if spaceDelimited style uses explode=true', () => {
            // type-coverage:ignore-next-line
            const createSpec = (
                style: import('@src/core/types/openapi.js').SwaggerSpec,
                schema: import('@src/core/types/openapi.js').SwaggerSpec,
                explode?: boolean,
            ) => ({
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        get: {
                            parameters: [
                                {
                                    name: 'q',
                                    in: 'query',
                                    style,
                                    explode,
                                    schema,
                                },
                            ],
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            });
            expect(() =>
                validateSpec(createSpec('spaceDelimited', { type: 'array', items: { type: 'string' } }, true)),
            ).toThrow(/spaceDelimited.*explode=true/);

            // Should throw if style is not a string
            expect(() => validateSpec(createSpec(123, { type: 'array' }))).toThrow(/has non-string 'style'/);

            // Should throw if spaceDelimited/pipeDelimited used on primitive schema
            expect(() => validateSpec(createSpec('spaceDelimited', { type: 'string' }))).toThrow(
                /style but schema is not an array or object/,
            );
            expect(() => validateSpec(createSpec('pipeDelimited', { type: 'integer' }))).toThrow(
                /style but schema is not an array or object/,
            );
        });

        it('should throw if pipeDelimited style uses explode=true', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/pipeDelimited.*explode=true/);
        });

        it('should throw if component parameter uses an invalid style', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    parameters: {
                        BadParam: { name: 'id', in: 'header', style: 'form', schema: { type: 'string' } },
                    },
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(/invalid style 'form' for location 'header'/);
        });

        it('should throw if parameter has both "schema" and "content"', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/contains both 'schema' and 'content'/);
        });

        it('should throw if component parameter has both "schema" and "content"', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(
                /Component parameter 'MyParam' contains both 'schema' and 'content'/,
            );
        });

        it('should throw if parameter content map has multiple entries (OAS 3.2)', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(
                /has an invalid 'content' map. It MUST contain exactly one entry/,
            );
        });

        it('should throw if component parameter content map has multiple entries (OAS 3.2)', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(
                /has an invalid 'content' map. It MUST contain exactly one entry/,
            );
        });

        it('should accept component parameter content map with a single entry', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should throw if allowEmptyValue used with style (OAS 3.2)', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(
                /defines 'allowEmptyValue' alongside 'style'. This is forbidden/,
            );
        });

        it('should accept allowEmptyValue on query parameter when style is absent', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should throw if allowEmptyValue used on non-query param (OAS 3.2)', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/defines 'allowEmptyValue' but location is not 'query'/);
        });

        it('should throw if querystring parameter defines style/explode/allowReserved', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(
                /location 'querystring' but defines style\/explode\/allowReserved/,
            );
        });

        it('should throw if querystring parameter is missing content', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/location 'querystring' but defines 'schema'/);
        });

        it('should throw if querystring parameter defines schema', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/contains both 'schema' and 'content'/);
        });

        it('should throw if operation defines more than one querystring parameter', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/defines more than one 'querystring' parameter/);
        });

        it('should throw if component parameter allowEmptyValue used on non-query', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/defines 'allowEmptyValue' but location is not 'query'/);
        });

        it('should throw if component parameter allowEmptyValue used with style', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/defines 'allowEmptyValue' alongside 'style'/);
        });

        it('should accept component parameter allowEmptyValue when style is absent', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should throw if component parameter querystring defines style/explode/allowReserved', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(
                /location 'querystring' but defines style\/explode\/allowReserved/,
            );
        });

        it('should accept component parameter querystring without style/explode/allowReserved', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should throw if component parameter querystring is missing content', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/location 'querystring' but defines 'schema'/);
        });

        it('should accept "example" only', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should accept "examples" only', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should accept "schema" only', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should accept "content" only', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });
    });

    describe('OAS 3.2 Header, MediaType, and Link Validation', () => {
        it('should reject header objects that define a name', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/Header Object.*name/);
        });

        it('should reject header objects that define an in', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/Header Object.*in/);
        });

        it('should reject header objects that define allowEmptyValue', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/allowEmptyValue/);
        });

        it('should reject header objects missing schema and content', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/must define either 'schema' or 'content'/);
        });

        it('should reject header objects with a non-simple style', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/invalid 'style'/);
        });

        it('should reject header objects with example and examples', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/example.*examples/);
        });

        it('should reject header objects with schema and content', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/schema.*content/);
        });

        it('should reject header content maps with multiple entries', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/content.*exactly one entry/);
        });

        it('should accept header content maps with single entry and valid media type', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should reject media types that define example and examples', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/Media Type Object.*example.*examples/);
        });

        it('should reject itemSchema on non-sequential media types', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/itemSchema.*not sequential/);
        });

        it('should allow itemSchema on custom JSON media types', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should allow itemSchema on sequential media types', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should reject media types that mix encoding with prefixEncoding', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/encoding.*prefixEncoding.*mutually exclusive/);
        });

        it('should reject encoding on non-form/non-multipart media types', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/media type.*encoding/i);
        });

        it('should reject encoding headers that define Content-Type', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/Content-Type.*headers/i);
        });

        it('should reject encoding objects with non-string contentType', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/contentType/i);
        });

        it('should reject encoding objects with invalid style', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/Encoding Object.*invalid 'style'/);
        });

        it('should validate Encoding Object properties', () => {
            const createSpec = (encodingObj: import('@src/core/types/openapi.js').SwaggerSpec) => ({
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        post: {
                            requestBody: {
                                content: {
                                    'multipart/form-data': {
                                        schema: { type: 'object', properties: { f: { type: 'string' } } },
                                        encoding: { f: encodingObj },
                                    },
                                },
                            },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            });

            expect(() => validateSpec(createSpec([]))).toThrow(/must be an object/);
            expect(() => validateSpec(createSpec({ contentType: 123 }))).toThrow(/non-string 'contentType'/);
            expect(() => validateSpec(createSpec({ style: 123 }))).toThrow(/non-string 'style'/);
            expect(() => validateSpec(createSpec({ explode: 'yes' }))).toThrow(/non-boolean 'explode'/);
            expect(() => validateSpec(createSpec({ allowReserved: 'yes' }))).toThrow(/non-boolean 'allowReserved'/);
            expect(() => validateSpec(createSpec({ headers: [] }))).toThrow(/invalid 'headers' map/);
            expect(() => validateSpec(createSpec({ headers: { 'Content-Type': {} } }))).toThrow(
                /MUST NOT define 'Content-Type' in headers/,
            ); // line 1029
            expect(() =>
                validateSpec(createSpec({ headers: { 'X-Rate-Limit': { schema: { type: 'integer' } } } })),
            ).not.toThrow();

            // Nested encoding checks
            expect(() => validateSpec(createSpec({ encoding: [] }))).toThrow(/invalid nested 'encoding' map/);
            expect(() => validateSpec(createSpec({ prefixEncoding: {} }))).toThrow(/prefixEncoding.*must be an array/);
            expect(() => validateSpec(createSpec({ itemEncoding: [] }))).toThrow(/Encoding Object.*must be an object/);

            // Exclusivity checks
            expect(() => validateSpec(createSpec({ encoding: {}, prefixEncoding: [] }))).toThrow(/mutually exclusive/);
            expect(() => validateSpec(createSpec({ encoding: {}, itemEncoding: {} }))).toThrow(/mutually exclusive/);

            // Valid nested paths should trace through recursively
            expect(() => validateSpec(createSpec({ encoding: { inner: { style: 123 } } }))).toThrow(
                /non-string 'style'/,
            );
            expect(() => validateSpec(createSpec({ prefixEncoding: [{ style: 123 }] }))).toThrow(/non-string 'style'/);
            expect(() => validateSpec(createSpec({ itemEncoding: { style: 123 } }))).toThrow(/non-string 'style'/);
        });

        it('should validate MediaType Object encoding on unsupported media types', () => {
            const createSpec = (
                mediaType: string,
                encodingConfig: import('@src/core/types/openapi.js').SwaggerSpec,
            ) => ({
                openapi: '3.2.0',
                info: validInfo,
                paths: {
                    '/test': {
                        post: {
                            requestBody: {
                                content: {
                                    [mediaType]: {
                                        schema: { type: 'object', properties: { f: { type: 'string' } } },
                                        ...encodingConfig,
                                    },
                                },
                            },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            });

            expect(() => validateSpec(createSpec('application/json', { encoding: {} }))).toThrow(/does not support it/); // 1115
            expect(() => validateSpec(createSpec('application/json', { prefixEncoding: [] }))).toThrow(
                /is not multipart/,
            ); // 1129
            expect(() => validateSpec(createSpec('multipart/form-data', { encoding: [] }))).toThrow(
                /invalid 'encoding' map/,
            ); // 1139? Actually, 1129 is inside validateMediaTypeObject line 1129. Let's trace it.

            // This tests validateMediaTypeObject line 1139 where prefixEncoding is not an array:
            expect(() => validateSpec(createSpec('multipart/form-data', { prefixEncoding: {} }))).toThrow(
                /invalid 'prefixEncoding'. It must be an array/,
            );
        });

        it('should reject Header Object examples when schema and content are missing', () => {
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                components: {
                    headers: {
                        BadHeader: {
                            examples: { ex: { value: 'test' } },
                            // Missing schema/content hits 1225/1226
                        },
                    },
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(/must define either 'schema' or 'content'/);
        });

        it('should reject Link Object invalid operationRef', () => {
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                components: {
                    links: {
                        BadLink: {
                            operationRef: 'not a uri ', // hits 1306
                        },
                    },
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(/must be a valid URI reference/);
        });

        it('should validate RequestBody and Response objects thoroughly', () => {
            // RequestBody content validation (1349)
            expect(() =>
                validateSpec({
                    openapi: '3.2.0',
                    info: validInfo,
                    paths: {},
                    components: { requestBodies: { Bad: { description: 'bad', content: [] } } },
                } as any),
            ).toThrow(/invalid 'content'. It must be an object/);

            // Response description non-string (1377)
            expect(() =>
                validateSpec({
                    openapi: '3.2.0',
                    info: validInfo,
                    paths: {},
                    components: { responses: { Bad: { description: 123 } } },
                } as any),
            ).toThrow(/non-string 'description'/);
        });

        it('should reject requestBody objects without content', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/RequestBody Object.*content/);
        });

        it('should allow requestBody objects with empty content maps (implementation-defined)', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should accept requestBody objects with at least one content entry', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should reject link objects that define both operationId and operationRef', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/both 'operationId' and 'operationRef'/);
        });

        it('should reject link objects with invalid operationRef URIs', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/operationRef.*URI reference/);
        });

        it('should reject link objects with invalid parameters', () => {
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: {
                    links: {
                        BadParamLink: {
                            operationRef: '#/op',
                            parameters: [],
                        },
                    },
                },
            };
            expect(() => validateSpec(spec as never)).toThrow(/invalid 'parameters'/);
        });

        it('should reject link objects that define neither operationId nor operationRef', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/must define either 'operationId' or 'operationRef'/);
        });

        it('should reject link parameters with invalid runtime expressions', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/Runtime expression.*valid runtime expression/);
        });

        it('should reject link requestBody templates with invalid runtime expressions', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/Runtime expression.*invalid runtime expression/);
        });

        it('should reject link objects with invalid server urls', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/Server url MUST NOT include query or fragment/);
        });

        it('should reject callback expressions with invalid runtime syntax', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/Callback expression.*runtime expression/);
        });

        it('should reject component callback expressions with invalid runtime syntax', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/Callback expression.*runtime expression/);
        });

        it('should accept callback expressions with embedded runtime templates', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should validate webhooks additionalOperations content and responses', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });
    });

    describe('OAS 3.1+ jsonSchemaDialect Field', () => {
        it('should accept valid absolute URI', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.1.0',
                info: validInfo,
                paths: {},
                jsonSchemaDialect: 'https://spec.openapis.org/oas/3.1/dialect/base',
            };
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should accept URN URI', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.1.0',
                info: validInfo,
                paths: {},
                jsonSchemaDialect: 'urn:ietf:params:xml:ns:yang:1',
            };
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should throw on non-URI string', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.1.0',
                info: validInfo,
                paths: {},
                jsonSchemaDialect: 'not-a-uri',
            };
            expect(() => validateSpec(spec as never)).toThrow(/must be a valid URI/);
        });

        it('should accept dialect strings that satisfy URI scheme regex when URL parsing fails', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.1.0',
                info: validInfo,
                paths: {},
                jsonSchemaDialect: 'http://',
            };
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should throw on non-string value', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.1.0',
                info: validInfo,
                paths: {},
                jsonSchemaDialect: 123,
            };
            expect(() => validateSpec(spec as never)).toThrow(/must be a string/);
        });
    });

    describe('OAS 3.2 $self Field', () => {
        it('should accept valid URI references', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                $self: '/api/openapi',
            };
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should reject invalid URI references', () => {
            // type-coverage:ignore-next-line
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                $self: 'not a uri',
            };
            expect(() => validateSpec(spec as never)).toThrow(/\$self.*valid URI reference/i);
        });
    });

    describe('OAS 3.2 Discriminator Validation', () => {
        const createSpec = (schema: import('@src/core/types/openapi.js').SwaggerSpec) => ({
            openapi: '3.2.0',
            info: validInfo,
            components: { schemas: { Test: schema } },
        });

        it('should reject string discriminators outside of Swagger 2.0 definitions', () => {
            expect(() => validateSpec(createSpec({ discriminator: 'foo' }))).toThrow(/must be an object/);
        });

        it('should reject non-object discriminators', () => {
            expect(() => validateSpec(createSpec({ discriminator: [] }))).toThrow(/must be an object/);
        });

        it('should require oneOf/anyOf/allOf when discriminator is present', () => {
            expect(() =>
                validateSpec(createSpec({ type: 'object', discriminator: { propertyName: 'petType' } })),
            ).toThrow(/only valid alongside oneOf\/anyOf\/allOf/);
        });

        it('should reject invalid discriminator mappings', () => {
            const schema1 = { oneOf: [{}], discriminator: { propertyName: 'p', mapping: [] } };
            expect(() => validateSpec(createSpec(schema1))).toThrow(/mapping.*must be an object/);

            const schema2 = { oneOf: [{}], discriminator: { propertyName: 'p', mapping: { a: 123 } } };
            expect(() => validateSpec(createSpec(schema2))).toThrow(/mapping value.*must be a string/);
        });

        it('should deeply check if property is required in allOf, ignoring refs and primitives', () => {
            const schema = {
                allOf: [null, { $ref: '#/components/schemas/Other' }, { required: ['p'] }],
                oneOf: [{}],
                discriminator: { propertyName: 'p' },
            };
            expect(() => validateSpec(createSpec(schema))).not.toThrow();
        });

        it('should reject discriminator with missing or empty propertyName', () => {
            expect(() => validateSpec(createSpec({ oneOf: [{}], discriminator: {} }))).toThrow(
                /must define a non-empty string 'propertyName'/,
            );
            expect(() => validateSpec(createSpec({ oneOf: [{}], discriminator: { propertyName: ' ' } }))).toThrow(
                /must define a non-empty string 'propertyName'/,
            );
        });

        it('should reject discriminator with non-string defaultMapping', () => {
            expect(() =>
                validateSpec(createSpec({ oneOf: [{}], discriminator: { propertyName: 'p', defaultMapping: 123 } })),
            ).toThrow(/defaultMapping.*must be a string/);
        });

        it('should require defaultMapping when discriminator property is optional', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/defaultMapping.*required/);
        });

        it('should accept discriminator when property is required', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });
    });

    describe('XML Object Validation (OAS 3.2)', () => {
        it('should reject xml.nodeType combined with deprecated attribute/wrapped fields', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/MUST NOT define 'attribute' when 'nodeType' is present/);
        });

        it('should reject xml.wrapped on non-array schemas', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).toThrow(/defines 'wrapped' but the schema is not an array/);
        });

        it('should reject xml.namespace that is not an absolute IRI', () => {
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                components: { schemas: { BadNamespace: { type: 'string', xml: { namespace: './relative' } } } },
            };
            expect(() => validateSpec(spec as never)).toThrow(/non-relative IRI/);
        });

        it('should reject non-object xml properties', () => {
            const createSpec = (xml: import('@src/core/types/openapi.js').SwaggerSpec) => ({
                openapi: '3.2.0',
                info: validInfo,
                components: { schemas: { BadXml: { type: 'string', xml } } },
            });

            expect(() => validateSpec(createSpec([]))).toThrow(/must be an object/);
            expect(() => validateSpec(createSpec({ nodeType: 123 }))).toThrow(/invalid 'nodeType'/);
            expect(() => validateSpec(createSpec({ nodeType: 'element', wrapped: true }))).toThrow(
                /MUST NOT define 'wrapped'/,
            );
            expect(() => validateSpec(createSpec({ name: 123 }))).toThrow(/non-string 'name'/);
            expect(() => validateSpec(createSpec({ prefix: 123 }))).toThrow(/non-string 'prefix'/);
            expect(() => validateSpec(createSpec({ attribute: 'true' }))).toThrow(/non-boolean 'attribute'/);
            expect(() => validateSpec(createSpec({ wrapped: 'true' }))).toThrow(/non-boolean 'wrapped'/);
        });
    });

    describe('Reference Object Strictness', () => {
        it('should allow reference objects with extra fields in responses (ignored by spec)', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should allow reference objects with extra fields in parameters (ignored by spec)', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should allow reference objects with summary/description overrides', () => {
            // type-coverage:ignore-next-line
            const spec = {
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
            expect(() => validateSpec(spec as never)).not.toThrow();
        });

        it('should reject reference objects that define both $ref and $dynamicRef', () => {
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: { responses: { Ok: { $ref: '#/a', $dynamicRef: '#/b' } } },
            };
            expect(() => validateSpec(spec as never)).toThrow(/must not define both '\$ref' and '\$dynamicRef'/);
        });

        it('should reject reference objects with invalid $ref or $dynamicRef', () => {
            const spec1 = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: { responses: { Ok: { $ref: 'not a ref ' } } },
            };
            expect(() => validateSpec(spec1)).toThrow(/invalid '\$ref' URI/);

            const spec2 = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: { responses: { Ok: { $dynamicRef: 'not a ref ' } } },
            };
            expect(() => validateSpec(spec2)).toThrow(/invalid '\$dynamicRef' URI/);
        });

        it('should reject reference objects with non-string summary or description', () => {
            const spec1 = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: { responses: { Ok: { $ref: '#/a', summary: 123 } } },
            };
            expect(() => validateSpec(spec1)).toThrow(/non-string 'summary'/);

            const spec2 = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                components: { responses: { Ok: { $ref: '#/a', description: 123 } } },
            };
            expect(() => validateSpec(spec2)).toThrow(/non-string 'description'/);
        });
    });

    describe('Runtime Expressions / Callbacks', () => {
        const createSpec = (expression: string) => ({
            openapi: '3.1.0',
            info: validInfo,
            components: {
                callbacks: {
                    MyCallback: {
                        [expression]: {
                            post: {
                                responses: { '200': { description: 'ok' } },
                            },
                        },
                    },
                },
            },
        });

        it('should reject empty string expressions', () => {
            expect(() => validateSpec(createSpec(''))).toThrow(/must be a non-empty string/);
        });

        it('should reject unmatched braces in template', () => {
            expect(() => validateSpec(createSpec('{$request.body'))).toThrow(/contains unmatched braces/);
            expect(() => validateSpec(createSpec('{$request.body}{'))).toThrow(/contains unmatched braces/);
        });

        it('should reject nested braces or invalid runtime expression inside braces', () => {
            expect(() => validateSpec(createSpec('{$request.unknown}'))).toThrow(/invalid runtime expression/);
        });

        it('should reject runtime expressions outside braces if required (e.g. starting with $)', () => {
            expect(() => validateSpec(createSpec('$request.unknown'))).toThrow(/must be a valid runtime expression/);
        });

        it('should accept valid json pointer in body', () => {
            expect(() => validateSpec(createSpec('{$request.body#/foo/bar}'))).not.toThrow();
        });

        it('should reject invalid header tokens', () => {
            expect(() => validateSpec(createSpec('{$request.header.invalid@token}'))).toThrow(
                /invalid runtime expression/,
            );
        });

        it('should accept valid query and path runtime expressions', () => {
            expect(() => validateSpec(createSpec('{$request.query.somevar}'))).not.toThrow();
            expect(() => validateSpec(createSpec('{$request.path.somevar}'))).not.toThrow();
        });

        it('should reject query and path expressions missing a name', () => {
            expect(() => validateSpec(createSpec('{$request.query.}'))).toThrow(/invalid runtime expression/);
            expect(() => validateSpec(createSpec('{$request.path.}'))).toThrow(/invalid runtime expression/);
        });
        it('should recursively validate schema properties (items, allOf, anyOf, oneOf, not, if, then, else, etc.)', () => {
            const createDeepSpec = (schema: import('@src/core/types/openapi.js').SwaggerSpec) => ({
                openapi: '3.2.0',
                info: validInfo,
                components: { schemas: { Deep: schema } },
            });

            const badDocs = { externalDocs: 'not-an-object' };

            // Trigger line 246:
            expect(() => validateSpec(createDeepSpec(badDocs))).toThrow(/must be an object/);

            // Test recursive visits to cover lines 337-380
            expect(() => validateSpec(createDeepSpec({ allOf: [badDocs] }))).toThrow(/allOf\[0\].externalDocs/);
            expect(() => validateSpec(createDeepSpec({ anyOf: [badDocs] }))).toThrow(/anyOf\[0\].externalDocs/);
            expect(() => validateSpec(createDeepSpec({ oneOf: [badDocs] }))).toThrow(/oneOf\[0\].externalDocs/);
            expect(() => validateSpec(createDeepSpec({ not: badDocs }))).toThrow(/not.externalDocs/);
            expect(() => validateSpec(createDeepSpec({ if: badDocs }))).toThrow(/if.externalDocs/);
            expect(() => validateSpec(createDeepSpec({ then: badDocs }))).toThrow(/then.externalDocs/);
            expect(() => validateSpec(createDeepSpec({ else: badDocs }))).toThrow(/else.externalDocs/);

            // items (object) vs items (array)
            expect(() => validateSpec(createDeepSpec({ items: badDocs }))).toThrow(/items.externalDocs/);
            expect(() => validateSpec(createDeepSpec({ items: [badDocs] }))).toThrow(/items\[0\].externalDocs/);

            expect(() => validateSpec(createDeepSpec({ prefixItems: [badDocs] }))).toThrow(
                /prefixItems\[0\].externalDocs/,
            );

            expect(() => validateSpec(createDeepSpec({ properties: { p: badDocs } }))).toThrow(
                /properties.p.externalDocs/,
            );
            expect(() => validateSpec(createDeepSpec({ patternProperties: { '^p': badDocs } }))).toThrow(
                /patternProperties.\^p.externalDocs/,
            );
            expect(() => validateSpec(createDeepSpec({ additionalProperties: badDocs }))).toThrow(
                /additionalProperties.externalDocs/,
            );
            expect(() => validateSpec(createDeepSpec({ dependentSchemas: { p: badDocs } }))).toThrow(
                /dependentSchemas.p.externalDocs/,
            );
            expect(() => validateSpec(createDeepSpec({ contentSchema: badDocs }))).toThrow(
                /contentSchema.externalDocs/,
            );
        });
    });
});
import { describe, expect, it } from 'vitest';

import { validateSpec } from '@src/openapi/parse_validator.js';

describe('Core: Server Object Validation (Additional)', () => {
    const validInfo = { title: 'Valid API', version: '1.0.0' };

    it('should reject server URLs with undefined template variables', () => {
        // type-coverage:ignore-next-line
        const spec = {
            openapi: '3.2.0',
            info: validInfo,
            servers: [
                {
                    url: 'https://{region}.example.com',
                    variables: { env: { default: 'prod' } },
                },
            ],
            paths: {},
        };
        expect(() => validateSpec(spec as never)).toThrow(/not defined in variables/);
    });

    it('should reject server URLs defining template variables but missing variables object entirely', () => {
        const spec = {
            openapi: '3.2.0',
            info: validInfo,
            servers: [
                {
                    url: 'https://{region}.example.com',
                },
            ],
            paths: {},
        };
        expect(() => validateSpec(spec as never)).toThrow(/defines template variables but 'variables' is missing/);
    });

    it('should reject server variables missing required default', () => {
        // type-coverage:ignore-next-line
        const spec = {
            openapi: '3.2.0',
            info: validInfo,
            servers: [
                {
                    url: 'https://{env}.example.com',
                    variables: { env: {} },
                },
            ],
            paths: {},
        };
        expect(() => validateSpec(spec as never)).toThrow(/must define a string default/);
    });

    it('should reject server variables with non-string default', () => {
        // type-coverage:ignore-next-line
        const spec = {
            openapi: '3.2.0',
            info: validInfo,
            servers: [
                {
                    url: 'https://{env}.example.com',
                    variables: { env: { default: 123 } },
                },
            ],
            paths: {},
        };
        expect(() => validateSpec(spec as never)).toThrow(/must define a string default/);
    });

    it('should reject empty or non-string server url', () => {
        const spec1 = { openapi: '3.2.0', info: validInfo, servers: [{ url: '' }], paths: {} };
        const spec2 = { openapi: '3.2.0', info: validInfo, servers: [{ url: 123 }], paths: {} };
        expect(() => validateSpec(spec1)).toThrow(/must be a non-empty string/);
        expect(() => validateSpec(spec2)).toThrow(/must be a non-empty string/);
    });

    it('should reject duplicate server names', () => {
        // type-coverage:ignore-next-line
        const spec = {
            openapi: '3.2.0',
            info: validInfo,
            servers: [
                { url: 'https://api.example.com', name: 'prod' },
                { url: 'https://staging.example.com', name: 'prod' },
            ],
            paths: {},
        };
        expect(() => validateSpec(spec as never)).toThrow(/Server name "prod" must be unique/);
    });

    it('should reject nested braces in server URL templates', () => {
        // type-coverage:ignore-next-line
        const spec = {
            openapi: '3.2.0',
            info: validInfo,
            servers: [{ url: 'https://{{nested}}.example.com' }],
            paths: {},
        };
        expect(() => validateSpec(spec as never)).toThrow(/contains nested "{" characters/);
    });

    it('should reject unmatched closing braces in server URL templates', () => {
        // type-coverage:ignore-next-line
        const spec = {
            openapi: '3.2.0',
            info: validInfo,
            servers: [{ url: 'https://unmatched}.example.com' }],
            paths: {},
        };
        expect(() => validateSpec(spec as never)).toThrow(/contains a closing "}" without a matching "\{"/);
    });
});
import { describe, expect, it } from 'vitest';

import { validateSpec } from '@src/openapi/parse_validator.js';
import { info } from '../fixtures/common.js';

describe('Core: Security Scheme Validation', () => {
    it('should require name and in for apiKey schemes', () => {
        const spec = {
            openapi: '3.0.0',
            info,
            paths: {},
            components: {
                securitySchemes: {
                    BadApiKey: { type: 'apiKey', in: 'header' },
                },
            },
        };

        expect(() => validateSpec(spec as any)).toThrow(
            /apiKey security scheme "BadApiKey" must define non-empty 'name'/,
        );

        const spec2 = {
            openapi: '3.0.0',
            info,
            paths: {},
            components: {
                securitySchemes: {
                    BadApiKey2: { type: 'apiKey', name: 'key' },
                },
            },
        };

        expect(() => validateSpec(spec2 as any)).toThrow(
            /apiKey security scheme "BadApiKey2" must define 'in' as 'query', 'header', or 'cookie'/,
        );
    });

    it('should require scheme for http schemes', () => {
        const spec = {
            openapi: '3.0.0',
            info,
            paths: {},
            components: {
                securitySchemes: {
                    BadHttp: { type: 'http' },
                },
            },
        };

        expect(() => validateSpec(spec as any)).toThrow(
            /http security scheme "BadHttp" must define non-empty 'scheme'/,
        );
    });

    it('should require valid oauth2 flows with URLs and scopes', () => {
        const spec = {
            openapi: '3.0.0',
            info,
            paths: {},
            components: {
                securitySchemes: {
                    OAuthMissingFlows: { type: 'oauth2' },
                },
            },
        };

        expect(() => validateSpec(spec as any)).toThrow(/must define 'flows'/);
    });

    it('should throw on invalid validateHttpsUrl cases', () => {
        const createSpec = (flows: import('@src/core/types/openapi.js').SwaggerSpec, extraSchemeOverrides = {}) => ({
            openapi: '3.1.0',
            info,
            paths: {},
            components: {
                securitySchemes: {
                    OAuth: {
                        type: 'oauth2',
                        flows,
                        ...extraSchemeOverrides,
                    },
                },
            },
        });

        // Not an object
        expect(() => validateSpec(createSpec({ implicit: 'not-an-object' }))).toThrow(/must be an object/);

        // Missing/empty/non-string URL
        expect(() => validateSpec(createSpec({ implicit: { authorizationUrl: '', scopes: {} } }))).toThrow(
            /must be a non-empty string/,
        );
        expect(() => validateSpec(createSpec({ implicit: { authorizationUrl: 123, scopes: {} } }))).toThrow(
            /must be a non-empty string/,
        );

        // Not a URL
        expect(() => validateSpec(createSpec({ implicit: { authorizationUrl: 'not-a-url', scopes: {} } }))).toThrow(
            /must be a valid URL/,
        );

        // Not HTTPS
        expect(() =>
            validateSpec(createSpec({ implicit: { authorizationUrl: 'http://auth.example.com', scopes: {} } })),
        ).toThrow(/must use https/);

        // Check required URLs per flow
        expect(() => validateSpec(createSpec({ password: { tokenUrl: '', scopes: {} } }))).toThrow(
            /must be a non-empty string/,
        );
        expect(() => validateSpec(createSpec({ clientCredentials: { tokenUrl: '', scopes: {} } }))).toThrow(
            /must be a non-empty string/,
        );
        expect(() =>
            validateSpec(
                createSpec({
                    deviceAuthorization: {
                        authorizationUrl: 'https://auth.example.com',
                        tokenUrl: 'https://auth.example.com',
                        deviceAuthorizationUrl: '',
                        scopes: {},
                    },
                }),
            ),
        ).toThrow(/must be a non-empty string/);

        // Optional refreshUrl
        expect(() =>
            validateSpec(
                createSpec({
                    implicit: { authorizationUrl: 'https://auth.example.com', refreshUrl: 'not-a-url', scopes: {} },
                }),
            ),
        ).toThrow(/must be a valid URL/);

        // Missing scopes
        expect(() => validateSpec(createSpec({ implicit: { authorizationUrl: 'https://auth.example.com' } }))).toThrow(
            /must define 'scopes' as an object/,
        );

        // Test oauth2MetadataUrl using the extra overrides
        expect(() =>
            validateSpec(
                createSpec(
                    { implicit: { authorizationUrl: 'https://auth.example.com', scopes: {} } },
                    { oauth2MetadataUrl: 'http://auth.example.com' },
                ),
            ),
        ).toThrow(/must use https/);

        // Test empty flows object
        expect(() => validateSpec(createSpec({}))).toThrow(/must define at least one flow/);
    });

    it('should require valid base fields for security schemes', () => {
        expect(() =>
            validateSpec({
                openapi: '3.1.0',
                info,
                paths: {},
                components: { securitySchemes: { Bad: { type: 123 } } },
            } as any),
        ).toThrow(/must define a string 'type'/);
        expect(() =>
            validateSpec({
                openapi: '3.1.0',
                info,
                paths: {},
                components: { securitySchemes: { Bad: { type: 'unknown' } } },
            } as any),
        ).toThrow(/unsupported type/);
    });

    it('should ignore non-object or Ref security schemes', () => {
        // Ref-like should just bypass type validation logic
        expect(() =>
            validateSpec({
                openapi: '3.1.0',
                info,
                paths: {},
                components: { securitySchemes: { Ref: { $ref: '#/components/securitySchemes/Other' } } },
            } as any),
        ).not.toThrow();
        expect(() =>
            validateSpec({
                openapi: '3.1.0',
                info,
                paths: {},
                components: { securitySchemes: { NotObj: 'foo' } },
            } as any),
        ).not.toThrow();
    });

    it('should require valid mutualTLS properties', () => {
        expect(() =>
            validateSpec({
                openapi: '3.1.0',
                info,
                paths: {},
                components: { securitySchemes: { Bad: { type: 'mutualTLS' } } },
            } as any),
        ).not.toThrow();
    });

    it('should enforce https URLs for openIdConnect', () => {
        const spec = {
            openapi: '3.0.0',
            info,
            paths: {},
            components: {
                securitySchemes: {
                    OIDC: {
                        type: 'openIdConnect',
                        openIdConnectUrl: 'http://example.com/.well-known/openid-configuration',
                    },
                },
            },
        };

        expect(() => validateSpec(spec as any)).toThrow(/openIdConnectUrl must use https/);
    });

    it('should accept valid oauth2 flows', () => {
        const spec = {
            openapi: '3.0.0',
            info,
            paths: {},
            components: {
                securitySchemes: {
                    OAuth: {
                        type: 'oauth2',
                        flows: {
                            authorizationCode: {
                                authorizationUrl: 'https://auth.example.com/authorize',
                                tokenUrl: 'https://auth.example.com/token',
                                scopes: {},
                            },
                        },
                    },
                },
            },
        };

        expect(() => validateSpec(spec as any)).not.toThrow();
    });
});
// tests/00-core/07-example-validation.spec.ts
import { describe, expect, it } from 'vitest';

import { validateSpec } from '@src/openapi/parse_validator.js';
import { SwaggerSpec } from '@src/core/types/index.js';

const baseSpec: SwaggerSpec = {
    openapi: '3.2.0',
    info: { title: 'Example API', version: '1.0.0' },
    paths: {
        '/pets': {
            get: {
                responses: {
                    '200': {
                        description: 'ok',
                        content: {
                            'application/json': {
                                schema: { type: 'string' },
                                examples: {
                                    ok: {
                                        dataValue: 'hello',
                                        serializedValue: '"hello"',
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
};

function cloneSpec(): SwaggerSpec {
    return JSON.parse(JSON.stringify(baseSpec)) as SwaggerSpec;
}

describe('Core: Example Object validation (OAS 3.2)', () => {
    it('should accept dataValue alongside serializedValue', () => {
        const spec = cloneSpec();
        expect(() => validateSpec(spec as never)).not.toThrow();
    });

    it('should reject Example Object with both value and dataValue', () => {
        const spec = cloneSpec();
        spec.paths!['/pets'].get!.parameters = [
            {
                name: 'q',
                in: 'query',
                schema: { type: 'string' },
                examples: {
                    bad: {
                        value: 'x',
                        dataValue: 'y',
                    },
                },
            },
        ] as any;
        expect(() => validateSpec(spec as never)).toThrow(/value.*dataValue/);
    });

    it('should reject Example Object with both serializedValue and externalValue', () => {
        const spec = cloneSpec();
        // type-coverage:ignore-next-line
        (spec.paths as any)['/pets'].get.responses['200'].content['application/json'].examples = {
            bad: {
                serializedValue: '{"a":1}',
                externalValue: 'http://example.com/example.json',
            },
        };
        expect(() => validateSpec(spec as never)).toThrow(/serializedValue.*externalValue/);
    });

    it('should reject component examples with both value and serializedValue', () => {
        const spec = cloneSpec();
        spec.components = {
            examples: {
                BadExample: {
                    value: 'foo',
                    serializedValue: 'foo',
                },
            },
        };
        expect(() => validateSpec(spec as never)).toThrow(/value.*serializedValue/);
    });

    it('should ignore non-object examples or refs', () => {
        const spec = cloneSpec();
        spec.components = {
            examples: {
                IgnoredStr: 'foo' as any,
                RefExample: { $ref: '#/components/examples/Other' },
            },
        };
        expect(() => validateSpec(spec as never)).not.toThrow();
    });

    it('should reject Example Object with both value and externalValue', () => {
        const spec = cloneSpec();
        spec.components = { examples: { Bad: { value: 'foo', externalValue: 'foo' } } };
        expect(() => validateSpec(spec as never)).toThrow(/value.*externalValue/);
    });

    it('should reject non-string serializedValue and externalValue', () => {
        const spec1 = cloneSpec();
        spec1.components = { examples: { Bad: { serializedValue: 123 as any } } };
        expect(() => validateSpec(spec1)).toThrow(/non-string 'serializedValue'/);

        const spec2 = cloneSpec();
        spec2.components = { examples: { Bad: { externalValue: 123 as any } } };
        expect(() => validateSpec(spec2)).toThrow(/non-string 'externalValue'/);
    });
});
