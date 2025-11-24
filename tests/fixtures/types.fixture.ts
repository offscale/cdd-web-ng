import { info } from "./common.js";

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
