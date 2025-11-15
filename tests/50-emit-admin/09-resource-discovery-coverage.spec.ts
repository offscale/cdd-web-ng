import { describe, expect, it } from 'vitest';
import { discoverAdminResources } from '@src/service/emit/admin/resource-discovery.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types.js';
import { branchCoverageSpec } from '../shared/specs.js';

describe('Admin: resource-discovery (Coverage)', () => {
    const runDiscovery = (spec: object) => {
        const config: GeneratorConfig = { options: { admin: true } } as any;
        const parser = new SwaggerParser(spec as any, config);
        return discoverAdminResources(parser);
    };

    it('should handle a resource with no schemas in any operation', () => {
        const resources = runDiscovery(branchCoverageSpec);
        const resource = resources.find(r => r.name === 'noSchemaResource');
        expect(resource).toBeDefined();
        // This covers the `if (allSchemas.length === 0 && ...)` branch
        expect(resource!.formProperties).toEqual([{ name: 'id', schema: { type: 'string' } }]);
        // This covers the `return singular(pascalCase(resourceName));` fallback in getModelName
        expect(resource!.modelName).toBe('NoSchemaResource');
    });

    it('should handle properties that are inline objects, not refs', () => {
        const resources = runDiscovery(branchCoverageSpec);
        const resource = resources.find(r => r.name === 'inlineSchemaProperty');
        expect(resource).toBeDefined();
        const prop = resource!.formProperties.find(p => p.name === 'inline');
        expect(prop?.schema.properties).toHaveProperty('prop');
    });

    it('should not classify custom actions like "addItem" as a standard "create"', () => {
        const resources = runDiscovery(branchCoverageSpec);
        const resource = resources.find(r => r.name === 'widgets')!;
        const addOp = resource.operations.find(op => op.operationId === 'addItemToWidget')!;
        // This verifies the `customActionKeywords` check in `classifyAction`
        expect(addOp.action).toBe('addItemToWidget');
    });

    it('should handle a resource with a create op but no success response schema', () => {
        const resources = runDiscovery({
            paths: {
                '/items': {
                    post: {
                        tags: ['Items'],
                        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } } } },
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
        const resource = resources.find(r => r.name === 'formData');
        expect(resource).toBeDefined();
        // formDataProperties are merged into the final list.
        expect(resource!.formProperties.some(p => p.name === 'file')).toBe(true);
        expect(resource!.formProperties.some(p => p.name === 'metadata')).toBe(true);
    });

    it('should handle unresolvable schemas gracefully', () => {
        const spec = {
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
        const resource = resources.find(r => r.name === 'badRef');
        expect(resource).toBeDefined();
        // The discovery should not crash and should produce a resource with fallback properties.
        expect(resource!.formProperties).toEqual([{ name: 'id', schema: { type: 'string' } }]);
    });

    it('should correctly identify a resource with PATCH as editable', () => {
        const resources = runDiscovery(branchCoverageSpec);
        const resource = resources.find(r => r.name === 'patchResource');
        expect(resource).toBeDefined();
        expect(resource!.isEditable).toBe(true);
    });
});
