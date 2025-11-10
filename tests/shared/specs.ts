/**
 * @fileoverview
 * This file serves as a data repository for the integration and unit tests. It contains various
 * OpenAPI specification objects, each defined as a constant to be used across multiple test files.
 * This centralization makes tests easier to read and maintain.
 */

const info = { title: 'Test API', version: '1.0.0' };

export const emptySpec = { openapi: '3.0.0', info, paths: {} };

// ... (fullCRUD_Users, coverageSpec, coverageSpecPart2 remain unchanged)
export const fullCRUD_Users = {
    paths: {
        '/users': {
            get: {
                operationId: 'getUsers',
                tags: ['Users'],
                responses: {
                    '200': {
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: { $ref: '#/components/schemas/User' }
                                }
                            }
                        }
                    }
                }
            },
            post: {
                operationId: 'createUser',
                tags: ['Users'],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
                responses: { '201': {} }
            }
        },
        '/users/{id}': {
            get: {
                operationId: 'getUserById',
                tags: ['Users'],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } }
            },
            put: {
                operationId: 'updateUser',
                tags: ['Users'],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
                responses: { '200': {} }
            },
            delete: {
                operationId: 'deleteUser',
                tags: ['Users'],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '204': {} }
            }
        },
    },
    components: {
        schemas: {
            User: {
                type: 'object',
                properties: {
                    id: { type: 'string', readOnly: true },
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' }
                }
            },
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
            get: {
                operationId: 'getLogs',
                tags: ['Logs'],
                responses: { '200': { description: 'Read-only logs' } }
            }
        },
        '/publications': {
            post: {
                tags: ['Publications'],
                operationId: 'createPublication',
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Publication' } } } }
            }
        },
        '/configs/{id}': {
            put: {
                tags: ['Configs'],
                operationId: 'updateConfig',
                parameters: [{ name: 'id', in: 'path' }]
            }
        },
        '/servers': {
            get: {
                operationId: 'getServers',
                tags: ['Servers'],
                responses: { '200': { description: 'ok' } }
            }
        },
        '/servers/reboot-all': { post: { tags: ['Servers'], operationId: 'rebootAllServers' } },
        '/servers/{id}/start': {
            post: {
                tags: ['Servers'],
                operationId: 'startServer',
                parameters: [{ name: 'id', in: 'path', schema: { type: 'string' } }]
            }
        },
        '/servers/{id}/reboot-item': {
            post: {
                tags: ['Servers'],
                operationId: 'rebootServerItem',
                parameters: [{ name: 'id', in: 'path', schema: { type: 'string' } }]
            }
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
                                    items: { type: 'string' }
                                }
                            }
                        }
                    }
                }
            }
        },
        '/custom-name': { get: { tags: ['CustomName'], operationId: 'get-custom-name' } },
        '/duplicate-name': {
            get: { tags: ['DuplicateName'], operationId: 'getName' },
            post: { tags: ['DuplicateName'], operationId: 'getName' }
        },
        '/action-test/{id}': {
            head: {
                tags: ['ActionTest'],
                parameters: [{ name: 'id', in: 'path', schema: { type: 'string' } }]
            }
        },
        '/users-search': { post: { tags: ['UsersSearch'], operationId: 'searchUsers' } },
        '/events': {
            get: {
                operationId: 'getEvents',
                tags: ['Events'],
                responses: {
                    '200': {
                        'content': {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: { '$ref': '#/components/schemas/Event' }
                                }
                            }
                        }
                    }
                }
            }
        },
        '/no-content': { delete: { tags: ['NoContent'], operationId: 'deleteNoContent', responses: { '204': {} } } },
    },
    components: {
        ...fullCRUD_Users.components,
        schemas: {
            ...fullCRUD_Users.components.schemas,
            Publication: { type: 'object' },
            Event: { type: 'object', properties: { eventId: { type: 'string' }, timestamp: { type: 'string' } } }
        }
    }
};

export const coverageSpecPart2 = {
    openapi: '3.0.0', info,
    paths: {
        '/no-id-opid': {
            head: { tags: ['NoIdOpId'], responses: { '200': {} } }
        },
        '/no-schema-resource': {
            delete: { tags: ['NoSchemaResource'], responses: { '204': {} } }
        },
        '/form-data-test': {
            post: {
                tags: ['FormData'],
                operationId: 'postWithFormData',
                consumes: ['multipart/form-data'],
                parameters: [
                    { name: 'file', in: 'formData', type: 'file', required: true },
                    { name: 'description', in: 'formData', type: 'string' }
                ]
            }
        },
        '/url-encoded-test': {
            post: {
                tags: ['UrlEncoded'],
                operationId: 'postWithUrlEncoded',
                consumes: ['application/x-www-form-urlencoded'],
                parameters: [
                    { name: 'grant_type', in: 'formData', type: 'string' },
                    { name: 'code', in: 'formData', type: 'string' }
                ]
            }
        },
        '/primitive-response': {
            get: {
                tags: ['PrimitiveResponse'],
                operationId: 'getHealthCheck',
                responses: { '200': { content: { 'text/plain': { schema: { type: 'string' } } } } }
            }
        },
        '/no-create-update/{id}': {
            delete: { tags: ['NoCreateUpdate'], operationId: 'deleteNoCreateUpdate', parameters: [{name: 'id', in: 'path'}] }
        }
    },
    components: {
        schemas: {
            NoCreateUpdate: { type: 'object', properties: { id: {type: 'string'}}}
        }
    }
};

export const parserCoverageSpec = {
    openapi: '3.0.0', info, paths: {},
    components: {
        schemas: {
            WithMapping: {
                oneOf: [{ $ref: '#/components/schemas/Sub3' }],
                discriminator: {
                    propertyName: 'type',
                    mapping: {
                        'subtype3': '#/components/schemas/Sub3'
                    }
                }
            },
            PolyWithInline: {
                oneOf: [
                    { type: 'object', properties: {} }, // Not a $ref
                    { $ref: '#/components/schemas/Sub3' }
                ],
                discriminator: { propertyName: 'type' }
            },
            PolyWithInvalidRefs: {
                oneOf: [
                    { $ref: '#/components/schemas/Sub1' },
                    { $ref: '#/components/schemas/Sub2' }
                ],
                discriminator: { propertyName: 'type' }
            },
            Sub1: { type: 'object', properties: { /* no 'type' property */ } },
            Sub2: { type: 'object', properties: { type: { /* no 'enum' */ } } },
            Sub3: {
                type: 'object',
                properties: { type: { type: 'string', enum: ['sub3'] } }
            }
        }
    }
};

// ... (providerCoverageSpec, securitySpec, typeGenSpec, adminFormSpec, polymorphismSpec, finalCoverageSpec, listComponentSpec remain unchanged)
export const providerCoverageSpec = {
    openapi: '3.0.0', info, paths: {},
    components: {
        securitySchemes: {
            ApiKeyOnly: { type: 'apiKey', in: 'header', name: 'X-API-KEY' }
        }
    }
};

export const securitySpec = {
    openapi: '3.0.0', info, paths: {},
    components: {
        securitySchemes: {
            ApiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-KEY' },
            ApiKeyQuery: { type: 'apiKey', in: 'query', name: 'api_key_query' },
            BearerAuth: { type: 'http', scheme: 'bearer' },
            OAuth2Flow: { type: 'oauth2', flows: {} },
        }
    }
};

export const typeGenSpec = {
    openapi: '3.0.0', info, paths: {},
    components: {
        schemas: {
            Status: { type: 'string', enum: ['active', 'inactive'] },
            NumericEnum: { type: 'number', enum: [1, 2, 3] },
            Extended: {
                allOf: [{ $ref: '#/components/schemas/Base' }, {
                    type: 'object',
                    properties: { name: { type: 'string' } }
                }]
            },
            Base: { type: 'object', properties: { id: { type: 'string' } } },
            AnyValue: { anyOf: [{ type: 'string' }, { type: 'number' }] },
            QuotedProps: { type: 'object', properties: { 'with-hyphen': { type: 'string' } } },
            FreeObject: { type: 'object', additionalProperties: true },
            StringMap: { type: 'object', additionalProperties: { type: 'string' } },
            Description: { properties: { prop: { type: 'string', description: 'A test property.' } } },
            SimpleAlias: { type: 'string', description: 'This is just a string alias.' },
            EmptyEnum: { type: 'string', enum: [] },
            ComplexAlias: { oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/Base' }] }
        }
    }
};

export const adminFormSpec = {
    openapi: '3.0.0',
    info,
    paths: {
        '/widgets': {
            get: { tags: ['Widgets'], responses: { '200': {} } },
            post: {
                tags: ['Widgets'],
                operationId: 'postWidgets',
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Widget' } } } }
            }
        }
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
                        properties: { key: { type: 'string' }, readOnlyKey: { type: 'string', readOnly: true } }
                    },
                    items: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                value: { type: 'number' },
                                readOnlyVal: { type: 'string', readOnly: true }
                            }
                        }
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
                    boundedArray: { type: 'array', items: { type: 'string' }, minItems: 2 }
                }
            }
        }
    }
};

export const polymorphismSpec = {
    openapi: '3.0.0',
    info,
    paths: {
        '/pets': {
            get: { tags: ['Pets'], responses: { '200': {} } },
            post: {
                tags: ['Pets'],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } }
            }
        }
    },
    components: {
        schemas: {
            Pet: {
                type: 'object', required: ['petType'],
                oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
                discriminator: { propertyName: 'petType' },
                properties: {
                    petType: { type: 'string' }
                }
            },
            Cat: {
                type: 'object',
                allOf: [{ $ref: '#/components/schemas/BasePet' }],
                required: ['petType'],
                properties: {
                    petType: { type: 'string', enum: ['cat'] },
                    huntingSkill: { type: 'string' },
                    isDeclawed: { type: 'boolean', readOnly: true }
                }
            },
            Dog: {
                type: 'object',
                allOf: [{ $ref: '#/components/schemas/BasePet' }],
                required: ['petType'],
                properties: { petType: { type: 'string', enum: ['dog'] }, barkingLevel: { type: 'integer' } }
            },
            BasePet: { type: 'object', properties: { name: { type: 'string' } } }
        }
    }
};

export const finalCoverageSpec = {
    openapi: '3.0.0', info,
    paths: {
        '/all-params/{pathParam}': {
            post: {
                tags: ['AllParams'],
                operationId: 'allParams',
                parameters: [
                    { name: 'pathParam', in: 'path', required: true, schema: { type: 'string' } }
                ],
                requestBody: { content: { 'application/octet-stream': {} } }
            }
        },
        '/with-query': {
            get: {
                tags: ['WithQuery'],
                operationId: 'withQuery',
                parameters: [
                    { name: 'search', in: 'query', schema: { type: 'string' } }
                ]
            }
        },
        '/primitive-body': {
            post: {
                tags: ['PrimitiveBody'],
                operationId: 'primitiveBody',
                requestBody: {
                    // FIX: Changed from text/plain to application/json to hit the correct logic branch
                    content: {
                        'application/json': {
                            schema: { type: 'string' }
                        }
                    }
                }
            }
        },
        '/with-header': {
            get: {
                tags: ['WithHeader'],
                operationId: 'withHeader',
                parameters: [
                    { name: 'X-Custom-Header', in: 'header', schema: { type: 'string' } }
                ]
            }
        },
        '/post-and-return': {
            post: {
                tags: ['PostAndReturn'],
                operationId: 'postAndReturn',
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/BodyModel' } } } }
            }
        },
        '/file-param': {
            post: {
                tags: ['FileParam'],
                operationId: 'uploadFile',
                consumes: ['multipart/form-data'],
                parameters: [{ name: 'file', in: 'formData', type: 'file' }]
            }
        },
        '/patch-op': {
            patch: {
                tags: ['PatchOp'],
                operationId: 'patchSomething',
                responses: { '200': { description: 'OK' } }
            }
        },
        '/delete-op': {
            delete: {
                tags: ['DeleteOp'],
                operationId: 'deleteSomething',
                responses: { '204': { description: 'No Content' } }
            }
        },
        '/oas2-no-schema': {
            get: {
                tags: ['OAS2'],
                operationId: 'getOAS2NoSchema',
                responses: { '200': { description: 'Success' } }
            }
        }
    },
    components: {
        schemas: {
            BodyModel: {
                type: 'object',
                properties: { id: { type: 'string' } }
            }
        }
    }
};

export const listComponentSpec = {
    openapi: '3.0.0', info,
    paths: {
        '/icon-tests': {
            get: { tags: ['IconTests'], responses: { '200': { description: 'ok' } } },
            post: { tags: ['IconTests'], operationId: 'createItem' }
        },
        '/icon-tests/{id}': {
            put: { tags: ['IconTests'], operationId: 'updateItem', parameters: [{ name: 'id', in: 'path' }] },
            delete: { tags: ['IconTests'], operationId: 'deleteItem', parameters: [{ name: 'id', in: 'path' }] }
        },
        '/icon-tests/add': { post: { tags: ['IconTests'], operationId: 'addItem' } },
        '/icon-tests/{id}/remove': {
            post: {
                tags: ['IconTests'],
                operationId: 'removeItem',
                parameters: [{ name: 'id', in: 'path' }]
            }
        },
        '/icon-tests/{id}/start': {
            post: {
                tags: ['IconTests'],
                operationId: 'startItem',
                parameters: [{ name: 'id', in: 'path' }]
            }
        },
        '/icon-tests/{id}/pause': {
            post: {
                tags: ['IconTests'],
                operationId: 'pauseProcess',
                parameters: [{ name: 'id', in: 'path' }]
            }
        },
        '/icon-tests/sync-all': { post: { tags: ['IconTests'], operationId: 'syncAll' } },
        '/icon-tests/{id}/approve': {
            post: {
                tags: ['IconTests'],
                operationId: 'approveItem',
                parameters: [{ name: 'id', in: 'path' }]
            }
        },
        '/icon-tests/{id}/block': {
            post: {
                tags: ['IconTests'],
                operationId: 'blockUser',
                parameters: [{ name: 'id', in: 'path' }]
            }
        },
        '/no-list': { post: { tags: ['NoListResource'], responses: { '200': {} } } },
        '/no-props': {
            get: {
                tags: ['NoPropsResource'],
                responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/NoProps' } } } } }
            }
        },
        '/no-listable-props': {
            get: {
                tags: ['NoListablePropsResource'],
                responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/NoListableProps' } } } } }
            }
        }
    },
    components: {
        schemas: {
            IconTest: { type: 'object', properties: { id: { type: 'string' } } },
            NoProps: { type: 'object', properties: {} },
            NoListableProps: { type: 'object', properties: { config: { type: 'object' } } },
            NoListResource: { type: 'object' },
        }
    }
};

export const mockDataGenSpec = {
    openapi: '3.0.0', info, paths: {},
    components: {
        schemas: {
            WithBadRef: {
                allOf: [
                    { $ref: '#/components/schemas/Base' },
                    { $ref: '#/components/schemas/NonExistent' }
                ]
            },
            JustARef: {
                $ref: '#/components/schemas/Base'
            },
            RefToNothing: {
                $ref: '#/components/schemas/NonExistent'
            },
            BooleanSchema: {
                type: 'boolean'
            },
            ArrayNoItems: {
                type: 'array'
            },
            ObjectNoProps: {
                type: 'object'
            },
            NullType: {
                type: 'null'
            },
            Base: { type: 'object', properties: { id: { type: 'string' } } },
        }
    }
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
            },
        },
        // For resource-discovery: getFormProperties & getModelName fallbacks
        '/no-schema-resource/{id}': {
            delete: {
                tags: ['NoSchemaResource'],
                parameters: [{ name: 'id', in: 'path', required: true }],
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
                    '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/ReadOnlyResource' } } } },
                },
            },
        },
        '/no-create-update/{id}': {
            delete: {
                tags: ['NoCreateUpdate'],
                operationId: 'deleteNoCreateUpdate',
                parameters: [{ name: 'id', in: 'path' }],
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
            },
        },
        '/op-with-default-response': {
            get: {
                tags: ['DefaultResponse'],
                responses: { default: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Base' } } } } },
            },
        },
        '/param-is-ref': {
            get: {
                tags: ['ParamIsRef'],
                parameters: [{ name: 'user', in: 'query', schema: { $ref: '#/components/schemas/User' } }],
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
            },
        },
        '/all-required/{id}': {
            get: {
                tags: ['AllRequired'],
                operationId: 'getAllRequired',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            },
        },
        '/body-no-schema': {
            post: {
                tags: ['BodyNoSchema'],
                operationId: 'postBodyNoSchema',
                requestBody: { content: { 'application/json': {} } },
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
    },
    components: {
        securitySchemes: {
            CookieAuth: { type: 'apiKey', in: 'cookie', name: 'session_id' },
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
        },
    },
};
