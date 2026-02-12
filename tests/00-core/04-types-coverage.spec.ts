import { describe, expect, it } from 'vitest';

import { SwaggerDefinition, SwaggerSpec } from '@src/core/types/index.js';

describe('Core: Types & Interfaces Coverage', () => {
    it('should support SPDX identifier in LicenseObject', () => {
        const spec: SwaggerSpec = {
            openapi: '3.1.0',
            info: {
                title: 'Test API',
                version: '1.0.0',
                license: {
                    name: 'Apache 2.0',
                    identifier: 'Apache-2.0',
                },
            },
            paths: {},
        };

        expect(spec.info.license?.identifier).toBe('Apache-2.0');
    });

    it('should support root Level tags and externalDocs (OAS 3.2)', () => {
        const spec: SwaggerSpec = {
            openapi: '3.2.0',
            info: { title: 'T', version: '1' },
            externalDocs: { url: 'http://doc' },
            tags: [{ name: 'Tag', summary: 'Summarized Tag' }],
            paths: {},
        };

        expect(spec.externalDocs?.url).toBe('http://doc');
        expect(spec.tags?.[0].summary).toBe('Summarized Tag');
    });

    it('should support allowEmptyValue in Parameter', () => {
        const param = {
            name: 'test',
            in: 'query',
            allowEmptyValue: true,
        };
        expect(param.allowEmptyValue).toBe(true);
    });

    it('should support numeric exclusiveMinimum/exclusiveMaximum (OAS 3.1/JSON Schema 2020-12)', () => {
        const schema: SwaggerDefinition = {
            type: 'number',
            exclusiveMinimum: 10,
            exclusiveMaximum: 20,
        };
        expect(schema.exclusiveMinimum).toBe(10);
        expect(schema.exclusiveMaximum).toBe(20);
    });

    it('should support boolean exclusiveMinimum/exclusiveMaximum (OAS 3.0)', () => {
        const schema: SwaggerDefinition = {
            type: 'number',
            minimum: 10,
            exclusiveMinimum: true,
            maximum: 20,
            exclusiveMaximum: true,
        };
        expect(schema.exclusiveMinimum).toBe(true);
        expect(schema.exclusiveMaximum).toBe(true);
    });

    it('should support JSON Schema meta keywords on Schema Object (OAS 3.1+)', () => {
        const schema: SwaggerDefinition = {
            $id: 'https://example.com/schemas/User',
            $schema: 'https://spec.openapis.org/oas/3.1/dialect/base',
            $anchor: 'UserAnchor',
            unevaluatedItems: false,
        };

        expect(schema.$id).toBe('https://example.com/schemas/User');
        expect(schema.$schema).toBe('https://spec.openapis.org/oas/3.1/dialect/base');
        expect(schema.$anchor).toBe('UserAnchor');
        expect(schema.unevaluatedItems).toBe(false);
    });

    it('should support webhooks in components (OAS 3.1+)', () => {
        const spec: SwaggerSpec = {
            openapi: '3.1.0',
            info: { title: 'Webhooks Components', version: '1.0' },
            paths: {},
            components: {
                webhooks: {
                    myWebhook: {
                        post: {
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            },
        };
        expect(spec.components?.webhooks?.['myWebhook']).toBeDefined();
    });

    it('should support responses, requestBodies, examples, and mediaTypes in components (OAS 3.2)', () => {
        const spec: SwaggerSpec = {
            openapi: '3.2.0',
            info: { title: 'Components Extras', version: '1.0' },
            paths: {},
            components: {
                responses: {
                    Ok: { description: 'ok' },
                },
                requestBodies: {
                    Payload: {
                        content: {
                            'application/json': { schema: { type: 'string' } },
                        },
                    },
                },
                examples: {
                    ExampleOne: { dataValue: { foo: 'bar' } },
                },
                mediaTypes: {
                    JsonPayload: { schema: { type: 'string' } },
                },
            },
        };

        expect(spec.components?.responses?.Ok).toBeDefined();
        expect(spec.components?.requestBodies?.Payload).toBeDefined();
        expect(spec.components?.examples?.ExampleOne).toBeDefined();
        expect(spec.components?.mediaTypes?.JsonPayload).toBeDefined();
    });

    it('should support oauth2MetadataUrl in security schemes (OAS 3.2)', () => {
        const spec: SwaggerSpec = {
            openapi: '3.2.0',
            info: { title: 'Security Metadata', version: '1.0' },
            paths: {},
            components: {
                securitySchemes: {
                    OAuth: {
                        type: 'oauth2',
                        oauth2MetadataUrl: 'https://example.com/.well-known/oauth-authorization-server',
                        flows: {
                            clientCredentials: {
                                tokenUrl: 'https://example.com/token',
                                scopes: {},
                            },
                        },
                    },
                },
            },
        };
        expect(spec.components?.securitySchemes?.OAuth.oauth2MetadataUrl).toContain('.well-known');
    });

    it('should allow boolean schemas in components (JSON Schema 2020-12)', () => {
        const spec: SwaggerSpec = {
            openapi: '3.2.0',
            info: { title: 'Boolean Schemas', version: '1.0' },
            paths: {},
            components: {
                schemas: {
                    AllowAny: true,
                    AllowNone: false,
                },
            },
        };

        expect(spec.components?.schemas?.AllowAny).toBe(true);
        expect(spec.components?.schemas?.AllowNone).toBe(false);
    });
});
