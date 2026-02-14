import { describe, expect, it, vi } from 'vitest';
import { Project, Scope } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, PathInfo } from '@src/core/types/index.js';
import { ServiceMethodGenerator } from '@src/generators/angular/service/service-method.generator.js';

const specEdgeTests = {
    openapi: '3.0.0',
    info: { title: 'Edge Cases', version: '1.0' },
    paths: {
        '/public-endpoint': {
            get: {
                operationId: 'getPublic',
                tags: ['Public'],
                security: [],
                responses: { '200': { description: 'ok' } },
            },
        },
        '/oauth-protected': {
            get: {
                operationId: 'getOauthProtected',
                security: [{ OAuth2: ['read:admin'] }],
                responses: { '200': { description: 'ok' } },
            },
        },
        '/server-override': {
            get: {
                tags: ['ServerOverride'],
                operationId: 'getWithServerOverride',
                servers: [{ url: 'https://custom.api.com' }],
                responses: { '200': { description: 'ok' } },
            },
        },
        '/copy-resource': {
            additionalOperations: {
                COPY: { operationId: 'copyResource', responses: { '200': { description: 'Copied' } } },
            },
        },
        '/query-search': {
            query: {
                operationId: 'querySearch',
                requestBody: { content: { 'application/json': { schema: { type: 'string' } } } },
                responses: { '200': { description: 'ok' } },
            },
        },
    },
    components: {
        securitySchemes: {
            OAuth2: {
                type: 'oauth2',
                flows: {
                    authorizationCode: {
                        authorizationUrl: 'https://auth.example.com/authorize',
                        tokenUrl: 'https://auth.example.com/token',
                        scopes: {},
                    },
                },
            },
        },
    },
};

describe('Emitter: ServiceMethodGenerator (Edge Cases)', () => {
    const createTestEnvironment = (spec: object, configOverrides: Partial<GeneratorConfig['options']> = {}) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = {
            input: '',
            output: '/out',
            options: { dateType: 'Date', enumStyle: 'enum', ...configOverrides },
        };
        const parser = new SwaggerParser(spec as any, config);
        const methodGen = new ServiceMethodGenerator(config, parser);
        const sourceFile = project.createSourceFile('/out/tmp.service.ts');
        const serviceClass = sourceFile.addClass({ name: 'TmpService' });
        serviceClass.addProperty({ name: 'http', scope: Scope.Private, isReadonly: true, type: 'any' });
        serviceClass.addProperty({
            name: 'basePath',
            isReadonly: true,
            scope: Scope.Private,
            type: 'string',
            initializer: "''",
        });
        serviceClass.addMethod({
            name: 'createContextWithClientId',
            scope: Scope.Private,
            returnType: 'any',
            statements: 'return {};',
        });
        return { methodGen, serviceClass, parser };
    };

    it('should warn and skip generation if operation has no methodName', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specEdgeTests);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const operationWithoutName: PathInfo = { path: '/test', method: 'GET', operationId: 'testOp' };

        methodGen.addServiceMethod(serviceClass, operationWithoutName);

        expect(serviceClass.getMethods().filter(m => m.getName() === 'testOp').length).toBe(0);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Skipping method generation for operation without a methodName'),
        );
        warnSpy.mockRestore();
    });

    it('should NOT apply SECURITY_CONTEXT_TOKEN for explicit skip (default behavior)', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment(specEdgeTests);
        const op = parser.operations.find((o: any) => o.operationId === 'getPublic')!;
        op.methodName = 'getPublic';
        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getPublic').getBodyText()!;
        // Effective security is empty, so no token is added
        expect(body).not.toContain('SECURITY_CONTEXT_TOKEN');
    });

    it('should generate context with SECURITY_CONTEXT_TOKEN when security scopes are present', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment(specEdgeTests);
        const op = parser.operations.find((o: any) => o.operationId === 'getOauthProtected')!;
        op.methodName = 'getOauthProtected';
        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getOauthProtected').getBodyText()!;
        expect(body).toContain('.set(SECURITY_CONTEXT_TOKEN, [{"OAuth2":["read:admin"]}])');
    });

    it('should override basePath when operation servers are present', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specEdgeTests);
        const op: PathInfo = {
            method: 'GET',
            path: '/server-override',
            methodName: 'getWithServerOverride',
            servers: [{ url: 'https://custom.api.com' }],
        };
        methodGen.addServiceMethod(serviceClass, op);
        const body = serviceClass.getMethodOrThrow('getWithServerOverride').getBodyText()!;
        expect(body).toContain('const operationServers =');
        expect(body).toContain('resolveServerUrl(operationServers');
        expect(body).not.toContain('const basePath = this.basePath;');
    });

    it('should generate generic request call for custom HTTP methods (COPY)', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment(specEdgeTests);
        const op = parser.operations.find(o => o.method === 'COPY')!;
        op.methodName = 'copyResource';

        methodGen.addServiceMethod(serviceClass, op);
        const body = serviceClass.getMethodOrThrow('copyResource').getBodyText()!;
        expect(body).toContain("return this.http.request<any>('COPY', url, requestOptions as any);");
    });

    it('should handle HTTP QUERY method with body (generic request)', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specEdgeTests);
        const op: PathInfo = {
            method: 'QUERY',
            path: '/query-search',
            methodName: 'querySearch',
            requestBody: { content: { 'application/json': { schema: { type: 'string' } } } },
            responses: { '200': { description: 'ok' } },
        };

        methodGen.addServiceMethod(serviceClass, op);
        const body = serviceClass.getMethodOrThrow('querySearch').getBodyText()!;
        expect(body).toContain("return this.http.request('QUERY', url, { ...requestOptions, body: body } as any)");
    });

    it('should NOT emit runtime warning for cookies if platform is node', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specEdgeTests, { platform: 'node' });
        const op: PathInfo = {
            method: 'GET',
            path: '/cookie',
            methodName: 'cookieTest',
            parameters: [{ name: 'c', in: 'cookie', schema: { type: 'string' } }],
        };

        methodGen.addServiceMethod(serviceClass, op);
        const body = serviceClass.getMethodOrThrow('cookieTest').getBodyText()!;
        expect(body).not.toContain('console.warn');
        expect(body).toContain("headers = headers.set('Cookie'");
    });
});
