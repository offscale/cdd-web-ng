import { describe, it, expect, vi } from 'vitest';
import { ClassDeclaration, Project } from 'ts-morph';
import { ServiceMethodGenerator } from '@src/service/emit/service/service-method.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, PathInfo } from '@src/core/types.js';
import { finalCoverageSpec } from '../shared/specs.js';
import { TypeGenerator } from '@src/service/emit/type/type.generator.js';
import { HttpParamsBuilderGenerator } from '@src/service/emit/utility/http-params-builder.js';

/**
 * A comprehensive spec designed specifically to hit all branches within the ServiceMethodGenerator.
 */
const serviceMethodGenSpec = {
    ...finalCoverageSpec,
    paths: {
        ...finalCoverageSpec.paths,
        '/docs/summary': { get: { tags: ['Docs'], operationId: 'getSummary', summary: 'This is a summary.' } },
        '/docs/description': { get: { tags: ['Docs'], operationId: 'getDescription', description: 'This is a description.' } },
        '/docs/both': { get: { tags: ['Docs'], operationId: 'getBoth', summary: 'Summary.', description: 'Description.' } },
        '/docs/neither': { get: { tags: ['Docs'], operationId: 'getNeither' } },
        '/multipart': {
            post: {
                operationId: 'postMultipart',
                tags: ['FormData'],
                consumes: ['multipart/form-data'],
                parameters: [{ name: 'file-upload', in: 'formData', type: 'file' }]
            }
        },
        '/urlencoded': {
            post: {
                operationId: 'postUrlencoded',
                tags: ['FormData'],
                consumes: ['application/x-www-form-urlencoded'],
                parameters: [{ name: 'grantType', in: 'formData', type: 'string' }]
            }
        },
        '/swagger2-param': {
            get: {
                operationId: 'getWithSwagger2Param',
                tags: ['OAS2'],
                parameters: [{ name: 'limit', in: 'query', type: 'integer' }] // No 'schema' key
            }
        },
        '/post-no-req-schema': {
            post: {
                operationId: 'postNoReqSchema',
                tags: ['ResponseType'],
                requestBody: { content: { 'application/json': {} } }, // Body exists, but no schema
                responses: { '204': {} }
            }
        },
        // NEW paths for coverage
        '/all-required/{id}': {
            post: {
                tags: ['RequiredParams'],
                operationId: 'postAllRequired',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'string' } } }
                }
            }
        },
        '/form-data-no-consumes': {
            post: {
                tags: ['FormData'],
                operationId: 'postFormDataNoConsumes',
                // No 'consumes' array here
                parameters: [{ name: 'file', in: 'formData', type: 'file' }]
            }
        }
    }
};

/**
 * @fileoverview
 * This file contains targeted tests for the `ServiceMethodGenerator` to ensure it correctly
 * handles various parameter types (query, header, body), response types, and operation structures.
 */
describe('Emitter: ServiceMethodGenerator', () => {

    const createTestEnvironment = (spec: object = serviceMethodGenSpec) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = { input: '', output: '/out', options: { dateType: 'Date', enumStyle: 'enum' } };
        const parser = new SwaggerParser(spec as any, config);
        // Pre-generate dependent files in-memory
        new TypeGenerator(parser, project, config).generate('/out');
        new HttpParamsBuilderGenerator(project).generate('/out');

        const methodGen = new ServiceMethodGenerator(config, parser);
        const sourceFile = project.createSourceFile('/out/tmp.service.ts');
        const serviceClass = sourceFile.addClass({ name: 'TmpService' });
        // Add minimal service boilerplate for the method body to compile
        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/common/http', namedImports: ['HttpHeaders', 'HttpContext', 'HttpParams'] });
        serviceClass.addProperty({ name: 'basePath', isReadonly: true, scope: 'private', type: 'string', initializer: "''" });
        serviceClass.addProperty({ name: 'http', isReadonly: true, scope: 'private', type: 'any', initializer: "{}" });
        serviceClass.addMethod({ name: 'createContextWithClientId', isPrivate: true, returnType: 'any', statements: 'return {};' });
        return { methodGen, serviceClass, parser };
    };

    it('should warn and skip generation if operation has no methodName', () => {
        const { methodGen, serviceClass } = createTestEnvironment({});
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const operationWithoutName: PathInfo = { path: '/test', method: 'GET', operationId: 'testOp' };

        methodGen.addServiceMethod(serviceClass, operationWithoutName);

        expect(serviceClass.getMethods().filter(m => m.getName() === 'testOp').length).toBe(0);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping method generation for operation without a methodName'));
        warnSpy.mockRestore();
    });

    describe('Documentation Generation', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment();
        const addMethodWithDocs = (operationId: string) => {
            const op = parser.operations.find(o => o.operationId === operationId)!;
            op.methodName = operationId;
            methodGen.addServiceMethod(serviceClass, op);
            return serviceClass.getMethodOrThrow(operationId).getJsDocs()[0].getDescription();
        };

        it('should use summary only', () => {
            const docs = addMethodWithDocs('getSummary');
            expect(docs.trim()).toBe('This is a summary.');
        });

        it('should use description only', () => {
            const docs = addMethodWithDocs('getDescription');
            expect(docs.trim()).toBe('This is a description.');
        });

        it('should use summary and description', () => {
            const docs = addMethodWithDocs('getBoth');
            expect(docs.trim()).toBe('Summary.\n\nDescription.');
        });

        it('should use a fallback when no docs are provided', () => {
            const docs = addMethodWithDocs('getNeither');
            expect(docs.trim()).toBe('Performs a GET request to /docs/neither.');
        });
    });

    describe('Overload Generation', () => {
        it('should make options optional if other parameters are optional', () => {
            const { methodGen, serviceClass, parser } = createTestEnvironment();
            // This operation has an optional query param
            const op = parser.operations.find(o => o.operationId === 'getWithSwagger2Param')!;
            op.methodName = 'getWithSwagger2Param';
            methodGen.addServiceMethod(serviceClass, op);

            const method = serviceClass.getMethodOrThrow('getWithSwagger2Param');
            const responseOverload = method.getOverloads().find(o => o.getReturnType().getText().includes('HttpResponse'))!;
            const optionsParam = responseOverload.getParameters().find(p => p.getName() === 'options')!;

            // because 'limit' is optional, 'options' must also be optional.
            expect(optionsParam.hasQuestionToken()).toBe(true);
        });

        it('should keep options required if all other parameters are required', () => {
            const { methodGen, serviceClass, parser } = createTestEnvironment();
            const op = parser.operations.find(o => o.operationId === 'postAllRequired')!;
            op.methodName = 'postAllRequired';
            methodGen.addServiceMethod(serviceClass, op);

            const method = serviceClass.getMethodOrThrow('postAllRequired');
            const responseOverload = method.getOverloads().find(o => o.getReturnType().getText().includes('HttpResponse'))!;
            const optionsParam = responseOverload.getParameters().find(p => p.getName() === 'options')!;

            // because 'id' and 'body' are required, 'options' for observe:'response' remains required.
            expect(optionsParam.hasQuestionToken()).toBe(false);
        });
    });

    describe('Parameter and Body Generation', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment();

        it('should handle multipart/form-data', () => {
            const op = parser.operations.find(o => o.operationId === 'postMultipart')!;
            op.methodName = 'postMultipart';
            methodGen.addServiceMethod(serviceClass, op);
            const body = serviceClass.getMethodOrThrow('postMultipart').getBodyText()!;
            expect(body).toContain("const formData = new FormData();");
            expect(body).toContain("if (fileUpload != null) { formData.append('file-upload', fileUpload); }");
            expect(body).toContain("return this.http.post(url, formData, requestOptions);");
        });

        it('should handle application/x-www-form-urlencoded', () => {
            const op = parser.operations.find(o => o.operationId === 'postUrlencoded')!;
            op.methodName = 'postUrlencoded';
            methodGen.addServiceMethod(serviceClass, op);
            const body = serviceClass.getMethodOrThrow('postUrlencoded').getBodyText()!;
            expect(body).toContain("let formBody = new HttpParams();");
            expect(body).toContain("if (grantType != null) { formBody = formBody.append('grantType', grantType); }");
            expect(body).toContain("return this.http.post(url, formBody, requestOptions);");
        });

        it('should handle Swagger 2.0 style parameters (without schema wrapper)', () => {
            const op = parser.operations.find(o => o.operationId === 'getWithSwagger2Param')!;
            op.methodName = 'getWithSwagger2Param';
            methodGen.addServiceMethod(serviceClass, op);
            const param = serviceClass.getMethodOrThrow('getWithSwagger2Param').getParameters().find(p => p.getName() === 'limit');
            expect(param).toBeDefined();
            expect(param?.getType().getText()).toBe('number');
        });

        it('should name the body parameter after the model type if it is an interface', () => {
            const op = parser.operations.find(o => o.operationId === 'postAndReturn')!;
            op.methodName = 'postAndReturn';
            methodGen.addServiceMethod(serviceClass, op);
            const param = serviceClass.getMethodOrThrow('postAndReturn').getParameters().find(p => p.getName() === 'bodyModel');
            expect(param).toBeDefined();
            expect(param?.getType().getText()).toBe('BodyModel');
        });

        it('should name the body parameter `body` for primitive types', () => {
            const operation = parser.operations.find(op => op.operationId === 'primitiveBody')!;
            operation.methodName = 'primitiveBody';
            methodGen.addServiceMethod(serviceClass, operation);
            const method = serviceClass.getMethodOrThrow('primitiveBody');
            const impl = method.getImplementation()!;
            const param = impl.getParameters().find(p => p.getType().getText() === 'string');
            expect(param?.getName()).toBe('body');
        });

        it('should handle request body without a schema', () => {
            const { methodGen, serviceClass, parser } = createTestEnvironment();
            const op = parser.operations.find(o => o.operationId === 'postNoReqSchema')!;
            op.methodName = 'postNoReqSchema';
            methodGen.addServiceMethod(serviceClass, op);

            const method = serviceClass.getMethodOrThrow('postNoReqSchema');
            const bodyParam = method.getParameters().find(p => p.getName() === 'body')!;
            expect(bodyParam).toBeDefined();
            expect(bodyParam.getType().getText()).toBe('unknown');
        });

        it('should handle formData params when consumes array is missing', () => {
            const { methodGen, serviceClass, parser } = createTestEnvironment();
            const op = parser.operations.find(o => o.operationId === 'postFormDataNoConsumes')!;
            op.methodName = 'postFormDataNoConsumes';
            methodGen.addServiceMethod(serviceClass, op);

            const body = serviceClass.getMethodOrThrow('postFormDataNoConsumes').getBodyText()!;
            // isMultipartForm will be false, so it falls through. Since there's no other body, 'null' is used.
            expect(body).toContain('return this.http.post(url, null, requestOptions);');
            expect(body).not.toContain('new FormData()');
        });
    });

    describe('Response Type Resolution', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment();

        it('should fall back to "any" when a POST has a request body but no schema', () => {
            const op = parser.operations.find(o => o.operationId === 'postNoReqSchema')!;
            op.methodName = 'postNoReqSchema';
            // It has a 204 response, which means `getResponseType` will return `void`.
            // Let's modify it to have no responses so it falls through.
            op.responses = {};
            methodGen.addServiceMethod(serviceClass, op);
            const overload = serviceClass.getMethodOrThrow('postNoReqSchema').getOverloads()[0];
            expect(overload.getReturnType().getText()).toBe('Observable<any>');
        });

        it('should correctly determine response type from requestBody for POST/PUT', () => {
            const operation = parser.operations.find(op => op.operationId === 'postAndReturn')!;
            operation.methodName = 'postAndReturn';
            methodGen.addServiceMethod(serviceClass, operation);
            const overload = serviceClass.getMethodOrThrow('postAndReturn').getOverloads()[0];
            expect(overload.getReturnType().getText()).toBe('Observable<BodyModel>');
        });

        it("should fall back to 'any' for responseType when no success response is defined", () => {
            const operation = parser.operations.find(op => op.operationId === 'getOAS2NoSchema')!;
            operation.methodName = 'getOAS2NoSchema';
            methodGen.addServiceMethod(serviceClass, operation);
            const overload = serviceClass.getMethodOrThrow('getOAS2NoSchema').getOverloads()[0];
            expect(overload.getReturnType().getText()).toBe('Observable<any>');
        });
    });

    it('should fall back to a generic `body: unknown` parameter for non-json content', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment();
        const operation = parser.operations.find(op => op.operationId === 'allParams')!;
        operation.methodName = 'allParams';
        methodGen.addServiceMethod(serviceClass, operation);
        const method = serviceClass.getMethodOrThrow('allParams');
        const impl = method.getImplementation()!;
        const param = impl.getParameters().find(p => p.getName() === 'body');
        expect(param?.getType().getText()).toBe('unknown');
    });

    it('should generate query param logic when query params are present', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment();
        const operation = parser.operations.find(op => op.operationId === 'withQuery')!;
        operation.methodName = 'withQuery';
        methodGen.addServiceMethod(serviceClass, operation);
        const method = serviceClass.getMethodOrThrow('withQuery');
        const body = method.getImplementation()?.getBodyText() ?? '';
        expect(body).toContain(`let params = new HttpParams({ fromObject: options?.params ?? {} });`);
        expect(body).toContain(`if (search != null) { params = HttpParamsBuilder.addToHttpParams(params, search, 'search'); }`);
        expect(body).toContain(`params,`);
    });

    it('should generate header param logic when header params are present', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment();
        const operation = parser.operations.find(op => op.operationId === 'withHeader')!;
        operation.methodName = 'withHeader';
        methodGen.addServiceMethod(serviceClass, operation);
        const method = serviceClass.getMethodOrThrow('withHeader');
        const body = method.getImplementation()?.getBodyText() ?? '';
        expect(body).toContain(`let headers = options?.headers instanceof HttpHeaders ? options.headers : new HttpHeaders(options?.headers ?? {});`);
        expect(body).toContain(`if (xCustomHeader != null) { headers = headers.set('X-Custom-Header', String(xCustomHeader)); }`);
        expect(body).toContain(`headers,`);
    });

    it("should handle OAS2 `type: 'file'` by creating an 'any' type parameter", () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment();
        const operation = parser.operations.find(op => op.operationId === 'uploadFile')!;
        operation.methodName = 'uploadFile';
        methodGen.addServiceMethod(serviceClass, operation);
        const param = serviceClass.getMethodOrThrow('uploadFile').getParameters().find(p => p.getName() === 'file');
        expect(param?.getType().getText()).toBe('any');
    });
});
