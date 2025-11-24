import { info } from "./common.js";

export const polymorphismSpec = {
    openapi: '3.0.0',
    info,
    paths: {
        '/pets': {
            get: { tags: ['Pets'], responses: { '200': {} } },
            post: {
                tags: ['Pets'],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } },
                responses: {}
            }
        }
    },
    components: {
        schemas: {
            Pet: {
                type: 'object', required: ['petType'],
                oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }, { $ref: '#/components/schemas/Lizard' }],
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
            BasePet: { type: 'object', properties: { name: { type: 'string' } } },
            Lizard: {
                type: 'object',
                allOf: [{ $ref: '#/components/schemas/BasePet' }],
                required: ['petType'],
                properties: {
                    petType: { type: 'string', enum: ['lizard'] },
                    unsupportedField: { type: 'object' } // This will not generate a control
                }
            }
        }
    }
};
