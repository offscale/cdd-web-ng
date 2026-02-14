import { info } from './common.js';

export const emptySpec = { openapi: '3.0.0', info, paths: {} };

export const fullCRUD_Users = {
    openapi: '3.0.0',
    info,
    paths: {
        '/users': {
            get: {
                operationId: 'getUsers',
                tags: ['Users'],
                responses: {
                    '200': {
                        description: 'ok',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: { $ref: '#/components/schemas/User' },
                                },
                            },
                        },
                    },
                },
            },
            post: {
                operationId: 'createUser',
                tags: ['Users'],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
                responses: { '201': { description: 'ok' } },
            },
        },
        '/users/{id}': {
            get: {
                operationId: 'getUserById',
                tags: ['Users'],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    '200': {
                        description: 'ok',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
                    },
                },
            },
            put: {
                operationId: 'updateUser',
                tags: ['Users'],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
                responses: { '200': { description: 'ok' } },
            },
            delete: {
                operationId: 'deleteUser',
                tags: ['Users'],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '204': { description: 'ok' } },
            },
        },
    },
    components: {
        schemas: {
            User: {
                type: 'object',
                properties: {
                    id: { type: 'string', readOnly: true },
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                },
            },
        },
    },
};
