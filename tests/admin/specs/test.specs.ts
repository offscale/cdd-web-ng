/**
 * @fileoverview
 * This file serves as a data repository for the integration tests. It contains various
 * OpenAPI specification objects, each defined as a JSON string. These specs are
 * meticulously crafted to test specific features of the generator, from basic
 * resource discovery and form control generation to advanced topics like polymorphism,
 * pagination, and complex validation. Each exported spec is documented with the
 * features it is designed to validate.
 */

const info = { title: 'Test API', version: '1.0.0' };

/**
 * A comprehensive specification used for end-to-end service generation tests
 * and basic admin resource discovery. It includes a full CRUD resource (`Users`),
 * a read-only resource (`Logs`), and their corresponding schemas.
 */
export const fullE2ESpec = JSON.stringify({
    openapi: '3.0.0',
    info,
    paths: {
        '/users': {
            get: { operationId: 'getUsers', tags: ['Users'], responses: { '200': { content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } } } },
            post: { operationId: 'createUser', tags: ['Users'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateUser' } } } }, responses: { '201': { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } } }
        },
        '/users/{id}': {
            get: { operationId: 'getUserById', tags: ['Users'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } } },
            put: { operationId: 'updateUser', tags: ['Users'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateUser' } } } }, responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } } },
            delete: { operationId: 'deleteUser', tags: ['Users'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '204': {} } }
        },
        '/logs': {
            get: { operationId: 'getLogs', tags: ['Log'], responses: { '200': { description: 'Read-only logs' } } }
        }
    },
    components: {
        schemas: {
            User: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string', format: 'email' } } },
            CreateUser: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, email: { type: 'string' } } },
            UpdateUser: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' } } }
        }
    }
});

/**
 * Specification designed to test the generation of a wide variety of individual
 * Angular Material form controls based on OpenAPI schema properties.
 */
export const basicControlsSpec = JSON.stringify({
    openapi: '3.0.0',
    info,
    paths: { '/widgets': { post: { tags: ['Widgets'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Widget' } } } } } } },
    components: {
        schemas: {
            Widget: {
                type: 'object',
                properties: {
                    name: { type: 'string', minLength: 3 },
                    description: { type: 'string', format: 'textarea' },
                    stock: { type: 'integer', minimum: 0, maximum: 100 },
                    isPublic: { type: 'boolean', default: true },
                    status: { type: 'string', enum: ['Pending', 'Active', 'Inactive'] }, // -> radio
                    priority: { type: 'string', enum: ['Low', 'Medium', 'High', 'Urgent', 'Critical'] }, // -> select
                    tags: { type: 'array', items: { type: 'string' } }, // -> chips
                    categories: { type: 'array', items: { type: 'string', enum: ['Tech', 'Health', 'Finance', 'Education' ] } }, // -> multiple select
                    launchDate: { type: 'string', format: 'date' }
                }
            }
        }
    }
});

/**
 * Specification for testing advanced form structures, including nested FormGroups for objects,
 * FormArrays for arrays of objects, and the exclusion of read-only properties.
 */
export const advancedStructuresSpec = JSON.stringify({
    openapi: '3.0.0',
    info,
    paths: { '/orders': { post: { tags: ['Orders'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } } } } },
    components: {
        schemas: {
            Order: {
                type: 'object',
                properties: {
                    customer: { $ref: '#/components/schemas/Customer' },
                    items: { type: 'array', items: { $ref: '#/components/schemas/OrderItem' } },
                    orderId: { type: 'string', readOnly: true }
                }
            },
            Customer: { type: 'object', properties: { name: { type: 'string' }, address: { type: 'string' } } },
            OrderItem: { type: 'object', properties: { productId: { type: 'string' }, quantity: { type: 'integer' } } }
        }
    }
});

/**
 * A complex bookstore specification for end-to-end admin component generation.
 * Features multiple resources, a create-only resource (`Publishers`),
 * and a resource with custom actions (`Servers`).
 */
export const bookStoreSpec = JSON.stringify({
    openapi: '3.0.0',
    info,
    paths: {
        '/servers': { "get": { "tags": ["Servers"], "operationId": "getServers" } },
        '/books': { get: { tags: ['Books'], operationId: 'getBooks' }, post: { tags: ['Books'], operationId: 'createBook', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Book' } } } } } },
        '/books/{id}': { get: { tags: ['Books'], operationId: 'getBookById', parameters: [{name: 'id', in: 'path'}] }, put: { tags: ['Books'], operationId: 'updateBook', parameters: [{name: 'id', in: 'path'}] }, delete: { tags: ['Books'], operationId: 'deleteBook', parameters: [{name: 'id', in: 'path'}] } },
        '/publishers': { post: { tags: ['Publishers'], operationId: 'createPublisher', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Publisher' } } } } } },
        '/servers/rebootAll': { post: { tags: ['Servers'], operationId: 'rebootAllServers' } },
        '/servers/{id}/reboot': { post: { tags: ['Servers'], operationId: 'rebootServer', parameters: [{name: 'id', in: 'path'}] } }
    },
    components: { schemas: { Book: { type: 'object' }, Publisher: { type: 'object' } } }
});

/**
 * Specification containing various security schemes to test the generation
 * of the `AuthInterceptor` and related provider functions. Includes both
 * OpenAPI 3.0 and a Swagger 2.0 equivalent.
 */
export const authSchemesSpec = JSON.stringify({
    openapi: '3.0.0',
    info,
    paths: { '/': { get: { summary: 'test' } } },
    components: {
        securitySchemes: {
            ApiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-KEY' },
            ApiKeyQuery: { type: 'apiKey', in: 'query', name: 'apiKey' },
            BearerAuth: { type: 'http', scheme: 'bearer' },
            OAuth2Flow: { type: 'oauth2', flows: { authorizationCode: { authorizationUrl: 'https://example.com/oauth/authorize', tokenUrl: 'https://example.com/oauth/token', scopes: { read: '' } } } }
        }
    }
});

export const authSchemesSpecV2 = JSON.stringify({
    swagger: '2.0',
    info,
    paths: { '/': { get: { summary: 'test' } } },
    securityDefinitions: {
        ApiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-KEY' }
    }
});

/**
 * Specification for testing file upload controls in the admin UI,
 * using the `format: binary` property.
 */
export const fileUploadsSpec = JSON.stringify({
    openapi: '3.0.0',
    info,
    paths: { '/avatars': { post: { tags: ['Avatars'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Avatar' } } } } } } },
    components: { schemas: { Avatar: { type: 'object', properties: { image: { type: 'string', format: 'binary' } } } } }
});

/**
 * Specification designed to test the generation of pagination and sorting
 * features in admin list components. It defines standard query parameters and
 * the `X-Total-Count` header for pagination.
 */
export const paginationSpec = JSON.stringify({
    openapi: '3.0.0',
    info,
    paths: {
        '/products': {
            get: {
                tags: ['Products'],
                parameters: [
                    { name: '_page', in: 'query', schema: { type: 'integer' } },
                    { name: '_limit', in: 'query', schema: { type: 'integer' } },
                    { name: '_sort', in: 'query', schema: { type: 'string' } },
                    { name: '_order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
                ],
                responses: { '200': { headers: { 'X-Total-Count': { schema: { type: 'integer' } } } } }
            }
        }
    }
});

/**
 * Specification with advanced schema validation keywords to test the
 * generation and application of `CustomValidators` in the admin UI.
 */
export const advancedValidationSpec = JSON.stringify({
    openapi: '3.0.0',
    info,
    paths: { '/validations': { post: { tags: ['Validations'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationTest' } } } } } } },
    components: {
        schemas: {
            ValidationTest: {
                type: 'object',
                properties: {
                    exclusiveMinNumber: { type: 'number', minimum: 10, exclusiveMinimum: true },
                    exclusiveMaxNumber: { type: 'number', maximum: 100, exclusiveMaximum: true },
                    multipleOfNumber: { type: 'number', multipleOf: 5 },
                    uniqueItemsArray: { type: 'array', items: { type: 'string' }, uniqueItems: true },
                    patternString: { type: 'string', pattern: '^\\d{3}$' },
                    minItemsArray: { type: 'array', items: { type: 'string' }, minItems: 2 }
                }
            }
        }
    }
});

/**
 * Specification that uses `oneOf` and `discriminator` to model polymorphism,
 * testing the admin UI's ability to generate dynamic sub-forms based on a type selector.
 */
export const polymorphismSpec = JSON.stringify({
    openapi: '3.0.0',
    info,
    paths: { '/pets': { post: { tags: ['Pets'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } } } },
    components: {
        schemas: {
            Pet: {
                type: 'object',
                required: ['petType'],
                oneOf: [ { $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' } ],
                discriminator: { propertyName: 'petType' }
            },
            Cat: { type: 'object', required: ['petType'], properties: { petType: { type: 'string', enum: ['cat'] }, huntingSkill: { type: 'string' } } },
            Dog: { type: 'object', required: ['petType'], properties: { petType: { type: 'string', enum: ['dog'] }, barkingLevel: { type: 'integer' } } }
        }
    }
});
