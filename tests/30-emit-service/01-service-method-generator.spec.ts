import { describe, it, expect, vi } from 'vitest';
import { Project } from 'ts-morph';
import { ServiceMethodGenerator } from '@src/service/emit/service/service-method.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, PathInfo } from '@src/core/types.js';
import { finalCoverageSpec } from '../shared/specs.js';
import { TypeGenerator } from '@src/service/emit/type/type.generator.js';
import { HttpParamsBuilderGenerator } from '@src/service/emit/utility/http-params-builder.js';

/**
 * @fileoverview
 * This file contains targeted tests for the `ServiceMethodGenerator` to ensure it correctly
 * handles various parameter types (query, header, body), response types, and operation structures.
 */
describe('Emitter: ServiceMethodGenerator', () => {

    const createTestEnvironment = (spec: object = finalCoverageSpec) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = { input: '', output: '/out', options: { dateType: 'Date', enumStyle: 'enum' } };
        const parser = new SwaggerParser(spec as any, config);

        // Pre-generate dependencies needed by the service methods
        new TypeGenerator(parser, project, config).generate('/out');
        new HttpParamsBuilderGenerator(project).generate('/out');

        const methodGen = new ServiceMethodGenerator(config, parser);

        const sourceFile = project.createSourceFile('/out/tmp.service.ts');
        const serviceClass = sourceFile.addClass({ name: 'TmpService' });

        // Add mock dependencies that the generated methods rely on
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
        expect(body).toContain(`params,`); // Check that params are included in options
        expect(body).toContain(`return this.http.get(url, requestOptions);`);
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

    it('should correctly determine response type from requestBody for POST/PUT', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment();
        const operation = parser.operations.find(op => op.operationId === 'postAndReturn')!;
        operation.methodName = 'postAndReturn';
        methodGen.addServiceMethod(serviceClass, operation);
        const overload = serviceClass.getMethodOrThrow('postAndReturn').getOverloads()[0];
        expect(overload.getReturnType().getText()).toBe('Observable<BodyModel>');
    });

    it('should name the body parameter `body` for primitive types', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment();
        const operation = parser.operations.find(op => op.operationId === 'primitiveBody')!;
        operation.methodName = 'primitiveBody';

        methodGen.addServiceMethod(serviceClass, operation);
        const method = serviceClass.getMethodOrThrow('primitiveBody');
        const impl = method.getImplementation()!;
        const param = impl.getParameters().find(p => p.getType().getText() === 'string');
        expect(param?.getName()).toBe('body');
    });
});
