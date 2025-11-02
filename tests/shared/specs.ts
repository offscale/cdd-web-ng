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
        '/logs': {
            get: { operationId: 'getLogs', tags: ['Logs'], responses: { '200': { description: 'Read-only logs' } } }
        },
        '/publications': { // Create-only resource
            post: { tags: ['Publications'], operationId: 'createPublication', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Publication' } } } } }
        },
        '/configs/{id}': { // Update-only resource
            put: { tags: ['Configs'], operationId: 'updateConfig', parameters: [{name: 'id', in: 'path'}] }
        },
        '/servers/reboot-all': { // Custom collection action
            post: { tags: ['Servers'], operationId: 'rebootAllServers' }
        },
        '/servers/{id}/start': { // Custom item action
            post: { tags: ['Servers'], operationId: 'startServer', parameters: [{name: 'id', in: 'path'}] }
        },
        '/primitive-body': { // Request body is a primitive
            post: { operationId: 'postPrimitive', requestBody: { content: { 'application/json': { schema: { type: 'string' } } } } }
        },
        '/no-content': { // 204 response
            delete: { operationId: 'deleteNoContent', responses: { '204': {} } }
        },
        '/no-prop-obj': { // Returns an object with no properties
            get: { tags: ['NoProp'], responses: { '200': { content: { 'application/json': { schema: { type: 'object' } } } } } }
        },
        '/string-array': {
            get: { tags: ['StringArray'], responses: { '200': { content: { 'application/json': { schema: { type: 'array', items: { type: 'string' } } } } } } }
        }
    },
    components: {
        ...fullCRUD_Users.components,
        schemas: {
            ...fullCRUD_Users.components.schemas,
            Publication: { type: 'object' },
            Config: { type: 'object' },
            Server: { type: 'object' },
        }
    }
};

export const securitySpec = {
    openapi: '3.0.0', info, paths: {},
    components: {
        securitySchemes: {
            ApiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-KEY' },
            ApiKeyQuery: { type: 'apiKey', in: 'query', name: 'apiKey' }, // For branch coverage
            BearerAuth: { type: 'http', scheme: 'bearer' },
            OAuth2Flow: { type: 'oauth2', flows: {} } // For branch coverage
        }
    }
};

export const typeGenSpec = {
    openapi: '3.0.0', info, paths: {},
    components: {
        schemas: {
            Status: { type: 'string', enum: ['active', 'inactive'] },
            NumericEnum: { type: 'number', enum: [1, 2, 3] }, // Non-string enum
            Extended: { allOf: [{ $ref: '#/components/schemas/Base' }, { type: 'object', properties: { name: { type: 'string' } } }] },
            Base: { type: 'object', properties: { id: { type: 'string' } } },
            AnyValue: { anyOf: [{ type: 'string' }, { type: 'number' }] },
            QuotedProps: { type: 'object', properties: { 'with-hyphen': { type: 'string' } } },
            FreeObject: { type: 'object', additionalProperties: true },
            StringMap: { type: 'object', additionalProperties: { type: 'string' } },
            EmptyAllOf: { allOf: [] }, // For branch coverage
            Description: { properties: { prop: { type: 'string', description: 'A test property.' } } }
        }
    }
};

export const adminFormSpec = {
    openapi: '3.0.0', info, paths: { '/widgets': { get: { tags:['Widgets'], responses: {'200': {}}}, post: { tags: ['Widgets'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Widget' } } } } } } },
    components: {
        schemas: {
            Widget: {
                type: 'object',
                properties: {
                    name: { type: 'string', minLength: 3 },
                    readOnlyProp: { type: 'string', readOnly: true },
                    launchDate: { type: 'string', format: 'date-time' },
                    isPublic: { type: 'boolean' },
                    status: { type: 'string', enum: ['Active', 'Inactive'] }, // Radio
                    priority: { type: 'string', enum: ['Low', 'Med', 'High', 'Urgent', 'Critical'] }, // Select
                    categories: { type: 'array', items: { type: 'string', enum: ['A','B','C'] } }, // Multi-select
                    rating: { type: 'integer', minimum: 0, maximum: 10 }, // Slider
                    image: { type: 'string', format: 'binary' }, // File upload
                    tags: { type: 'array', items: { type: 'string' } }, // Chips
                    config: { type: 'object', properties: { key: { type: 'string' } } }, // FormGroup
                    items: { type: 'array', items: { type: 'object', properties: { name: {type: 'string'}, value: {type: 'number'}} } }, // FormArray
                    primitiveArray: { type: 'array', items: {type: 'number'}} // To test a specific mapper branch
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
                discriminator: { propertyName: 'petType' }
            },
            // The discriminator property (`petType`) is NOT defined on the base schema, testing a resource-discovery branch
            Cat: { type: 'object', allOf: [{$ref: '#/components/schemas/BasePet'}], required: ['petType'], properties: { petType: { type: 'string', enum: ['cat'] }, huntingSkill: { type: 'string' } } },
            Dog: { type: 'object', allOf: [{$ref: '#/components/schemas/BasePet'}], required: ['petType'], properties: { petType: { type: 'string', enum: ['dog'] }, barkingLevel: { type: 'integer' } } },
            BasePet: { type: 'object', properties: { name: { type: 'string'} } }
        }
    }
};
