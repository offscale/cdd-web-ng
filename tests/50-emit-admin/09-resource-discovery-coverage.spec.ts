import { describe, expect, it } from 'vitest';

import { discoverAdminResources } from '@src/generators/angular/admin/resource-discovery.js';
import { SwaggerParser } from '@src/core/parser.js';
import { FormProperty, GeneratorConfig, Resource, ResourceOperation } from "@src/core/types/index.js";

import { branchCoverageSpec } from '../shared/specs.js';

describe('Admin: resource-discovery (Coverage)', () => {
    const runDiscovery = (spec: object) => {
        const config: GeneratorConfig = { options: { admin: true } } as any;
        const parser = new SwaggerParser(spec as any, config);
        return discoverAdminResources(parser);
    };

    it('should infer form properties from a 201 response when 200 is missing', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/items-201': {
                    post: {
                        tags: ['Items201'],
                        responses: { '201': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } } } },
                    },
                },
            },
            components: { schemas: { Item: { type: 'object', properties: { name: { type: 'string' } } } } },
        };
        const resources = runDiscovery(spec);
        const resource = resources.find((r: Resource) => r.name === 'items201');
        expect(resource).toBeDefined();
        expect(resource!.formProperties.some((p: FormProperty) => p.name === 'name')).toBe(true);
    });

    it('should ignore formData parameters that are refs', () => {
        const spec = {
            swagger: '2.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/form-ref': {
                    post: {
                        tags: ['FormRef'],
                        consumes: ['multipart/form-data'],
                        parameters: [
                            { name: 'good', in: 'formData', type: 'string' },
                            { name: 'bad', in: 'formData', schema: { $ref: '#/definitions/Item' } },
                        ],
                    },
                },
            },
            definitions: { Item: { type: 'object', properties: { name: { type: 'string' } } } },
        };
        const resources = runDiscovery(spec);
        const resource = resources.find((r: Resource) => r.name === 'formRef');
        expect(resource).toBeDefined();
        // `good` is processed because it's a primitive.
        expect(resource!.formProperties.some((p: FormProperty) => p.name === 'good')).toBe(true);
        // `bad` is skipped by the `!('$ref' in param.schema)` check.
        expect(resource!.formProperties.some((p: FormProperty) => p.name === 'bad')).toBe(false);
    });

    it('should correctly classify a POST with a custom keyword opId as a custom action', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/items': {
                    post: { // collection path, no ID suffix
                        tags: ['Items'],
                        operationId: 'uploadItems', // has 'upload' keyword
                        responses: { '200': {} }
                    }
                }
            }
        };
        const resources = runDiscovery(spec);
        const resource = resources.find((r: Resource) => r.name === 'items');
        // This hits the `hasCustomKeyword` branch in `classifyAction`
        expect(resource!.operations[0].action).toBe('uploadItems');
    });

    it('should handle operations with no parameters key and schemas with no required key', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/items': {
                    get: { // No `parameters` key at all
                        tags: ['Items'],
                        responses: {
                            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } } }
                        },
                    }
                }
            },
            components: {
                schemas: {
                    Item: {
                        type: 'object',
                        properties: { name: { type: 'string' } } // no 'required' key
                    }
                }
            }
        };
        const resources = runDiscovery(spec);
        const resource = resources.find((r: Resource) => r.name === 'items');
        // This covers line 110 (op.parameters is undefined) and line 125 (schema has no 'required' key)
        expect(resource).toBeDefined();
        expect(resource!.formProperties.length).toBeGreaterThan(0);
    });

    it('should derive modelName from an inline schema', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/items': {
                    get: { tags: ['Items'],
                        responses: {
                            '200': {
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: { id: { type: 'string' } }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        const resources = runDiscovery(spec);
        const resource = resources.find((r: Resource) => r.name === 'items');
        // This covers line 192, where the code falls through to the final return
        expect(resource!.modelName).toBe('Item'); // singular(pascalCase('items'))
    });

    it('should handle a resource with no schemas in any operation', () => {
        const resources = runDiscovery(branchCoverageSpec);
        const resource = resources.find((r: Resource) => r.name === 'noSchemaResource');
        expect(resource).toBeDefined();
        // This covers the `if (allSchemas.length === 0 && ...)` branch
        expect(resource!.formProperties).toEqual([{ name: 'id', schema: { type: 'string' } }]);
        // This covers the `return singular(pascalCase(resourceName));` fallback in getModelName
        expect(resource!.modelName).toBe('NoSchemaResource');
    });

    it('should handle properties that are inline objects, not refs', () => {
        const resources = runDiscovery(branchCoverageSpec);
        const resource = resources.find((r: Resource) => r.name === 'inlineSchemaProperty');
        expect(resource).toBeDefined();
        const prop = resource!.formProperties.find((p: FormProperty) => p.name === 'inline');
        expect(prop?.schema.properties).toHaveProperty('prop');
    });

    it('should not classify custom actions like "addItem" as a standard "create"', () => {
        const resources = runDiscovery(branchCoverageSpec);
        const resource = resources.find((r): boolean => r.name === 'widgets')!;
        const addOp = resource.operations.find((op: ResourceOperation): boolean => op.operationId === 'addItemToWidget')!;
        // This verifies the `customActionKeywords` check in `classifyAction`
        expect(addOp.action).toBe('addItemToWidget');
    });

    it('should handle a resource with a create op but no success response schema', () => {
        const resources = runDiscovery({
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/items': {
                    post: {
                        tags: ['Items'],
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: { name: { type: 'string' } }
                                    }
                                }
                            }
                        },
                        responses: { '201': { description: 'Created' } }, // No schema
                    },
                },
            },
        });
        const resource = resources[0];
        // This covers the `if (resSchema)` false branch in getFormProperties
        expect(resource.formProperties.length).toBeGreaterThan(0);
        expect(resource.formProperties[0].name).toBe('name');
    });

    it('should collect properties from swagger 2.0 formData parameters', () => {
        const spec = {
            swagger: '2.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/form-data': {
                    post: {
                        tags: ['FormData'],
                        consumes: ['multipart/form-data'],
                        parameters: [
                            { name: 'file', in: 'formData', type: 'file' },
                            { name: 'metadata', in: 'formData', type: 'string' }
                        ]
                    }
                }
            }
        };
        const resources = runDiscovery(spec);
        const resource = resources.find((r: Resource) => r.name === 'formData');
        expect(resource).toBeDefined();
        // formDataProperties are merged into the final list.
        expect(resource!.formProperties.some((p: FormProperty) => p.name === 'file')).toBe(true);
        expect(resource!.formProperties.some((p: FormProperty) => p.name === 'metadata')).toBe(true);
    });

    it('should handle unresolvable schemas gracefully', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/bad-ref': {
                    get: {
                        tags: ['BadRef'],
                        responses: { '200': { content: { 'application/json': { schema: { $ref: '#/non/existent' } } } } }
                    }
                }
            }
        };
        const resources = runDiscovery(spec);
        const resource = resources.find((r: Resource) => r.name === 'badRef');
        expect(resource).toBeDefined();
        // The discovery should not crash and should produce a resource with fallback properties.
        expect(resource!.formProperties).toEqual([{ name: 'id', schema: { type: 'string' } }]);
    });

    it('should correctly identify a resource with PATCH as editable', () => {
        const resources = runDiscovery(branchCoverageSpec);
        const resource = resources.find((r: Resource) => r.name === 'patchResource');
        expect(resource).toBeDefined();
        expect(resource!.isEditable).toBe(true);
    });

    it('should handle getFormProperties with unresolvable ref in properties', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/bad-prop-ref': {
                    get: {
                        tags: ['BadPropRef'],
                        responses: {
                            '200': {
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: { bad: { $ref: '#/non/existent' } }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        const resources = runDiscovery(spec);
        const resource = resources.find((r: Resource) => r.name === 'badPropRef')!;
        expect(resource.formProperties[0].schema).toEqual({ $ref: '#/non/existent' });
    });

    it('should fall back to path segment for untagged resource', () => {
        const specWithUntagged = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: { '/some-resource': { get: { operationId: 'getSome' } } }
        };
        const resources = runDiscovery(specWithUntagged);
        const resource = resources.find((r: Resource) => r.name === 'someResource');
        expect(resource).toBeDefined();
    });

    it('should create fallback properties for a resource with no schemas', () => {
        const resources = runDiscovery(branchCoverageSpec);
        const resource = resources.find((r: Resource) => r.name === 'noSchemaResource');
        expect(resource).toBeDefined();
        expect(resource!.formProperties).toEqual([{ name: 'id', schema: { type: 'string' } }]);
    });

    it('should exclude non-primitive properties from listProperties', () => {
        const specWithObjectProp = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/configs': {
                    get: {
                        tags: ['Configs'],
                        responses: {
                            '200': {
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: { id: { type: 'string' }, data: { type: 'object' } }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        const resources = runDiscovery(specWithObjectProp);
        const resource = resources.find((r: Resource) => r.name === 'configs');
        expect(resource).toBeDefined();
        expect(resource!.listProperties.some((p: FormProperty) => p.name === 'id')).toBe(true);
        expect(resource!.listProperties.some((p: FormProperty) => p.name === 'data')).toBe(false);
    });
});
