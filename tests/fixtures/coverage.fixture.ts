import { info as originalInfo } from './common.js';
import { fullCRUD_Users } from './basic.fixture.js';

// Create a version of the info object with a license to bypass validator bug
const info = {
    ...originalInfo,
    license: { name: 'unlicense' },
};

export const coverageSpec = {
    openapi: '3.0.0',
    info,
    paths: {
        ...fullCRUD_Users.paths,
        '/logs': {
            get: {
                operationId: 'getLogs',
                tags: ['Logs'],
                responses: { '200': { description: 'Read-only logs' } },
            },
        },
        '/publications': {
            post: {
                tags: ['Publications'],
                operationId: 'createPublication',
                requestBody: {
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/Publication' } } },
                },
                responses: { '201': {} },
            },
        },
        '/configs/{id}': {
            put: {
                tags: ['Configs'],
                operationId: 'updateConfig',
                parameters: [{ name: 'id', in: 'path' }],
                responses: { '200': {} },
            },
        },
        '/servers': {
            get: {
                operationId: 'getServers',
                tags: ['Servers'],
                responses: { '200': { description: 'ok' } },
            },
        },
        '/servers/reboot-all': { post: { tags: ['Servers'], operationId: 'rebootAllServers', responses: {} } },
        '/servers/{id}/start': {
            post: {
                tags: ['Servers'],
                operationId: 'startServer',
                parameters: [{ name: 'id', in: 'path', schema: { type: 'string' } }],
                responses: {},
            },
        },
        '/servers/{id}/reboot-item': {
            post: {
                tags: ['Servers'],
                operationId: 'rebootServerItem',
                parameters: [{ name: 'id', in: 'path', schema: { type: 'string' } }],
                responses: {},
            },
        },
        '/string-array': {
            get: {
                tags: ['StringArray'],
                operationId: 'getStringArray',
                responses: {
                    '200': {
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: { type: 'string' },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/custom-name': { get: { tags: ['CustomName'], operationId: 'get-custom-name', responses: {} } },
        '/duplicate-name': {
            get: { tags: ['DuplicateName'], operationId: 'getName', responses: {} },
            post: { tags: ['DuplicateName'], operationId: 'getName', responses: {} },
        },
        '/action-test/{id}': {
            head: {
                tags: ['ActionTest'],
                parameters: [{ name: 'id', in: 'path', schema: { type: 'string' } }],
                responses: {},
            },
        },
        '/users-search': { post: { tags: ['UsersSearch'], operationId: 'searchUsers', responses: {} } },
        '/events': {
            get: {
                operationId: 'getEvents',
                tags: ['Events'],
                responses: {
                    '200': {
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: { $ref: '#/components/schemas/Event' },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/no-content': { delete: { tags: ['NoContent'], operationId: 'deleteNoContent', responses: { '204': {} } } },
    },
    components: {
        ...fullCRUD_Users.components,
        schemas: {
            ...fullCRUD_Users.components.schemas,
            Publication: { type: 'object' },
            Event: { type: 'object', properties: { eventId: { type: 'string' }, timestamp: { type: 'string' } } },
        },
    },
};

export const coverageSpecPart2 = {
    openapi: '3.0.0',
    info,
    paths: {
        '/no-id-opid': {
            head: { tags: ['NoIdOpId'], responses: { '200': {} } },
        },
        '/no-schema-resource': {
            delete: { tags: ['NoSchemaResource'], responses: { '204': {} } },
        },
        '/form-data-test': {
            post: {
                tags: ['FormData'],
                operationId: 'postWithFormData',
                consumes: ['multipart/form-data'],
                parameters: [
                    { name: 'file', in: 'formData', type: 'file', required: true },
                    { name: 'description', in: 'formData', type: 'string' },
                ],
                responses: {},
            },
        },
        '/url-encoded-test': {
            post: {
                tags: ['UrlEncoded'],
                operationId: 'postWithUrlEncoded',
                consumes: ['application/x-www-form-urlencoded'],
                parameters: [
                    { name: 'grant_type', in: 'formData', type: 'string' },
                    { name: 'code', in: 'formData', type: 'string' },
                ],
                responses: {},
            },
        },
        '/primitive-response': {
            get: {
                tags: ['PrimitiveResponse'],
                operationId: 'getHealthCheck',
                responses: { '200': { content: { 'text/plain': { schema: { type: 'string' } } } } },
            },
        },
        '/no-create-update/{id}': {
            delete: {
                tags: ['NoCreateUpdate'],
                operationId: 'deleteNoCreateUpdate',
                parameters: [{ name: 'id', in: 'path' }],
                responses: {},
            },
        },
    },
    components: {
        schemas: {
            NoCreateUpdate: { type: 'object', properties: { id: { type: 'string' } } },
        },
    },
};

export const finalCoverageSpec = {
    openapi: '3.0.0',
    info,
    paths: {
        '/all-params/{pathParam}': {
            post: {
                tags: ['AllParams'],
                operationId: 'allParams',
                parameters: [{ name: 'pathParam', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: { content: { 'application/octet-stream': {} } },
                responses: {},
            },
        },
        '/with-query': {
            get: {
                tags: ['WithQuery'],
                operationId: 'withQuery',
                parameters: [{ name: 'search', in: 'query', schema: { type: 'string' } }],
                responses: {},
            },
        },
        '/primitive-body': {
            post: {
                tags: ['PrimitiveBody'],
                operationId: 'primitiveBody',
                requestBody: {
                    content: {
                        'application/json': {
                            schema: { type: 'string' },
                        },
                    },
                },
                responses: {},
            },
        },
        '/with-header': {
            get: {
                tags: ['WithHeader'],
                operationId: 'withHeader',
                parameters: [{ name: 'X-Custom-Header', in: 'header', schema: { type: 'string' } }],
                responses: {},
            },
        },
        '/post-and-return': {
            post: {
                tags: ['PostAndReturn'],
                operationId: 'postAndReturn',
                requestBody: {
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/BodyModel' } } },
                },
                responses: {},
            },
        },
        '/file-param': {
            post: {
                tags: ['FileParam'],
                operationId: 'uploadFile',
                consumes: ['multipart/form-data'],
                parameters: [{ name: 'file', in: 'formData', type: 'file' }],
                responses: {},
            },
        },
        '/patch-op': {
            patch: {
                tags: ['PatchOp'],
                operationId: 'patchSomething',
                responses: { '200': { description: 'OK' } },
            },
        },
        '/delete-op': {
            delete: {
                tags: ['DeleteOp'],
                operationId: 'deleteSomething',
                responses: { '204': { description: 'No Content' } },
            },
        },
        '/oas2-no-schema': {
            get: {
                tags: ['OAS2'],
                operationId: 'getOAS2NoSchema',
                responses: { '200': { description: 'Success' } },
            },
        },
        '/patch-resource/{id}': {
            patch: {
                tags: ['PatchResource'],
                parameters: [{ name: 'id', in: 'path' }],
                requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
                responses: {},
            },
        },
        // OAS 3.2 Support: GET with body
        '/get-with-body': {
            get: {
                tags: ['OAS32'],
                operationId: 'getWithBody',
                requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
                responses: { '200': {} },
            },
        },
        // OAS 3.2 Support: DELETE with body
        '/delete-with-body': {
            delete: {
                tags: ['OAS32'],
                operationId: 'deleteWithBody',
                requestBody: { content: { 'application/json': { schema: { type: 'string' } } } },
                responses: { '200': {} },
            },
        },
    },
    components: {
        schemas: {
            BodyModel: {
                type: 'object',
                properties: { id: { type: 'string' } },
            },
        },
    },
};

export const branchCoverageSpec = {
    openapi: '3.0.0',
    info,
    paths: {
        // For resource-discovery: getResourceName fallback
        '/': {
            get: {
                tags: ['Default'],
                operationId: 'getRoot',
                responses: {},
            },
        },
        // For resource-discovery: getFormProperties & getModelName fallbacks
        '/no-schema-resource/{id}': {
            delete: {
                tags: ['NoSchemaResource'],
                parameters: [{ name: 'id', in: 'path', required: true }],
                responses: {},
                // Deliberately no requestBody or success response with a schema
            },
        },
        '/multi/path/complex-action': {
            post: {
                tags: ['MultiPath'],
                operationId: 'multiPathComplexAction',
                responses: { '200': {} },
            },
        },
        '/read-only-resource': {
            get: {
                tags: ['ReadOnlyResource'],
                operationId: 'getReadOnly',
                responses: {
                    '200': {
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/ReadOnlyResource' } } },
                    },
                },
            },
        },
        '/no-create-update/{id}': {
            delete: {
                tags: ['NoCreateUpdate'],
                operationId: 'deleteNoCreateUpdate',
                parameters: [{ name: 'id', in: 'path' }],
                responses: {},
            },
        },
        '/update-only-no-get/{id}': {
            put: {
                tags: ['UpdateOnlyNoGet'],
                operationId: 'updateTheThing',
                parameters: [{ name: 'id', in: 'path' }],
                requestBody: {
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateOnlyNoGet' } } },
                },
                responses: {},
            },
        },
        '/op-with-default-response': {
            get: {
                tags: ['DefaultResponse'],
                responses: {
                    default: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Base' } } } },
                },
            },
        },

        '/collection-action': {
            post: {
                tags: ['CollectionAction'],
                operationId: 'triggerGlobalAction',
                responses: { '200': {} },
            },
        },
        '/poly-readonly-discriminator': {
            post: {
                tags: ['PolyReadonlyDiscriminator'],
                requestBody: {
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/PolyReadonly' } } },
                },
                responses: {},
            },
        },
        '/all-required/{id}': {
            get: {
                tags: ['AllRequired'],
                operationId: 'getAllRequired',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {},
            },
        },
        '/body-no-schema': {
            post: {
                tags: ['BodyNoSchema'],
                operationId: 'postBodyNoSchema',
                requestBody: { content: { 'application/json': {} } },
                responses: {},
            },
        },
        '/no-body-at-all': {
            get: {
                tags: ['NoBody'],
                operationId: 'getNoBody',
                responses: { '200': { description: 'OK', content: { 'text/plain': { schema: { type: 'string' } } } } },
            },
        },
        '/no-success-response': {
            get: {
                tags: ['NoSuccessResponse'],
                operationId: 'getNoSuccess',
                responses: { '404': { description: 'not found' } },
            },
        },
        '/no-params-key': {
            get: {
                tags: ['NoParamsKey'],
                operationId: 'getNoParamsKey',
                responses: {},
            },
        },
        '/param-is-ref': {
            get: {
                tags: ['ParamIsRef'],
                parameters: [{ name: 'user', in: 'query', schema: { $ref: '#/components/schemas/User' } }],
                responses: {},
            },
        },
        // For service generator fallback test
        '/no-operation-id': {
            head: {
                tags: ['NoOperationId'],
                responses: { '200': {} },
            },
        },
        // For final resource-discovery coverage (custom collection action classification)
        '/widgets/add-item': {
            post: {
                tags: ['Widgets'],
                operationId: 'addItemToWidget',
                responses: { '200': {} },
            },
        },
        '/inline-schema-property': {
            get: {
                tags: ['InlineSchemaProperty'],
                operationId: 'getInlineSchemaProperty',
                responses: {
                    '200': {
                        content: {
                            'application/json': { schema: { $ref: '#/components/schemas/InlineSchemaProperty' } },
                        },
                    },
                },
            },
        },
        '/patch-resource/{id}': {
            patch: {
                tags: ['PatchResource'],
                parameters: [{ name: 'id', in: 'path' }],
                requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
                responses: {},
            },
        },
    },
    components: {
        securitySchemes: {
            CookieAuth: { type: 'apiKey', in: 'cookie', name: 'sid' },
            // For auth-interceptor: Bearer with non-function value
            BearerTokenSimple: { type: 'http', scheme: 'bearer' },
        },
        schemas: {
            ReadOnlyResource: {
                type: 'object',
                properties: {
                    id: { type: 'string', readOnly: true },
                    name: { type: 'string', readOnly: true },
                },
            },
            NoCreateUpdate: { type: 'object', properties: { id: { type: 'string' } } },
            UpdateOnlyNoGet: { type: 'object', properties: { name: { type: 'string' } } },
            CircularA: { properties: { b: { $ref: '#/components/schemas/CircularB' } } },
            CircularB: { properties: { a: { $ref: '#/components/schemas/CircularA' } } },
            WithExample: { type: 'string', example: 'hello from example' },
            User: { type: 'object', properties: { name: { type: 'string' } } },
            Base: { type: 'object', properties: { id: { type: 'string' } } },
            PolyReadonly: {
                type: 'object',
                properties: { petType: { type: 'string', readOnly: true } },
                oneOf: [{ $ref: '#/components/schemas/Cat' }],
                discriminator: { propertyName: 'petType' },
            },
            Cat: {
                type: 'object',
                properties: { name: { type: 'string' }, petType: { type: 'string', enum: ['cat'] } },
            },
            OneOfNoType: {
                oneOf: [{ type: 'string' }, { type: 'number' }],
            },
            TupleArray: {
                type: 'array',
                items: [{ type: 'string' }, { type: 'number' }],
            },
            NumberWithDefault: {
                type: 'number',
                default: 42,
            },
            // For mock data coverage of `allOf` with primitives
            AllOfWithPrimitive: {
                allOf: [{ type: 'string' }],
            },
            InlineSchemaProperty: {
                type: 'object',
                properties: {
                    inline: {
                        type: 'object',
                        properties: {
                            prop: { type: 'string' },
                        },
                    },
                },
            },
        },
    },
};

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
                    responses: { '200': {} },
                },
            },
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
                responses: { '200': {} },
            },
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
                                    items: { $ref: '#/components/schemas/DeleteOnly' },
                                },
                            },
                        },
                    },
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
                responses: { '200': {} },
            },
        },
        '/poly-no-prop': {
            post: {
                tags: ['Poly'],
                operationId: 'postPolyNoProp',
                requestBody: {
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/PolyNoProp' } } },
                },
                responses: { '200': {} },
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
                responses: { '200': {} },
            },
        },
        '/form-urlencoded-no-params': {
            post: {
                tags: ['UrlencodedNoParams'],
                operationId: 'postUrlencodedNoParams',
                consumes: ['application/x-www-form-urlencoded'],
                requestBody: { content: { 'application/x-www-form-urlencoded': {} } },
            },
        },
        '/poly-with-only-primitives': {
            post: {
                tags: ['PolyWithOnlyPrimitives'],
                operationId: 'postPolyWithOnlyPrimitives',
                requestBody: {
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/PolyWithOnlyPrimitives' } },
                    },
                },
            },
        },
        '/server-override': {
            get: {
                tags: ['ServerOverride'],
                operationId: 'getWithServerOverride',
                servers: [{ url: 'https://custom.api.com', description: 'Custom Server' }],
                responses: { '200': {} },
            },
        },
        // OAS 3.2 Support: GET with body
        '/get-with-body': {
            get: {
                tags: ['OAS32'],
                operationId: 'getWithBody',
                requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
                responses: { '200': {} },
            },
        },
        // OAS 3.2 Support: DELETE with body
        '/delete-with-body': {
            delete: {
                tags: ['OAS32'],
                operationId: 'deleteWithBody',
                requestBody: { content: { 'application/json': { schema: { type: 'string' } } } },
                responses: { '200': {} },
            },
        },
    },
    components: {
        schemas: {
            WithUnsupported: {
                type: 'object',
                properties: {
                    myFile: { type: 'string', format: 'binary' },
                    unsupportedField: { type: 'object' }, // An object with no properties is not a valid form control
                },
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
                required: ['type'],
            },
            PolyWithPrimitive: {
                oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/Sub' }],
                discriminator: { propertyName: 'type' },
            },
            PolyWithOnlyPrimitives: {
                oneOf: [{ type: 'string' }, { type: 'number' }],
                discriminator: { propertyName: 'type' },
            },
        },
    },
};
