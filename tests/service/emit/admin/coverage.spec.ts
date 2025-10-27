import { describe, it, expect } from 'vitest';
import { mapSchemaToFormControl } from '../../../../src/service/emit/admin/form-control.mapper.js';
import { discoverAdminResources } from '../../../../src/service/emit/admin/resource-discovery.js';
import { SwaggerParser } from '../../../../src/core/parser.js';
import { GeneratorConfig } from '../../../../src/core/types.js';

describe('Unit: Admin Generators (Coverage)', () => {

    const createParser = (spec: object) => {
        const config: GeneratorConfig = {
            input: 'spec.json',
            output: './out',
            options: { dateType: 'string', enumStyle: 'enum' },
        };
        return new SwaggerParser(spec as any, config);
    };

    describe('FormControlMapper', () => {
        it('should return null for array of non-string/enum/object', () => {
            const schema = { type: 'array', items: { type: 'integer' } };
            const result = mapSchemaToFormControl('myArray', schema as any);
            expect(result).toBeNull();
        });

        it('should return null for object with no properties', () => {
            const schema = { type: 'object' };
            const result = mapSchemaToFormControl('myObject', schema as any);
            expect(result).toBeNull();
        });

        it('should return null for unsupported types', () => {
            const schema = { type: 'file' }; // Not a standard JSON schema type
            const result = mapSchemaToFormControl('myFile', schema as any);
            expect(result).toBeNull();
        });
    });

    describe('ResourceDiscovery', () => {
        it('should use "default" for untagged root paths', () => {
            const spec = { paths: { '/': { get: {} } } };
            const parser = createParser(spec);
            const resources = discoverAdminResources(parser);
            expect(resources[0].name).toBe('default');
        });

        it('should use operationId as fallback for action classification', () => {
            const spec = { paths: { '/users/custom-action': { post: { operationId: 'doSomethingCustom' } } } };
            const parser = createParser(spec);
            const resources = discoverAdminResources(parser);
            const userResource = resources.find(r => r.name === 'users');
            expect(userResource?.operations[0].action).toBe('doSomethingCustom');
        });

        it('should create a fallback action name if no operationId exists', () => {
            const spec = { paths: { '/users/another-action': { post: { tags:['Users']} } } };
            const parser = createParser(spec);
            const resources = discoverAdminResources(parser);
            const userResource = resources.find(r => r.name === 'users');
            expect(userResource?.operations[0].action).toBe('postUsersAnotherAction');
        });

        it('should handle schemas with no properties', () => {
            const spec = { paths: { '/items': { get: { tags:['Items'], responses: { '200': { content: { 'application/json': { schema: { type: 'object' } } } } } } } } };
            const parser = createParser(spec);
            const resources = discoverAdminResources(parser);
            // Expect it not to crash and produce a default property
            expect(resources[0].formProperties).toEqual([{ name: 'id', schema: { type: 'string' } }]);
        });
    });
});
