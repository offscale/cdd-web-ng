import { describe, it, expect, vi } from 'vitest';
import { Project, Scope } from 'ts-morph';
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
        // Paths for coverage
        '/post-infer-return': {
            post: {
                tags: ['ResponseType'],
                operationId: 'postInferReturn',
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/BodyModel' } } } },
                responses: { '400': { description: 'Bad Request' } } // No 2xx response
            }
        },
        '/body-no-schema': {
            post: {
                tags: ['ResponseType'],
                operationId: 'postBodyNoSchema',
                requestBody: { content: { 'application/json': {} } }, // Body exists, but no schema
                responses: { '204': {} }
            }
        },
        '/multipart-no-params': {
            post: {
                tags: ['FormData'],
                operationId: 'postMultipartNoParams',
                consumes: ['multipart/form-data'],
                // No `parameters` array with `in: 'formData'`
                responses: { '200': {} }
            }
        },
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
        },
        '/with-header': {
            get: {
                tags: ['WithHeader'],
                operationId: 'withHeader',
                parameters: [
                    { name: 'X-Custom-Header', in: 'header', schema: { type: 'string' } }
                ],
                responses: {}
            }
        },
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
        serviceClass.addProperty({ name: 'basePath', isReadonly: true, scope: Scope.Private, type: 'string', initializer: "''" });
        serviceClass.addProperty({ name: 'http', isReadonly: true, scope: Scope.Private, type: 'any', initializer: "{}" });
        serviceClass.addMethod({ name: 'createContextWithClientId', scope: Scope.Private, returnType: 'any', statements: 'return {};' });
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
            const op = parser.operations.find((o: PathInfo) => o.operationId === operationId)!;
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
            const op = parser.operations.find((o: PathInfo) => o.operationId === 'getWithSwagger2Param')!;
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
            const op = parser.operations.find((o: PathInfo) => o.operationId === 'postAllRequired')!;
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
        it('should correctly serialize path parameters with default allowReserved=false', () => {
            const { methodGen, serviceClass } = createTestEnvironment();
            const op: PathInfo = {
                method: 'GET', path: '/users/{id}', methodName: 'getUser',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }]
            };
            methodGen.addServiceMethod(serviceClass, op);
            const body = serviceClass.getMethodOrThrow('getUser').getBodyText()!;
            // Expect 5th argument to be false (or implied)
            expect(body).toContain("HttpParamsBuilder.serializePathParam('id', id, 'simple', false, false)");
        });

        it('should pass allowReserved: true for path parameters', () => {
            const { methodGen, serviceClass } = createTestEnvironment();
            const op: PathInfo = {
                method: 'GET', path: '/files/{path}', methodName: 'getFile',
                parameters: [{ name: 'path', in: 'path', required: true, allowReserved: true, schema: { type: 'string' } }]
            };
            methodGen.addServiceMethod(serviceClass, op);
            const body = serviceClass.getMethodOrThrow('getFile').getBodyText()!;
            // Expect 5th argument to be true
            expect(body).toContain("HttpParamsBuilder.serializePathParam('path', path, 'simple', false, true)");
        });

        it('should handle multipart/form-data', () => {
            const { methodGen, serviceClass, parser } = createTestEnvironment();
            const op = parser.operations.find((o: PathInfo) => o.operationId === 'postMultipart')!;
            op.methodName = 'postMultipart';
            methodGen.addServiceMethod(serviceClass, op);
            const body = serviceClass.getMethodOrThrow('postMultipart').getBodyText()!;
            expect(body).toContain("const formData = new FormData();");
            expect(body).toContain("if (fileUpload != null) { formData.append('file-upload', fileUpload); }");
            expect(body).toContain("return this.http.post(url, formData, requestOptions as any);");
        });

        it('should handle multipart/form-data with no formData params', () => {
            const { methodGen, serviceClass, parser } = createTestEnvironment();
            const op = parser.operations.find((o: PathInfo) => o.operationId === 'postMultipartNoParams')!;
            op.methodName = 'postMultipartNoParams';
            methodGen.addServiceMethod(serviceClass, op);
            const body = serviceClass.getMethodOrThrow('postMultipartNoParams').getBodyText()!;
            // It should not generate FormData logic and fall back to a null body.
            expect(body).not.toContain('new FormData()');
            expect(body).toContain('return this.http.post(url, null, requestOptions as any);');
        });

        it('should handle application/x-www-form-urlencoded', () => {
            const { methodGen, serviceClass, parser } = createTestEnvironment();
            const op = parser.operations.find((o: PathInfo) => o.operationId === 'postUrlencoded')!;
            op.methodName = 'postUrlencoded';
            methodGen.addServiceMethod(serviceClass, op);
            const body = serviceClass.getMethodOrThrow('postUrlencoded').getBodyText()!;
            expect(body).toContain("let formBody = new HttpParams();");
            expect(body).toContain("if (grantType != null) { formBody = formBody.append('grantType', grantType); }");
            expect(body).toContain("return this.http.post(url, formBody, requestOptions as any);");
        });

        it('should handle Swagger 2.0 style parameters (without schema wrapper)', () => {
            const { methodGen, serviceClass, parser } = createTestEnvironment();
            const op = parser.operations.find((o: PathInfo) => o.operationId === 'getWithSwagger2Param')!;
            op.methodName = 'getWithSwagger2Param';
            methodGen.addServiceMethod(serviceClass, op);
            const param = serviceClass.getMethodOrThrow('getWithSwagger2Param').getParameters().find(p => p.getName() === 'limit');
            expect(param).toBeDefined();
            expect(param?.getType().getText()).toBe('number');
        });

        it('should name the body parameter after the model type if it is an interface', () => {
            const { methodGen, serviceClass, parser } = createTestEnvironment();
            const op = parser.operations.find((o: PathInfo) => o.operationId === 'postAndReturn')!;
            op.methodName = 'postAndReturn';
            methodGen.addServiceMethod(serviceClass, op);
            const param = serviceClass.getMethodOrThrow('postAndReturn').getParameters().find(p => p.getName() === 'bodyModel');
            expect(param).toBeDefined();
            expect(param?.getType().getText()).toBe('BodyModel');
        });

        it('should handle request body without a schema by creating an "unknown" body param', () => {
            const { methodGen, serviceClass, parser } = createTestEnvironment();
            const op = parser.operations.find((o: PathInfo) => o.operationId === 'postBodyNoSchema')!;
            op.methodName = 'postBodyNoSchema';
            methodGen.addServiceMethod(serviceClass, op);

            const method = serviceClass.getMethodOrThrow('postBodyNoSchema');
            const bodyParam = method.getParameters().find(p => p.getName() === 'body')!;
            expect(bodyParam).toBeDefined();
            expect(bodyParam.getType().getText()).toBe('unknown');
        });

        it('should handle formData params when consumes array is missing', () => {
            const { methodGen, serviceClass, parser } = createTestEnvironment();
            const op = parser.operations.find((o: PathInfo) => o.operationId === 'postFormDataNoConsumes')!;
            op.methodName = 'postFormDataNoConsumes';
            methodGen.addServiceMethod(serviceClass, op);

            const body = serviceClass.getMethodOrThrow('postFormDataNoConsumes').getBodyText()!;
            // isMultipartForm will be false, so it falls through. Since there's no other body, 'null' is used.
            expect(body).toContain('return this.http.post(url, null, requestOptions as any);');
            expect(body).not.toContain('new FormData()');
        });

        it('should generate logic for cookie parameters', () => {
            const { methodGen, serviceClass } = createTestEnvironment({});
            const op: PathInfo = {
                method: 'GET', path: '/with-cookie', methodName: 'withCookie',
                parameters: [
                    { name: 'session', in: 'cookie', schema: { type: 'string' } }
                ]
            };
            methodGen.addServiceMethod(serviceClass, op);
            const body = serviceClass.getMethodOrThrow('withCookie').getBodyText()!;

            // Check for cookie collection logic
            expect(body).toContain('const __cookies: string[] = [];');
            expect(body).toContain("if (session != null) { __cookies.push(HttpParamsBuilder.serializeCookieParam('session', session, 'form', true)); }");
            expect(body).toContain("if (__cookies.length > 0) { headers = headers.set('Cookie', __cookies.join('; ')); }");
        });

        it('should add warnings for unsupported querystring parameters', () => {
            const { methodGen, serviceClass } = createTestEnvironment();
            const op: PathInfo = {
                method: 'GET', path: '/test', methodName: 'getWithUnsupported',
                parameters: [
                    // Removed cookie, only querystring remains unsupported
                    { name: 'raw', in: 'querystring', schema: { type: 'string'}}
                ]
            };
            methodGen.addServiceMethod(serviceClass, op);
            const body = serviceClass.getMethodOrThrow('getWithUnsupported').getBodyText()!;
            // Warning about cookie support should be GONE
            expect(body).not.toContain("console.warn('The following cookie parameters are not automatically handled");
            // Warning about querystring should REMAIN
            expect(body).toContain("console.warn('The following querystring parameters are not automatically handled:', [\"raw\"]);");
        });
    });

    describe('Response Type Resolution', () => {
        it('should infer response type from request body on POST when no success response is defined', () => {
            const { methodGen, serviceClass, parser } = createTestEnvironment();
            const op = parser.operations.find((o: PathInfo) => o.operationId === 'postInferReturn')!;
            op.methodName = 'postInferReturn';
            methodGen.addServiceMethod(serviceClass, op);
            const overload = serviceClass.getMethodOrThrow('postInferReturn').getOverloads()[0];
            expect(overload.getReturnType().getText()).toBe('Observable<BodyModel>');
        });

        it("should fall back to 'any' for responseType when no success response or request body schema is defined", () => {
            const { methodGen, serviceClass, parser } = createTestEnvironment();
            const operation = parser.operations.find((o: PathInfo) => o.operationId === 'getOAS2NoSchema')!;
            operation.methodName = 'getOAS2NoSchema';
            methodGen.addServiceMethod(serviceClass, operation);
            const overload = serviceClass.getMethodOrThrow('getOAS2NoSchema').getOverloads()[0];
            expect(overload.getReturnType().getText()).toBe('Observable<any>');
        });
    });

    it('should generate query param logic with correct nullish coalescing for options.params', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment();
        const operation = parser.operations.find((o: PathInfo) => o.operationId === 'withQuery')!;
        operation.methodName = 'withQuery';
        methodGen.addServiceMethod(serviceClass, operation);
        const body = serviceClass.getMethodOrThrow('withQuery').getImplementation()?.getBodyText() ?? '';
        expect(body).toContain(`let params = new HttpParams({ fromObject: options?.params ?? {} });`);
        expect(body).toContain(`params = HttpParamsBuilder.serializeQueryParam(params,`);
        expect(body).toContain(`, search`);
        expect(body).toContain(`params`);
    });

    it('should generate header param logic correctly using HttpParamsBuilder', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment();
        const operation = parser.operations.find((o: PathInfo) => o.operationId === 'withHeader')!;
        operation.methodName = 'withHeader';
        methodGen.addServiceMethod(serviceClass, operation);
        const method = serviceClass.getMethodOrThrow('withHeader');
        const body = method.getImplementation()?.getBodyText() ?? '';

        expect(body).toContain(`let headers = options?.headers instanceof HttpHeaders ? options.headers : new HttpHeaders(options?.headers ?? {});`);
        // Expect usage of serializeHeaderParam
        expect(body).toContain(`if (xCustomHeader != null) { headers = headers.set('X-Custom-Header', HttpParamsBuilder.serializeHeaderParam('X-Custom-Header', xCustomHeader, false)); }`);
        expect(body).toContain(`headers`);
    });

    describe('Strict Content Serialization Generation', () => {
        it('should generate correct builder call with "json" hint for path params with content', () => {
            const { methodGen, serviceClass } = createTestEnvironment({});
            const op: PathInfo = {
                method: 'GET', path: '/search/{filter}', methodName: 'search',
                parameters: [{
                    name: 'filter', in: 'path', required: true,
                    content: { 'application/json': { schema: { type: 'object' } } }
                }]
            };
            methodGen.addServiceMethod(serviceClass, op);
            const body = serviceClass.getMethodOrThrow('search').getBodyText()!;
            // Expect 6th argument to be 'json'
            expect(body).toContain("HttpParamsBuilder.serializePathParam('filter', filter, 'simple', false, false, 'json')");
        });

        it('should generate correct builder call with "json" hint for header params with content', () => {
            const { methodGen, serviceClass } = createTestEnvironment({});
            const op: PathInfo = {
                method: 'GET', path: '/info', methodName: 'getInfo',
                parameters: [{
                    name: 'X-Meta', in: 'header',
                    content: { 'application/json': { schema: { type: 'object' } } }
                }]
            };
            methodGen.addServiceMethod(serviceClass, op);
            const body = serviceClass.getMethodOrThrow('getInfo').getBodyText()!;
            // Expect 4th arg to be 'json'
            expect(body).toContain("HttpParamsBuilder.serializeHeaderParam('X-Meta', xMeta, false, 'json')");
        });

        it('should handle query params implicitly via the parameter JSON passed to builder', () => {
            // Query params use the `serializeQueryParam` which takes the full definition object.
            // We just verify the definition object string contains the content key.
            const { methodGen, serviceClass } = createTestEnvironment({});
            const op: PathInfo = {
                method: 'GET', path: '/list', methodName: 'list',
                parameters: [{
                    name: 'q', in: 'query',
                    content: { 'application/json': { schema: { type: 'object' } } }
                }]
            };
            methodGen.addServiceMethod(serviceClass, op);
            const body = serviceClass.getMethodOrThrow('list').getBodyText()!;
            // The parameter definition is passed as JSON.stringify(p)
            expect(body).toContain('"content":{"application/json"');
        });
    });
});
