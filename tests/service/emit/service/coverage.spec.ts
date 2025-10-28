import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { ServiceGenerator } from '../../../../src/service/emit/service/service.generator.js';
import { SwaggerParser } from '../../../../src/core/parser.js';
import { GeneratorConfig } from '../../../../src/core/types.js';

describe('Unit: ServiceGenerator (Coverage)', () => {

    const runGenerator = (spec: object, config: GeneratorConfig) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const parser = new SwaggerParser(spec as any, config);
        const serviceGen = new ServiceGenerator(parser, project, config);
        const operations = (spec as any).paths['/test'];
        serviceGen.generateServiceFile('Test', operations, '/generated/services');
        return project.getSourceFileOrThrow('/generated/services/test.service.ts');
    };

    it('should use customizeMethodName function when provided', () => {
        const spec = {
            paths: {
                '/test': [{ path: '/test', operationId: 'get_test_data', method: 'GET' }]
            }
        };
        const config: GeneratorConfig = {
            input: '', output: '',
            options: {
                dateType: 'string', enumStyle: 'enum',
                customizeMethodName: (opId) => `custom_${opId}`
            }
        };
        const sourceFile = runGenerator(spec, config);
        const serviceClass = sourceFile.getClassOrThrow('TestService');
        expect(serviceClass.getMethod('custom_get_test_data')).toBeDefined();
    });

    it('should throw if customizeMethodName is used but operationId is missing', () => {
        const spec = {
            paths: {
                '/test': [{ path: '/test', method: 'GET' }] // No operationId
            }
        };
        const config: GeneratorConfig = {
            input: '', output: '',
            options: {
                dateType: 'string', enumStyle: 'enum',
                customizeMethodName: (opId) => opId
            }
        };
        // We need to wrap the call in a function for toThrow to catch it
        const generate = () => runGenerator(spec, config);
        expect(generate).toThrow('Operation ID is required for method name customization');
    });

    it('should generate method with header parameters', () => {
        const spec = {
            paths: {
                '/test': [{
                    path: '/test',
                    method: 'GET',
                    operationId: 'getWithHeader',
                    parameters: [{ name: 'X-My-Header', in: 'header', required: true, schema: { type: 'string' } }]
                }]
            }
        };
        const config: GeneratorConfig = { input: '', output: '', options: { dateType: 'string', enumStyle: 'enum' } };

        const sourceFile = runGenerator(spec, config);
        const method = sourceFile.getClassOrThrow('TestService').getMethodOrThrow('getWithHeader');

        // Check parameter generation
        const headerParam = method.getParameters().find(p => p.getName() === 'xMyHeader');
        expect(headerParam).toBeDefined();
        expect(headerParam?.getType().getText()).toBe('string');

        // Check method body generation
        const bodyText = method.getBodyText();
        expect(bodyText).toContain("let headers = new HttpHeaders();");
        expect(bodyText).toContain("headers = headers.append('X-My-Header', String(xMyHeader));");
    });
});
