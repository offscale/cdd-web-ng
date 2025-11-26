import { describe, expect, it } from 'vitest';
import { Project, Scope } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, PathInfo } from "@src/core/types/index.js";
import { TypeGenerator } from "@src/generators/shared/type.generator.js";
import { ServiceMethodGenerator } from "@src/generators/angular/service/service-method.generator.js";
import { HttpParamsBuilderGenerator } from "@src/generators/angular/utils/http-params-builder.generator.js";

const specParamTests = {
    openapi: '3.0.0',
    info: { title: 'Param Tests', version: '1.0' },
    paths: {
        '/xml-params/{xmlId}': {
            get: {
                operationId: 'getXmlParams',
                parameters: [
                    {
                        name: 'filter', in: 'query',
                        content: {
                            'application/xml': {
                                schema: {
                                    type: 'object',
                                    properties: { active: { type: 'boolean', xml: { attribute: true } } }
                                }
                            }
                        }
                    },
                    {
                        name: 'xmlId', in: 'path',
                        content: { 'application/xml': { schema: { type: 'string' } } }
                    }
                ],
                responses: { '200': {} }
            }
        },
        '/deprecated-endpoint': {
            get: { operationId: 'getDeprecated', deprecated: true, responses: { '200': {} } }
        },
        '/deprecated-param': {
            get: {
                operationId: 'getDeprecatedParam',
                parameters: [
                    { name: 'id', in: 'query', deprecated: true, schema: { type: 'string' } }
                ],
                responses: { '200': {} }
            }
        },
        '/cookie-test': {
            get: {
                operationId: 'getWithCookies',
                parameters: [{ name: 'session_id', in: 'cookie', schema: { type: 'string' } }],
                responses: { '200': {} }
            }
        },
        '/cookie-strict-defaults': {
            get: {
                operationId: 'getWithCookieDefaults',
                parameters: [
                    // Should default to explode: true (default style: form)
                    { name: 'default_cookie', in: 'cookie', schema: { type: 'string' } },
                    // Explicit style: simple should default to explode: false
                    { name: 'simple_cookie', in: 'cookie', style: 'simple', schema: { type: 'string' } },
                    // Allow Reserved test
                    { name: 'reserved_cookie', in: 'cookie', schema: { type: 'string' }, allowReserved: true }
                ],
                responses: { '200': {} }
            }
        },
        '/query-string': {
            get: {
                operationId: 'getWithQuerystring',
                parameters: [
                    {
                        name: 'filter',
                        in: 'querystring',
                        content: { 'application/json': { schema: { type: 'object' } } }
                    }
                ],
                responses: { '200': {} }
            }
        },
        '/search/{filter}': {
            get: {
                operationId: 'search',
                parameters: [{
                    name: 'filter',
                    in: 'path',
                    required: true,
                    content: { 'application/json': { schema: { type: 'object' } } }
                }],
                responses: {}
            }
        },
        '/info': {
            get: {
                operationId: 'getInfo',
                parameters: [{
                    name: 'X-Meta',
                    in: 'header',
                    content: { 'application/json': { schema: { type: 'object' } } }
                }],
                responses: {}
            }
        }
    }
};

describe('Emitter: ServiceMethodGenerator (Parameters)', () => {

    const createTestEnvironment = (spec: object) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = {
            input: '', output: '/out',
            options: { dateType: 'Date', enumStyle: 'enum', platform: 'browser' }
        };
        const parser = new SwaggerParser(spec as any, config);
        new TypeGenerator(parser, project, config).generate('/out');
        new HttpParamsBuilderGenerator(project).generate('/out');

        const methodGen = new ServiceMethodGenerator(config, parser);
        const sourceFile = project.createSourceFile('/out/tmp.service.ts');
        const serviceClass = sourceFile.addClass({ name: 'TmpService' });
        serviceClass.addProperty({ name: 'http', scope: Scope.Private, isReadonly: true, type: 'any' });
        serviceClass.addProperty({
            name: 'basePath',
            isReadonly: true,
            scope: Scope.Private,
            type: 'string',
            initializer: "''"
        });
        serviceClass.addMethod({
            name: 'createContextWithClientId',
            scope: Scope.Private,
            returnType: 'any',
            statements: 'return {};'
        });
        return { methodGen, serviceClass };
    };

    it('should detect application/xml parameters and generate xml serialization logic', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specParamTests);
        const opKey = '/xml-params/{xmlId}';
        const op: PathInfo = {
            ...specParamTests.paths[opKey].get,
            method: 'GET', path: opKey, methodName: 'getXmlParams'
        } as any;

        methodGen.addServiceMethod(serviceClass, op);
        const body = serviceClass.getMethodOrThrow('getXmlParams').getBodyText()!;

        expect(body).toContain(`let filterSerialized: any = filter;`);
        expect(body).toContain(`filterSerialized = XmlBuilder.serialize(filter, 'filter',`);
        expect(body).toContain(`let xmlIdSerialized: any = xmlId;`);
        expect(body).toContain(`xmlIdSerialized = XmlBuilder.serialize(xmlId, 'xmlId',`);
    });

    it('should generate @deprecated JSDoc for deprecated operations', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specParamTests);
        const op: PathInfo = {
            ...specParamTests.paths['/deprecated-endpoint'].get,
            path: '/deprecated-endpoint', method: 'GET', methodName: 'getDeprecated'
        } as any;

        methodGen.addServiceMethod(serviceClass, op);
        const method = serviceClass.getMethodOrThrow('getDeprecated');
        const docs = method.getJsDocs().map(doc => doc.getInnerText());
        expect(docs[0]).toContain('@deprecated');
    });

    it('should generate @deprecated JSDoc override for deprecated parameters', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specParamTests);
        const op: PathInfo = {
            ...specParamTests.paths['/deprecated-param'].get,
            path: '/deprecated-param', method: 'GET', methodName: 'getDeprecatedParam'
        } as any;

        methodGen.addServiceMethod(serviceClass, op);
        const method = serviceClass.getMethodOrThrow('getDeprecatedParam');
        const overload = method.getOverloads()[0];
        const param = overload.getParameters()[0];
        expect(param.getFullText()).toContain('@deprecated');
    });

    it('should warn about forbidden Cookie headers during generation and in runtime code (Browser Default)', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specParamTests);
        const op: PathInfo = {
            ...specParamTests.paths['/cookie-test'].get,
            path: '/cookie-test', method: 'GET', methodName: 'getWithCookies'
        } as any;

        methodGen.addServiceMethod(serviceClass, op);
        const body = serviceClass.getMethodOrThrow('getWithCookies').getBodyText()!;
        expect(body).toContain("if (typeof window !== 'undefined') { console.warn");
        expect(body).toContain("headers = headers.set('Cookie'");
    });

    it('should respect strict OAS defaults for cookie explode based on style', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specParamTests);
        const op: PathInfo = {
            ...specParamTests.paths['/cookie-strict-defaults'].get,
            path: '/cookie-strict-defaults', method: 'GET', methodName: 'getWithCookieDefaults'
        } as any;

        methodGen.addServiceMethod(serviceClass, op);
        const body = serviceClass.getMethodOrThrow('getWithCookieDefaults').getBodyText()!;

        // Default cookie (implicit style: form) should be explode: true, allowReserved: false (last arg)
        expect(body).toContain("HttpParamsBuilder.serializeCookieParam('default_cookie', defaultCookie, 'form', true, false");

        // Explicit simple style should be explode: false, allowReserved: false
        expect(body).toContain("HttpParamsBuilder.serializeCookieParam('simple_cookie', simpleCookie, 'simple', false, false");

        // allowReserved explicitly true matching allowReserved parameter
        expect(body).toContain("HttpParamsBuilder.serializeCookieParam('reserved_cookie', reservedCookie, 'form', true, true");
    });

    it('should generate logic for in: "querystring" parameters', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specParamTests);
        const op: PathInfo = {
            method: 'GET', path: '/query-string', methodName: 'getWithQuerystring',
            parameters: specParamTests.paths['/query-string'].get.parameters
        } as any;

        methodGen.addServiceMethod(serviceClass, op);
        const body = serviceClass.getMethodOrThrow('getWithQuerystring').getBodyText()!;
        expect(body).toContain("const queryString = HttpParamsBuilder.serializeRawQuerystring(filter, 'json');");
        expect(body).toContain("const url = `${basePath}/query-string${queryString ? '?' + queryString : ''}`;");
    });

    it('should generate correct builder call with "json" hint for path params with content', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specParamTests);
        const op: PathInfo = {
            method: 'GET', path: '/search/{filter}', methodName: 'search',
            parameters: specParamTests.paths['/search/{filter}'].get.parameters
        } as any;

        methodGen.addServiceMethod(serviceClass, op);
        const body = serviceClass.getMethodOrThrow('search').getBodyText()!;
        expect(body).toContain("HttpParamsBuilder.serializePathParam('filter', filter, 'simple', false, false, 'json')");
    });

    it('should generate correct builder call with "json" hint for header params with content', () => {
        const { methodGen, serviceClass } = createTestEnvironment(specParamTests);
        const op: PathInfo = {
            method: 'GET', path: '/info', methodName: 'getInfo',
            parameters: specParamTests.paths['/info'].get.parameters
        } as any;

        methodGen.addServiceMethod(serviceClass, op);
        const body = serviceClass.getMethodOrThrow('getInfo').getBodyText()!;
        expect(body).toContain("HttpParamsBuilder.serializeHeaderParam('X-Meta', xMeta, false, 'json')");
    });
});
