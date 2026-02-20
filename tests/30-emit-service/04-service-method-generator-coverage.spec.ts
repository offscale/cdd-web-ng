import { describe, expect, it, vi } from 'vitest';

import { Project } from 'ts-morph';

import { ServiceMethodGenerator } from '@src/generators/angular/service/service-method.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { ServiceMethodModel } from '@src/analysis/service-method-types.js';

describe('Emitter: ServiceMethodGenerator (Coverage)', () => {
    const config: GeneratorConfig = {
        input: '',
        output: '/out',
        options: { dateType: 'string', enumStyle: 'enum' },
    } as any;

    it('should include docs when provided', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const parser = new SwaggerParser(
            { openapi: '3.0.0', info: { title: 'T', version: '1' }, paths: {} } as any,
            config,
        );
        const generator = new ServiceMethodGenerator(config, parser);

        const model: ServiceMethodModel = {
            methodName: 'doThing',
            httpMethod: 'GET',
            urlTemplate: '/do',
            docs: 'Doc string',
            isDeprecated: false,
            parameters: [],
            responseType: 'string',
            responseSerialization: 'json',
            responseVariants: [
                { mediaType: 'application/json', type: 'string', serialization: 'json', isDefault: true },
            ],
            errorResponses: [],
            pathParams: [],
            queryParams: [],
            headerParams: [],
            cookieParams: [],
            security: [],
            extensions: {},
            hasServers: false,
        };

        const sourceFile = project.createSourceFile('/out/service.ts', '', { overwrite: true });
        const classDeclaration = sourceFile.addClass({ name: 'TestService' });

        vi.spyOn((generator as any).analyzer, 'analyze').mockReturnValue(model);
        generator.addServiceMethod(classDeclaration, { methodName: 'doThing' } as any);

        const docs = classDeclaration.getMethodOrThrow('doThing').getJsDocs();
        expect(docs[0].getText()).toContain('Doc string');
    });

    it('should emit @operationId when provided on the operation', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const parser = new SwaggerParser(
            { openapi: '3.0.0', info: { title: 'T', version: '1' }, paths: {} } as any,
            config,
        );
        const generator = new ServiceMethodGenerator(config, parser);

        const model: ServiceMethodModel = {
            methodName: 'doThing',
            httpMethod: 'GET',
            urlTemplate: '/do',
            docs: 'Doc string',
            isDeprecated: false,
            parameters: [],
            responseType: 'string',
            responseSerialization: 'json',
            responseVariants: [
                { mediaType: 'application/json', type: 'string', serialization: 'json', isDefault: true },
            ],
            errorResponses: [],
            pathParams: [],
            queryParams: [],
            headerParams: [],
            cookieParams: [],
            security: [],
            extensions: {},
            hasServers: false,
        };

        const sourceFile = project.createSourceFile('/out/service.ts', '', { overwrite: true });
        const classDeclaration = sourceFile.addClass({ name: 'TestService' });

        vi.spyOn((generator as any).analyzer, 'analyze').mockReturnValue(model);
        generator.addServiceMethod(classDeclaration, { methodName: 'doThing', operationId: 'getThing' } as any);

        const docText = classDeclaration.getMethodOrThrow('doThing').getJsDocs()[0].getText();
        expect(docText).toContain('@operationId getThing');
    });

    it('should emit operation metadata tags for reverse generation', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const spec = {
            openapi: '3.2.0',
            info: { title: 'T', version: '1' },
            paths: {
                '/items': {
                    get: {
                        operationId: 'listItems',
                        tags: ['items', 'admin'],
                        externalDocs: {
                            url: 'https://example.com/items',
                            description: 'Item docs',
                        },
                        servers: [
                            {
                                url: 'https://api.example.com/v1',
                                description: 'primary',
                                name: 'prod',
                                variables: {
                                    region: { default: 'us' },
                                },
                            },
                        ],
                        security: [{ ApiKey: [] }],
                        parameters: [
                            {
                                name: 'qs',
                                in: 'querystring',
                                required: true,
                                description: 'Filter',
                                content: {
                                    'application/x-www-form-urlencoded': {
                                        schema: { type: 'object' },
                                    },
                                },
                            },
                        ],
                        'x-feature-flag': 'beta',
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };
        const parser = new SwaggerParser(spec as any, config);
        const generator = new ServiceMethodGenerator(config, parser);

        const model: ServiceMethodModel = {
            methodName: 'listItems',
            httpMethod: 'GET',
            urlTemplate: '/items',
            isDeprecated: false,
            parameters: [],
            responseType: 'string',
            responseSerialization: 'json',
            responseVariants: [
                { mediaType: 'application/json', type: 'string', serialization: 'json', isDefault: true },
            ],
            errorResponses: [],
            pathParams: [],
            queryParams: [],
            headerParams: [],
            cookieParams: [],
            security: [],
            extensions: {},
            hasServers: false,
        };

        const sourceFile = project.createSourceFile('/out/service.ts', '', { overwrite: true });
        const classDeclaration = sourceFile.addClass({ name: 'TestService' });

        vi.spyOn((generator as any).analyzer, 'analyze').mockReturnValue(model);
        generator.addServiceMethod(classDeclaration, parser.operations[0]);

        const docText = classDeclaration.getMethodOrThrow('listItems').getJsDocs()[0].getText();
        expect(docText).toContain('@tags items, admin');
        expect(docText).toContain('@see https://example.com/items Item docs');
        expect(docText).toContain('@server [{"url":"https://api.example.com/v1"');
        expect(docText).toContain('@security [{"ApiKey":[]}'); // order stable via JSON.stringify
        expect(docText).toContain('@x-feature-flag "beta"');
        expect(docText).toContain(
            '@querystring {"name":"qs","contentType":"application/x-www-form-urlencoded","required":true,"description":"Filter"}',
        );
    });

    it('should emit example tags for parameters, request bodies, and responses', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const spec = {
            openapi: '3.2.0',
            info: { title: 'T', version: '1' },
            paths: {
                '/items/{id}': {
                    post: {
                        operationId: 'createItem',
                        parameters: [
                            {
                                name: 'id',
                                in: 'path',
                                required: true,
                                example: 'abc',
                                schema: { type: 'string' },
                            },
                            {
                                name: 'limit',
                                in: 'query',
                                example: 10,
                                schema: { type: 'integer' },
                            },
                        ],
                        requestBody: {
                            content: {
                                'application/json': {
                                    example: { name: 'Widget' },
                                },
                            },
                        },
                        responses: {
                            '200': {
                                description: 'ok',
                                content: {
                                    'application/json': {
                                        example: { id: 1 },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };
        const parser = new SwaggerParser(spec as any, config);
        const generator = new ServiceMethodGenerator(config, parser);

        const model: ServiceMethodModel = {
            methodName: 'createItem',
            httpMethod: 'POST',
            urlTemplate: '/items/{id}',
            isDeprecated: false,
            parameters: [
                { name: 'id', type: 'string' },
                { name: 'limit', type: 'number', hasQuestionToken: true },
                { name: 'body', type: 'any' },
            ],
            responseType: 'string',
            responseSerialization: 'json',
            responseVariants: [
                { mediaType: 'application/json', type: 'string', serialization: 'json', isDefault: true },
            ],
            errorResponses: [],
            pathParams: [],
            queryParams: [],
            headerParams: [],
            cookieParams: [],
            security: [],
            extensions: {},
            hasServers: false,
        };

        const sourceFile = project.createSourceFile('/out/service.ts', '', { overwrite: true });
        const classDeclaration = sourceFile.addClass({ name: 'TestService' });

        vi.spyOn((generator as any).analyzer, 'analyze').mockReturnValue(model);
        generator.addServiceMethod(classDeclaration, parser.operations[0]);

        const docText = classDeclaration.getMethodOrThrow('createItem').getJsDocs()[0].getText();
        expect(docText).toContain('@paramExample id "abc"');
        expect(docText).toContain('@paramExample limit 10');
        expect(docText).toContain('@requestExample application/json {"name":"Widget"}');
        expect(docText).toContain('@responseExample 200 application/json {"id":1}');
    });

    it('should prefer serializedValue examples for non-JSON media types', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const spec = {
            openapi: '3.2.0',
            info: { title: 'T', version: '1' },
            paths: {
                '/text': {
                    get: {
                        operationId: 'getText',
                        responses: {
                            '200': {
                                description: 'ok',
                                content: {
                                    'text/plain': {
                                        examples: {
                                            sample: {
                                                dataValue: 'raw-value',
                                                serializedValue: 'SERIALIZED-VALUE',
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            components: {},
        };
        const parser = new SwaggerParser(spec as any, config);
        const generator = new ServiceMethodGenerator(config, parser);

        const model: ServiceMethodModel = {
            methodName: 'getText',
            httpMethod: 'GET',
            urlTemplate: '/text',
            isDeprecated: false,
            parameters: [],
            responseType: 'string',
            responseSerialization: 'text',
            responseVariants: [{ mediaType: 'text/plain', type: 'string', serialization: 'text', isDefault: true }],
            errorResponses: [],
            pathParams: [],
            queryParams: [],
            headerParams: [],
            cookieParams: [],
            security: [],
            extensions: {},
            hasServers: false,
        };

        const sourceFile = project.createSourceFile('/out/service.ts', '', { overwrite: true });
        const classDeclaration = sourceFile.addClass({ name: 'TestService' });

        vi.spyOn((generator as any).analyzer, 'analyze').mockReturnValue(model);
        generator.addServiceMethod(classDeclaration, parser.operations[0]);

        const docText = classDeclaration.getMethodOrThrow('getText').getJsDocs()[0].getText();
        expect(docText).toContain(
            '@responseExample 200 text/plain {"__oasExample":{"serializedValue":"SERIALIZED-VALUE"}}',
        );
        expect(docText).not.toContain('raw-value');
    });

    it('should widen return type when multiple success response types exist', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const parser = new SwaggerParser(
            { openapi: '3.2.0', info: { title: 'T', version: '1' }, paths: {} } as any,
            config,
        );
        const generator = new ServiceMethodGenerator(config, parser);

        const model: ServiceMethodModel = {
            methodName: 'getMulti',
            httpMethod: 'GET',
            urlTemplate: '/multi',
            isDeprecated: false,
            parameters: [],
            responseType: 'string',
            responseSerialization: 'json',
            responseVariants: [
                { mediaType: 'application/json', type: 'string', serialization: 'json', isDefault: true },
                { mediaType: 'application/json', type: 'number', serialization: 'json', isDefault: false },
            ],
            errorResponses: [],
            pathParams: [],
            queryParams: [],
            headerParams: [],
            cookieParams: [],
            security: [],
            extensions: {},
            hasServers: false,
        };

        const sourceFile = project.createSourceFile('/out/service.ts', '', { overwrite: true });
        const classDeclaration = sourceFile.addClass({ name: 'TestService' });

        vi.spyOn((generator as any).analyzer, 'analyze').mockReturnValue(model);
        generator.addServiceMethod(classDeclaration, { methodName: 'getMulti' } as any);

        const returnType = classDeclaration.getMethodOrThrow('getMulti').getReturnType().getText();
        expect(returnType).toContain('Observable<string | number>');
    });

    it('should emit @response tags when responses are defined', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const parser = new SwaggerParser(
            { openapi: '3.0.0', info: { title: 'T', version: '1' }, paths: {} } as any,
            config,
        );
        const generator = new ServiceMethodGenerator(config, parser);

        const model: ServiceMethodModel = {
            methodName: 'withResponses',
            httpMethod: 'GET',
            urlTemplate: '/with-responses',
            docs: 'Doc string',
            isDeprecated: false,
            parameters: [],
            responseType: 'string',
            responseSerialization: 'json',
            responseVariants: [
                { mediaType: 'application/json', type: 'string', serialization: 'json', isDefault: true },
            ],
            errorResponses: [],
            pathParams: [],
            queryParams: [],
            headerParams: [],
            cookieParams: [],
            security: [],
            extensions: {},
            hasServers: false,
        };

        const sourceFile = project.createSourceFile('/out/service.ts', '', { overwrite: true });
        const classDeclaration = sourceFile.addClass({ name: 'TestService' });

        vi.spyOn((generator as any).analyzer, 'analyze').mockReturnValue(model);
        generator.addServiceMethod(classDeclaration, {
            methodName: 'withResponses',
            responses: {
                '200': {
                    summary: 'Success payload',
                    description: 'OK',
                    content: {
                        'application/json': { schema: { type: 'string' } },
                        'text/plain': { schema: { type: 'string' } },
                    },
                },
                '404': {
                    description: 'Not found',
                },
            },
        } as any);

        const docText = classDeclaration.getMethodOrThrow('withResponses').getJsDocs()[0].getText();
        expect(docText).toContain('@response 200 application/json OK');
        expect(docText).toContain('@response 200 text/plain OK');
        expect(docText).toContain('@response 404 Not found');
        expect(docText).toContain('@responseSummary 200 Success payload');
    });

    it('should omit docs when none are provided', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const parser = new SwaggerParser(
            { openapi: '3.0.0', info: { title: 'T', version: '1' }, paths: {} } as any,
            config,
        );
        const generator = new ServiceMethodGenerator(config, parser);

        const model: ServiceMethodModel = {
            methodName: 'noDocs',
            httpMethod: 'GET',
            urlTemplate: '/nodocs',
            docs: '',
            isDeprecated: false,
            parameters: [],
            responseType: 'string',
            responseSerialization: 'json',
            responseVariants: [
                { mediaType: 'application/json', type: 'string', serialization: 'json', isDefault: true },
            ],
            errorResponses: [],
            pathParams: [],
            queryParams: [],
            headerParams: [],
            cookieParams: [],
            security: [],
            extensions: {},
            hasServers: false,
        };

        const sourceFile = project.createSourceFile('/out/service.ts', '', { overwrite: true });
        const classDeclaration = sourceFile.addClass({ name: 'TestService' });

        vi.spyOn((generator as any).analyzer, 'analyze').mockReturnValue(model);
        generator.addServiceMethod(classDeclaration, { methodName: 'noDocs' } as any);

        expect(classDeclaration.getMethodOrThrow('noDocs').getJsDocs().length).toBe(0);
    });

    it('should generate body logic for xml, json-seq, json-lines, and decoding variants', () => {
        const parser = new SwaggerParser(
            { openapi: '3.0.0', info: { title: 'T', version: '1' }, paths: {} } as any,
            config,
        );
        const generator = new ServiceMethodGenerator(config, parser);

        const model: ServiceMethodModel = {
            methodName: 'custom',
            httpMethod: 'CUSTOM',
            urlTemplate: '/custom',
            isDeprecated: false,
            parameters: [
                { name: 'payload', type: 'any' },
                { name: 'qs', type: 'string' },
                { name: 'hdr', type: 'string' },
                { name: 'cookie', type: 'string' },
            ],
            responseType: 'string',
            responseSerialization: 'json',
            responseVariants: [
                {
                    mediaType: 'application/json',
                    type: 'string',
                    serialization: 'json',
                    decodingConfig: { foo: 'bar' },
                    isDefault: true,
                },
                {
                    mediaType: 'application/xml',
                    type: 'string',
                    serialization: 'xml',
                    xmlConfig: { name: 'Root' },
                    isDefault: false,
                },
                {
                    mediaType: 'application/json-seq',
                    type: 'any[]',
                    serialization: 'json-seq',
                    isDefault: false,
                },
                {
                    mediaType: 'application/json-lines',
                    type: 'any[]',
                    serialization: 'json-lines',
                    isDefault: false,
                },
                {
                    mediaType: 'application/custom',
                    type: 'string',
                    serialization: 'json',
                    decodingConfig: { baz: true },
                    isDefault: false,
                },
            ],
            errorResponses: [],
            pathParams: [],
            queryParams: [],
            headerParams: [
                {
                    paramName: 'hdr',
                    originalName: 'X-Hdr',
                    explode: false,
                    allowReserved: false,
                    serializationLink: 'json',
                },
            ],
            cookieParams: [
                {
                    paramName: 'cookie',
                    originalName: 'sid',
                    style: 'form',
                    explode: true,
                    allowReserved: false,
                    serializationLink: 'json',
                },
            ],
            body: { type: 'xml', paramName: 'payload', rootName: 'Root', config: {} },
            security: [],
            extensions: {},
            hasServers: false,
        };

        const rawOp = {
            path: '/custom',
            method: 'CUSTOM',
            parameters: [
                {
                    name: 'qs',
                    in: 'querystring',
                    schema: { type: 'string' },
                    content: { 'application/json': { schema: { type: 'string' } } },
                },
            ],
        } as any;

        const body = (generator as any).emitMethodBody(model, rawOp, false, true);

        expect(body).toContain("serializeRawQuerystring(qs, 'json')");
        expect(body).toContain("serializeHeaderParam(hdr, false, 'json')");
        expect(body).toContain("serializeCookieParam('sid', cookie, 'form', true, false, 'json')");
        expect(body).toContain("XmlBuilder.serialize(payload, 'Root'");
        expect(body).toContain("this.http.request<any>('CUSTOM', url, { ...requestOptions, body: xmlBody } as any)");
        expect(body).toContain("response.split('\\x1e')");
        expect(body).toContain("response.split('\\n')");
        expect(body).toContain('ContentDecoder.decode(response');
    });

    it('should omit json hints for querystring and header params when not using json serialization', () => {
        const parser = new SwaggerParser(
            { openapi: '3.0.0', info: { title: 'T', version: '1' }, paths: {} } as any,
            config,
        );
        const generator = new ServiceMethodGenerator(config, parser);

        const model: ServiceMethodModel = {
            methodName: 'noJsonHints',
            httpMethod: 'GET',
            urlTemplate: '/qs',
            isDeprecated: false,
            parameters: [
                { name: 'qs', type: 'string' },
                { name: 'hdr', type: 'string' },
            ],
            responseType: 'string',
            responseSerialization: 'json',
            responseVariants: [
                { mediaType: 'application/json', type: 'string', serialization: 'json', isDefault: true },
            ],
            errorResponses: [],
            pathParams: [],
            queryParams: [],
            headerParams: [
                {
                    paramName: 'hdr',
                    originalName: 'X-Hdr',
                    explode: false,
                    allowReserved: false,
                },
            ],
            cookieParams: [],
            security: [],
            extensions: {},
            hasServers: false,
        };

        const rawOp = {
            path: '/qs',
            method: 'GET',
            parameters: [{ name: 'qs', in: 'querystring', schema: { type: 'string' } }],
        } as any;

        const body = (generator as any).emitMethodBody(model, rawOp, false, false);
        expect(body).toContain('serializeRawQuerystring(qs)');
        expect(body).not.toContain("serializeRawQuerystring(qs, 'json')");
        expect(body).toContain('serializeHeaderParam(hdr, false)');
        expect(body).not.toContain("serializeHeaderParam(hdr, false, 'json')");
    });

    it('should keep responseType as options when content negotiation has no xml/seq variants', () => {
        const parser = new SwaggerParser(
            { openapi: '3.0.0', info: { title: 'T', version: '1' }, paths: {} } as any,
            config,
        );
        const generator = new ServiceMethodGenerator(config, parser);

        const model: ServiceMethodModel = {
            methodName: 'negotiated',
            httpMethod: 'GET',
            urlTemplate: '/neg',
            isDeprecated: false,
            parameters: [],
            responseType: 'string',
            responseSerialization: 'json',
            responseVariants: [
                { mediaType: 'application/json', type: 'string', serialization: 'json', isDefault: true },
                { mediaType: 'application/problem+json', type: 'string', serialization: 'json', isDefault: false },
            ],
            errorResponses: [],
            pathParams: [],
            queryParams: [],
            headerParams: [],
            cookieParams: [],
            security: [],
            extensions: {},
            hasServers: false,
        };

        const rawOp = { path: '/neg', method: 'GET' } as any;
        const body = (generator as any).emitMethodBody(model, rawOp, false, true);

        expect(body).toContain("const acceptHeader = headers.get('Accept');");
        expect(body).toContain('responseType: options?.responseType');
        expect(body).not.toContain("? 'text' :");
    });

    it('should default responseType to blob for binary responses', () => {
        const parser = new SwaggerParser(
            { openapi: '3.2.0', info: { title: 'T', version: '1' }, paths: {} } as any,
            config,
        );
        const generator = new ServiceMethodGenerator(config, parser);

        const model: ServiceMethodModel = {
            methodName: 'download',
            httpMethod: 'GET',
            urlTemplate: '/download',
            isDeprecated: false,
            parameters: [],
            responseType: 'Blob',
            responseSerialization: 'blob',
            responseVariants: [{ mediaType: 'application/pdf', type: 'Blob', serialization: 'blob', isDefault: true }],
            errorResponses: [],
            pathParams: [],
            queryParams: [],
            headerParams: [],
            cookieParams: [],
            security: [],
            extensions: {},
            hasServers: false,
        };

        const rawOp = { path: '/download', method: 'GET' } as any;
        const body = (generator as any).emitMethodBody(model, rawOp, false, false);

        expect(body).toContain("responseType: 'blob'");
    });

    it('should leave body null for unsupported body types', () => {
        const parser = new SwaggerParser(
            { openapi: '3.0.0', info: { title: 'T', version: '1' }, paths: {} } as any,
            config,
        );
        const generator = new ServiceMethodGenerator(config, parser);

        const model: ServiceMethodModel = {
            methodName: 'weird',
            httpMethod: 'POST',
            urlTemplate: '/weird',
            isDeprecated: false,
            parameters: [{ name: 'payload', type: 'any' }],
            responseType: 'string',
            responseSerialization: 'json',
            responseVariants: [
                { mediaType: 'application/json', type: 'string', serialization: 'json', isDefault: true },
            ],
            errorResponses: [],
            pathParams: [],
            queryParams: [],
            headerParams: [],
            cookieParams: [],
            body: { type: 'binary', paramName: 'payload' } as any,
            security: [],
            extensions: {},
            hasServers: false,
        };

        const rawOp = { path: '/weird', method: 'POST' } as any;
        const body = (generator as any).emitMethodBody(model, rawOp, false, false);
        expect(body).toContain('this.http.post<any>(url, null, requestOptions as any)');
    });

    it('should set Content-Type when requestContentType is provided', () => {
        const parser = new SwaggerParser(
            { openapi: '3.0.0', info: { title: 'T', version: '1' }, paths: {} } as any,
            config,
        );
        const generator = new ServiceMethodGenerator(config, parser);

        const model: ServiceMethodModel = {
            methodName: 'sendText',
            httpMethod: 'POST',
            urlTemplate: '/text',
            isDeprecated: false,
            parameters: [{ name: 'payload', type: 'string' }],
            responseType: 'string',
            responseSerialization: 'json',
            responseVariants: [
                { mediaType: 'application/json', type: 'string', serialization: 'json', isDefault: true },
            ],
            errorResponses: [],
            pathParams: [],
            queryParams: [],
            headerParams: [],
            cookieParams: [],
            body: { type: 'raw', paramName: 'payload' },
            requestContentType: 'text/plain',
            security: [],
            extensions: {},
            hasServers: false,
        };

        const rawOp = { path: '/text', method: 'POST' } as any;
        const body = (generator as any).emitMethodBody(model, rawOp, false, false);

        expect(body).toContain("headers = headers.set('Content-Type', 'text/plain')");
        expect(body).toContain('requestOptions = { ...requestOptions, headers };');
    });

    it('should fall back to unknown when responseType is empty', () => {
        const parser = new SwaggerParser(
            { openapi: '3.0.0', info: { title: 'T', version: '1' }, paths: {} } as any,
            config,
        );
        const generator = new ServiceMethodGenerator(config, parser);

        const overloads = (generator as any).emitOverloads('doThing', '', [], false, false, [
            { mediaType: 'application/json', type: 'any', serialization: 'json', isDefault: true },
        ]);
        expect(overloads[0].returnType).toContain('unknown');
    });
});
