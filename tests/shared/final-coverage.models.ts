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
        '/swagger2-no-schema': {
            get: {
                tags: ['Utils'],
                operationId: 'swagger2NoSchema',
                responses: { '200': { description: 'An old-style response without a schema key.' } },
            },
        },
        '/content-no-schema': {
            get: {
                tags: ['ServiceMethods'],
                operationId: 'getContentNoSchema',
                responses: { '200': { content: { 'application/json': {} } } },
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
            },
        },
        '/delete-only': { // FIX: Path changed from '/delete-only/{id}' to '/delete-only' for the GET
            get: {
                tags: ['DeleteOnly'],
                operationId: 'getDeleteOnlyList', // Renamed for clarity
                responses: { '200': { content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/DeleteOnly' } } } } } },
            },
        },
        '/delete-only/{id}': { // This path now only contains DELETE
            delete: {
                tags: ['DeleteOnly'],
                operationId: 'deleteTheItem',
                parameters: [{ name: 'id', in: 'path', required: true }],
                responses: { '204': {} },
            },
        },
        '/unsupported-control': {
            post: {
                tags: ['Unsupported'],
                operationId: 'postUnsupportedControl',
                requestBody: {
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/WithFile' } } },
                },
                responses: {'200': {}}
            },
        },
        '/poly-no-prop': {
            post: {
                tags: ['Poly'], // This remains as the 'Poly' resource
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
    },
    components: {
        schemas: {
            WithFile: { type: 'object', properties: { myFile: { type: 'string', format: 'binary' } } },
            DeleteOnly: { type: 'object', properties: { id: { type: 'string' } } },
            BooleanWithFalseDefault: { type: 'boolean', default: false },
            NumberPlain: { type: 'number' },
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
            },
            PolyWithPrimitive: {
                oneOf: [{ type: 'string' }, { type: 'number' }],
                discriminator: { propertyName: 'type' },
            },
        },
    },
};
