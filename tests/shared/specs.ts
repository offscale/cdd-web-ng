// tests/shared/specs.ts

/**
 * @fileoverview
 * This file serves as a data repository for the integration tests. It contains various
 * OpenAPI specification objects, each defined as a constant.
 */

const info = { title: 'Test API', version: '1.0.0' };

export const emptySpec = { openapi: '3.0.0', info, paths: {} };

export const fullCRUD_Users = {
    paths: {
        '/users': {
            get: { operationId: 'getUsers', tags: ['Users'], responses: { '200': { content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } } } },
            post: { operationId: 'createUser', tags: ['Users'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } }, responses: { '201': {} } }
        },
        '/users/{id}': {
            get: { operationId: 'getUserById', tags: ['Users'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } } },
            put: { operationId: 'updateUser', tags: ['Users'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } }, responses: { '200': {} } },
            delete: { operationId: 'deleteUser', tags: ['Users'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '204': {} } }
        },
    },
    components: {
        schemas: {
            User: { type: 'object', properties: { id: { type: 'string', readOnly: true }, name: { type: 'string' }, email: { type: 'string', format: 'email' } } },
        }
    }
};

export const coverageSpec = {
    openapi: '3.0.0',
    info,
    ...fullCRUD_Users,
    paths: {
        ...fullCRUD_Users.paths,
        '/logs': { get: { operationId: 'getLogs', tags: ['Logs'], responses: { '200': { description: 'Read-only logs' } } } },
        '/publications': { post: { tags: ['Publications'], operationId: 'createPublication', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Publication' } } } } } },
        '/configs/{id}': { put: { tags: ['Configs'], operationId: 'updateConfig', parameters: [{name: 'id', in: 'path'}] } },
        '/servers': { get: { operationId: 'getServers', tags: ['Servers'], responses: { '200': { description: 'ok' } } } },
        '/servers/reboot-all': { post: { tags: ['Servers'], operationId: 'rebootAllServers' } },
        '/servers/{id}/start': { post: { tags: ['Servers'], operationId: 'startServer', parameters: [{name: 'id', in: 'path', schema:{type:'string'}}] } },
        '/servers/{id}/reboot-item': { post: { tags: ['Servers'], operationId: 'rebootServerItem', parameters: [{name: 'id', in: 'path', schema:{type:'string'}}] } },
        '/primitive-body': { post: { operationId: 'postPrimitive', requestBody: { content: { 'application/json': { schema: { type: 'string' } } } } } },
        '/no-content': { delete: { tags: ['NoContent'], operationId: 'deleteNoContent', responses: { '204': {} } } },
        '/no-prop-obj': { get: { tags: ['NoProp'], operationId: 'getNoPropObj', responses: { '200': { content: { 'application/json': { schema: { type: 'object' } } } } } } },
        '/string-array': { get: { tags: ['StringArray'], operationId: 'getStringArray', responses: { '200': { content: { 'application/json': { schema: { type: 'array', items: { type: 'string' } } } } } } } },
        '/custom-name': { get: { tags: ['CustomName'], operationId: 'get-custom-name' } },
        '/duplicate-name': { get: { tags: ['DuplicateName'], operationId: 'getName' }, post: { tags: ['DuplicateName'], operationId: 'getName' } },
        '/update-only/{id}': { put: { tags: ['UpdateOnly'], operationId: 'updateOnly', parameters: [{ name: 'id', in: 'path' }] } },
        '/unresolvable': { get: { tags: ['Unresolvable'], operationId: 'getUnresolvable', responses: { '200': { content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/NonExistent' }}}}}}} },
        '/action-test/{id}': { head: { tags: ['ActionTest'], operationId: 'headAction' } },
        '/no-actions': { get: { tags: ['NoActions'], operationId: 'getNoActions' } },
        '/events': { get: { operationId: 'getEvents', tags: ['Events'], responses: { '200': { 'content': {'application/json': { schema: { type: 'array', items: { '$ref': '#/components/schemas/Event' } } } } } } } }
    },
    components: {
        ...fullCRUD_Users.components,
        schemas: {
            ...fullCRUD_Users.components.schemas,
            Publication: { type: 'object' },
            Config: { type: 'object' },
            Server: { type: 'object', properties:{ id: {type: 'string'}}},
            UpdateOnly: { type: 'object' },
            ActionTest: {type: 'object'},
            NoActions: { type: 'object' },
            Event: { type: 'object', properties: { eventId: { type: 'string' }, timestamp: { type: 'string' } } }
        }
    }
};

export const securitySpec = {
    openapi: '3.0.0', info, paths: {},
    components: {
        securitySchemes: {
            // **FIX**: Simplified to one of each type for predictable testing
            ApiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-KEY' },
            BearerAuth: { type: 'http', scheme: 'bearer' },
            OAuth2Flow: { type: 'oauth2', flows: {} },
            UnsupportedAuth: { type: 'http', scheme: 'basic' }
        }
    }
};

export const typeGenSpec = {
    openapi: '3.0.0', info, paths: {},
    components: {
        schemas: {
            Status: { type: 'string', enum: ['active', 'inactive'] },
            NumericEnum: { type: 'number', enum: [1, 2, 3] },
            EmptyEnum: { type: 'string', enum: [] },
            Extended: { allOf: [{ $ref: '#/components/schemas/Base' }, { type: 'object', properties: { name: { type: 'string' } } }] },
            Base: { type: 'object', properties: { id: { type: 'string' } } },
            AnyValue: { anyOf: [{ type: 'string' }, { type: 'number' }] },
            QuotedProps: { type: 'object', properties: { 'with-hyphen': { type: 'string' } } },
            FreeObject: { type: 'object', additionalProperties: true },
            StringMap: { type: 'object', additionalProperties: { type: 'string' } },
            EmptyAllOf: { allOf: [] },
            Description: { properties: { prop: { type: 'string', description: 'A test property.' } } },
            AnyOfEmpty: { anyOf: [{ type: 'foo' }, { type: 'bar' }] },
            OneOfEmpty: { oneOf: [{ type: 'foo' }, { type: 'bar' }] },
            BrokenAllOf: { allOf: [{ $ref: '#/components/schemas/NonExistent' }] },
            SimpleAlias: { type: 'string', description: 'This is just a string alias.' }
        }
    }
};

export const adminFormSpec = {
    openapi: '3.0.0', info, paths: { '/widgets': { get: { tags:['Widgets'], responses: {'200': {}}}, post: { tags: ['Widgets'], operationId: 'postWidgets',  requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Widget' } } } } } } },
    components: {
        schemas: {
            Widget: {
                type: 'object',
                required: ['name'],
                properties: {
                    name: { type: 'string', minLength: 3, maxLength: 50, required: true },
                    description: { type: 'string', format: 'textarea' },
                    email: { type: 'string', format: 'email'},
                    score: { type: 'number', minimum: 0, exclusiveMinimum: true },
                    factor: { type: 'number', multipleOf: 5 },
                    uniqueTags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
                    readOnlyProp: { type: 'string', readOnly: true },
                    launchDate: { type: 'string', format: 'date-time' },
                    isPublic: { type: 'boolean' },
                    status: { type: 'string', enum: ['Active', 'Inactive'] },
                    size: { type: 'string', enum: ['S', 'M', 'L'] },
                    priority: { type: 'string', enum: ['Low', 'Med', 'High', 'Urgent', 'Critical'] },
                    categories: { type: 'array', items: { type: 'string', enum: ['A','B','C'] } },
                    rating: { type: 'integer', minimum: 0, maximum: 10 },
                    image: { type: 'string', format: 'binary' },
                    tags: { type: 'array', items: { type: 'string' } },
                    config: { type: 'object', properties: { key: { type: 'string' } } },
                    items: { type: 'array', items: { type: 'object', properties: { name: {type: 'string'}, value: {type: 'number'}} } },
                    primitiveArray: { type: 'array', items: {type: 'number'}},
                    arrayNoItems: { type: 'array' },
                    noControlProp: { type: 'object' },
                    anotherDate: { type: 'string', format: 'date'},
                    smallEnum: { type: 'string', enum: ['One', 'Two'] },
                    bigEnum: { type: 'string', enum: ['One', 'Two', 'Three', 'Four', 'Five'] },
                    otherNumber: { type: 'number' },
                    arrayObject: { type: 'array', items: { type: 'object' }},
                    unknownType: { type: 'file' },
                    boundedNumber: { type: 'number', maximum: 100, pattern: '^[0-9]+$' },
                    boundedArray: { type: 'array', items: { type: 'string' }, minItems: 2 }
                }
            }
        }
    }
};

export const polymorphismSpec = {
    openapi: '3.0.0', info, paths: { '/pets': { get: { tags: ['Pets'], responses: { '200': {} }}, post: { tags: ['Pets'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } } } },
    components: {
        schemas: {
            Pet: {
                type: 'object', required: ['petType'],
                oneOf: [ { $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' } ],
                discriminator: { propertyName: 'petType' },
                properties: {
                    petType: { type: 'string' }
                }
            },
            Cat: { type: 'object', allOf: [{$ref: '#/components/schemas/BasePet'}], required: ['petType'], properties: { petType: { type: 'string', enum: ['cat'] }, huntingSkill: { type: 'string' }, isDeclawed: { type: 'boolean', readOnly: true } } },
            Dog: { type: 'object', allOf: [{$ref: '#/components/schemas/BasePet'}], required: ['petType'], properties: { petType: { type: 'string', enum: ['dog'] }, barkingLevel: { type: 'integer' } } },
            BasePet: { type: 'object', properties: { name: { type: 'string'} } }
        }
    }
};

/**
 * A spec designed to hit every remaining uncovered branch.
 */
export const finalCoverageSpec = {
    openapi: '3.0.0', info,
    paths: {
        '/no-base-path': { get: { operationId: 'noBasePathTest', tags: ['NoBasePath'] } },
        '/list-icon-fallback': {
            get: { tags: ['ListIconFallback'], responses: { '200': { description: 'ok' } } },
            post: { tags: ['ListIconFallback'], operationId: 'aStrangeAction' }
        },
        '/all-params/{pathParam}': {
            post: {
                tags: ['AllParams'],
                operationId: 'allParams',
                parameters: [
                    { name: 'pathParam', in: 'path', required: true, schema: { type: 'string' } },
                    // **FIX**: Added query param to test its generation logic
                    { name: 'queryParam', in: 'query', schema: { type: 'string' } }
                ],
                // Use a non-json body to test that fallback path
                requestBody: { content: { 'application/octet-stream': {} } }
            }
        }
    },
    components: { schemes: { ListIconFallback: {type: 'object'} } }
};

/**
 * A spec designed specifically for testing list component generation edge cases.
 */
export const listComponentSpec = {
    openapi: '3.0.0', info,
    paths: {
        '/icon-tests': {
            get: { tags: ['IconTests'], responses: { '200': { description: 'ok' } } },
            post: { tags: ['IconTests'], operationId: 'createItem' }
        },
        '/icon-tests/{id}': {
            put: { tags: ['IconTests'], operationId: 'updateItem', parameters: [{name: 'id', in: 'path'}] },
            delete: { tags: ['IconTests'], operationId: 'removeItem', parameters: [{name: 'id', in: 'path'}] },
        },
        '/icon-tests/{id}/start': { post: { tags: ['IconTests'], operationId: 'startItem', parameters: [{name: 'id', in: 'path'}] }},
        '/icon-tests/{id}/pause': { post: { tags: ['IconTests'], operationId: 'pauseProcess', parameters: [{name: 'id', in: 'path'}] }},
        '/icon-tests/sync-all': { post: { tags: ['IconTests'], operationId: 'syncAll' }},
        '/icon-tests/{id}/approve': { post: { tags: ['IconTests'], operationId: 'approveItem', parameters: [{name: 'id', in: 'path'}] }},
        '/icon-tests/{id}/block': { post: { tags: ['IconTests'], operationId: 'blockUser', parameters: [{name: 'id', in: 'path'}] }},
        '/no-props': { get: { tags: ['NoPropsResource'], responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/NoProps'}}}}}}},
        '/no-list': { post: { tags: ['NoListResource'], responses: { '200': {}}}},
    },
    components: {
        schemas: {
            IconTest: { type: 'object', properties: { id: { type: 'string' } } },
            NoProps: { type: 'object' }, // Has no properties, tests `getIdProperty` fallback
            NoListResource: { type: 'object' }, // Has operations, but no 'list' operation
        }
    }
};

