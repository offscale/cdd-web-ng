// tests/shared/final-coverage.models.ts

const info = { title: 'Final Coverage API', version: '1.0.0' };

/**
 * A highly specific OpenAPI specification designed to hit the remaining uncovered
 * branches in the Istanbul coverage report.
 */
export const finalCoveragePushSpec = {
    openapi: '3.0.0',
    info,
    paths: {
        // OAS 3.2 additionalOperations
        '/custom-verb-resource': {
            additionalOperations: {
                LOCK: {
                    tags: ['CustomVerbs'],
                    operationId: 'lockResource',
                    responses: { '200': {} }
                }
            }
        },
        '/no-security': {
            get: {
                tags: ['NoSecurity'],
                operationId: 'getNoSecurity',
                responses: { '200': { description: 'OK' } },
            },
        },
        '/external-ref': {
            get: {
                tags: ['Refs'],
                responses: { '200': { content: { 'application/json': { schema: { $ref: 'external.json#/User' } } } } },
            },
        },
        '/content-no-schema': {
            post: {
                tags: ['ServiceMethods'],
                operationId: 'getContentNoSchema',
                requestBody: { content: { 'application/json': {} } }, // Body exists but has no schema property inside
                responses: { '200': {} },
            },
        },
        '/only-required-params/{id}': {
            get: {
                tags: ['ServiceMethods'],
                operationId: 'getOnlyRequired',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            },
        },
        '/primitive-return': {
            get: {
                tags: ['ServiceTests'],
                operationId: 'getPrimitive',
                responses: { '200': { content: { 'application/json': { schema: { type: 'number' } } } } },
            },
        },
        '/primitive-body-post': {
            post: {
                tags: ['ServiceTests'],
                operationId: 'postPrimitive',
                requestBody: { content: { 'application/json': { schema: { type: 'string' } } } },
                responses: { '200': {} },
            },
        },
        '/primitive-param/{id}': {
            get: {
                tags: ['ServiceTests'],
                operationId: 'getWithPrimitiveParam',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '200': {} }
            }
        },
        '/delete-only': {
            get: {
                tags: ['DeleteOnly'],
                operationId: 'getDeleteOnlyList',
                responses: {
                    '200': {
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: { $ref: '#/components/schemas/DeleteOnly' }
                                }
                            }
                        }
                    }
                },
            },
        },
        '/delete-only/{id}': {
            delete: {
                tags: ['DeleteOnly'],
                operationId: 'deleteTheItem',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '204': {} },
            },
        },
        '/unsupported-control': {
            post: {
                tags: ['Unsupported'],
                operationId: 'postUnsupportedControl',
                requestBody: {
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/WithUnsupported' } } },
                },
                responses: { '200': {} }
            },
        },
        '/poly-no-prop': {
            post: {
                tags: ['Poly'],
                operationId: 'postPolyNoProp',
                requestBody: {
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/PolyNoProp' } } },
                },
                responses: { '200': {} }
            },
        },
        '/inline-model': {
            get: {
                tags: ['InlineModel'],
                operationId: 'getInlineModel',
                responses: {
                    '200': {
                        content: {
                            'application/json': {
                                schema: { type: 'object', properties: { name: { type: 'string' } } },
                            },
                        },
                    },
                },
            },
        },
        '/poly-with-primitive': {
            post: {
                tags: ['PolyWithPrimitive'],
                operationId: 'postPolyWithPrimitive',
                requestBody: {
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/PolyWithPrimitive' } } },
                },
                responses: { '200': {} }
            },
        },
        '/form-urlencoded-no-params': {
            post: {
                tags: ['UrlencodedNoParams'],
                operationId: 'postUrlencodedNoParams',
                consumes: ['application/x-www-form-urlencoded'],
                requestBody: { content: { 'application/x-www-form-urlencoded': {} } }
            }
        },
        '/poly-with-only-primitives': {
            post: {
                tags: ['PolyWithOnlyPrimitives'],
                operationId: 'postPolyWithOnlyPrimitives',
                requestBody: {
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/PolyWithOnlyPrimitives' } } }
                }
            }
        },
        '/server-override': {
            get: {
                tags: ['ServerOverride'],
                operationId: 'getWithServerOverride',
                servers: [{ url: 'https://custom.api.com', description: 'Custom Server' }],
                responses: { '200': {} }
            }
        },
        // OAS 3.2 Support: GET with body
        '/get-with-body': {
            get: {
                tags: ['OAS32'],
                operationId: 'getWithBody',
                requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
                responses: { '200': {} }
            }
        },
        // OAS 3.2 Support: DELETE with body
        '/delete-with-body': {
            delete: {
                tags: ['OAS32'],
                operationId: 'deleteWithBody',
                requestBody: { content: { 'application/json': { schema: { type: 'string' } } } },
                responses: { '200': {} }
            }
        }
    },
    components: {
        schemas: {
            WithUnsupported: {
                type: 'object',
                properties: {
                    myFile: { type: 'string', format: 'binary' },
                    unsupportedField: { type: 'object' } // An object with no properties is not a valid form control
                }
            },
            DeleteOnly: { type: 'object', properties: { id: { type: 'string' } } },
            PolyNoProp: {
                oneOf: [{ $ref: '#/components/schemas/Sub' }],
                discriminator: { propertyName: 'type' },
            },
            Sub: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['sub'] },
                    name: { type: 'string' },
                },
                required: ['type']
            },
            PolyWithPrimitive: {
                oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/Sub' }],
                discriminator: { propertyName: 'type' },
            },
            PolyWithOnlyPrimitives: {
                oneOf: [{ type: 'string' }, { type: 'number' }],
                discriminator: { propertyName: 'type' }
            }
        },
    },
};
