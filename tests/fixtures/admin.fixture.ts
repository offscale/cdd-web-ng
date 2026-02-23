import { info } from './common.js';

export const adminFormSpec = {
    openapi: '3.0.0',
    info,
    paths: {
        '/widgets': {
            get: { tags: ['Widgets'], responses: { '200': { description: 'ok' } } },
            post: {
                tags: ['Widgets'],
                operationId: 'postWidgets',
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Widget' } } } },
                responses: { '200': { description: 'ok' } },
            },
        },
    },
    components: {
        schemas: {
            Widget: {
                type: 'object',
                required: ['name'],
                properties: {
                    name: { type: 'string', minLength: 3, maxLength: 50 },
                    description: { type: 'string', format: 'textarea' },
                    email: { type: 'string', format: 'email' },
                    score: { type: 'number', minimum: 0, exclusiveMinimum: true },
                    factor: { type: 'number', multipleOf: 5, exclusiveMaximum: true, maximum: 100 },
                    uniqueTags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
                    readOnlyProp: { type: 'string', readOnly: true },
                    launchDate: { type: 'string', format: 'date-time' },
                    isPublic: { type: 'boolean' },
                    status: { type: 'string', enum: ['Active', 'Inactive'] },
                    size: { type: 'string', enum: ['S', 'M', 'L'] },
                    priority: { type: 'string', enum: ['Low', 'Med', 'High', 'Urgent', 'Critical'] },
                    categories: { type: 'array', items: { type: 'string', enum: ['A', 'B', 'C'] } },
                    rating: { type: 'integer', minimum: 0, maximum: 10 },
                    image: { type: 'string', format: 'binary' },
                    tags: { type: 'array', items: { type: 'string' } },
                    config: {
                        type: 'object',
                        properties: { key: { type: 'string' }, readOnlyKey: { type: 'string', readOnly: true } },
                    },
                    items: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                value: { type: 'number' },
                                readOnlyVal: { type: 'string', readOnly: true },
                            },
                        },
                    },
                    primitiveArray: { type: 'array', items: { type: 'number' } },
                    arrayNoItems: { type: 'array' },
                    noControlProp: { type: 'object' },
                    anotherDate: { type: 'string', format: 'date' },
                    smallEnum: { type: 'string', enum: ['One', 'Two'] },
                    bigEnum: { type: 'string', enum: ['One', 'Two', 'Three', 'Four', 'Five'] },
                    otherNumber: { type: 'number' },
                    arrayObject: { type: 'array', items: { type: 'object' } },
                    unknownType: { type: 'file' },
                    boundedNumber: { type: 'number', maximum: 100, pattern: '^[0-9]+$' },
                    boundedArray: { type: 'array', items: { type: 'string' }, minItems: 2 },
                },
            },
        },
    },
};

export const listComponentSpec = {
    openapi: '3.0.0',
    info,
    paths: {
        '/icon-tests': {
            get: { tags: ['IconTests'], responses: { '200': { description: 'ok' } } },
            post: { tags: ['IconTests'], operationId: 'createItem', responses: { '200': { description: 'ok' } } },
        },
        '/icon-tests/{id}': {
            put: {
                tags: ['IconTests'],
                operationId: 'updateItem',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '200': { description: 'ok' } },
            },
            delete: {
                tags: ['IconTests'],
                operationId: 'deleteItem',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '200': { description: 'ok' } },
            },
        },
        '/icon-tests/add': {
            post: { tags: ['IconTests'], operationId: 'addItem', responses: { '200': { description: 'ok' } } },
        },
        '/icon-tests/{id}/remove': {
            post: {
                tags: ['IconTests'],
                operationId: 'removeItem',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '200': { description: 'ok' } },
            },
        },
        '/icon-tests/{id}/start': {
            post: {
                tags: ['IconTests'],
                operationId: 'startItem',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '200': { description: 'ok' } },
            },
        },
        '/icon-tests/{id}/pause': {
            post: {
                tags: ['IconTests'],
                operationId: 'pauseProcess',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '200': { description: 'ok' } },
            },
        },
        '/icon-tests/sync-all': {
            post: { tags: ['IconTests'], operationId: 'syncAll', responses: { '200': { description: 'ok' } } },
        },
        '/icon-tests/{id}/approve': {
            post: {
                tags: ['IconTests'],
                operationId: 'approveItem',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '200': { description: 'ok' } },
            },
        },
        '/icon-tests/{id}/block': {
            post: {
                tags: ['IconTests'],
                operationId: 'blockUser',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '200': { description: 'ok' } },
            },
        },
        '/no-list': { post: { tags: ['NoListResource'], responses: { '200': { description: 'ok' } } } },
        '/no-props': {
            get: {
                tags: ['NoPropsResource'],
                responses: {
                    '200': {
                        description: 'ok',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/NoProps' } } },
                    },
                },
            },
        },
        '/no-listable-props': {
            get: {
                tags: ['NoListablePropsResource'],
                responses: {
                    '200': {
                        description: 'ok',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/NoListableProps' } } },
                    },
                },
            },
        },
    },
    components: {
        schemas: {
            IconTest: { type: 'object', properties: { id: { type: 'string' } } },
            NoProps: { type: 'object', properties: {} },
            NoListableProps: { type: 'object', properties: { config: { type: 'object' } } },
            NoListResource: { type: 'object' },
        },
    },
};
