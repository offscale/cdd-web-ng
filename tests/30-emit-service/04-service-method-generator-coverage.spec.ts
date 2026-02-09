import { describe, expect, it, vi } from 'vitest';

import { Project } from 'ts-morph';

import { ServiceMethodGenerator } from '@src/generators/angular/service/service-method.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { ServiceMethodModel } from '@src/analysis/service-method-types.js';

describe('Emitter: ServiceMethodGenerator (Coverage)', () => {
    const config: GeneratorConfig = { input: '', output: '/out', options: { dateType: 'string', enumStyle: 'enum' } } as any;

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

    it('should fall back to unknown when responseType is empty', () => {
        const parser = new SwaggerParser(
            { openapi: '3.0.0', info: { title: 'T', version: '1' }, paths: {} } as any,
            config,
        );
        const generator = new ServiceMethodGenerator(config, parser);

        const overloads = (generator as any).emitOverloads(
            'doThing',
            '',
            [],
            false,
            false,
            [{ mediaType: 'application/json', type: 'any', serialization: 'json', isDefault: true }],
        );
        expect(overloads[0].returnType).toContain('unknown');
    });
});
