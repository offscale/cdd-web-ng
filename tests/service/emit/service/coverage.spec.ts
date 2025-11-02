import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { ServiceGenerator } from '../../../../src/service/emit/service/service.generator.js';
import { SwaggerParser } from '../../../../src/core/parser.js';
import { GeneratorConfig } from '../../../../src/core/types.js';
import { extractPaths } from '../../../../src/core/utils.js';

describe('Unit: ServiceGenerator (Coverage)', () => {

    const runGenerator = (spec: object, config: GeneratorConfig) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const parser = new SwaggerParser(spec as any, config);
        const serviceGen = new ServiceGenerator(parser, project, config);
        const operations = extractPaths((spec as any).paths);
        serviceGen.generateServiceFile('Test', operations, '/generated/services');
        return project.getSourceFileOrThrow('/generated/services/test.service.ts');
    };

    it('should use customizeMethodName function when provided', () => {
        const spec = {
            paths: {
                '/test': {
                    get: {
                        operationId: 'get_test_data',
                        parameters: [{ name: 'X-My-Header', in: 'header', schema: { type: 'string' } }]
                    }
                }
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
        // FIX: Find all methods with the name and take the last one (the implementation).
        const methods = serviceClass.getMethods().filter(m => m.getName() === 'custom_get_test_data');
        const method = methods[methods.length - 1];
        expect(method).toBeDefined();

        const bodyText = method!.getBodyText() ?? '';
        expect(bodyText).toContain("let headers = new HttpHeaders(options?.headers);");
        expect(bodyText).toContain("if (xMyHeader != null) headers = headers.set('X-My-Header', String(xMyHeader));");
    });

    it('should throw if customizeMethodName is used but operationId is missing', () => {
        const spec = {
            paths: { '/test': { get: {} } }
        };
        const config: GeneratorConfig = {
            input: '', output: '',
            options: {
                dateType: 'string', enumStyle: 'enum',
                customizeMethodName: (opId) => opId
            }
        };
        const generate = () => runGenerator(spec, config);
        expect(generate).toThrow('Operation ID is required for method name customization');
    });

    it('should generate method with header parameters', () => {
        // FIX: Define spec and config inside the test scope
        const spec = {
            paths: {
                '/test': {
                    get: {
                        operationId: 'getWithHeader',
                        parameters: [{ name: 'X-My-Header', in: 'header', required: true, schema: { type: 'string' } }]
                    }
                }
            }
        };
        const config: GeneratorConfig = { input: '', output: '', options: { dateType: 'string', enumStyle: 'enum' } };

        const sourceFile = runGenerator(spec, config);
        // FIX: Find all methods with the name and take the last one (the implementation).
        const methods = sourceFile.getClassOrThrow('TestService')
            .getMethods()
            .filter(m => m.getName() === 'getWithHeader');
        const method = methods[methods.length - 1];
        expect(method).toBeDefined();

        const bodyText = method!.getBodyText() ?? '';
        expect(bodyText).toContain("let headers = new HttpHeaders(options?.headers);");
        expect(bodyText).toContain("if (xMyHeader != null) headers = headers.set('X-My-Header', String(xMyHeader));");
    });
});
