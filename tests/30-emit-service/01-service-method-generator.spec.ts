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
        // NEW paths for coverage
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
        const operation = parser.operations.find((op: PathInfo) => op.operationId === 'withQuery')!;
        operation.methodName = 'withQuery';
        methodGen.addServiceMethod(serviceClass, operation);
        const body = serviceClass.getMethodOrThrow('withQuery').getImplementation()?.getBodyText() ?? '';
        expect(body).toContain(`let params = new HttpParams({ fromObject: options?.params ?? {} });`);
        expect(body).toContain(`if (search != null) { params = HttpParamsBuilder.addToHttpParams(params, search, 'search'); }`);
        expect(body).toContain(`params`);
    });

    it('should generate header param logic correctly', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment();
        const operation = parser.operations.find((op: PathInfo) => op.operationId === 'withHeader')!;
        operation.methodName = 'withHeader';
        methodGen.addServiceMethod(serviceClass, operation);
        const method = serviceClass.getMethodOrThrow('withHeader');
        const body = method.getImplementation()?.getBodyText() ?? '';
        expect(body).toContain(`let headers = options?.headers instanceof HttpHeaders ? options.headers : new HttpHeaders(options?.headers ?? {});`);
        expect(body).toContain(`if (xCustomHeader != null) { headers = headers.set('X-Custom-Header', String(xCustomHeader)); }`);
        expect(body).toContain(`headers`);
    });
});
